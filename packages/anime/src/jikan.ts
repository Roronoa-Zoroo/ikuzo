import { createRateLimiter, fetchWithRetry, readJson } from "./http";
import type {
  AiringStatus,
  AnimeDetail,
  AnimeProvider,
  AnimeStats,
  AnimeSummary,
  Broadcast,
  BrowseList,
  CharacterDetail,
  CharacterRole,
  MediaFormat,
  Paged,
  Person,
  Review,
  SearchParams,
  Season,
  Themes,
} from "./types";

const BASE_URL = "https://api.jikan.moe/v4";
/** Jikan allows 3 requests/second and 60/minute. */
const REQUEST_INTERVAL_MS = 400;
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
const WEEKDAY_NAMES: readonly string[] = WEEKDAYS;
const DURATION_PATTERN = /(?:(?<hours>\d+) hr)?\s*(?:(?<minutes>\d+) min)?/u;
const MINUTES_PER_HOUR = 60;
const RANDOM_MAX_ATTEMPTS = 5;

// ── Raw response shapes (only the fields we read) ──────────────────────────

interface JikanImages {
  jpg?: { image_url?: string; large_image_url?: string };
  webp?: { image_url?: string; large_image_url?: string };
}

interface JikanNamed {
  mal_id: number;
  name: string;
}

interface JikanAnime {
  mal_id: number;
  url: string;
  images: JikanImages;
  title: string;
  title_english?: string | null;
  title_japanese?: string | null;
  title_synonyms?: string[];
  type?: string | null;
  source?: string | null;
  episodes?: number | null;
  status?: string | null;
  aired?: { from?: string | null; to?: string | null };
  duration?: string | null;
  rating?: string | null;
  score?: number | null;
  rank?: number | null;
  popularity?: number | null;
  members?: number | null;
  favorites?: number | null;
  synopsis?: string | null;
  season?: string | null;
  year?: number | null;
  broadcast?: { day?: string | null; time?: string | null; timezone?: string | null };
  studios?: JikanNamed[];
  genres?: JikanNamed[];
  themes?: JikanNamed[];
  demographics?: JikanNamed[];
  explicit_genres?: JikanNamed[];
  relations?: { relation: string; entry: { mal_id: number; type: string; name: string }[] }[];
  theme?: { openings?: string[]; endings?: string[] };
  trailer?: { url?: string | null };
  external?: { name: string; url: string }[];
}

interface JikanPagination {
  current_page?: number;
  has_next_page: boolean;
}

interface JikanList<T> {
  data: T[];
  pagination?: JikanPagination;
}

interface JikanPerson {
  mal_id: number;
  name: string;
  images: JikanImages;
}

// ── Mapping helpers ────────────────────────────────────────────────────────

const imageOf = (images?: JikanImages): string | undefined =>
  images?.webp?.large_image_url ?? images?.jpg?.large_image_url ?? images?.jpg?.image_url ?? undefined;

const FORMATS: Record<string, MediaFormat> = {
  Movie: "Movie",
  Music: "Music",
  ONA: "ONA",
  OVA: "OVA",
  Special: "Special",
  TV: "TV",
  "TV Special": "Special",
};

const STATUSES: Record<string, AiringStatus> = {
  "Currently Airing": "airing",
  "Finished Airing": "finished",
  "Not yet aired": "upcoming",
};

const toDate = (value?: string | null): string | undefined => value?.slice(0, "YYYY-MM-DD".length) ?? undefined;

const toDuration = (value?: string | null): number | undefined => {
  const groups = value === undefined || value === null ? undefined : DURATION_PATTERN.exec(value)?.groups;
  if (groups === undefined) {
    return undefined;
  }
  const total = Number(groups.hours ?? 0) * MINUTES_PER_HOUR + Number(groups.minutes ?? 0);
  return total > 0 ? total : undefined;
};

