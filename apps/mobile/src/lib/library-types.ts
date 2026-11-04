import type { ListStatus } from "@ikuzo/anime/trackers";
import type { AnimeSummary, Source } from "@ikuzo/anime/types";

export type WatchStatus = ListStatus;

export const WATCH_STATUSES: readonly WatchStatus[] = ["watching", "planned", "onHold", "completed", "dropped"];

export const WATCH_STATUS_LABELS: Record<WatchStatus, string> = {
  completed: "Completed",
  dropped: "Dropped",
  onHold: "On hold",
  planned: "Plan to watch",
  watching: "Watching",
};

/** A note as older versions stored it, inside its library entry. */
export interface LegacyNote {
  id: string;
  episode?: number;
  text: string;
  createdAt: number;
}

/**
 * A personal note about a show. Notes live in their own collection, so they stay when the show
 * leaves the list (removed on AniList, for example) and need no list entry to exist.
 */
export interface Note extends LegacyNote {
  /** Key of the show the note was written on ("anilist:1"). */
  showKey: string;
  malId?: number;
  anilistId?: number;
}

export interface LibraryEntry {
  key: string;
  /** Snapshot of the show, refreshed from the source when the list is refreshed. */
  anime: AnimeSummary;
  /** Copies of anime.ids.mal / anime.ids.anilist at the top level, so live queries can index them. */
  malId?: number;
  anilistId?: number;
  status: WatchStatus;
  progress: number;
  /** 0 = not scored, otherwise 1–10 */
  score: number;
  notify: boolean;
  /** Only in data from older versions; moved to the notes collection on launch. */
  notes?: LegacyNote[];
  addedAt: number;
  updatedAt: number;
}

export interface SavedAnime {
  key: string;
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

export type HomeSort = "updated" | "title" | "score" | "start";

export interface Settings {
  source: Source;
  titleLanguage: TitleLanguage;
  /** Hide shows that are not out yet from the Calendar "My shows" tab */
  calendarHideUpcoming: boolean;
  homeSort: HomeSort;
}

export interface SettingsRow extends Settings {
  id: "settings";
}

export const DEFAULT_SETTINGS: Settings = {
  calendarHideUpcoming: false,
  homeSort: "updated",
  source: "anilist",
  titleLanguage: "romaji",
};

export type { TrackerId } from "@ikuzo/anime/trackers";
