import type { AnimeSummary, Paged } from "@ikuzo/anime/types";
import type { InfiniteData, UseInfiniteQueryResult } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { ActivityIndicator, FlatList, StyleSheet } from "react-native";

import { openAnime } from "@/lib/nav";
import { animeKey, useEntryLookup } from "@/lib/store";
import { colors, spacing } from "@/lib/theme";

import { AnimeRow } from "./anime-row";
import { EmptyState, ErrorState, Loading } from "./states";

interface AnimeResultsProps {
  query: UseInfiniteQueryResult<InfiniteData<Paged<AnimeSummary>>>;
  header?: ReactElement;
  emptyTitle?: string;
}

const styles = StyleSheet.create({
  list: { flexGrow: 1, gap: spacing.md, paddingBottom: spacing.xl },
});

/** Infinite list of anime rows for search, seasonal and browse screens. */
export const AnimeResults = ({ query, header, emptyTitle = "No results" }: AnimeResultsProps) => {
  const lookup = useEntryLookup();
  if (query.isPending && query.fetchStatus !== "idle") {
    return (
      <>
        {header}
        <Loading />
      </>
    );
  }
  if (query.isError) {
    return (
      <>
        {header}
        <ErrorState
          error={query.error}
          onRetry={() => {
            void query.refetch();
          }}
        />
      </>
    );
  }
  const seen = new Set<string>();
  const items = (query.data?.pages ?? [])
    .flatMap((page) => page.items)
    .filter((anime) => {
      const key = animeKey(anime);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={items}
      keyExtractor={animeKey}
      ListEmptyComponent={
        query.data === undefined ? undefined : <EmptyState icon="search-outline" title={emptyTitle} />
      }
      ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator color={colors.accent} /> : undefined}
      ListHeaderComponent={header}
      onEndReached={() => {
        if (query.hasNextPage && !query.isFetchingNextPage) {
          void query.fetchNextPage();
        }
      }}
      onEndReachedThreshold={0.5}
      renderItem={({ item }) => (
        <AnimeRow
          anime={item}
          onPress={() => {
            openAnime(item);
          }}
          progress={lookup(item)?.progress}
        />
      )}
    />
  );
};
