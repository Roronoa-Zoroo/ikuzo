import { diffList, isEmptyChange } from "@ikuzo/anime/account-sync";
import type { PullPlan } from "@ikuzo/anime/account-sync";
import type { AnimeSummary, CharacterRole, Source } from "@ikuzo/anime/types";
import { useMemo, useSyncExternalStore } from "react";

import {
  bookmarksCollection,
  entriesCollection,
  favoriteCharactersCollection,
  favoriteShowsCollection,
  notesCollection,
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
import { createMirror, stripVirtual } from "./mirror";
import { reportWriteError } from "./write-errors";

export { stripVirtual } from "./mirror";

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

/**
 * Only the summary fields of a show. Detail screens pass the full AnimeDetail (synopsis,
 * relations, links), which would bloat every entry, bookmark and backup.
 */
export const summaryOf = (anime: AnimeSummary): AnimeSummary => ({
  airedFrom: anime.airedFrom,
  airedTo: anime.airedTo,
  banner: anime.banner,
  broadcast: anime.broadcast,
  durationMinutes: anime.durationMinutes,
  episodes: anime.episodes,
  format: anime.format,
  genres: anime.genres,
  id: anime.id,
  ids: anime.ids,
  image: anime.image,
  isAdult: anime.isAdult,
  members: anime.members,
  nextEpisode: anime.nextEpisode,
  score: anime.score,
  season: anime.season,
  source: anime.source,
  status: anime.status,
  synonyms: anime.synonyms,
  title: anime.title,
  titleEnglish: anime.titleEnglish,
  titleNative: anime.titleNative,
  year: anime.year,
});

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

// ── Hooks ───────────────────────────────────────────────────────────────────
// Every hook reads a shared in-memory mirror of its collection (see mirror.ts).

const entries = createMirror(entriesCollection);
const bookmarks = createMirror(bookmarksCollection);
const favoriteShows = createMirror(favoriteShowsCollection);
const favoriteCharacters = createMirror(favoriteCharactersCollection);
const notes = createMirror(notesCollection);
const settings = createMirror(settingsCollection);

/**
 * Called once the library has loaded from disk. Loading is not announced as changes, so screens
 * that mounted earlier pick the rows up here.
 */
export const refreshLibraryViews = (): void => {
  for (const mirror of [entries, bookmarks, favoriteShows, favoriteCharacters, notes, settings]) {
    mirror.resync();
  }
};

export type EntryLookupFn = (anime: EntryLookup) => LibraryEntry | undefined;

/** Finds entries by key, MyAnimeList id or AniList id; rebuilt once per library change. */
const entryLookup = entries.derive((rows): EntryLookupFn => {
  const byMal = new Map<number, LibraryEntry>();
  const byAniList = new Map<number, LibraryEntry>();
  for (const entry of rows) {
    if (entry.malId !== undefined) {
      byMal.set(entry.malId, entry);
    }
    if (entry.anilistId !== undefined) {
      byAniList.set(entry.anilistId, entry);
    }
  }
  return (anime) =>
    entries.get(animeKey(anime)) ??
    (anime.ids.mal === undefined ? undefined : byMal.get(anime.ids.mal)) ??
    (anime.ids.anilist === undefined ? undefined : byAniList.get(anime.ids.anilist));
});

export const useEntries = (): readonly LibraryEntry[] => useSyncExternalStore(entries.subscribe, entries.list);

/** One lookup for long lists (search results, bookmarks). */
export const useEntryLookup = (): EntryLookupFn => useSyncExternalStore(entries.subscribe, entryLookup);

/**
 * The library entry for a show, matched across AniList and MyAnimeList ids. Re-renders only
 * when that entry changes, not when any other show does.
 */
export const useEntry = (anime: EntryLookup): LibraryEntry | undefined =>
  useSyncExternalStore(entries.subscribe, () => entryLookup()(anime));

const readSettings = (): Settings => settings.get(SETTINGS_ID) ?? DEFAULT_SETTINGS;

export const useSettings = (): Settings => useSyncExternalStore(settings.subscribe, readSettings);

const newestFirst = <T extends { addedAt: number }>(rows: readonly T[]): readonly T[] =>
  rows.toSorted((a, b) => b.addedAt - a.addedAt);

const bookmarkList = bookmarks.derive(newestFirst);
const favoriteShowList = favoriteShows.derive(newestFirst);
const favoriteCharacterList = favoriteCharacters.derive(newestFirst);

/** Bookmarks, newest first. */
export const useBookmarks = (): readonly SavedAnime[] => useSyncExternalStore(bookmarks.subscribe, bookmarkList);

/** Favourite shows, newest first. */
export const useFavoriteShows = (): readonly SavedAnime[] =>
  useSyncExternalStore(favoriteShows.subscribe, favoriteShowList);

/** Favourite characters, newest first. */
export const useFavoriteCharacters = (): readonly FavoriteCharacter[] =>
  useSyncExternalStore(favoriteCharacters.subscribe, favoriteCharacterList);

export const useIsBookmarked = (anime: Pick<AnimeSummary, "source" | "id">): boolean =>
  useSyncExternalStore(bookmarks.subscribe, () => bookmarks.has(animeKey(anime)));

export const useIsFavoriteShow = (anime: Pick<AnimeSummary, "source" | "id">): boolean =>
  useSyncExternalStore(favoriteShows.subscribe, () => favoriteShows.has(animeKey(anime)));

export const useIsFavoriteCharacter = (source: Source, id: number): boolean =>
  useSyncExternalStore(favoriteCharacters.subscribe, () => favoriteCharacters.has(characterKey(source, id)));

/** Notes about a show, newest first, matched across AniList and MyAnimeList ids. */
export const useNotes = (anime: EntryLookup): Note[] => {
  const all = useSyncExternalStore(notes.subscribe, notes.list);
  const key = animeKey(anime);
  const { mal, anilist } = anime.ids;
  return useMemo(
    () =>
      all
        .filter(
          (note) =>
            note.showKey === key ||
            (mal !== undefined && note.malId === mal) ||
            (anilist !== undefined && note.anilistId === anilist)
        )
        .toSorted((a, b) => b.createdAt - a.createdAt),
    [all, anilist, key, mal]
  );
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
  summaryOf(
    current.source === incoming.source
      ? { ...current, ...incoming, ids: { ...current.ids, ...incoming.ids } }
      : { ...current, ids: { ...incoming.ids, ...current.ids } }
  );

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
      anime: summaryOf(anime),
      key: animeKey(anime),
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

/** Removes a show from the list (its notes stay). Returns the removed entry so the caller can offer Undo. */
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
  afterWrite(entriesCollection.insert(clean), { entry: clean, kind: "restore" });
};

/** Newer show data (episode counts, air dates) for entries; list values are untouched and nothing syncs. */
const refreshSnapshots = (shows: AnimeSummary[]): void => {
  const fresh = new Map<string, AnimeSummary>();
  for (const anime of shows) {
    const entry = findEntry(anime);
    if (entry !== undefined) {
      fresh.set(entry.key, mergeSnapshot(entry.anime, anime));
    }
  }
  if (fresh.size === 0) {
    return;
  }
  // One write for all of them: screens update once instead of once per show.
  afterWrite(
    entriesCollection.update([...fresh.keys()], (drafts) => {
      for (const draft of drafts) {
        const anime = fresh.get(draft.key);
        if (anime !== undefined) {
          draft.anime = anime;
          draft.malId = anime.ids.mal;
          draft.anilistId = anime.ids.anilist;
        }
      }
    })
  );
};

/**
 * Makes the library match the main account's list (planned by planPull). Nothing is announced
 * to sync: this is the account's own data. Notification switches and notes are kept.
 */
const applyPull = async (plan: Pick<PullPlan, "inserts" | "updates" | "deletes">): Promise<void> => {
  const writes: Promise<unknown>[] = [];
  const fresh = plan.inserts.filter((item) => !entriesCollection.has(item.key));
  if (fresh.length > 0) {
    const rows = fresh.map((item) =>
      withIdFields({
        addedAt: item.updatedAt,
        anime: summaryOf(item.anime),
        key: item.key,
        notify: false,
        progress: item.progress,
        score: item.score,
        status: item.status,
        updatedAt: item.updatedAt,
      })
    );
    writes.push(entriesCollection.insert(rows).when("settled"));
  }
  const updates = new Map(
    plan.updates.filter((item) => entriesCollection.has(item.key)).map((item) => [item.key, item])
  );
  if (updates.size > 0) {
    const transaction = entriesCollection.update([...updates.keys()], (drafts) => {
      for (const draft of drafts) {
        const item = updates.get(draft.key);
        if (item !== undefined) {
          draft.status = item.status;
          draft.progress = item.progress;
          draft.score = item.score;
          draft.updatedAt = item.updatedAt;
          draft.anime = summaryOf(item.anime);
          draft.malId = item.anime.ids.mal;
          draft.anilistId = item.anime.ids.anilist;
        }
      }
    });
    writes.push(transaction.when("settled"));
  }
  const deletes = plan.deletes.filter((key) => entriesCollection.has(key));
  if (deletes.length > 0) {
    writes.push(entriesCollection.delete(deletes).when("settled"));
  }
  await Promise.all(writes);
};

/** Removes shows from the library only (the account already does not have them). */
const removeLocally = async (keys: string[]): Promise<void> => {
  await applyPull({ deletes: keys, inserts: [], updates: [] });
};

/** Adds a note about a show; the show does not have to be in the list. */
const addNote = (anime: EntryLookup, text: string, episode?: number): void => {
  afterWrite(
    notesCollection.insert({
      anilistId: anime.ids.anilist,
      createdAt: Date.now(),
      episode,
      id: newId(),
      malId: anime.ids.mal,
      showKey: animeKey(anime),
      text,
    })
  );
};

/** Deletes a note and returns it for Undo. */
const deleteNote = (noteId: string): Note | undefined => {
  const note = notesCollection.get(noteId);
  if (note === undefined) {
    return undefined;
  }
  afterWrite(notesCollection.delete(noteId));
  return stripVirtual(note);
};

const restoreNote = (note: Note): void => {
  if (!notesCollection.has(note.id)) {
    afterWrite(notesCollection.insert(note));
  }
};

const toggleSaved = (collection: typeof bookmarksCollection, anime: AnimeSummary): boolean => {
  const key = animeKey(anime);
  if (collection.has(key)) {
    afterWrite(collection.delete(key));
    return false;
  }
  afterWrite(collection.insert({ addedAt: Date.now(), anime: summaryOf(anime), key }));
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
  applyPull,
  deleteNote,
  increment,
  refreshSnapshots,
  remove,
  removeLocally,
  restoreEntry,
  restoreNote,
  save,
  setSettings,
  toggleBookmark,
  toggleFavoriteCharacter,
  toggleFavoriteShow,
  update,
};
