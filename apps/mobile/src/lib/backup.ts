import { createTransaction } from "@tanstack/react-db";
import type { Collection } from "@tanstack/react-db";

import {
  bookmarksCollection,
  entriesCollection,
  favoriteCharactersCollection,
  favoriteShowsCollection,
  noteFromEntry,
  notesCollection,
  parseCharacter,
  parseEntry,
  parseNote,
  parseRecord,
  parseSaved,
  parseSettings,
  SETTINGS_ID,
  settingsCollection,
} from "./db";
import { kv } from "./kv";
import type { FavoriteCharacter, LibraryEntry, Note, SavedAnime, SettingsRow } from "./library-types";
import { findEntry, stripVirtual } from "./store";

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
  notes: Record<string, Note>;
  settings: SettingsRow;
}

/** The library in a form ready to restore. */
export interface ParsedBackup {
  exportedAt?: string;
  entries: LibraryEntry[];
  bookmarks: SavedAnime[];
  favoriteShows: SavedAnime[];
  favoriteCharacters: FavoriteCharacter[];
  notes: Note[];
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
  notes: Object.fromEntries(notesCollection.toArray.map((note) => [note.id, stripVirtual(note)])),
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
  const entries = parseRecord(value.entries, parseEntry);
  // Old backups kept notes inside their entries.
  const legacyNotes = entries.flatMap((entry) => (entry.notes ?? []).map((note) => noteFromEntry(entry, note)));
  const notes = new Map([...legacyNotes, ...parseRecord(value.notes, parseNote)].map((note) => [note.id, note]));
  return {
    bookmarks: parseRecord(value.bookmarks, parseSaved),
    entries,
    exportedAt: typeof value.exportedAt === "string" ? value.exportedAt : undefined,
    favoriteCharacters: parseRecord(value.favoriteCharacters, parseCharacter),
    favoriteShows: parseRecord(value.favoriteShows, parseSaved),
    notes: [...notes.values()],
    settings: parseSettings(value.settings),
  };
};

const sameEntry = (a: LibraryEntry, b: LibraryEntry): boolean =>
  a.status === b.status && a.progress === b.progress && a.score === b.score && a.notify === b.notify;

/** Bookmarks and favourites have nothing to update: merging only adds the missing ones. */
const addOnly = (): boolean => false;

/** In "Add & update" mode an entry is only overwritten by a newer copy from the backup. */
const backupIsNewer = (current: LibraryEntry, incoming: LibraryEntry): boolean =>
  incoming.updatedAt > current.updatedAt;

/**
 * Gives each backup entry the key of the same show in this library, matched by MyAnimeList or
 * AniList id like everywhere else: a backup may have the show as "mal:5" where this phone has
 * "anilist:1". Without this a restore would create a second entry for the same show.
 */
const matchLibraryKeys = (entries: LibraryEntry[]): LibraryEntry[] => {
  const seen = new Map<string, LibraryEntry>();
  for (const entry of entries) {
    const local = findEntry(entry.anime);
    const matched = local === undefined ? entry : { ...entry, anime: local.anime, key: local.key };
    const other = seen.get(matched.key);
    // The same show twice in the backup: the newer copy counts.
    if (other === undefined || matched.updatedAt > other.updatedAt) {
      seen.set(matched.key, matched);
    }
  }
  return [...seen.values()];
};

export const previewRestore = (parsed: ParsedBackup): RestorePreview => {
  const backup = { ...parsed, entries: matchLibraryKeys(parsed.entries) };
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

/**
 * Writes the backup in one TanStack DB transaction. Each collection is written to disk on its
 * own, so a failure part-way can leave some written: restoreBackup then puts the snapshot back.
 */
const applyBackup = async (parsed: ParsedBackup, mode: RestoreMode): Promise<void> => {
  const backup = { ...parsed, entries: matchLibraryKeys(parsed.entries) };
  const transaction = createTransaction({
    autoCommit: false,
    mutationFn: async ({ transaction: tx }) => {
      await entriesCollection.utils.acceptMutations(tx);
      await bookmarksCollection.utils.acceptMutations(tx);
      await favoriteShowsCollection.utils.acceptMutations(tx);
      await favoriteCharactersCollection.utils.acceptMutations(tx);
      await settingsCollection.utils.acceptMutations(tx);
      await notesCollection.utils.acceptMutations(tx);
    },
  });
  transaction.mutate(() => {
    mirror(entriesCollection, backup.entries, mode, backupIsNewer);
    // Bookmarks and favourites have nothing to update: merging only adds the missing ones.
    mirror(bookmarksCollection, backup.bookmarks, mode, addOnly);
    mirror(favoriteShowsCollection, backup.favoriteShows, mode, addOnly);
    mirror(favoriteCharactersCollection, backup.favoriteCharacters, mode, addOnly);
    // Notes are only ever added or removed, never edited.
    for (const note of backup.notes) {
      if (!notesCollection.has(note.id)) {
        notesCollection.insert(note);
      }
    }
    if (mode === "replace") {
      const keep = new Set(backup.notes.map((note) => note.id));
      for (const note of notesCollection.toArray) {
        if (!keep.has(note.id)) {
          notesCollection.delete(note.id);
        }
      }
    }
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
/** Keeps the library as it is now, so the next big change (restore, switching accounts) can be undone for a day. */
export const saveUndoSnapshot = async (): Promise<Backup> => {
  const current = createBackup();
  const snapshot: UndoSnapshot = { at: Date.now(), backup: current };
  await kv.setItem(UNDO_KEY, JSON.stringify(snapshot));
  return current;
};

export const restoreBackup = async (backup: ParsedBackup, mode: RestoreMode): Promise<void> => {
  const current = await saveUndoSnapshot();
  try {
    await applyBackup(backup, mode);
  } catch (error) {
    // Part of the backup may be on disk already: put the library back as it was.
    const before = parseBackup(JSON.stringify(current));
    if (before !== undefined) {
      await applyBackup(before, "replace");
    }
    await kv.removeItem(UNDO_KEY);
    throw error;
  }
};

/** When the restore that can still be undone happened, if there is one. */
export const undoableRestoreAt = async (): Promise<number | undefined> => {
  const snapshot = await readSnapshot();
  return snapshot?.at;
};

/** Puts the library back exactly as it was before the last restore (within a day of it). */
export const undoRestore = async (): Promise<boolean> => {
  const snapshot = await readSnapshot();
  const backup = snapshot === undefined ? undefined : parseBackup(snapshot.text);
  if (backup === undefined) {
    return false;
  }
  await applyBackup(backup, "replace");
  await kv.removeItem(UNDO_KEY);
  return true;
};
