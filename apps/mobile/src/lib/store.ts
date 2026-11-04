import { diffList, isEmptyChange } from "@ikuzo/anime/sync-plan";
import type { PlannedInsert, PlannedUpdate } from "@ikuzo/anime/sync-plan";
import type { ListChange, TrackerId } from "@ikuzo/anime/trackers";
import type { AnimeSummary, CharacterRole, Source } from "@ikuzo/anime/types";
import { eq, or, useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";

import {
  bookmarksCollection,
  entriesCollection,
  favoriteCharactersCollection,
  favoriteShowsCollection,
  SETTINGS_ID,
  settingsCollection,
  withIdFields,
} from "./db";
import { emitLibraryChange } from "./library-events";
import type { LibraryChange } from "./library-events";
import { DEFAULT_SETTINGS } from "./library-types";
import type {
  FavoriteCharacter,
  LibraryEntry,
  Note,
  SavedAnime,
  Settings,
  TitleLanguage,
  WatchStatus,
} from "./library-types";
import { reportWriteError } from "./write-errors";

export { WATCH_STATUS_LABELS, WATCH_STATUSES } from "./library-types";
export type {
  FavoriteCharacter,
  HomeSort,
  LibraryEntry,
  Note,
  SavedAnime,
  Settings,
  TitleLanguage,
  WatchStatus,
} from "./library-types";

const ID_RADIX = 36;

export const animeKey = (anime: Pick<AnimeSummary, "source" | "id">): string => `${anime.source}:${anime.id}`;

export const characterKey = (source: Source, id: number): string => `${source}:${id}`;

/** Title in the user's preferred language. */
export const displayTitle = (anime: AnimeSummary, language: TitleLanguage): string =>
  language === "english" ? (anime.titleEnglish ?? anime.title) : anime.title;

type EntryLookup = Pick<AnimeSummary, "source" | "id" | "ids">;

/** TanStack DB adds virtual `$…` fields to rows it returns; they must not be written back. */
export const stripVirtual = <T extends object>(row: T): T => {
  const copy = { ...row };
  for (const name of Object.keys(copy)) {
    if (name.startsWith("$")) {
      Reflect.deleteProperty(copy, name);
    }
  }
  return copy;
};

const newId = (): string => `${Date.now().toString(ID_RADIX)}${Math.random().toString(ID_RADIX).slice(2)}`;

// ── Reading outside React (sync engine, notifications, actions) ─────────────

export const getEntries = (): LibraryEntry[] => entriesCollection.toArray.map(stripVirtual);

export const getEntry = (key: string): LibraryEntry | undefined => {
  const entry = entriesCollection.get(key);
  return entry === undefined ? undefined : stripVirtual(entry);
};

/**
 * The library entry for a show, whichever source it was added from: a show added
 * from MyAnimeList is the same entry when opened through AniList.
 */
export const findEntry = (anime: EntryLookup): LibraryEntry | undefined => {
  const direct = getEntry(animeKey(anime));
  if (direct !== undefined) {
    return direct;
  }
  const { mal, anilist } = anime.ids;
  const match = entriesCollection.toArray.find(
    (entry) => (mal !== undefined && entry.malId === mal) || (anilist !== undefined && entry.anilistId === anilist)
  );
  return match === undefined ? undefined : stripVirtual(match);
};

/** Key of the show's entry if it is in the library, otherwise the key a new entry would get. */
export const entryKeyFor = (anime: EntryLookup): string => findEntry(anime)?.key ?? animeKey(anime);

export const getSettings = (): Settings => settingsCollection.get(SETTINGS_ID) ?? DEFAULT_SETTINGS;

// ── Hooks (live queries) ────────────────────────────────────────────────────

export const useEntries = (): LibraryEntry[] => {
  const { data } = useLiveQuery({ query: (q) => q.from({ entry: entriesCollection }) });
  return data;
};

export type EntryLookupFn = (anime: EntryLookup) => LibraryEntry | undefined;

/** One lookup for long lists (search results, bookmarks): built once per library change. */
export const useEntryLookup = (): EntryLookupFn => {
  const entries = useEntries();
  return useMemo(() => {
    const byKey = new Map<string, LibraryEntry>();
    const byMal = new Map<number, LibraryEntry>();
    const byAniList = new Map<number, LibraryEntry>();
    for (const entry of entries) {
      byKey.set(entry.key, entry);
      if (entry.malId !== undefined) {
        byMal.set(entry.malId, entry);
      }
      if (entry.anilistId !== undefined) {
        byAniList.set(entry.anilistId, entry);
      }
    }
    return (anime) =>
      byKey.get(animeKey(anime)) ??
      (anime.ids.mal === undefined ? undefined : byMal.get(anime.ids.mal)) ??
      (anime.ids.anilist === undefined ? undefined : byAniList.get(anime.ids.anilist));
  }, [entries]);
};

/** The library entry for a show, matched across AniList and MyAnimeList ids (indexed lookup). */
export const useEntry = (anime: EntryLookup): LibraryEntry | undefined => {
  const key = animeKey(anime);
  const { mal, anilist } = anime.ids;
  const { data } = useLiveQuery({
    query: (q) =>
      q
        .from({ entry: entriesCollection })
        .where(({ entry }) => {
          let match = eq(entry.key, key);
          if (mal !== undefined) {
            match = or(match, eq(entry.malId, mal));
          }
          if (anilist !== undefined) {
            match = or(match, eq(entry.anilistId, anilist));
          }
          return match;
        })
        .findOne(),
  });
  return data;
};

export const useSettings = (): Settings => {
  const { data } = useLiveQuery({
    query: (q) =>
      q
        .from({ settings: settingsCollection })
        .where(({ settings }) => eq(settings.id, SETTINGS_ID))
        .findOne(),
  });
  return data ?? DEFAULT_SETTINGS;
};

/** Bookmarks, newest first. */
export const useBookmarks = (): SavedAnime[] => {
  const { data } = useLiveQuery({
    query: (q) => q.from({ bookmark: bookmarksCollection }).orderBy(({ bookmark }) => bookmark.addedAt, "desc"),
  });
  return data;
};

/** Favourite shows, newest first. */
export const useFavoriteShows = (): SavedAnime[] => {
  const { data } = useLiveQuery({
    query: (q) => q.from({ favorite: favoriteShowsCollection }).orderBy(({ favorite }) => favorite.addedAt, "desc"),
  });
  return data;
};

/** Favourite characters, newest first. */
export const useFavoriteCharacters = (): FavoriteCharacter[] => {
  const { data } = useLiveQuery({
    query: (q) =>
      q.from({ favorite: favoriteCharactersCollection }).orderBy(({ favorite }) => favorite.addedAt, "desc"),
  });
  return data;
};

export const useIsBookmarked = (anime: Pick<AnimeSummary, "source" | "id">): boolean => {
  const key = animeKey(anime);
  const { data } = useLiveQuery({
    query: (q) =>
      q
        .from({ bookmark: bookmarksCollection })
        .where(({ bookmark }) => eq(bookmark.key, key))
        .findOne(),
  });
  return data !== undefined;
};

export const useIsFavoriteShow = (anime: Pick<AnimeSummary, "source" | "id">): boolean => {
  const key = animeKey(anime);
  const { data } = useLiveQuery({
    query: (q) =>
      q
        .from({ favorite: favoriteShowsCollection })
        .where(({ favorite }) => eq(favorite.key, key))
        .findOne(),
  });
  return data !== undefined;
};

export const useIsFavoriteCharacter = (source: Source, id: number): boolean => {
  const key = characterKey(source, id);
  const { data } = useLiveQuery({
    query: (q) =>
      q
        .from({ favorite: favoriteCharactersCollection })
        .where(({ favorite }) => eq(favorite.key, key))
        .findOne(),
  });
  return data !== undefined;
};

// ── Writing ────────────────────────────────────────────────────────────────

type ListPatch = Partial<Pick<LibraryEntry, "status" | "progress" | "score">>;

const clampProgress = (anime: AnimeSummary, progress: number): number => {
  const max = anime.episodes ?? Number.POSITIVE_INFINITY;
  return Math.max(0, Math.min(Math.round(progress), max));
};

/** Moving progress implies a status: started → watching, reached the end → completed. */
const statusForProgress = (anime: AnimeSummary, current: WatchStatus, progress: number): WatchStatus => {
  const total = anime.episodes;
  if (total !== null && total > 0 && progress >= total) {
    return "completed";
  }
  if (progress > 0 && (current === "planned" || current === "onHold")) {
    return "watching";
  }
  return current;
};

/** The list values after applying `patch` to `entry`, with the usual progress/status rules. */
const nextListValues = (
  anime: AnimeSummary,
  current: Pick<LibraryEntry, "status" | "progress" | "score">,
  patch: ListPatch
): Pick<LibraryEntry, "status" | "progress" | "score"> => {
  let progress = clampProgress(anime, patch.progress ?? current.progress);
  let status = patch.status ?? current.status;
  if (patch.progress !== undefined && patch.status === undefined) {
    status = statusForProgress(anime, current.status, progress);
  }
  if (patch.status === "completed" && anime.episodes !== null) {
    progress = anime.episodes;
  }
  return { progress, score: patch.score ?? current.score, status };
};

/** Keeps the entry's snapshot from its own source, but learns the other service's ids. */
const mergeSnapshot = (current: AnimeSummary, incoming: AnimeSummary): AnimeSummary =>
  current.source === incoming.source
    ? { ...current, ...incoming, ids: { ...current.ids, ...incoming.ids } }
    : { ...current, ids: { ...incoming.ids, ...current.ids } };

interface Write {
  when: (state: "settled") => Promise<unknown>;
}

/**
 * Waits for a write to reach the disk. Only then is the change announced to the sync engine, so
 * a write that fails (and is rolled back by TanStack DB) is never sent to AniList or MyAnimeList.
 */
const afterWrite = (write: Write, change?: LibraryChange): void => {
  const settle = async () => {
    try {
      await write.when("settled");
      if (change !== undefined) {
        emitLibraryChange(change);
      }
    } catch (error) {
      reportWriteError(error);
    }
  };
  void settle();
};

const writeEntry = (key: string, next: LibraryEntry): Write =>
  entriesCollection.update(key, (draft) => {
    Object.assign(draft, withIdFields(next));
  });

/** Adds a show to the library, or changes its list values. */
const save = (anime: AnimeSummary, patch: ListPatch = {}): LibraryEntry => {
  const existing = findEntry(anime);
  const now = Date.now();
  if (existing === undefined) {
    const values = nextListValues(anime, { progress: 0, score: 0, status: "planned" }, patch);
    const entry = withIdFields({
      ...values,
      addedAt: now,
      anime,
      key: animeKey(anime),
      notes: [],
      notify: false,
      updatedAt: now,
    });
    afterWrite(entriesCollection.insert(entry), { change: values, entry, isNew: true, kind: "save" });
    return entry;
  }
  const merged = mergeSnapshot(existing.anime, anime);
  const values = nextListValues(merged, existing, patch);
  const change = diffList(existing, values);
  const next = { ...existing, ...values, anime: merged, updatedAt: isEmptyChange(change) ? existing.updatedAt : now };
  afterWrite(
    writeEntry(existing.key, next),
    isEmptyChange(change) ? undefined : { change, entry: next, isNew: false, kind: "save" }
  );
  return next;
};

const update = (key: string, patch: ListPatch & { notify?: boolean }): void => {
  const entry = getEntry(key);
  if (entry === undefined) {
    return;
  }
  const values = nextListValues(entry.anime, entry, patch);
  const change = diffList(entry, values);
  const next = {
    ...entry,
    ...values,
    notify: patch.notify ?? entry.notify,
    updatedAt: isEmptyChange(change) ? entry.updatedAt : Date.now(),
  };
  afterWrite(
    writeEntry(key, next),
    isEmptyChange(change) ? undefined : { change, entry: next, isNew: false, kind: "save" }
  );
};

const increment = (key: string): void => {
  const entry = getEntry(key);
  if (entry !== undefined) {
    update(key, { progress: entry.progress + 1 });
  }
};

/** Removes a show (and its notes). Returns the removed entry so the caller can offer Undo. */
const remove = (key: string): LibraryEntry | undefined => {
  const entry = getEntry(key);
  if (entry === undefined) {
    return undefined;
  }
  afterWrite(entriesCollection.delete(key), { entry, kind: "remove" });
  return entry;
};

/** Puts back an entry exactly as it was (Undo after delete). */
const restoreEntry = (entry: LibraryEntry): void => {
  if (getEntry(entry.key) !== undefined) {
    return;
  }
  const clean = withIdFields(stripVirtual(entry));
  const change: ListChange = { progress: clean.progress, score: clean.score, status: clean.status };
  afterWrite(entriesCollection.insert(clean), { change, entry: clean, isNew: true, kind: "save" });
};

/** Newer show data (episode counts, air dates) for entries; list values are untouched and nothing syncs. */
const refreshSnapshots = (shows: AnimeSummary[]): void => {
  for (const anime of shows) {
    const entry = findEntry(anime);
    if (entry !== undefined) {
      afterWrite(writeEntry(entry.key, { ...entry, anime: mergeSnapshot(entry.anime, anime) }));
    }
  }
};

/** Applies a sync plan from AniList / MyAnimeList in two bulk writes. Nothing is sent back from here. */
const applySyncPlan = async (inserts: PlannedInsert[], updates: PlannedUpdate[]): Promise<void> => {
  const fresh = inserts.filter((item) => getEntry(item.key) === undefined);
  const pending: Promise<unknown>[] = [];
  if (fresh.length > 0) {
    const rows = fresh.map((item) =>
      withIdFields({
        addedAt: item.updatedAt,
        anime: item.anime,
        key: item.key,
        notes: [],
        notify: false,
        progress: item.progress,
        score: item.score,
        status: item.status,
        trackers: item.trackers,
        updatedAt: item.updatedAt,
      })
    );
    pending.push(entriesCollection.insert(rows).when("settled"));
  }
  const byKey = new Map(updates.filter((item) => getEntry(item.key) !== undefined).map((item) => [item.key, item]));
  if (byKey.size > 0) {
    const transaction = entriesCollection.update([...byKey.keys()], (drafts) => {
      for (const draft of drafts) {
        const item = byKey.get(draft.key);
        if (item !== undefined) {
          if (item.values !== undefined) {
            Object.assign(draft, item.values);
          }
          draft.anime = { ...draft.anime, ids: item.ids };
          draft.malId = item.ids.mal;
          draft.anilistId = item.ids.anilist;
          draft.trackers = item.trackers;
        }
      }
    });
    pending.push(transaction.when("settled"));
  }
  await Promise.all(pending);
};

/** Records that a service now has (at > 0) or no longer has (0) the show. */
const markTracker = (key: string, tracker: TrackerId, at: number): void => {
  if (getEntry(key) !== undefined) {
    afterWrite(
      entriesCollection.update(key, (draft) => {
        draft.trackers = { ...draft.trackers, [tracker]: at };
      })
    );
  }
};

/** Forgets which shows were on a service (after signing out of it). */
const clearTrackerMarks = async (tracker: TrackerId): Promise<void> => {
  const keys = entriesCollection.toArray.filter((entry) => entry.trackers?.[tracker] !== undefined).map((e) => e.key);
  if (keys.length > 0) {
    await entriesCollection
      .update(keys, (drafts) => {
        for (const draft of drafts) {
          const { [tracker]: _removed, ...rest } = draft.trackers ?? {};
          draft.trackers = rest;
        }
      })
      .when("settled");
  }
};

const addNote = (key: string, text: string, episode?: number): void => {
  const note: Note = { createdAt: Date.now(), episode, id: newId(), text };
  afterWrite(
    entriesCollection.update(key, (draft) => {
      draft.notes = [note, ...draft.notes];
    })
  );
};

const deleteNote = (key: string, noteId: string): Note | undefined => {
  const note = getEntry(key)?.notes.find((item) => item.id === noteId);
  if (note !== undefined) {
    afterWrite(
      entriesCollection.update(key, (draft) => {
        draft.notes = draft.notes.filter((item) => item.id !== noteId);
      })
    );
  }
  return note;
};

const restoreNote = (key: string, note: Note): void => {
  if (getEntry(key) !== undefined) {
    afterWrite(
      entriesCollection.update(key, (draft) => {
        draft.notes = [note, ...draft.notes].toSorted((a, b) => b.createdAt - a.createdAt);
      })
    );
  }
};

const toggleSaved = (collection: typeof bookmarksCollection, anime: AnimeSummary): boolean => {
  const key = animeKey(anime);
  if (collection.has(key)) {
    afterWrite(collection.delete(key));
    return false;
  }
  afterWrite(collection.insert({ addedAt: Date.now(), anime, key }));
  return true;
};

const toggleBookmark = (anime: AnimeSummary): boolean => toggleSaved(bookmarksCollection, anime);

const toggleFavoriteShow = (anime: AnimeSummary): boolean => toggleSaved(favoriteShowsCollection, anime);

const toggleFavoriteCharacter = (source: Source, character: Pick<CharacterRole, "id" | "name" | "image">): void => {
  const key = characterKey(source, character.id);
  if (favoriteCharactersCollection.has(key)) {
    afterWrite(favoriteCharactersCollection.delete(key));
    return;
  }
  const insert = favoriteCharactersCollection.insert({
    addedAt: Date.now(),
    id: character.id,
    image: character.image,
    key,
    name: character.name,
    source,
  });
  afterWrite(insert);
};

const setSettings = (patch: Partial<Settings>): void => {
  afterWrite(
    settingsCollection.has(SETTINGS_ID)
      ? settingsCollection.update(SETTINGS_ID, (draft) => {
          Object.assign(draft, patch);
        })
      : settingsCollection.insert({ ...DEFAULT_SETTINGS, ...patch, id: SETTINGS_ID })
  );
};

/** Every write to the library goes through these. */
export const library = {
  addNote,
  applySyncPlan,
  clearTrackerMarks,
  deleteNote,
  increment,
  markTracker,
  refreshSnapshots,
  remove,
  restoreEntry,
  restoreNote,
  save,
  setSettings,
  toggleBookmark,
  toggleFavoriteCharacter,
  toggleFavoriteShow,
  update,
};
