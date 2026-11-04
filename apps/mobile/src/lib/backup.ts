import { createTransaction } from "@tanstack/react-db";
import type { Collection } from "@tanstack/react-db";

import {
  bookmarksCollection,
  entriesCollection,
  favoriteCharactersCollection,
  favoriteShowsCollection,
  parseCharacter,
  parseEntry,
  parseRecord,
  parseSaved,
  parseSettings,
  SETTINGS_ID,
  settingsCollection,
} from "./db";
import { kv } from "./kv";
import type { FavoriteCharacter, LibraryEntry, SavedAnime, SettingsRow } from "./library-types";
import { stripVirtual } from "./store";

/**
 * Backups are plain JSON, readable by every Ikuzo version. Restoring is local only: it never
 * sends deletions to AniList or MyAnimeList, and the library before the restore is kept so the
 * restore can be undone.
 */
const BACKUP_VERSION = 2;
const UNDO_KEY = "ikuzo-restore-undo";
/** A restore can be undone for this long; later, undoing would throw away too much new work. */
const UNDO_TTL_MS = 24 * 60 * 60 * 1000;

export interface Backup {
  app: "ikuzo";
  version: number;
  exportedAt: string;
  entries: Record<string, LibraryEntry>;
  bookmarks: Record<string, SavedAnime>;
  favoriteShows: Record<string, SavedAnime>;
  favoriteCharacters: Record<string, FavoriteCharacter>;
  settings: SettingsRow;
}

/** The library in a form ready to restore. */
export interface ParsedBackup {
  exportedAt?: string;
  entries: LibraryEntry[];
  bookmarks: SavedAnime[];
  favoriteShows: SavedAnime[];
  favoriteCharacters: FavoriteCharacter[];
  settings: SettingsRow;
}

/** merge: add and update from the backup, keep everything else. replace: make the library equal the backup. */
export type RestoreMode = "merge" | "replace";

export interface RestorePreview {
  shows: number;
  added: number;
  /** Shows whose copy in the backup is newer than the one here. */
  changed: number;
  /** Shows changed here after the backup was made: "Add & update" keeps them, "Replace" overwrites them. */
  newerHere: number;
  /** Shows only in the current library; removed in "replace" mode. */
  onlyHere: number;
  notesLost: number;
}

const byKey = <T extends { key: string }>(rows: T[]): Record<string, T> =>
  Object.fromEntries(rows.map((row) => [row.key, stripVirtual(row)]));

export const createBackup = (): Backup => ({
  app: "ikuzo",
  bookmarks: byKey(bookmarksCollection.toArray),
  entries: byKey(entriesCollection.toArray),
  exportedAt: new Date().toISOString(),
  favoriteCharacters: byKey(favoriteCharactersCollection.toArray),
  favoriteShows: byKey(favoriteShowsCollection.toArray),
  settings: parseSettings(settingsCollection.get(SETTINGS_ID)),
  version: BACKUP_VERSION,
});

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/**
 * Reads a backup made by any Ikuzo version, dropping entries that do not look right.
 * Which shows were on which AniList / MyAnimeList account is only kept for the undo snapshot:
 * a backup may come from another device or account, where that information is wrong.
 */
export const parseBackup = (text: string, { keepSyncMarks = false } = {}): ParsedBackup | undefined => {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isRecord(value) || value.app !== "ikuzo" || !isRecord(value.entries)) {
    return undefined;
  }
  return {
    bookmarks: parseRecord(value.bookmarks, parseSaved),
    entries: parseRecord(value.entries, parseEntry).map((entry) =>
      keepSyncMarks ? entry : { ...entry, trackers: undefined }
    ),
    exportedAt: typeof value.exportedAt === "string" ? value.exportedAt : undefined,
    favoriteCharacters: parseRecord(value.favoriteCharacters, parseCharacter),
    favoriteShows: parseRecord(value.favoriteShows, parseSaved),
    settings: parseSettings(value.settings),
  };
};

const sameEntry = (a: LibraryEntry, b: LibraryEntry): boolean =>
  a.status === b.status &&
  a.progress === b.progress &&
  a.score === b.score &&
  a.notify === b.notify &&
  a.notes.length === b.notes.length;

/** Bookmarks and favourites have nothing to update: merging only adds the missing ones. */
const addOnly = (): boolean => false;

/** In "Add & update" mode an entry is only overwritten by a newer copy from the backup. */
const backupIsNewer = (current: LibraryEntry, incoming: LibraryEntry): boolean =>
  incoming.updatedAt > current.updatedAt;

