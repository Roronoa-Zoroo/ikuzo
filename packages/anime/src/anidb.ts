import { XMLParser } from "fast-xml-parser";

import { createRateLimiter, parseJson } from "./http";

/**
 * AniDB HTTP API client (episode data only).
 *
 * AniDB rules (https://wiki.anidb.net/HTTP_API_Definition):
 * - every client must be registered at https://anidb.net/software/add and send its name + version
 * - at most one request every 2 seconds, and the same anime no more than once per day
 * - breaking the rules gets the client banned, so responses are cached for 24h
 *
 * The API is only served over plain HTTP.
 */
const ENDPOINT = "http://api.anidb.net:9001/httpapi";
const REQUEST_INTERVAL_MS = 2500;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PROTOCOL_VERSION = 1;

export type EpisodeKind = "regular" | "special" | "credit" | "trailer" | "parody" | "other";

export interface AniDbEpisode {
  id: number;
  /** "1", "S1", "C2"… as shown on AniDB */
  number: string;
  kind: EpisodeKind;
  title?: string;
  titleNative?: string;
  airDate?: string;
  lengthMinutes?: number;
  rating?: number;
  summary?: string;
}

export interface AniDbAnime {
  id: number;
  url: string;
  episodeCount?: number;
  episodes: AniDbEpisode[];
}

/** Persistent cache supplied by the app (SQLite, localStorage…). */
export interface AniDbCache {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
}

export interface AniDbConfig {
  client: string;
  clientVersion: number;
  cache?: AniDbCache;
}

const KINDS: Record<string, EpisodeKind> = {
  "1": "regular",
  "2": "special",
  "3": "credit",
  "4": "trailer",
  "5": "parody",
  "6": "other",
};

interface XmlText {
  "#text"?: string | number;
  "@_type"?: string | number;
  "@_xml:lang"?: string;
}

interface XmlEpisode {
  "@_id": number;
  epno: XmlText | string | number;
  length?: number;
  airdate?: string;
  rating?: XmlText | number;
  summary?: string;
  title?: (XmlText | string)[] | XmlText | string;
}

const asArray = <T>(value: T | T[] | undefined): T[] => {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
};

const textOf = (value: XmlText | string | number | undefined): string | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "object") {
    return value["#text"] === undefined ? undefined : String(value["#text"]);
  }
  return String(value);
};

const titleIn = (titles: (XmlText | string)[], lang: string): string | undefined => {
  const match = titles.find((title) => typeof title === "object" && title["@_xml:lang"] === lang);
  return textOf(match);
};

const parser = new XMLParser({ attributeNamePrefix: "@_", ignoreAttributes: false });

interface XmlDocument {
  error?: string | XmlText;
  anime?: { "@_id": number; episodecount?: number; episodes?: { episode?: XmlEpisode | XmlEpisode[] } };
}

const regularFirst = (episode: AniDbEpisode): number => (episode.kind === "regular" ? 0 : 1);

export const parseAnimeXml = (xml: string): AniDbAnime => {
  const parsed: unknown = parser.parse(xml);
  // fast-xml-parser returns untyped data; XmlDocument lists the parts we read, all optional.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const document = parsed as XmlDocument;
  if (document.error !== undefined) {
    throw new Error(`AniDB: ${textOf(document.error) ?? "unknown error"}`);
  }
  if (document.anime === undefined) {
    throw new Error("AniDB: unexpected response");
  }
  const { anime } = document;
  const episodes = asArray(anime.episodes?.episode).map((episode): AniDbEpisode => {
    const titles = asArray(episode.title);
    const epno = typeof episode.epno === "object" ? episode.epno : { "#text": episode.epno };
    const rating = textOf(episode.rating);
    return {
      airDate: episode.airdate,
      id: episode["@_id"],
      kind: KINDS[String(epno["@_type"] ?? "1")] ?? "other",
      lengthMinutes: episode.length,
      number: textOf(epno) ?? "?",
      rating: rating === undefined ? undefined : Number(rating),
      summary: episode.summary,
      title: titleIn(titles, "en") ?? titleIn(titles, "x-jat"),
      titleNative: titleIn(titles, "ja"),
    };
  });
  episodes.sort(
    (a, b) =>
      regularFirst(a) - regularFirst(b) ||
      a.kind.localeCompare(b.kind) ||
      a.number.localeCompare(b.number, undefined, { numeric: true })
  );
  return {
    episodeCount: anime.episodecount,
    episodes,
    id: anime["@_id"],
    url: `https://anidb.net/anime/${anime["@_id"]}`,
  };
};

export const createAniDbClient = (config: AniDbConfig) => {
  const limit = createRateLimiter(REQUEST_INTERVAL_MS);

  const fetchXml = async (aid: number): Promise<string> => {
    const key = `anidb:anime:${aid}`;
    const cached = await config.cache?.get(key);
    if (cached !== null && cached !== undefined) {
      const { at, xml } = parseJson<{ at: number; xml: string }>(cached);
      if (Date.now() - at < CACHE_TTL_MS) {
        return xml;
      }
    }
    const params = new URLSearchParams({
      aid: String(aid),
      client: config.client,
      clientver: String(config.clientVersion),
      protover: String(PROTOCOL_VERSION),
      request: "anime",
    });
    const xml = await limit(async () => {
      // No retries: AniDB bans clients that hammer it.
      const response = await fetch(`${ENDPOINT}?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`AniDB request failed with status ${response.status}`);
      }
      return await response.text();
    });
    // Only cache valid answers, never errors such as "banned".
    parseAnimeXml(xml);
    await config.cache?.set(key, JSON.stringify({ at: Date.now(), xml }));
    return xml;
  };

  return {
    async getAnime(aid: number): Promise<AniDbAnime> {
      return parseAnimeXml(await fetchXml(aid));
    },
  };
};

export type AniDbClient = ReturnType<typeof createAniDbClient>;
