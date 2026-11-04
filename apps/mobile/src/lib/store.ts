import type { ListStatus, RemoteEntry } from "@ikuzo/anime/trackers";
import type { AnimeSummary, CharacterRole, Source } from "@ikuzo/anime/types";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

import { kv } from "./kv";

export type WatchStatus = ListStatus;

export const WATCH_STATUSES: readonly WatchStatus[] = ["watching", "planned", "onHold", "completed", "dropped"];

export const WATCH_STATUS_LABELS: Record<WatchStatus, string> = {
  completed: "Completed",
  dropped: "Dropped",
  onHold: "On hold",
  planned: "Plan to watch",
  watching: "Watching",
};

export interface Note {
  id: string;
  episode?: number;
  text: string;
  createdAt: number;
}

export interface LibraryEntry {
  key: string;
  /** Snapshot of the show, refreshed from the source when the list is refreshed. */
  anime: AnimeSummary;
  status: WatchStatus;
  progress: number;
  /** 0 = not scored, otherwise 1–10 */
  score: number;
  notify: boolean;
  notes: Note[];
  addedAt: number;
  updatedAt: number;
}

export interface SavedAnime {
  anime: AnimeSummary;
  addedAt: number;
}

export interface FavoriteCharacter {
  key: string;
  source: Source;
  id: number;
  name: string;
  image?: string;
  addedAt: number;
}

export type TitleLanguage = "romaji" | "english";

export interface Settings {
  source: Source;
  titleLanguage: TitleLanguage;
  /** Hide shows that are not out yet from the Calendar "My shows" tab */
  calendarHideUpcoming: boolean;
}

interface LibraryState {
  entries: Record<string, LibraryEntry>;
  bookmarks: Record<string, SavedAnime>;
  favoriteShows: Record<string, SavedAnime>;
  favoriteCharacters: Record<string, FavoriteCharacter>;
  settings: Settings;
}

interface LibraryActions {
  save: (anime: AnimeSummary, patch?: Partial<Pick<LibraryEntry, "status" | "progress" | "score">>) => void;
  update: (key: string, patch: Partial<Pick<LibraryEntry, "status" | "progress" | "score" | "notify">>) => void;
  increment: (key: string) => void;
  remove: (key: string) => void;
  refreshSnapshots: (shows: AnimeSummary[]) => void;
  toggleBookmark: (anime: AnimeSummary) => void;
  toggleFavoriteShow: (anime: AnimeSummary) => void;
  toggleFavoriteCharacter: (source: Source, character: Pick<CharacterRole, "id" | "name" | "image">) => void;
  addNote: (key: string, text: string, episode?: number) => void;
  deleteNote: (key: string, noteId: string) => void;
  setSettings: (patch: Partial<Settings>) => void;
  importBackup: (backup: Backup) => void;
  /** Applies a list downloaded from AniList or MyAnimeList; the newer side wins per show. */
  mergeRemote: (remote: RemoteEntry[]) => MergeResult;
}

export interface MergeResult {
  added: number;
  updated: number;
  /** Shows changed in Ikuzo after the service's copy: these should be sent back. */
  localNewer: string[];
}

export interface Backup extends LibraryState {
  app: "ikuzo";
  version: number;
  exportedAt: string;
}

const BACKUP_VERSION = 1;
const ID_RADIX = 36;

export const animeKey = (anime: Pick<AnimeSummary, "source" | "id">): string => `${anime.source}:${anime.id}`;

export const characterKey = (source: Source, id: number): string => `${source}:${id}`;

type EntryLookup = Pick<AnimeSummary, "source" | "id" | "ids">;

const sameShow = (a: AnimeSummary["ids"], b: AnimeSummary["ids"]): boolean =>
  (a.mal !== undefined && a.mal === b.mal) || (a.anilist !== undefined && a.anilist === b.anilist);

/**
 * The library entry for a show, whichever source it was added from: a show added
 * from MyAnimeList is the same entry when opened through AniList.
 */
export const findEntry = (entries: Record<string, LibraryEntry>, anime: EntryLookup): LibraryEntry | undefined =>
  entries[animeKey(anime)] ?? Object.values(entries).find((entry) => sameShow(entry.anime.ids, anime.ids));

const clampProgress = (anime: AnimeSummary, progress: number): number => {
  const max = anime.episodes ?? Number.POSITIVE_INFINITY;
  return Math.max(0, Math.min(Math.round(progress), max));
};

/** Moving progress implies a status: started → watching, reached the end → completed. */
const statusForProgress = (entry: LibraryEntry, progress: number): WatchStatus => {
  const total = entry.anime.episodes;
  if (total !== null && total > 0 && progress >= total) {
    return "completed";
  }
  if (progress > 0 && (entry.status === "planned" || entry.status === "onHold")) {
    return "watching";
  }
  return entry.status;
};