const toBroadcast = (broadcast: JikanAnime["broadcast"]): Broadcast | undefined => {
  const dayName = broadcast?.day?.toLowerCase().replace(/s$/u, "");
  const day = dayName === undefined ? -1 : WEEKDAY_NAMES.indexOf(dayName);
  const time = broadcast?.time ?? "";
  if (day === -1 || time === "") {
    return undefined;
  }
  return { day, time, timezone: broadcast?.timezone ?? "Asia/Tokyo" };
};

const toSeason = (value?: string | null): Season | undefined =>
  value === "winter" || value === "spring" || value === "summer" || value === "fall" ? value : undefined;

const genreNames = (anime: JikanAnime): string[] =>
  [...(anime.genres ?? []), ...(anime.themes ?? []), ...(anime.demographics ?? [])].map((genre) => genre.name);

const isAdult = (anime: JikanAnime): boolean =>
  (anime.explicit_genres?.length ?? 0) > 0 || anime.rating?.startsWith("Rx") === true;

const toSummary = (anime: JikanAnime): AnimeSummary => ({
  airedFrom: toDate(anime.aired?.from),
  airedTo: toDate(anime.aired?.to),
  broadcast: toBroadcast(anime.broadcast),
  durationMinutes: toDuration(anime.duration),
  episodes: anime.episodes ?? null,
  format: FORMATS[anime.type ?? ""] ?? "Unknown",
  genres: genreNames(anime),
  id: anime.mal_id,
  ids: { mal: anime.mal_id },
  image: imageOf(anime.images),
  isAdult: isAdult(anime),
  members: anime.members ?? undefined,
  score: anime.score ?? undefined,
  season: toSeason(anime.season),
  source: "mal",
  status: STATUSES[anime.status ?? ""] ?? "unknown",
  synonyms: anime.title_synonyms ?? [],
  title: anime.title,
  titleEnglish: anime.title_english ?? undefined,
  titleNative: anime.title_japanese ?? undefined,
  year: anime.year ?? undefined,
});

const toDetail = (anime: JikanAnime): AnimeDetail => ({
  ...toSummary(anime),
  externalLinks: anime.external ?? [],
  favorites: anime.favorites ?? undefined,
  popularity: anime.popularity ?? undefined,
  rank: anime.rank ?? undefined,
  rating: anime.rating ?? undefined,
  relations: (anime.relations ?? []).map((group) => ({
    items: group.entry.map((entry) => ({
      id: entry.mal_id,
      kind: entry.type === "anime" ? ("anime" as const) : ("manga" as const),
      title: entry.name,
    })),
    relation: group.relation,
  })),
  sourceMaterial: anime.source ?? undefined,
  studios: (anime.studios ?? []).map((studio) => studio.name),
  synopsis: anime.synopsis ?? undefined,
  trailerUrl: anime.trailer?.url ?? undefined,
  url: anime.url,
});

const toPerson = (person: JikanPerson, language?: string): Person => ({
  id: person.mal_id,
  image: imageOf(person.images),
  language,
  name: person.name,
});

/** Jikan returns the same show twice when it appears on several pages of a list. */
const uniqueById = (items: AnimeSummary[]): AnimeSummary[] => {
  const seen = new Set<number>();
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
};

const toPaged = (list: JikanList<JikanAnime>, page: number): Paged<AnimeSummary> => ({
  hasNextPage: list.pagination?.has_next_page ?? false,
  items: uniqueById(list.data.map(toSummary)),
  page: list.pagination?.current_page ?? page,
});

const SORTS: Record<NonNullable<SearchParams["sort"]>, { order_by: string; sort: "asc" | "desc" }> = {
  popularity: { order_by: "members", sort: "desc" },
  score: { order_by: "score", sort: "desc" },
  start_date: { order_by: "start_date", sort: "desc" },
  title: { order_by: "title", sort: "asc" },
};

const SEARCH_STATUSES: Partial<Record<AiringStatus, string>> = {
  airing: "airing",
  finished: "complete",
  upcoming: "upcoming",
};

