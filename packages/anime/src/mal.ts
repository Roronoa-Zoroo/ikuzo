import { createRateLimiter, fetchWithRetry, readJson } from "./http";
import { completeIds } from "./ids";
import { malNodeToSummary } from "./mal-account";
import type { MalNode } from "./mal-account";
import type {
  AnimeDetail,
  AnimeProvider,
  AnimeStats,
  AnimeSummary,
  BrowseList,
  CharacterRole,
  Paged,
  RelationGroup,
  SearchParams,
} from "./types";

/**
 * MyAnimeList data from the official API (api.myanimelist.net) with only the
 * app's client ID. It is fast and reliable, but has no characters, reviews,
 * themes or schedules: those come from Jikan, and from AniList (matched by MAL
 * id) when Jikan is unavailable.
 */
const API = "https://api.myanimelist.net/v2";
const REQUEST_INTERVAL_MS = 350;
const PAGE_SIZE = 25;
const MIN_QUERY_LENGTH = 3;
const RANDOM_POOL = 2000;

const SUMMARY_FIELDS = [
  "alternative_titles",
  "media_type",
  "status",
  "num_episodes",
  "start_date",
  "end_date",
  "start_season",
  "mean",
  "num_list_users",
  "genres",
  "broadcast",
  "average_episode_duration",
  "nsfw",
].join(",");

const DETAIL_FIELDS = [
  SUMMARY_FIELDS,
  "synopsis",
  "rank",
  "popularity",
  "rating",
  "source",
  "studios",
  "related_anime",
  "recommendations",
  "statistics",
].join(",");

const RANKINGS: Record<BrowseList, string> = {
  airing: "airing",
  movies: "movie",
  popular: "bypopularity",
  top: "all",
  upcoming: "upcoming",
};

const RATINGS: Record<string, string> = {
  g: "G - All Ages",
  pg: "PG - Children",
  pg_13: "PG-13 - Teens 13 or older",
  r: "R - 17+ (violence & profanity)",
  "r+": "R+ - Mild Nudity",
  rx: "Rx - Hentai",
};

interface MalDetailNode extends MalNode {
  synopsis?: string;
  rank?: number;
  popularity?: number;
  rating?: string;
  source?: string;
  studios?: { name: string }[];
  related_anime?: { node: MalNode; relation_type_formatted: string }[];
  recommendations?: { node: MalNode }[];
  statistics?: { status?: Record<string, string | number> };
}

interface MalPage {
  data: { node: MalNode }[];
  paging?: { next?: string };
}

const titleCase = (value: string): string =>
  value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const toRelations = (related: MalDetailNode["related_anime"]): RelationGroup[] => {
  const groups = new Map<string, RelationGroup>();
  for (const item of related ?? []) {
    const group = groups.get(item.relation_type_formatted) ?? { items: [], relation: item.relation_type_formatted };
    group.items.push({ id: item.node.id, image: item.node.main_picture?.large, kind: "anime", title: item.node.title });
    groups.set(item.relation_type_formatted, group);
  }
  return [...groups.values()];
};

const toDetail = (node: MalDetailNode): AnimeDetail => ({
  ...malNodeToSummary(node),
  externalLinks: [],
  popularity: node.popularity,
  rank: node.rank,
  rating: node.rating === undefined ? undefined : (RATINGS[node.rating] ?? node.rating.toUpperCase()),
  relations: toRelations(node.related_anime),
  sourceMaterial: node.source === undefined ? undefined : titleCase(node.source),
  studios: (node.studios ?? []).map((studio) => studio.name),
  synopsis: node.synopsis,
  url: `https://myanimelist.net/anime/${node.id}`,
});

const STATUS_LABELS: [string, string][] = [
  ["watching", "Watching"],
  ["completed", "Completed"],
  ["on_hold", "On hold"],
  ["dropped", "Dropped"],
  ["plan_to_watch", "Plan to watch"],
];

/** After Jikan fails once, skip it for a while so every screen does not wait for it again. */
const JIKAN_COOLDOWN_MS = 5 * 60 * 1000;
let jikanDownUntil = 0;

const viaJikan = async <T>(primary: () => Promise<T>, fallback: () => Promise<T>): Promise<T> => {
  if (Date.now() < jikanDownUntil) {
    return await fallback();
  }
  try {
    return await primary();
  } catch {
    jikanDownUntil = Date.now() + JIKAN_COOLDOWN_MS;
    return await fallback();
  }
};