/** Keeps the entry's own snapshot but learns the other service's id. */
const mergeIds = (anime: AnimeSummary, other: AnimeSummary): AnimeSummary => ({
  ...anime,
  ids: { ...other.ids, ...anime.ids },
});

const without = <T>(record: Record<string, T>, key: string): Record<string, T> =>
  Object.fromEntries(Object.entries(record).filter(([entryKey]) => entryKey !== key));

const newId = (): string => `${Date.now().toString(ID_RADIX)}${Math.random().toString(ID_RADIX).slice(2)}`;

const initialState: LibraryState = {
  bookmarks: {},
  entries: {},
  favoriteCharacters: {},
  favoriteShows: {},
  settings: { calendarHideUpcoming: false, source: "anilist", titleLanguage: "romaji" },
};

export const useLibrary = create<LibraryState & LibraryActions>()(
  persist(
    (set) => ({
      ...initialState,

      addNote: (key, text, episode) => {
        set((state) => {
          const entry = state.entries[key];
          if (entry === undefined) {
            return state;
          }
          const note: Note = { createdAt: Date.now(), episode, id: newId(), text };
          return { entries: { ...state.entries, [key]: { ...entry, notes: [note, ...entry.notes] } } };
        });
      },

      deleteNote: (key, noteId) => {
        set((state) => {
          const entry = state.entries[key];
          if (entry === undefined) {
            return state;
          }
          const notes = entry.notes.filter((note) => note.id !== noteId);
          return { entries: { ...state.entries, [key]: { ...entry, notes } } };
        });
      },

      importBackup: (backup) => {
        set({
          bookmarks: backup.bookmarks,
          entries: backup.entries,
          favoriteCharacters: backup.favoriteCharacters,
          favoriteShows: backup.favoriteShows,
          settings: { ...initialState.settings, ...backup.settings },
        });
      },

      increment: (key) => {
        set((state) => {
          const entry = state.entries[key];
          if (entry === undefined) {
            return state;
          }
          const progress = clampProgress(entry.anime, entry.progress + 1);
          const status = statusForProgress(entry, progress);
          return { entries: { ...state.entries, [key]: { ...entry, progress, status, updatedAt: Date.now() } } };
        });
      },

      mergeRemote: (remote) => {
        const result: MergeResult = { added: 0, localNewer: [], updated: 0 };
        set((state) => {
          const entries = { ...state.entries };
          const byMal = new Map<number, string>();
          const byAniList = new Map<number, string>();
          const index = (entry: LibraryEntry) => {
            if (entry.anime.ids.mal !== undefined) {
              byMal.set(entry.anime.ids.mal, entry.key);
            }
            if (entry.anime.ids.anilist !== undefined) {
              byAniList.set(entry.anime.ids.anilist, entry.key);
            }
          };
          for (const entry of Object.values(entries)) {
            index(entry);
          }
          for (const item of remote) {
            const { ids } = item.anime;
            const key =
              (ids.mal === undefined ? undefined : byMal.get(ids.mal)) ??
              (ids.anilist === undefined ? undefined : byAniList.get(ids.anilist));
            const local = key === undefined ? undefined : entries[key];
            const changedAt = item.updatedAt > 0 ? item.updatedAt : Date.now();
            if (local === undefined) {
              const entry: LibraryEntry = {
                addedAt: changedAt,
                anime: item.anime,
                key: animeKey(item.anime),
                notes: [],
                notify: false,
                progress: item.progress,
                score: item.score,
                status: item.status,
                updatedAt: changedAt,
              };
              entries[entry.key] = entry;
              index(entry);
              result.added += 1;
              continue;
            }
            const anime = mergeIds(local.anime, item.anime);
            const same = local.status === item.status && local.progress === item.progress && local.score === item.score;
            if (same) {
              entries[local.key] = { ...local, anime };
            } else if (item.updatedAt >= local.updatedAt) {
              entries[local.key] = {
                ...local,
                anime,
                progress: item.progress,
                score: item.score,
                status: item.status,
                updatedAt: changedAt,
              };
              result.updated += 1;
            } else {
              entries[local.key] = { ...local, anime };
              result.localNewer.push(local.key);
            }
          }
          return { entries };
        });
        return result;
      },

      refreshSnapshots: (shows) => {
        set((state) => {
          const entries = { ...state.entries };
          for (const anime of shows) {
            const key = animeKey(anime);
            const entry = entries[key];
            if (entry !== undefined) {
              entries[key] = { ...entry, anime: { ...entry.anime, ...anime } };
            }
          }
          return { entries };
        });
      },

      remove: (key) => {
        set((state) => ({ entries: without(state.entries, key) }));
      },

      save: (anime, patch = {}) => {
        set((state) => {
          const existing = findEntry(state.entries, anime);
          const key = existing?.key ?? animeKey(anime);
          const now = Date.now();
          const base: LibraryEntry = existing ?? {
            addedAt: now,
            anime,
            key,
            notes: [],
            notify: false,
            progress: 0,
            score: 0,
            status: "planned",
            updatedAt: now,
          };
          const progress = clampProgress(anime, patch.progress ?? base.progress);
          const entry: LibraryEntry = {
            ...base,
            ...patch,
            anime: existing?.anime.source === anime.source ? { ...base.anime, ...anime } : mergeIds(base.anime, anime),
            progress,
            updatedAt: now,
          };
          if (patch.status === "completed" && anime.episodes !== null) {
            entry.progress = anime.episodes;
          }
          return { entries: { ...state.entries, [key]: entry } };
        });
      },

      setSettings: (patch) => {
        set((state) => ({ settings: { ...state.settings, ...patch } }));
      },

      toggleBookmark: (anime) => {
        set((state) => {
          const key = animeKey(anime);
          if (state.bookmarks[key] !== undefined) {
            return { bookmarks: without(state.bookmarks, key) };
          }
          return { bookmarks: { ...state.bookmarks, [key]: { addedAt: Date.now(), anime } } };
        });
      },

      toggleFavoriteCharacter: (source, character) => {
        set((state) => {
          const key = characterKey(source, character.id);
          if (state.favoriteCharacters[key] !== undefined) {
            return { favoriteCharacters: without(state.favoriteCharacters, key) };
          }
          const favorite: FavoriteCharacter = { addedAt: Date.now(), ...character, key, source };
          return { favoriteCharacters: { ...state.favoriteCharacters, [key]: favorite } };
        });
      },

      toggleFavoriteShow: (anime) => {
        set((state) => {
          const key = animeKey(anime);
          if (state.favoriteShows[key] !== undefined) {
            return { favoriteShows: without(state.favoriteShows, key) };
          }
          return { favoriteShows: { ...state.favoriteShows, [key]: { addedAt: Date.now(), anime } } };
        });
      },

      update: (key, patch) => {
        set((state) => {
          const entry = state.entries[key];
          if (entry === undefined) {
            return state;
          }
          const progress = clampProgress(entry.anime, patch.progress ?? entry.progress);
          const next: LibraryEntry = { ...entry, ...patch, progress, updatedAt: Date.now() };
          if (patch.progress !== undefined && patch.status === undefined) {
            next.status = statusForProgress(entry, progress);
          }
          if (patch.status === "completed" && entry.anime.episodes !== null) {
            next.progress = entry.anime.episodes;
          }
          return { entries: { ...state.entries, [key]: next } };
        });
      },
    }),
    {
      name: "ikuzo-library",
      partialize: ({ entries, bookmarks, favoriteShows, favoriteCharacters, settings }): LibraryState => ({
        bookmarks,
        entries,
        favoriteCharacters,
        favoriteShows,
        settings,
      }),
      storage: createJSONStorage(() => kv),
      version: BACKUP_VERSION,
    }
  )
);

