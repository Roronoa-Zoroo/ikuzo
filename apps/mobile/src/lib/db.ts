import type { AnimeSummary } from "@ikuzo/anime/types";
import { createCollection } from "@tanstack/react-db";

import { kv } from "./kv";
import { DEFAULT_SETTINGS, WATCH_STATUSES } from "./library-types";
import type { FavoriteCharacter, LibraryEntry, Note, SavedAnime, SettingsRow, WatchStatus } from "./library-types";
import { persistedOptions } from "./persistence";

/** The user's library, stored with TanStack DB (SQLite on the phone). */
export const entriesCollection = createCollection(persistedOptions<LibraryEntry>("library-entries", (e) => e.key));
export const bookmarksCollection = createCollection(persistedOptions<SavedAnime>("library-bookmarks", (b) => b.key));
export const favoriteShowsCollection = createCollection(
  persistedOptions<SavedAnime>("library-favorite-shows", (f) => f.key)
);
export const favoriteCharactersCollection = createCollection(
  persistedOptions<FavoriteCharacter>("library-favorite-characters", (f) => f.key)
);
export const settingsCollection = createCollection(persistedOptions<SettingsRow>("settings", (s) => s.id));

export const SETTINGS_ID = "settings";

const ALL = [
  entriesCollection,
  bookmarksCollection,
  favoriteShowsCollection,
  favoriteCharactersCollection,
  settingsCollection,
] as const;

/** Adds the indexed id fields to an entry whose show snapshot changed. */
export const withIdFields = (entry: LibraryEntry): LibraryEntry => ({
  ...entry,
  anilistId: entry.anime.ids.anilist,
  malId: entry.anime.ids.mal,
});

// ── Legacy data (versions before TanStack DB kept everything in one zustand blob) ──

const LEGACY_KEY = "ikuzo-library";
const MIGRATED_KEY = "ikuzo-db-migrated";

