import { estimateNextEpisode } from "@ikuzo/anime/airing";
import { HttpError } from "@ikuzo/anime/errors";
import { completeIds } from "@ikuzo/anime/ids";
import type { AnimeSummary, BrowseList, NextEpisode, Paged, SearchParams, Season, Source } from "@ikuzo/anime/types";
import { QueryClient, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { anidb, anilist, getProvider } from "./sources";
import { useEntries } from "./store";
import type { LibraryEntry } from "./store";
import { useNow } from "./use-now";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const STALE_DEFAULT_MS = 30 * MINUTE_MS;
const HTTP_CLIENT_ERROR = 400;
const HTTP_SERVER_ERROR = 500;
const HTTP_TOO_MANY_REQUESTS = 429;
/** The HTTP layer already retries 429 / 5xx; one more try here covers flaky networks. */
const MAX_QUERY_RETRIES = 1;

/** Requests the server refused (404, 400…) cannot succeed by asking again. */
const shouldRetry = (failureCount: number, error: unknown): boolean => {
  if (
    error instanceof HttpError &&
    error.status >= HTTP_CLIENT_ERROR &&
    error.status < HTTP_SERVER_ERROR &&
    error.status !== HTTP_TOO_MANY_REQUESTS
  ) {
    return false;
  }
  return failureCount < MAX_QUERY_RETRIES;
};

const nextPage = (last: Paged<unknown>): number | undefined => (last.hasNextPage ? last.page + 1 : undefined);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 6 * HOUR_MS,
      retry: shouldRetry,
      staleTime: STALE_DEFAULT_MS,
    },
  },
});

export const useAnime = (source: Source, id: number) =>
  useQuery({ queryFn: async () => await getProvider(source).getAnime(id), queryKey: ["anime", source, id] });

export const useCharacters = (source: Source, id: number) =>
  useQuery({
    queryFn: async () => await getProvider(source).getCharacters(id),
    queryKey: ["characters", source, id],
  });

export const useRecommendations = (source: Source, id: number) =>
  useQuery({
    queryFn: async () => await getProvider(source).getRecommendations(id),
    queryKey: ["recommendations", source, id],
  });

export const useReviews = (source: Source, id: number) =>
  useInfiniteQuery({
    getNextPageParam: nextPage,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => await getProvider(source).getReviews(id, pageParam),
    queryKey: ["reviews", source, id],
  });

export const useAnimeStats = (source: Source, id: number) =>
  useQuery({ queryFn: async () => await getProvider(source).getStats(id), queryKey: ["stats", source, id] });

export const useThemes = (source: Source, id: number, malId?: number) =>
  useQuery({
    enabled: source === "mal" || malId !== undefined,
    // Only MyAnimeList lists opening/ending songs, so AniList shows use their MAL id.
    queryFn: async () => {
      const jikan = getProvider("mal");
      return (await jikan.getThemes?.(source === "mal" ? id : (malId ?? id))) ?? { endings: [], openings: [] };
    },
    queryKey: ["themes", source, id],
  });

export const useCharacter = (source: Source, id: number) =>
  useQuery({ queryFn: async () => await getProvider(source).getCharacter(id), queryKey: ["character", source, id] });

export const useBrowse = (source: Source, list: BrowseList) =>
  useInfiniteQuery({
    getNextPageParam: nextPage,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => await getProvider(source).browse(list, pageParam),
    queryKey: ["browse", source, list],
  });

export const useSearch = (source: Source, params: SearchParams, enabled = true) =>
  useInfiniteQuery({
    enabled,
    getNextPageParam: nextPage,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => await getProvider(source).search({ ...params, page: pageParam }),
    queryKey: ["search", source, params],
  });

export const useSeasonal = (source: Source, year: number, season: Season) =>
  useInfiniteQuery({
    getNextPageParam: nextPage,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => await getProvider(source).seasonal(year, season, pageParam),
    queryKey: ["seasonal", source, year, season],
  });

