import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { AnimeSummary } from "@ikuzo/anime/types";
import { Image } from "expo-image";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { formatDateRange } from "@/lib/format";
import { duration } from "@/lib/motion";
import { displayTitle, useSettings } from "@/lib/store";
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
  /** Hide the AIRING / NYA badge where every row has the same status (Calendar). */
  showStatus?: boolean;
  /** anYme lists use one line; the calendar allows two. */
  titleLines?: number;
}

const POSTER_WIDTH = 90;
const POSTER_HEIGHT = 110;

const styles = StyleSheet.create({
  // Measured from anYme's cardview_anime_main layout.
  body: { flex: 1, paddingBottom: 6, paddingLeft: 10, paddingRight: 4, paddingTop: 6 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 10,
    elevation: 5,
    flexDirection: "row",
    marginHorizontal: 8,
    overflow: "hidden",
  },
  date: { color: colors.text, fontSize: 13, fontWeight: "700", marginTop: 1 },
  footer: { alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" },
  footerText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  more: { borderRadius: radius.pill, marginRight: -4, marginTop: -2, padding: 2 },
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
  progress: { marginTop: 6 },
  spacer: { flex: 1, minHeight: spacing.sm },
  title: { color: colors.textStrong, fontSize: 17, fontWeight: "700" },
  titleBlock: { flex: 1 },
  titleRow: { flexDirection: "row", gap: spacing.xs },
});

/** The list card used by Home, Bookmarks, Calendar and search results. */
export const AnimeRow = ({
  anime,
  onPress,
  progress,
  onMore,
  footer,
  posterLabel,
  trailing,
  showStatus = true,
  titleLines = 1,
}: AnimeRowProps) => {
  const language = useSettings().titleLanguage;
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
              <AppText numberOfLines={titleLines} style={styles.title}>
                {displayTitle(anime, language)}
              </AppText>
              {dates === undefined ? null : (
                <AppText numberOfLines={1} style={styles.date}>
                  {dates}
                </AppText>
              )}
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
                <MaterialCommunityIcons color={colors.text} name="dots-vertical" size={22} />
              </Touchable>
            )}
            {trailing}
          </View>
          <View style={styles.spacer} />
          <View style={styles.footer}>
            {footer ?? (
              <AppText style={styles.footerText}>
                {progress === undefined
                  ? [anime.format, total === null ? undefined : `${total} eps`, anime.score?.toFixed(1)]
                      .filter(Boolean)
                      .join(" · ")
                  : `${progress}/${total ?? "?"}`}
              </AppText>
            )}
            {showStatus ? <StatusBadge status={anime.status} /> : null}
          </View>
          {progress === undefined ? null : (
            <View style={styles.progress}>
              <ProgressBar ratio={ratio} />
            </View>
          )}
        </View>
      </Touchable>
    </Animated.View>
  );
};
