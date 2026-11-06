import type { AnimeSummary } from "@ikuzo/anime/types";
import { FlatList, StyleSheet } from "react-native";

import { openAnime } from "@/lib/nav";
import { animeKey, displayTitle, useSettings } from "@/lib/store";
import { spacing } from "@/lib/theme";

import { PosterTile } from "./poster-tile";
import { Section } from "./section";
import { SkeletonTiles } from "./skeleton";
import { AppText } from "./text";

interface AnimeCarouselProps {
  title: string;
  items?: AnimeSummary[];
  loading?: boolean;
  error?: unknown;
  onViewAll?: () => void;
}

const styles = StyleSheet.create({
  row: { gap: spacing.md, paddingHorizontal: spacing.lg },
  status: { paddingHorizontal: spacing.lg },
});

/** Horizontal row of posters inside a section card (Discover, Recommendations, Related). */
export const AnimeCarousel = ({ title, items, loading = false, error, onViewAll }: AnimeCarouselProps) => {
  const language = useSettings().titleLanguage;
  return (
    <Section actionLabel={onViewAll === undefined ? undefined : "View all"} flush onAction={onViewAll} title={title}>
      {loading ? <SkeletonTiles /> : null}
      {error === undefined || error === null ? null : (
        <AppText style={styles.status} variant="caption">
          {error instanceof Error ? error.message : "Could not load"}
        </AppText>
      )}
      {!loading && items !== undefined && items.length === 0 ? (
        <AppText style={styles.status} variant="caption">
          Nothing here yet
        </AppText>
      ) : null}
      <FlatList
        contentContainerStyle={styles.row}
        data={items ?? []}
        horizontal
        keyExtractor={animeKey}
        renderItem={({ item }) => (
          <PosterTile
            image={item.image}
            onPress={() => {
              openAnime(item);
            }}
            subtitle={[item.format === "Unknown" ? undefined : item.format, item.score?.toFixed(1)]
              .filter(Boolean)
              .join(" · ")}
            title={displayTitle(item, language)}
          />
        )}
        showsHorizontalScrollIndicator={false}
      />
    </Section>
  );
};
