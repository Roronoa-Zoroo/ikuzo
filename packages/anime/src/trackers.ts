import type { AnimeSummary } from "./types";

/** Services Ikuzo can sign in to and keep a list in sync with. */
export type TrackerId = "anilist" | "mal";

export const TRACKERS: readonly TrackerId[] = ["anilist", "mal"] as const;

export const TRACKER_LABELS: Record<TrackerId, string> = {
  anilist: "AniList",
  mal: "MyAnimeList",
};

export type ListStatus = "watching" | "planned" | "onHold" | "completed" | "dropped";

export interface ListUpdate {
  status: ListStatus;
  progress: number;
  /** 0 = no score, otherwise 1–10 */
  score: number;
}

export interface RemoteEntry extends ListUpdate {
  anime: AnimeSummary;
  /** Epoch milliseconds of the last change on the service */
  updatedAt: number;
}

export interface TrackerProfile {
  id: number;
  name: string;
  avatar?: string;
}

export interface TrackerSession {
  accessToken: string;
  /** Epoch milliseconds */
  expiresAt: number;
  refreshToken?: string;
}

/** What a signed-in (or public, read-only) list connection can do. */
export interface TrackerAccount {
  tracker: TrackerId;
  profile: () => Promise<TrackerProfile>;
  /** The whole anime list. Without a session only public lists of `userName` can be read. */
  list: (userName?: string) => Promise<RemoteEntry[]>;
  save: (animeId: number, update: ListUpdate) => Promise<void>;
  remove: (animeId: number) => Promise<void>;
}
