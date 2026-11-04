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
  changed: number;
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

/** Reads a backup made by any Ikuzo version, dropping entries that do not look right. */
export const parseBackup = (text: string): ParsedBackup | undefined => {
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
    entries: parseRecord(value.entries, parseEntry),
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

export const previewRestore = (backup: ParsedBackup): RestorePreview => {
  const incoming = new Map(backup.entries.map((entry) => [entry.key, entry]));
  let added = 0;
  let changed = 0;
  for (const entry of backup.entries) {
    const current = entriesCollection.get(entry.key);
    if (current === undefined) {
      added += 1;
    } else if (!sameEntry(current, entry)) {
      changed += 1;
    }
  }
  const onlyHere = entriesCollection.toArray.filter((entry) => !incoming.has(entry.key));
  return {
    added,
    changed,
    notesLost: onlyHere.reduce((sum, entry) => sum + entry.notes.length, 0),
    onlyHere: onlyHere.length,
    shows: backup.entries.length,
  };
};

/** Queues the writes that make `collection` match `rows` (and, in replace mode, drops the rest). */
const mirror = <T extends { key: string }>(collection: Collection<T, string>, rows: T[], mode: RestoreMode): void => {
  const keep = new Set(rows.map((row) => row.key));
  for (const row of rows) {
    if (collection.has(row.key)) {
      collection.update(row.key, (draft) => {
        Object.assign(draft, row);
      });
    } else {
      collection.insert(row);
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
    mirror(entriesCollection, backup.entries, mode);
    mirror(bookmarksCollection, backup.bookmarks, mode);
    mirror(favoriteShowsCollection, backup.favoriteShows, mode);
    mirror(favoriteCharactersCollection, backup.favoriteCharacters, mode);
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

/**
 * Restores a backup. The current library is saved first, so `undoRestore` can bring it back.
 * Nothing is sent to AniList or MyAnimeList from here: the next sync compares as usual and
 * the newest copy of each show wins. Deletions are never sent.
 */
export const restoreBackup = async (backup: ParsedBackup, mode: RestoreMode): Promise<void> => {
  await kv.setItem(UNDO_KEY, JSON.stringify(createBackup()));
  await applyBackup(backup, mode);
};

export const canUndoRestore = async (): Promise<boolean> => (await kv.getItem(UNDO_KEY)) !== null;

/** Puts the library back exactly as it was before the last restore. */
export const undoRestore = async (): Promise<boolean> => {
  const raw = await kv.getItem(UNDO_KEY);
  const backup = raw === null ? undefined : parseBackup(raw);
  if (backup === undefined) {
    return false;
  }
  await applyBackup(backup, "replace");
  await kv.removeItem(UNDO_KEY);
  return true;
};
