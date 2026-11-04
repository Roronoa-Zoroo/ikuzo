import { AuthError } from "./auth-error";
import { HttpError } from "./errors";
import { createRateLimiter, fetchWithRetry, readJson } from "./http";
import type {
  AiringStatus,
  AnimeDetail,
  AnimeProvider,
  AnimeSummary,
  BrowseList,
  CharacterRole,
  MediaFormat,
  NextEpisode,
  Paged,
  Person,
  SearchParams,
  Season,
} from "./types";

const ENDPOINT = "https://graphql.anilist.co";
/** AniList allows 90 requests/minute (temporarily 30 when degraded). */
const REQUEST_INTERVAL_MS = 700;
const PER_PAGE = 25;
const INVALID_TOKEN = /invalid token|unauthorized/iu;
const MS_PER_SECOND = 1000;
const SECONDS_PER_DAY = 86_400;
const DAYS_PER_WEEK = 7;
const SCORE_SCALE = 10;
const RANDOM_POOL_PAGES = 400;
const HTML_TAG = /<[^>]+>/gu;
const LINE_BREAK = /<br\s*\/?>/giu;

// ── GraphQL ───────────────────────────────────────────────────────────────

export const SUMMARY_FIELDS = `
  id idMal isAdult
  title { romaji english native }
  synonyms
  coverImage { extraLarge large }
  bannerImage
  format episodes status duration
  startDate { year month day }
  endDate { year month day }
  season seasonYear
  averageScore popularity genres
  nextAiringEpisode { episode airingAt }
`;

const DETAIL_QUERY = `
query ($id: Int) {
  Media(id: $id, type: ANIME) {
    ${SUMMARY_FIELDS}
    siteUrl description(asHtml: false) source favourites
    studios(isMain: true) { nodes { name } }
    rankings { rank type allTime }
    trailer { id site }
    externalLinks { site url }
    relations { edges { relationType node { id type title { romaji } coverImage { large } } } }
  }
}`;

const PAGE_QUERY = `
query ($page: Int, $perPage: Int, $search: String, $sort: [MediaSort], $format: MediaFormat, $status: MediaStatus,
       $genres: [String], $season: MediaSeason, $seasonYear: Int, $idMalIn: [Int], $idIn: [Int]) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { hasNextPage currentPage }
    media(type: ANIME, isAdult: false, search: $search, sort: $sort, format: $format, status: $status,
          genre_in: $genres, season: $season, seasonYear: $seasonYear, idMal_in: $idMalIn, id_in: $idIn) {
      ${SUMMARY_FIELDS}
    }
  }
}`;

interface FuzzyDate {
  year?: number | null;
  month?: number | null;
  day?: number | null;
}

export interface AniListMedia {
  id: number;
  idMal?: number | null;
  isAdult?: boolean;
  title: { romaji?: string | null; english?: string | null; native?: string | null };
  synonyms?: string[];
  coverImage?: { extraLarge?: string | null; large?: string | null };
  bannerImage?: string | null;
  format?: string | null;
  episodes?: number | null;
  status?: string | null;
  duration?: number | null;
  startDate?: FuzzyDate;
  endDate?: FuzzyDate;
  season?: string | null;
  seasonYear?: number | null;
  averageScore?: number | null;
  popularity?: number | null;
  genres?: string[];
  nextAiringEpisode?: { episode: number; airingAt: number } | null;
}

interface AniListDetail extends AniListMedia {
  siteUrl: string;
  description?: string | null;
  source?: string | null;
  favourites?: number | null;
  studios?: { nodes: { name: string }[] };
  rankings?: { rank: number; type: string; allTime: boolean }[];
  trailer?: { id: string; site: string } | null;
  externalLinks?: { site: string; url: string }[];
  relations?: {
    edges: {
      relationType: string;
      node: { id: number; type: string; title: { romaji: string }; coverImage?: { large?: string } };
    }[];
  };
}

interface AniListPage {
  Page: { pageInfo: { hasNextPage: boolean; currentPage: number }; media: AniListMedia[] };
}

// ── Mapping helpers ───────────────────────────────────────────────────────

const FORMATS: Record<string, MediaFormat> = {
  MOVIE: "Movie",
  MUSIC: "Music",
  ONA: "ONA",
  OVA: "OVA",
  SPECIAL: "Special",
  TV: "TV",
  TV_SHORT: "TV Short",
};

