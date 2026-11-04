import type { AnimeSummary } from "@ikuzo/anime/types";
import { useQueries } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo } from "react";
import { FlatList, StyleSheet, View } from "react-native";

import { AnimeRow } from "@/components/anime-row";
import { Header } from "@/components/header";
import { EmptyState, Loading } from "@/components/states";
import { AppText } from "@/components/text";
import { openAnime } from "@/lib/nav";
import { getProvider } from "@/lib/sources";
import { animeKey, useLibrary, findEntry } from "@/lib/store";
import { colors, spacing } from "@/lib/theme";

/** How many favourite shows seed the recommendations. */
const SEEDS = 6;

const styles = StyleSheet.create({
  because: { flex: 1 },
  list: { gap: spacing.md, paddingVertical: spacing.md },
  screen: { backgroundColor: colors.background, flex: 1 },
});

/**
 * "Because you liked…": recommendations of your best-scored (or most recently
 * finished) shows, ranked by how many of them recommend the same title.
 */
const RecommendationsScreen = () => {
  const entries = useLibrary((state) => state.entries);
  const seeds = useMemo(
    () =>
      Object.values(entries)
        .filter((entry) => entry.status === "completed" || entry.status === "watching")
        .toSorted((a, b) => b.score - a.score || b.updatedAt - a.updatedAt)
        .slice(0, SEEDS),
    [entries]
  );

  const results = useQueries({
    queries: seeds.map((seed) => ({
      queryFn: async () => await getProvider(seed.anime.source).getRecommendations(seed.anime.id),
      queryKey: ["recommendations", seed.anime.source, seed.anime.id],
    })),
  });

  const pending = results.some((result) => result.isPending);
  const ranked = useMemo(() => {
    const counts = new Map<string, { anime: AnimeSummary; votes: number; because: string[] }>();
    for (const [index, result] of results.entries()) {
      const seed = seeds[index];
      for (const anime of result.data ?? []) {
        const key = animeKey(anime);
        if (findEntry(entries, anime) !== undefined || seed === undefined) {
          continue;
        }
        const current = counts.get(key) ?? { anime, because: [], votes: 0 };
        current.votes += 1;
        current.because.push(seed.anime.title);
        counts.set(key, current);
      }
    }
    return [...counts.values()].toSorted((a, b) => b.votes - a.votes);
  }, [entries, results, seeds]);

  return (
    <View style={styles.screen}>
      <Header
        leading={{
          icon: "arrow-back",
          label: "Back",
          onPress: () => {
            router.back();
          },
        }}
        title="Recommendations"
      />
      {seeds.length === 0 ? (
        <EmptyState
          icon="thumbs-up-outline"
          message="Complete or score a few shows and recommendations will show up here."
          title="Nothing to go on yet"
        />
      ) : null}
      {seeds.length > 0 && pending && ranked.length === 0 ? <Loading /> : null}
      <FlatList
        contentContainerStyle={styles.list}
        data={ranked}
        keyExtractor={(item) => animeKey(item.anime)}
        renderItem={({ item }) => (
          <AnimeRow
            anime={item.anime}
            footer={
              <AppText numberOfLines={2} style={styles.because} variant="caption">
                Because you liked {item.because.join(", ")}
              </AppText>
            }
            onPress={() => {
              openAnime(item.anime);
            }}
          />
        )}
      />
    </View>
  );
};

export default RecommendationsScreen;
