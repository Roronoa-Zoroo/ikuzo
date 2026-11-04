import type { TrackerMarks } from "@ikuzo/anime/sync-plan";
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
  /** Copies of anime.ids.mal / anime.ids.anilist at the top level, so live queries can index them. */
  malId?: number;
  anilistId?: number;
  status: WatchStatus;
  progress: number;
  /** 0 = not scored, otherwise 1–10 */
  score: number;
  notify: boolean;
  notes: Note[];
  addedAt: number;
  updatedAt: number;
  /** When the show was last seen on each connected service; 0 = removed there. */
  trackers?: TrackerMarks;
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
