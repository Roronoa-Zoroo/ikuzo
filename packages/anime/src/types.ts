/** Where a piece of anime data came from. AniDB is an add-on source (episodes), not a browse source. */
export type Source = "mal" | "anilist";

export const SOURCES: readonly Source[] = ["mal", "anilist"] as const;

export const SOURCE_LABELS: Record<Source, string> = {
  anilist: "AniList",
  mal: "MyAnimeList",
};

/** IDs of the same show on other databases, when known. */
export interface ExternalIds {
  anidb?: number;
  anilist?: number;
  kitsu?: number;
  mal?: number;
}

export type AiringStatus = "airing" | "finished" | "upcoming" | "cancelled" | "hiatus" | "unknown";

export type MediaFormat = "TV" | "TV Short" | "Movie" | "OVA" | "ONA" | "Special" | "Music" | "Unknown";

export type Season = "winter" | "spring" | "summer" | "fall";

export const SEASONS: readonly Season[] = ["winter", "spring", "summer", "fall"] as const;

/** Weekly broadcast slot, expressed in the broadcaster's timezone (usually Asia/Tokyo). */
export interface Broadcast {
  /** 0 = Sunday … 6 = Saturday */
  day: number;
  /** "HH:MM", 24h */
  time: string;
  timezone: string;
}

export interface NextEpisode {
  episode: number;
  /** Unix epoch milliseconds */
  airingAt: number;
}

export interface AnimeSummary {
  source: Source;
  id: number;
  ids: ExternalIds;
  title: string;
  titleEnglish?: string;
  titleNative?: string;
  synonyms: string[];
  image?: string;
  banner?: string;
  format: MediaFormat;
  episodes: number | null;
  status: AiringStatus;
  /** ISO date (YYYY-MM-DD or YYYY-MM) */
  airedFrom?: string;
  airedTo?: string;
  season?: Season;
  year?: number;
  /** 0–10 */
  score?: number;
  members?: number;
  genres: string[];
  durationMinutes?: number;
  broadcast?: Broadcast;
  nextEpisode?: NextEpisode;
  isAdult?: boolean;
}

export interface RelationGroup {
  relation: string;
  items: { id: number; title: string; kind: "anime" | "manga"; image?: string }[];
}

export interface AnimeDetail extends AnimeSummary {
  synopsis?: string;
  studios: string[];
  sourceMaterial?: string;
  rating?: string;
  rank?: number;
  popularity?: number;
  favorites?: number;
  relations: RelationGroup[];
  trailerUrl?: string;
  externalLinks: { name: string; url: string }[];
  /** Page on the source website */
  url: string;
}

export interface Person {
  id: number;
  name: string;
  image?: string;
  language?: string;
}

export interface CharacterRole {
  id: number;
  /** Database the id belongs to, when it differs from the anime's (fallback data). */
  source?: Source;
  name: string;
  image?: string;
  role: string;
  voiceActors: Person[];
}

export interface CharacterDetail {
  source: Source;
  id: number;
  name: string;
  nameNative?: string;
  nicknames: string[];
  image?: string;
  about?: string;
  favorites?: number;
  appearances: { role: string; anime: Pick<AnimeSummary, "id" | "title" | "image"> }[];
  voiceActors: Person[];
  url: string;
}

export interface Review {
  id: number;
  author: string;
  avatar?: string;
  /** 0–10 */
  score?: number;
  body: string;
  date?: string;
  spoiler: boolean;
  url?: string;
}

export interface AnimeStats {
  statuses: { label: string; count: number }[];
  /** score 1–10 → votes */
  scores: { score: number; votes: number }[];
}

export interface Themes {
  openings: string[];
  endings: string[];
}

export interface Paged<T> {
  items: T[];
  page: number;
  hasNextPage: boolean;
}

export type BrowseList = "airing" | "popular" | "upcoming" | "top" | "movies";

export type SortOrder = "score" | "popularity" | "title" | "start_date";

export interface SearchParams {
  query?: string;
  format?: MediaFormat;
  status?: AiringStatus;
  genres?: string[];
  sort?: SortOrder;
  year?: number;
  season?: Season;
  page?: number;
}

/** Every browse source implements this. Optional members are capabilities a source may lack. */
export interface AnimeProvider {
  source: Source;
  getAnime: (id: number) => Promise<AnimeDetail>;
  getCharacters: (id: number) => Promise<CharacterRole[]>;
  getRecommendations: (id: number) => Promise<AnimeSummary[]>;
  getReviews: (id: number, page?: number) => Promise<Paged<Review>>;
  getStats: (id: number) => Promise<AnimeStats>;
  getThemes?: (id: number) => Promise<Themes>;
  getCharacter: (id: number) => Promise<CharacterDetail>;
  search: (params: SearchParams) => Promise<Paged<AnimeSummary>>;
  browse: (list: BrowseList, page?: number) => Promise<Paged<AnimeSummary>>;
  seasonal: (year: number, season: Season, page?: number) => Promise<Paged<AnimeSummary>>;
  /** Shows broadcasting on a weekday (0 = Sunday). */
  schedule: (day: number) => Promise<AnimeSummary[]>;
  random: () => Promise<AnimeSummary>;
  genres: () => Promise<string[]>;
}
