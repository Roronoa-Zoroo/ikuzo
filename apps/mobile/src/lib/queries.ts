import { estimateNextEpisode } from "@ikuzo/anime/airing";
import { completeIds } from "@ikuzo/anime/ids";
import type { AnimeSummary, BrowseList, Paged, SearchParams, Season, Source } from "@ikuzo/anime/types";
import { QueryClient, useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { anidb, anilist, getProvider } from "./sources";
import { useLibrary } from "./store";
import type { LibraryEntry } from "./store";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const STALE_DEFAULT_MS = 30 * MINUTE_MS;

const nextPage = (last: Paged<unknown>): number | undefined => (last.hasNextPage ? last.page + 1 : undefined);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 6 * HOUR_MS,
      retry: 2,
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

/**
 * Next episode for every airing/upcoming show in the library. AniList knows exact
 * times, so MyAnimeList entries are looked up there by MAL id; anything AniList
 * does not know falls back to the weekly broadcast slot.
 */
export const useLibraryAiring = () => {
  const entries = useLibrary((state) => state.entries);
  const candidates = Object.values(entries).filter(
    (entry) =>
      (entry.anime.status === "airing" || entry.anime.status === "upcoming") &&
      (entry.status === "watching" || entry.status === "planned" || entry.status === "onHold")
  );
  const malIds = candidates
    .map((entry) => entry.anime.ids.mal)
    .filter((id): id is number => id !== undefined)
    .toSorted((a, b) => a - b);

  return useQuery({
    queryFn: async (): Promise<Airing[]> => {
      const exact = new Map<number, AnimeSummary>();
      for (const show of await anilist.byMalIds(malIds)) {
        if (show.ids.mal !== undefined) {
          exact.set(show.ids.mal, show);
        }
      }
      const now = Date.now();
      const result: Airing[] = [];
      for (const entry of candidates) {
        const fresh = entry.anime.ids.mal === undefined ? undefined : exact.get(entry.anime.ids.mal);
        const next = estimateNextEpisode({ ...entry.anime, nextEpisode: fresh?.nextEpisode }, now);
        if (next !== undefined) {
          result.push({ airingAt: next.airingAt, entry, episode: next.episode });
        }
      }
      return result.toSorted((a, b) => a.airingAt - b.airingAt);
    },
    queryKey: ["library-airing", malIds, candidates.length],
    staleTime: 15 * MINUTE_MS,
  });
};