export const createBackup = (state: LibraryState): Backup => ({
  app: "ikuzo",
  bookmarks: state.bookmarks,
  entries: state.entries,
  exportedAt: new Date().toISOString(),
  favoriteCharacters: state.favoriteCharacters,
  favoriteShows: state.favoriteShows,
  settings: state.settings,
  version: BACKUP_VERSION,
});

export const isBackup = (value: unknown): value is Backup =>
  typeof value === "object" &&
  value !== null &&
  "app" in value &&
  value.app === "ikuzo" &&
  "entries" in value &&
  typeof value.entries === "object";

/** Title in the user's preferred language. */
export const displayTitle = (anime: AnimeSummary, language: TitleLanguage): string =>
  language === "english" ? (anime.titleEnglish ?? anime.title) : anime.title;

/** Stable action functions for components (actions never change, so this never re-renders). */
export const useLibraryActions = (): LibraryActions =>
  useLibrary(
    useShallow((state) => ({
      addNote: state.addNote,
      deleteNote: state.deleteNote,
      importBackup: state.importBackup,
      increment: state.increment,
      mergeRemote: state.mergeRemote,
      refreshSnapshots: state.refreshSnapshots,
      remove: state.remove,
      save: state.save,
      setSettings: state.setSettings,
      toggleBookmark: state.toggleBookmark,
      toggleFavoriteCharacter: state.toggleFavoriteCharacter,
      toggleFavoriteShow: state.toggleFavoriteShow,
      update: state.update,
    }))
  );

/** The library entry for a show, matched across AniList and MyAnimeList ids. */
export const useEntry = (anime: EntryLookup): LibraryEntry | undefined =>
  useLibrary((state) => findEntry(state.entries, anime));

/** Key of the show's entry if it is in the library, otherwise the key a new entry would get. */
export const entryKeyFor = (anime: EntryLookup): string =>
  findEntry(useLibrary.getState().entries, anime)?.key ?? animeKey(anime);
