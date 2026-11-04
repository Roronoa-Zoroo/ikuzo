import { Ionicons } from "@expo/vector-icons";
import type { AnimeSummary } from "@ikuzo/anime/types";
import { Image } from "expo-image";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { formatDateRange } from "@/lib/format";
import { duration } from "@/lib/motion";
import { displayTitle, useLibrary } from "@/lib/store";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

import { ProgressBar } from "./progress-bar";
import { StatusBadge } from "./status-badge";
import { AppText } from "./text";
import { Touchable } from "./touchable";

interface AnimeRowProps {
  anime: AnimeSummary;
  onPress: () => void;
  /** Watched episodes; shows the "3/12" counter and progress bar when set. */
  progress?: number;
  onMore?: () => void;
  /** Overrides the bottom-left text (e.g. calendar air time). */
  footer?: ReactNode;
  /** Small label over the poster, e.g. "EP8". */
  posterLabel?: string;
  trailing?: ReactNode;
}

const POSTER_WIDTH = 96;
const POSTER_HEIGHT = 120;

const styles = StyleSheet.create({
  body: { flex: 1, gap: spacing.sm, justifyContent: "space-between", padding: spacing.md },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    flexDirection: "row",
    marginHorizontal: spacing.md,
    overflow: "hidden",
  },
  footer: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  more: { borderRadius: radius.pill, padding: 2 },
  poster: { backgroundColor: colors.surface, height: POSTER_HEIGHT, width: POSTER_WIDTH },
  posterLabel: {
    backgroundColor: colors.overlay,
    borderRadius: radius.sm,
    bottom: spacing.sm,
    left: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    position: "absolute",
  },
  posterLabelText: { fontSize: fontSize.sm, fontWeight: "700" },
  titleBlock: { flex: 1, gap: 2 },
  titleRow: { flexDirection: "row", gap: spacing.sm },
});

/** The list card used by Home, Bookmarks, Calendar and search results. */
export const AnimeRow = ({ anime, onPress, progress, onMore, footer, posterLabel, trailing }: AnimeRowProps) => {
  const language = useLibrary((state) => state.settings.titleLanguage);
  const total = anime.episodes;
  const ratio = progress !== undefined && total !== null && total > 0 ? Math.min(1, progress / total) : 0;
  const dates = formatDateRange(anime.airedFrom, anime.airedTo, anime.status);

  return (
    // Rows fade in and out like RecyclerView's default item animator (120 ms).
    <Animated.View entering={FadeIn.duration(duration.itemFade)} exiting={FadeOut.duration(duration.itemFade)}>
      <Touchable accessibilityRole="button" onPress={onPress} scaleOnPress style={styles.card}>
        <View>
          <Image contentFit="cover" source={anime.image} style={styles.poster} transition={duration.image} />
          {posterLabel === undefined ? null : (
            <View style={styles.posterLabel}>
              <AppText style={styles.posterLabelText}>{posterLabel}</AppText>
            </View>
          )}
        </View>
        <View style={styles.body}>
          <View style={styles.titleRow}>
            <View style={styles.titleBlock}>
              <AppText numberOfLines={2} variant="label">
                {displayTitle(anime, language)}
              </AppText>
              {dates === undefined ? null : <AppText variant="caption">{dates}</AppText>}
            </View>
            {onMore === undefined ? null : (
              <Touchable
                accessibilityLabel="More options"
                accessibilityRole="button"
                borderless
                hitSlop={10}
                onPress={onMore}
                style={styles.more}
              >
                <Ionicons color={colors.textMuted} name="ellipsis-vertical" size={20} />
              </Touchable>
            )}
            {trailing}
          </View>
          <View style={styles.footer}>
            {footer ?? (
              <AppText variant="caption">
                {progress === undefined
                  ? [anime.format, total === null ? undefined : `${total} eps`, anime.score?.toFixed(1)]
                      .filter(Boolean)
                      .join(" · ")
                  : `${progress}/${total ?? "?"}`}
              </AppText>
            )}
            <StatusBadge status={anime.status} />
          </View>
          {progress === undefined ? null : <ProgressBar ratio={ratio} />}
        </View>
      </Touchable>
    </Animated.View>
  );
};