interface LegacyState {
  entries?: Record<string, Omit<LibraryEntry, "malId" | "anilistId">>;
  bookmarks?: Record<string, { anime: AnimeSummary; addedAt: number }>;
  favoriteShows?: Record<string, { anime: AnimeSummary; addedAt: number }>;
  favoriteCharacters?: Record<string, FavoriteCharacter>;
  settings?: Partial<SettingsRow>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const isStatus = (value: unknown): value is WatchStatus =>
  typeof value === "string" && (WATCH_STATUSES as readonly string[]).includes(value);

const isAnime = (value: unknown): value is AnimeSummary =>
  isRecord(value) &&
  (value.source === "mal" || value.source === "anilist") &&
  typeof value.id === "number" &&
  typeof value.title === "string" &&
  isRecord(value.ids);

const toNumber = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const toNotes = (value: unknown): Note[] =>
  Array.isArray(value)
    ? value.filter(
        (note): note is Note => isRecord(note) && typeof note.id === "string" && typeof note.text === "string"
      )
    : [];

/**
 * Reads a library entry from untrusted JSON (old storage, backups). Anything malformed is
 * dropped instead of crashing the app or poisoning the database.
 */
export const parseEntry = (key: string, value: unknown): LibraryEntry | undefined => {
  if (!isRecord(value) || !isAnime(value.anime) || !isStatus(value.status)) {
    return undefined;
  }
  const now = Date.now();
  return withIdFields({
    addedAt: toNumber(value.addedAt, now),
    anime: value.anime,
    key: typeof value.key === "string" ? value.key : key,
    notes: toNotes(value.notes),
    notify: value.notify === true,
    progress: Math.max(0, Math.round(toNumber(value.progress, 0))),
    score: Math.min(10, Math.max(0, Math.round(toNumber(value.score, 0)))),
    status: value.status,
    trackers: isRecord(value.trackers) ? value.trackers : undefined,
    updatedAt: toNumber(value.updatedAt, now),
  });
};

export const parseSaved = (key: string, value: unknown): SavedAnime | undefined =>
  isRecord(value) && isAnime(value.anime)
    ? { addedAt: toNumber(value.addedAt, Date.now()), anime: value.anime, key }
    : undefined;

export const parseCharacter = (key: string, value: unknown): FavoriteCharacter | undefined =>
  isRecord(value) &&
  (value.source === "mal" || value.source === "anilist") &&
  typeof value.id === "number" &&
  typeof value.name === "string"
    ? {
        addedAt: toNumber(value.addedAt, Date.now()),
        id: value.id,
        image: typeof value.image === "string" ? value.image : undefined,
        key,
        name: value.name,
        source: value.source,
      }
    : undefined;

export const parseSettings = (value: unknown): SettingsRow => {
  const settings = isRecord(value) ? value : {};
  return {
    calendarHideUpcoming: settings.calendarHideUpcoming === true,
    homeSort:
      settings.homeSort === "title" || settings.homeSort === "score" || settings.homeSort === "start"
        ? settings.homeSort
        : DEFAULT_SETTINGS.homeSort,
    id: SETTINGS_ID,
    source: settings.source === "mal" ? "mal" : DEFAULT_SETTINGS.source,
    titleLanguage: settings.titleLanguage === "english" ? "english" : DEFAULT_SETTINGS.titleLanguage,
  };
};

/** Parses every value of a stored record, dropping invalid rows and repeated keys (first one wins). */
export const parseRecord = <T extends { key: string }>(
  record: unknown,
  parse: (key: string, value: unknown) => T | undefined
): T[] => {
  if (!isRecord(record)) {
    return [];
  }
  const rows = new Map<string, T>();
  for (const [key, value] of Object.entries(record)) {
    const parsed = parse(key, value);
    if (parsed !== undefined && !rows.has(parsed.key)) {
      rows.set(parsed.key, parsed);
    }
  }
  return [...rows.values()];
};

interface Insertable<T> {
  has: (key: string) => boolean;
  insert: (rows: T[]) => { when: (state: "settled") => Promise<unknown> };
}

const byKey = (row: { key: string }): string => row.key;

/** Inserts the rows that are not stored yet and waits until they are on disk. */
const insertMissing = async <T>(collection: Insertable<T>, rows: T[], keyOf: (row: T) => string): Promise<void> => {
  const missing = rows.filter((row) => !collection.has(keyOf(row)));
  if (missing.length > 0) {
    await collection.insert(missing).when("settled");
  }
};

/**
 * Copies the library of older versions into TanStack DB. It is safe to run again: only rows
 * that are not stored yet are added, so an interrupted migration finishes on the next launch
 * without overwriting anything changed since. The old copy is left in place as a fallback.
 */
const migrateLegacy = async (): Promise<void> => {
  if ((await kv.getItem(MIGRATED_KEY)) !== null) {
    return;
  }
  const raw = await kv.getItem(LEGACY_KEY);
  if (raw !== null) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Unreadable old data: start empty but keep the old copy (the flag below is not set).
      return;
    }
    const state: LegacyState = isRecord(parsed) && isRecord(parsed.state) ? parsed.state : {};
    await insertMissing(entriesCollection, parseRecord(state.entries, parseEntry), byKey);
    await insertMissing(bookmarksCollection, parseRecord(state.bookmarks, parseSaved), byKey);
    await insertMissing(favoriteShowsCollection, parseRecord(state.favoriteShows, parseSaved), byKey);
    await insertMissing(favoriteCharactersCollection, parseRecord(state.favoriteCharacters, parseCharacter), byKey);
    await insertMissing(settingsCollection, [parseSettings(state.settings)], (row) => row.id);
  }
  await kv.setItem(MIGRATED_KEY, String(Date.now()));
};

let ready: Promise<void> | undefined;

/** Loads every collection from disk (and migrates old data) before the app reads the library. */
export const whenLibraryReady = async (): Promise<void> => {
  ready ??= (async () => {
    await Promise.all(
      ALL.map(async (collection) => {
        await collection.preload();
      })
    );
    await migrateLegacy();
  })();
  await ready;
};
