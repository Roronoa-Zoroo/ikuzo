import { useMemo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { Header } from "@/components/header";
import { Section } from "@/components/section";
import { useSideMenu } from "@/components/side-menu";
import { AppText } from "@/components/text";
import { formatWatchTime } from "@/lib/format";
import { useEntries, WATCH_STATUS_LABELS, WATCH_STATUSES } from "@/lib/store";
import type { LibraryEntry, WatchStatus } from "@/lib/store";
import { colors, radius, spacing } from "@/lib/theme";

const DEFAULT_EPISODE_MINUTES = 24;
const TOP_GENRES = 8;
const SCORE_STEPS = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1] as const;

const STATUS_COLORS: Record<WatchStatus, string> = {
  completed: colors.success,
  dropped: colors.danger,
  onHold: colors.warning,
  planned: colors.textSubtle,
  watching: colors.accent,
};

const styles = StyleSheet.create({
  barFill: { borderRadius: radius.pill, height: "100%" },
  barLabel: { width: 104 },
  barRow: { alignItems: "center", flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.xs },
  barTrack: { backgroundColor: colors.surface, borderRadius: radius.pill, flex: 1, height: 10, overflow: "hidden" },
  barValue: { textAlign: "right", width: 40 },
  content: { gap: spacing.md, paddingBottom: spacing.xl },
  screen: { backgroundColor: colors.background, flex: 1 },
  tile: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    flexBasis: "47%",
    flexGrow: 1,
    gap: spacing.xs,
    padding: spacing.lg,
  },
  tiles: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
});

const computeStats = (entries: LibraryEntry[]) => {
  const byStatus: Record<WatchStatus, number> = { completed: 0, dropped: 0, onHold: 0, planned: 0, watching: 0 };
  const scores = new Map<number, number>();
  const genres = new Map<string, number>();
  let episodes = 0;
  let minutes = 0;
  let scoreSum = 0;
  let scored = 0;

  for (const entry of entries) {
    byStatus[entry.status] += 1;
    episodes += entry.progress;
    minutes += entry.progress * (entry.anime.durationMinutes ?? DEFAULT_EPISODE_MINUTES);
    if (entry.score > 0) {
      scoreSum += entry.score;
      scored += 1;
      scores.set(entry.score, (scores.get(entry.score) ?? 0) + 1);
    }
    if (entry.status !== "planned") {
      for (const genre of entry.anime.genres) {
        genres.set(genre, (genres.get(genre) ?? 0) + 1);
      }
    }
  }

  return {
    byStatus,
    episodes,
    genres: [...genres.entries()].toSorted((a, b) => b[1] - a[1]).slice(0, TOP_GENRES),
    meanScore: scored > 0 ? scoreSum / scored : undefined,
    minutes,
    scores,
    total: entries.length,
  };
};

const Tile = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.tile}>
    <AppText variant="title">{value}</AppText>
    <AppText variant="caption">{label}</AppText>
  </View>
);

const Bar = ({ label, value, max, color }: { label: string; value: number; max: number; color: string }) => (
  <View style={styles.barRow}>
    <AppText style={styles.barLabel} variant="caption">
      {label}
    </AppText>
    <View style={styles.barTrack}>
      <View style={[styles.barFill, { backgroundColor: color, width: `${max > 0 ? (value / max) * 100 : 0}%` }]} />
    </View>
    <AppText style={styles.barValue} variant="caption">
      {value}
    </AppText>
  </View>
);

const StatsScreen = () => {
  const entries = useEntries();
  const openMenu = useSideMenu((state) => state.setOpen);
  const stats = useMemo(() => computeStats(entries), [entries]);
  const maxStatus = Math.max(...Object.values(stats.byStatus));
  const maxScore = Math.max(0, ...stats.scores.values());
  const maxGenre = stats.genres[0]?.[1] ?? 0;

  return (
    <View style={styles.screen}>
      <Header
        leading={{
          icon: "menu",
          label: "Open menu",
          onPress: () => {
            openMenu(true);
          },
        }}
        title="Stats"
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.tiles}>
          <Tile label="Shows" value={String(stats.total)} />
          <Tile label="Episodes" value={stats.episodes.toLocaleString()} />
          <Tile label="Time watched" value={formatWatchTime(stats.minutes)} />
          <Tile label="Mean score" value={stats.meanScore === undefined ? "-" : stats.meanScore.toFixed(2)} />
        </View>

        <Section title="Lists">
          {WATCH_STATUSES.map((status) => (
            <Bar
              color={STATUS_COLORS[status]}
              key={status}
              label={WATCH_STATUS_LABELS[status]}
              max={maxStatus}
              value={stats.byStatus[status]}
            />
          ))}
        </Section>

        <Section title="Your scores">
          {maxScore === 0 ? (
            <AppText variant="caption">Score shows from the Update button to see your distribution.</AppText>
          ) : (
            SCORE_STEPS.map((score) => (
              <Bar
                color={colors.accent}
                key={score}
                label={String(score)}
                max={maxScore}
                value={stats.scores.get(score) ?? 0}
              />
            ))
          )}
        </Section>

        <Section title="Top genres">
          {stats.genres.length === 0 ? (
            <AppText variant="caption">Start watching shows to see your favourite genres.</AppText>
          ) : (
            stats.genres.map(([genre, count]) => (
              <Bar color={colors.success} key={genre} label={genre} max={maxGenre} value={count} />
            ))
          )}
        </Section>
      </ScrollView>
    </View>
  );
};

export default StatsScreen;