export const useSchedule = (source: Source, day: number) =>
  useQuery({
    queryFn: async () => await getProvider(source).schedule(day),
    queryKey: ["schedule", source, day],
    staleTime: HOUR_MS,
  });

export const useGenres = (source: Source) =>
  useQuery({
    queryFn: async () => await getProvider(source).genres(),
    queryKey: ["genres", source],
    staleTime: Number.POSITIVE_INFINITY,
  });

/** AniDB episode list, resolved through the cross-database id map. Disabled without an AniDB client. */
export const useAniDbEpisodes = (anime: AnimeSummary | undefined) =>
  useQuery({
    enabled: anidb !== undefined && anime !== undefined,
    queryFn: async () => {
      if (anidb === undefined || anime === undefined) {
        return null;
      }
      const ids = await completeIds(anime.ids);
      return ids.anidb === undefined ? null : await anidb.getAnime(ids.anidb);
    },
    queryKey: ["anidb", anime?.source, anime?.id],
    staleTime: 24 * HOUR_MS,
  });

export interface Airing {
  entry: LibraryEntry;
  episode: number;
  airingAt: number;
}

const isAiringCandidate = (entry: LibraryEntry): boolean =>
  (entry.anime.status === "airing" || entry.anime.status === "upcoming") &&
  (entry.status === "watching" || entry.status === "planned" || entry.status === "onHold");

const sortedIds = (ids: (number | undefined)[]): number[] =>
  [...new Set(ids.filter((id): id is number => id !== undefined))].toSorted((a, b) => a - b);

/**
 * Next episode for every airing/upcoming show in the library. AniList knows exact times, so
 * shows are looked up there (by MAL id, or AniList id for shows without one); anything AniList
 * does not know falls back to the weekly broadcast slot.
 *
 * Only the air times are fetched; they are combined with the live library here, so changes
 * such as turning notifications on show up (and reschedule reminders) immediately.
 */
export const useLibraryAiring = () => {
  const entries = useEntries();
  const candidates = useMemo(() => entries.filter(isAiringCandidate), [entries]);
  const malIds = useMemo(() => sortedIds(candidates.map((entry) => entry.anime.ids.mal)), [candidates]);
  const aniListIds = useMemo(
    () =>
      sortedIds(
        candidates.filter((entry) => entry.anime.ids.mal === undefined).map((entry) => entry.anime.ids.anilist)
      ),
    [candidates]
  );

  const times = useQuery({
    queryFn: async (): Promise<Record<string, NextEpisode | undefined>> => {
      const result: Record<string, NextEpisode | undefined> = {};
      for (const show of await anilist.byMalIds(malIds)) {
        result[`mal:${show.ids.mal ?? ""}`] = show.nextEpisode;
      }
      for (const show of await anilist.byIds(aniListIds)) {
        result[`anilist:${show.id}`] = show.nextEpisode;
      }
      return result;
    },
    queryKey: ["library-airing-times", malIds, aniListIds],
    staleTime: 15 * MINUTE_MS,
  });

  // Re-evaluated every minute, so shows that just aired move on to their next episode.
  const now = useNow();
  const data = useMemo((): Airing[] | undefined => {
    if (times.data === undefined) {
      return undefined;
    }
    const result: Airing[] = [];
    for (const entry of candidates) {
      const { mal, anilist: aniListId } = entry.anime.ids;
      const exactKey = mal === undefined ? `anilist:${aniListId ?? ""}` : `mal:${mal}`;
      const fresh = exactKey in times.data ? times.data[exactKey] : entry.anime.nextEpisode;
      const next = estimateNextEpisode({ ...entry.anime, nextEpisode: fresh }, now);
      if (next !== undefined) {
        result.push({ airingAt: next.airingAt, entry, episode: next.episode });
      }
    }
    return result.toSorted((a, b) => a.airingAt - b.airingAt);
  }, [candidates, now, times.data]);

  return {
    data,
    error: times.error,
    isError: times.isError,
    isPending: times.isPending,
    isRefetching: times.isRefetching,
    refetch: times.refetch,
  };
};