export const previewRestore = (backup: ParsedBackup): RestorePreview => {
  const incoming = new Map(backup.entries.map((entry) => [entry.key, entry]));
  let added = 0;
  let changed = 0;
  let newerHere = 0;
  for (const entry of backup.entries) {
    const current = entriesCollection.get(entry.key);
    if (current === undefined) {
      added += 1;
    } else if (!sameEntry(current, entry)) {
      if (backupIsNewer(current, entry)) {
        changed += 1;
      } else {
        newerHere += 1;
      }
    }
  }
  const onlyHere = entriesCollection.toArray.filter((entry) => !incoming.has(entry.key));
  return {
    added,
    changed,
    newerHere,
    notesLost: onlyHere.reduce((sum, entry) => sum + entry.notes.length, 0),
    onlyHere: onlyHere.length,
    shows: backup.entries.length,
  };
};

/**
 * Queues the writes that make `collection` match `rows`. "merge" adds missing rows and updates
 * the ones `replaces` allows; "replace" overwrites everything and drops rows not in `rows`.
 */
const mirror = <T extends { key: string }>(
  collection: Collection<T, string>,
  rows: T[],
  mode: RestoreMode,
  replaces: (current: T, incoming: T) => boolean = () => true
): void => {
  const keep = new Set(rows.map((row) => row.key));
  for (const row of rows) {
    const current = collection.get(row.key);
    if (current === undefined) {
      collection.insert(row);
    } else if (mode === "replace" || replaces(current, row)) {
      collection.update(row.key, (draft) => {
        Object.assign(draft, row);
      });
    }
  }
  if (mode === "replace") {
    for (const row of collection.toArray) {
      if (!keep.has(row.key)) {
        collection.delete(row.key);
      }
    }
  }
};

/** Writes the whole backup in one transaction: either all of it lands on disk or none of it. */
const applyBackup = async (backup: ParsedBackup, mode: RestoreMode): Promise<void> => {
  const transaction = createTransaction({
    autoCommit: false,
    mutationFn: async ({ transaction: tx }) => {
      await entriesCollection.utils.acceptMutations(tx);
      await bookmarksCollection.utils.acceptMutations(tx);
      await favoriteShowsCollection.utils.acceptMutations(tx);
      await favoriteCharactersCollection.utils.acceptMutations(tx);
      await settingsCollection.utils.acceptMutations(tx);
    },
  });
  transaction.mutate(() => {
    mirror(entriesCollection, backup.entries, mode, backupIsNewer);
    // Bookmarks and favourites have nothing to update: merging only adds the missing ones.
    mirror(bookmarksCollection, backup.bookmarks, mode, addOnly);
    mirror(favoriteShowsCollection, backup.favoriteShows, mode, addOnly);
    mirror(favoriteCharactersCollection, backup.favoriteCharacters, mode, addOnly);
    if (mode === "replace") {
      if (settingsCollection.has(SETTINGS_ID)) {
        settingsCollection.update(SETTINGS_ID, (draft) => {
          Object.assign(draft, backup.settings);
        });
      } else {
        settingsCollection.insert(backup.settings);
      }
    }
  });
  await transaction.commit();
};

interface UndoSnapshot {
  at: number;
  backup: Backup;
}

const readSnapshot = async (): Promise<{ at: number; text: string } | undefined> => {
  const raw = await kv.getItem(UNDO_KEY);
  if (raw === null) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isRecord(parsed) && typeof parsed.at === "number" && Date.now() - parsed.at < UNDO_TTL_MS) {
      return { at: parsed.at, text: JSON.stringify(parsed.backup) };
    }
  } catch {
    // Unreadable snapshot: treated as expired.
  }
  await kv.removeItem(UNDO_KEY);
  return undefined;
};

/**
 * Restores a backup. The current library is saved first, so `undoRestore` can bring it back
 * (for a day). Nothing is sent to AniList or MyAnimeList from here: the next sync compares as
 * usual and the newest copy of each show wins. Deletions are never sent.
 */
export const restoreBackup = async (backup: ParsedBackup, mode: RestoreMode): Promise<void> => {
  const snapshot: UndoSnapshot = { at: Date.now(), backup: createBackup() };
  await kv.setItem(UNDO_KEY, JSON.stringify(snapshot));
  await applyBackup(backup, mode);
};

/** When the restore that can still be undone happened, if there is one. */
export const undoableRestoreAt = async (): Promise<number | undefined> => {
  const snapshot = await readSnapshot();
  return snapshot?.at;
};

/** Puts the library back exactly as it was before the last restore (within a day of it). */
export const undoRestore = async (): Promise<boolean> => {
  const snapshot = await readSnapshot();
  const backup = snapshot === undefined ? undefined : parseBackup(snapshot.text, { keepSyncMarks: true });
  if (backup === undefined) {
    return false;
  }
  await applyBackup(backup, "replace");
  await kv.removeItem(UNDO_KEY);
  return true;
};