const SEARCH_FORMATS: Partial<Record<MediaFormat, string>> = {
  Movie: "movie",
  Music: "music",
  ONA: "ona",
  OVA: "ova",
  Special: "special",
  TV: "tv",
};

// ── Provider ───────────────────────────────────────────────────────────────

export const createJikanProvider = (): AnimeProvider => {
  const limit = createRateLimiter(REQUEST_INTERVAL_MS);
  let genreCache: { id: number; name: string }[] | undefined;

  const get = async <T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") {
        query.set(key, String(value));
      }
    }
    const qs = query.size > 0 ? `?${query.toString()}` : "";
    return await limit(async () => {
      const response = await fetchWithRetry(`${BASE_URL}${path}${qs}`);
      return await readJson<T>(response);
    });
  };

  const loadGenres = async (): Promise<{ id: number; name: string }[]> => {
    if (genreCache === undefined) {
      const result = await get<JikanList<JikanNamed>>("/genres/anime");
      genreCache = result.data.map((genre) => ({ id: genre.mal_id, name: genre.name }));
    }
    return genreCache;
  };

  const provider: AnimeProvider = {
    async browse(list: BrowseList, page = 1) {
      const filters: Record<BrowseList, Record<string, string>> = {
        airing: { filter: "airing" },
        movies: { type: "movie" },
        popular: { filter: "bypopularity" },
        top: {},
        upcoming: { filter: "upcoming" },
      };
      const result = await get<JikanList<JikanAnime>>("/top/anime", { ...filters[list], page, sfw: "true" });
      return toPaged(result, page);
    },

    async genres() {
      const genres = await loadGenres();
      return genres.map((genre) => genre.name);
    },

    async getAnime(id) {
      const { data } = await get<{ data: JikanAnime }>(`/anime/${id}/full`);
      return toDetail(data);
    },

    async getCharacter(id) {
      const { data } = await get<{
        data: {
          mal_id: number;
          url: string;
          name: string;
          name_kanji?: string | null;
          nicknames?: string[];
          images: JikanImages;
          about?: string | null;
          favorites?: number;
          anime?: { role: string; anime: { mal_id: number; title: string; images: JikanImages } }[];
          voices?: { language: string; person: JikanPerson }[];
        };
      }>(`/characters/${id}/full`);
      const detail: CharacterDetail = {
        about: data.about ?? undefined,
        appearances: (data.anime ?? []).map((entry) => ({
          anime: { id: entry.anime.mal_id, image: imageOf(entry.anime.images), title: entry.anime.title },
          role: entry.role,
        })),
        favorites: data.favorites,
        id: data.mal_id,
        image: imageOf(data.images),
        name: data.name,
        nameNative: data.name_kanji ?? undefined,
        nicknames: data.nicknames ?? [],
        source: "mal",
        url: data.url,
        voiceActors: (data.voices ?? []).map((voice) => toPerson(voice.person, voice.language)),
      };
      return detail;
    },

    async getCharacters(id) {
      const { data } = await get<{
        data: {
          character: { mal_id: number; name: string; images: JikanImages };
          role: string;
          voice_actors?: { language: string; person: JikanPerson }[];
        }[];
      }>(`/anime/${id}/characters`);
      return data.map((entry): CharacterRole => ({
        id: entry.character.mal_id,
        image: imageOf(entry.character.images),
        name: entry.character.name,
        role: entry.role,
        voiceActors: (entry.voice_actors ?? []).map((va) => toPerson(va.person, va.language)),
      }));
    },

    async getRecommendations(id) {
      const { data } = await get<{ data: { entry: { mal_id: number; title: string; images: JikanImages } }[] }>(
        `/anime/${id}/recommendations`
      );
      return data.map(({ entry }): AnimeSummary => ({
        episodes: null,
        format: "Unknown",
        genres: [],
        id: entry.mal_id,
        ids: { mal: entry.mal_id },
        image: imageOf(entry.images),
        source: "mal",
        status: "unknown",
        synonyms: [],
        title: entry.title,
      }));
    },

    async getReviews(id, page = 1) {
      const result = await get<
        JikanList<{
          mal_id: number;
          url: string;
          user: { username: string; images?: JikanImages };
          score?: number;
          review: string;
          date?: string;
          is_spoiler?: boolean;
        }>
      >(`/anime/${id}/reviews`, { page, preliminary: "true", spoilers: "true" });
      return {
        hasNextPage: result.pagination?.has_next_page ?? false,
        items: result.data.map((review): Review => ({
          author: review.user.username,
          avatar: imageOf(review.user.images),
          body: review.review,
          date: toDate(review.date),
          id: review.mal_id,
          score: review.score,
          spoiler: review.is_spoiler ?? false,
          url: review.url,
        })),
        page,
      };
    },

    async getStats(id) {
      const { data } = await get<{
        data: {
          watching: number;
          completed: number;
          on_hold: number;
          dropped: number;
          plan_to_watch: number;
          scores?: { score: number; votes: number }[];
        };
      }>(`/anime/${id}/statistics`);
      const stats: AnimeStats = {
        scores: (data.scores ?? []).map(({ score, votes }) => ({ score, votes })),
        statuses: [
          { count: data.watching, label: "Watching" },
          { count: data.completed, label: "Completed" },
          { count: data.on_hold, label: "On hold" },
          { count: data.dropped, label: "Dropped" },
          { count: data.plan_to_watch, label: "Plan to watch" },
        ],
      };
      return stats;
    },

    async getThemes(id): Promise<Themes> {
      const { data } = await get<{ data: { openings?: string[]; endings?: string[] } }>(`/anime/${id}/themes`);
      return { endings: data.endings ?? [], openings: data.openings ?? [] };
    },

    async random() {
      // /random/anime can return adult titles even with sfw, so retry a few times.
      for (let attempt = 0; attempt < RANDOM_MAX_ATTEMPTS; attempt += 1) {
        // oxlint-disable-next-line no-await-in-loop
        const { data } = await get<{ data: JikanAnime }>("/random/anime", { sfw: "true" });
        const summary = toSummary(data);
        if (summary.isAdult !== true) {
          return summary;
        }
      }
      throw new Error("Could not find a random anime, please try again");
    },

    async schedule(day) {
      const filter = WEEKDAYS[day] ?? "monday";
      const items: AnimeSummary[] = [];
      for (let page = 1; ; page += 1) {
        // Pages depend on the previous page's has_next_page.
        // oxlint-disable-next-line no-await-in-loop
        const result = await get<JikanList<JikanAnime>>("/schedules", { filter, page, sfw: "true" });
        items.push(...result.data.map(toSummary));
        if (result.pagination?.has_next_page !== true) {
          break;
        }
      }
      return uniqueById(items);
    },

    async search(params) {
      const page = params.page ?? 1;
      const wantsGenres = (params.genres?.length ?? 0) > 0;
      const allGenres = wantsGenres ? await loadGenres() : [];
      const genreIds = allGenres
        .filter((genre) => params.genres?.includes(genre.name) === true)
        .map((genre) => genre.id);
      const hasQuery = (params.query ?? "") !== "";
      const sort = SORTS[params.sort ?? (hasQuery ? "popularity" : "score")];
      const result = await get<JikanList<JikanAnime>>("/anime", {
        genres: genreIds.length > 0 ? genreIds.join(",") : undefined,
        order_by: sort.order_by,
        page,
        q: params.query,
        sfw: "true",
        sort: sort.sort,
        start_date: params.year === undefined ? undefined : `${params.year}-01-01`,
        status: params.status === undefined ? undefined : SEARCH_STATUSES[params.status],
        type: params.format === undefined ? undefined : SEARCH_FORMATS[params.format],
      });
      return toPaged(result, page);
    },

    async seasonal(year, season, page = 1) {
      return toPaged(await get<JikanList<JikanAnime>>(`/seasons/${year}/${season}`, { page, sfw: "true" }), page);
    },

    source: "mal",
  };
  return provider;
};