/** The AniList id for a MAL id, to borrow AniList's characters and reviews. */
const aniListId = async (malId: number): Promise<number> => {
  const ids = await completeIds({ mal: malId });
  if (ids.anilist === undefined) {
    throw new Error("This show is not on AniList");
  }
  return ids.anilist;
};

export interface MalProviderOptions {
  clientId: string;
  /** Jikan, for what the official API lacks. */
  jikan: AnimeProvider;
  /** AniList, used when Jikan is down (shows matched by MAL id). */
  anilist: AnimeProvider;
}

export const createMalProvider = ({ clientId, jikan, anilist }: MalProviderOptions): AnimeProvider => {
  const limit = createRateLimiter(REQUEST_INTERVAL_MS);

  const get = async <T>(path: string, params: Record<string, string | number>): Promise<T> => {
    const query = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]));
    return await limit(async () => {
      const response = await fetchWithRetry(`${API}${path}?${query.toString()}`, {
        headers: { "X-MAL-CLIENT-ID": clientId },
      });
      return await readJson<T>(response);
    });
  };

  const page = async (
    path: string,
    params: Record<string, string | number>,
    pageNumber: number
  ): Promise<Paged<AnimeSummary>> => {
    const result = await get<MalPage>(path, {
      ...params,
      fields: SUMMARY_FIELDS,
      limit: PAGE_SIZE,
      nsfw: "false",
      offset: (pageNumber - 1) * PAGE_SIZE,
    });
    return {
      hasNextPage: result.paging?.next !== undefined,
      items: result.data.map((item) => malNodeToSummary(item.node)).filter((anime) => anime.isAdult !== true),
      page: pageNumber,
    };
  };

  const detail = async (id: number): Promise<MalDetailNode> =>
    await get<MalDetailNode>(`/anime/${id}`, { fields: DETAIL_FIELDS });

  return {
    async browse(list, pageNumber = 1) {
      return await page("/anime/ranking", { ranking_type: RANKINGS[list] }, pageNumber);
    },

    async genres() {
      return await jikan.genres();
    },

    async getAnime(id) {
      return toDetail(await detail(id));
    },

    async getCharacter(id) {
      return await jikan.getCharacter(id);
    },

    async getCharacters(id) {
      return await viaJikan(
        async () => await jikan.getCharacters(id),
        async () => {
          const characters = await anilist.getCharacters(await aniListId(id));
          return characters.map((character): CharacterRole => ({ ...character, source: "anilist" }));
        }
      );
    },

    async getRecommendations(id) {
      const node = await detail(id);
      return (node.recommendations ?? []).map((item) => malNodeToSummary(item.node));
    },

    async getReviews(id, pageNumber = 1) {
      return await viaJikan(
        async () => await jikan.getReviews(id, pageNumber),
        async () => await anilist.getReviews(await aniListId(id), pageNumber)
      );
    },

    async getStats(id) {
      return await viaJikan(
        async () => await jikan.getStats(id),
        async (): Promise<AnimeStats> => {
          // The official API has list counts but no score distribution.
          const node = await detail(id);
          const counts = node.statistics?.status ?? {};
          return {
            scores: [],
            statuses: STATUS_LABELS.map(([key, label]) => ({ count: Number(counts[key] ?? 0), label })),
          };
        }
      );
    },

    getThemes: jikan.getThemes,

    async random() {
      return await viaJikan(
        async () => await jikan.random(),
        async () => {
          const offset = Math.floor(Math.random() * RANDOM_POOL);
          const result = await get<MalPage>("/anime/ranking", {
            fields: SUMMARY_FIELDS,
            limit: 1,
            offset,
            ranking_type: "bypopularity",
          });
          const [first] = result.data;
          if (first === undefined) {
            throw new Error("Could not find a random anime, please try again");
          }
          return malNodeToSummary(first.node);
        }
      );
    },

    // AniList has exact air times for the week; its shows carry their MAL ids.
    schedule: anilist.schedule,

    async search(params: SearchParams) {
      const queryText = params.query?.trim() ?? "";
      const hasFilters =
        params.format !== undefined ||
        params.status !== undefined ||
        params.year !== undefined ||
        (params.genres?.length ?? 0) > 0 ||
        params.sort !== undefined;
      // The official API only searches by title (3+ characters); filters need Jikan.
      if (hasFilters || queryText.length < MIN_QUERY_LENGTH) {
        return await jikan.search(params);
      }
      return await page("/anime", { q: queryText }, params.page ?? 1);
    },

    async seasonal(year, season, pageNumber = 1) {
      return await page(`/anime/season/${year}/${season}`, { sort: "anime_num_list_users" }, pageNumber);
    },

    source: "mal",
  };
};