const FORMATS_REVERSE: Partial<Record<MediaFormat, string>> = {
  Movie: "MOVIE",
  Music: "MUSIC",
  ONA: "ONA",
  OVA: "OVA",
  Special: "SPECIAL",
  TV: "TV",
  "TV Short": "TV_SHORT",
};

const STATUSES: Record<string, AiringStatus> = {
  CANCELLED: "cancelled",
  FINISHED: "finished",
  HIATUS: "hiatus",
  NOT_YET_RELEASED: "upcoming",
  RELEASING: "airing",
};

const STATUSES_REVERSE: Partial<Record<AiringStatus, string>> = {
  airing: "RELEASING",
  cancelled: "CANCELLED",
  finished: "FINISHED",
  hiatus: "HIATUS",
  upcoming: "NOT_YET_RELEASED",
};

const SORTS: Record<NonNullable<SearchParams["sort"]>, string> = {
  popularity: "POPULARITY_DESC",
  score: "SCORE_DESC",
  start_date: "START_DATE_DESC",
  title: "TITLE_ROMAJI",
};

const pad = (value: number): string => String(value).padStart(2, "0");

const toDate = (date?: FuzzyDate): string | undefined => {
  const year = date?.year ?? 0;
  const month = date?.month ?? 0;
  const day = date?.day ?? 0;
  if (year === 0) {
    return undefined;
  }
  if (month === 0) {
    return String(year);
  }
  return day === 0 ? `${year}-${pad(month)}` : `${year}-${pad(month)}-${pad(day)}`;
};

const toSeason = (value?: string | null): Season | undefined => {
  const lower = value?.toLowerCase();
  return lower === "winter" || lower === "spring" || lower === "summer" || lower === "fall" ? lower : undefined;
};

const toNextEpisode = (next: AniListMedia["nextAiringEpisode"]): NextEpisode | undefined =>
  next === null || next === undefined ? undefined : { airingAt: next.airingAt * MS_PER_SECOND, episode: next.episode };

/** AniList descriptions contain light HTML; the apps render plain text. */
export const stripHtml = (html?: string | null): string | undefined => {
  const text = html?.replaceAll(LINE_BREAK, "\n").replaceAll(HTML_TAG, "").trim() ?? "";
  return text === "" ? undefined : text;
};

const toScore = (averageScore?: number | null): number | undefined =>
  averageScore === null || averageScore === undefined || averageScore === 0 ? undefined : averageScore / SCORE_SCALE;

const toTitle = (media: AniListMedia): string =>
  media.title.romaji ?? media.title.english ?? media.title.native ?? `#${media.id}`;

const toImage = (media: AniListMedia): string | undefined =>
  media.coverImage?.extraLarge ?? media.coverImage?.large ?? undefined;

export const toSummary = (media: AniListMedia): AnimeSummary => ({
  airedFrom: toDate(media.startDate),
  airedTo: toDate(media.endDate),
  banner: media.bannerImage ?? undefined,
  durationMinutes: media.duration ?? undefined,
  episodes: media.episodes ?? null,
  format: FORMATS[media.format ?? ""] ?? "Unknown",
  genres: media.genres ?? [],
  id: media.id,
  ids: { anilist: media.id, mal: media.idMal ?? undefined },
  image: toImage(media),
  isAdult: media.isAdult ?? false,
  members: media.popularity ?? undefined,
  nextEpisode: toNextEpisode(media.nextAiringEpisode),
  score: toScore(media.averageScore),
  season: toSeason(media.season),
  source: "anilist",
  status: STATUSES[media.status ?? ""] ?? "unknown",
  synonyms: media.synonyms ?? [],
  title: toTitle(media),
  titleEnglish: media.title.english ?? undefined,
  titleNative: media.title.native ?? undefined,
  year: media.seasonYear ?? media.startDate?.year ?? undefined,
});

const titleCase = (value: string): string =>
  value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const toDetail = (media: AniListDetail): AnimeDetail => {
  const groups = new Map<string, AnimeDetail["relations"][number]>();
  for (const edge of media.relations?.edges ?? []) {
    const relation = titleCase(edge.relationType);
    const group = groups.get(relation) ?? { items: [], relation };
    group.items.push({
      id: edge.node.id,
      image: edge.node.coverImage?.large,
      kind: edge.node.type === "ANIME" ? "anime" : "manga",
      title: edge.node.title.romaji,
    });
    groups.set(relation, group);
  }
  const rated = media.rankings?.find((ranking) => ranking.type === "RATED" && ranking.allTime);
  const popular = media.rankings?.find((ranking) => ranking.type === "POPULAR" && ranking.allTime);
  return {
    ...toSummary(media),
    externalLinks: (media.externalLinks ?? []).map((link) => ({ name: link.site, url: link.url })),
    favorites: media.favourites ?? undefined,
    popularity: popular?.rank,
    rank: rated?.rank,
    relations: [...groups.values()],
    sourceMaterial: media.source === null || media.source === undefined ? undefined : titleCase(media.source),
    studios: media.studios?.nodes.map((studio) => studio.name) ?? [],
    synopsis: stripHtml(media.description),
    trailerUrl: media.trailer?.site === "youtube" ? `https://www.youtube.com/watch?v=${media.trailer.id}` : undefined,
    url: media.siteUrl,
  };
};

interface AniListVoiceActor {
  id: number;
  name: { full: string };
  image?: { large?: string };
  languageV2?: string;
}

const toPerson = (va: AniListVoiceActor): Person => ({
  id: va.id,
  image: va.image?.large,
  language: va.languageV2,
  name: va.name.full,
});

// ── Provider ──────────────────────────────────────────────────────────────

/** One limiter for every AniList call in the app, signed in or not. */
const limit = createRateLimiter(REQUEST_INTERVAL_MS);

/** Runs a GraphQL document against AniList, optionally as the signed-in user. */
export const aniListRequest = async <T>(
  document: string,
  variables: Record<string, unknown>,
  token?: string
): Promise<T> =>
  await limit(async () => {
    const headers: Record<string, string> = { Accept: "application/json", "Content-Type": "application/json" };
    if (token !== undefined) {
      headers.Authorization = `Bearer ${token}`;
    }
    let response: Response;
    try {
      response = await fetchWithRetry(ENDPOINT, {
        body: JSON.stringify({ query: document, variables }),
        headers,
        method: "POST",
      });
    } catch (error) {
      // AniList answers 400 "Invalid token" (not 401) for expired or revoked tokens.
      if (token !== undefined && error instanceof HttpError && INVALID_TOKEN.test(error.body)) {
        throw new AuthError("AniList");
      }
      throw error;
    }
    const body = await readJson<{ data?: T | null; errors?: { message: string }[] }>(response);
    if (body.data === undefined || body.data === null) {
      throw new Error(body.errors?.[0]?.message ?? "AniList request failed");
    }
    return body.data;
  });

export type AniListClient = AnimeProvider & {
  /** Batch lookup by MyAnimeList id — used to get exact next-episode times for any show. */
  byMalIds: (malIds: number[]) => Promise<AnimeSummary[]>;
  /** Batch lookup by AniList id, for shows that have no MyAnimeList id. */
  byIds: (ids: number[]) => Promise<AnimeSummary[]>;
};

/** Most ids per batch request (AniList pages hold up to 50 items). */
const BATCH_SIZE = PER_PAGE * 2;

export const createAniListProvider = (): AniListClient => {
  const query = aniListRequest;

  /** Looks shows up in batches by `variable` (idMalIn or idIn), one request at a time. */
  const batched = async (variable: "idMalIn" | "idIn", ids: number[]): Promise<AnimeSummary[]> => {
    const results: AnimeSummary[] = [];
    for (let start = 0; start < ids.length; start += BATCH_SIZE) {
      const chunk = ids.slice(start, start + BATCH_SIZE);
      // Chunks are sent one by one to respect the rate limit.
      const variables = new Map<string, unknown>([
        ["page", 1],
        ["perPage", chunk.length],
        [variable, chunk],
      ]);
      // oxlint-disable-next-line no-await-in-loop
      const data = await query<AniListPage>(PAGE_QUERY, Object.fromEntries(variables));
      results.push(...data.Page.media.map(toSummary));
    }
    return results;
  };

  const page = async (variables: Record<string, unknown>): Promise<Paged<AnimeSummary>> => {
    const data = await query<AniListPage>(PAGE_QUERY, { perPage: PER_PAGE, ...variables });
    return {
      hasNextPage: data.Page.pageInfo.hasNextPage,
      items: data.Page.media.map(toSummary),
      page: data.Page.pageInfo.currentPage,
    };
  };

  return {
    async browse(list: BrowseList, pageNumber = 1) {
      const variables: Record<BrowseList, Record<string, unknown>> = {
        airing: { sort: ["POPULARITY_DESC"], status: "RELEASING" },
        movies: { format: "MOVIE", sort: ["SCORE_DESC"] },
        popular: { sort: ["POPULARITY_DESC"] },
        top: { sort: ["SCORE_DESC"] },
        upcoming: { sort: ["POPULARITY_DESC"], status: "NOT_YET_RELEASED" },
      };
      return await page({ ...variables[list], page: pageNumber });
    },

    async byIds(ids) {
      return await batched("idIn", ids);
    },

    async byMalIds(malIds) {
      return await batched("idMalIn", malIds);
    },

    async genres() {
      const data = await query<{ GenreCollection: string[] }>("{ GenreCollection }", {});
      return data.GenreCollection.filter((genre) => genre !== "Hentai");
    },

    async getAnime(id) {
      const data = await query<{ Media: AniListDetail }>(DETAIL_QUERY, { id });
      return toDetail(data.Media);
    },

    async getCharacter(id) {
      const data = await query<{
        Character: {
          id: number;
          siteUrl: string;
          name: { full: string; native?: string; alternative?: string[] };
          image?: { large?: string };
          description?: string;
          favourites?: number;
          media: {
            edges: {
              characterRole: string;
              node: { id: number; title: { romaji: string }; coverImage?: { large?: string } };
              voiceActors: AniListVoiceActor[];
            }[];
          };
        };
      }>(
        `query ($id: Int) { Character(id: $id) {
          id siteUrl name { full native alternative } image { large } description(asHtml: false) favourites
          media(sort: POPULARITY_DESC, type: ANIME) { edges { characterRole
            node { id title { romaji } coverImage { large } }
            voiceActors { id name { full } image { large } languageV2 } } }
        } }`,
        { id }
      );
      const character = data.Character;
      const voiceActors = new Map<number, Person>();
      for (const edge of character.media.edges) {
        for (const va of edge.voiceActors) {
          voiceActors.set(va.id, toPerson(va));
        }
      }
      return {
        about: stripHtml(character.description),
        appearances: character.media.edges.map((edge) => ({
          anime: { id: edge.node.id, image: edge.node.coverImage?.large, title: edge.node.title.romaji },
          role: titleCase(edge.characterRole),
        })),
        favorites: character.favourites,
        id: character.id,
        image: character.image?.large,
        name: character.name.full,
        nameNative: character.name.native,
        nicknames: character.name.alternative?.filter(Boolean) ?? [],
        source: "anilist",
        url: character.siteUrl,
        voiceActors: [...voiceActors.values()],
      };
    },

    async getCharacters(id) {
      const data = await query<{
        Media: {
          characters: {
            edges: {
              role: string;
              node: { id: number; name: { full: string }; image?: { large?: string } };
              voiceActors: AniListVoiceActor[];
            }[];
          };
        };
      }>(
        `query ($id: Int) { Media(id: $id) { characters(sort: [ROLE, RELEVANCE], perPage: 50) { edges { role
          node { id name { full } image { large } }
          voiceActors { id name { full } image { large } languageV2 } } } } }`,
        { id }
      );
      return data.Media.characters.edges.map((edge): CharacterRole => ({
        id: edge.node.id,
        image: edge.node.image?.large,
        name: edge.node.name.full,
        role: titleCase(edge.role),
        voiceActors: edge.voiceActors.map(toPerson),
      }));
    },

    async getRecommendations(id) {
      const data = await query<{
        Media: { recommendations: { nodes: { mediaRecommendation: AniListMedia | null }[] } };
      }>(
        `query ($id: Int) { Media(id: $id) { recommendations(sort: RATING_DESC, perPage: 25) { nodes {
          mediaRecommendation { ${SUMMARY_FIELDS} } } } } }`,
        { id }
      );
      return data.Media.recommendations.nodes
        .map((node) => node.mediaRecommendation)
        .filter((media): media is AniListMedia => media !== null && media.isAdult !== true)
        .map(toSummary);
    },

    async getReviews(id, pageNumber = 1) {
      const data = await query<{
        Media: {
          reviews: {
            pageInfo: { hasNextPage: boolean };
            nodes: {
              id: number;
              siteUrl: string;
              summary?: string;
              body: string;
              score?: number;
              createdAt: number;
              user: { name: string; avatar?: { large?: string } };
            }[];
          };
        };
      }>(
        `query ($id: Int, $page: Int) { Media(id: $id) { reviews(page: $page, perPage: 10, sort: RATING_DESC) {
          pageInfo { hasNextPage }
          nodes { id siteUrl summary body(asHtml: false) score createdAt user { name avatar { large } } } } } }`,
        { id, page: pageNumber }
      );
      return {
        hasNextPage: data.Media.reviews.pageInfo.hasNextPage,
        items: data.Media.reviews.nodes.map((review) => ({
          author: review.user.name,
          avatar: review.user.avatar?.large,
          body: stripHtml(review.body) ?? review.summary ?? "",
          date: new Date(review.createdAt * MS_PER_SECOND).toISOString().slice(0, "YYYY-MM-DD".length),
          id: review.id,
          score: review.score === undefined ? undefined : review.score / SCORE_SCALE,
          spoiler: false,
          url: review.siteUrl,
        })),
        page: pageNumber,
      };
    },

    async getStats(id) {
      const data = await query<{
        Media: {
          stats: {
            statusDistribution: { status: string; amount: number }[];
            scoreDistribution: { score: number; amount: number }[];
          };
        };
      }>(
        `query ($id: Int) { Media(id: $id) { stats {
          statusDistribution { status amount } scoreDistribution { score amount } } } }`,
        { id }
      );
      return {
        // AniList scores are 10–100 in steps of 10; normalise to 1–10.
        scores: data.Media.stats.scoreDistribution.map((entry) => ({
          score: entry.score / SCORE_SCALE,
          votes: entry.amount,
        })),
        statuses: data.Media.stats.statusDistribution.map((entry) => ({
          count: entry.amount,
          label: titleCase(entry.status === "CURRENT" ? "WATCHING" : entry.status),
        })),
      };
    },

    async random() {
      const randomPage = 1 + Math.floor(Math.random() * RANDOM_POOL_PAGES);
      const result = await page({ page: randomPage, perPage: 1, sort: ["POPULARITY_DESC"] });
      const [first] = result.items;
      if (!first) {
        throw new Error("Could not find a random anime, please try again");
      }
      return first;
    },

    async schedule(day) {
      // Next occurrence of `day` in the user's local time.
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() + ((day - start.getDay() + DAYS_PER_WEEK) % DAYS_PER_WEEK));
      const from = Math.floor(start.getTime() / MS_PER_SECOND);
      const items = new Map<number, AnimeSummary>();
      for (let pageNumber = 1; ; pageNumber += 1) {
        // oxlint-disable-next-line no-await-in-loop
        const data = await query<{
          Page: {
            pageInfo: { hasNextPage: boolean };
            airingSchedules: { episode: number; airingAt: number; media: AniListMedia }[];
          };
        }>(
          `query ($page: Int, $from: Int, $to: Int) { Page(page: $page, perPage: 50) { pageInfo { hasNextPage }
            airingSchedules(airingAt_greater: $from, airingAt_lesser: $to, sort: TIME) {
              episode airingAt media { ${SUMMARY_FIELDS} } } } }`,
          { from, page: pageNumber, to: from + SECONDS_PER_DAY }
        );
        for (const entry of data.Page.airingSchedules) {
          if (entry.media.isAdult !== true) {
            items.set(entry.media.id, {
              ...toSummary(entry.media),
              nextEpisode: { airingAt: entry.airingAt * MS_PER_SECOND, episode: entry.episode },
            });
          }
        }
        if (!data.Page.pageInfo.hasNextPage) {
          break;
        }
      }
      return [...items.values()];
    },

    async search(params) {
      const hasQuery = (params.query ?? "") !== "";
      return await page({
        format: params.format === undefined ? undefined : FORMATS_REVERSE[params.format],
        genres: (params.genres?.length ?? 0) > 0 ? params.genres : undefined,
        page: params.page ?? 1,
        search: hasQuery ? params.query : undefined,
        season: params.season?.toUpperCase(),
        seasonYear: params.year,
        sort: [SORTS[params.sort ?? (hasQuery ? "popularity" : "score")]],
        status: params.status === undefined ? undefined : STATUSES_REVERSE[params.status],
      });
    },

    async seasonal(year, season, pageNumber = 1) {
      return await page({
        page: pageNumber,
        season: season.toUpperCase(),
        seasonYear: year,
        sort: ["POPULARITY_DESC"],
      });
    },

    source: "anilist",
  };
};
