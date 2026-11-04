import { Ionicons } from "@expo/vector-icons";
import type { AnimeDetail } from "@ikuzo/anime/types";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { Section } from "@/components/section";
import { ErrorState } from "@/components/states";
import { AppText } from "@/components/text";
import { openLink, youtubeSearchUrl } from "@/lib/links";
import { useAniDbEpisodes, useAnimeStats, useReviews, useThemes } from "@/lib/queries";
import { anidb } from "@/lib/sources";
import { colors, radius, spacing } from "@/lib/theme";

const REVIEW_PREVIEW_LINES = 8;

const styles = StyleSheet.create({
  barFill: { backgroundColor: colors.accent, borderRadius: radius.pill, height: "100%" },
  barLabel: { width: 96 },
  barRow: { alignItems: "center", flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.xs },
  barTrack: { backgroundColor: colors.surface, borderRadius: radius.pill, flex: 1, height: 10, overflow: "hidden" },
  barValue: { textAlign: "right", width: 64 },
  episode: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  episodeBody: { flex: 1, gap: 2 },
  episodeNumber: { width: 40 },
  more: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    marginHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  pad: { padding: spacing.lg },
  reviewHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.sm },
  song: { alignItems: "center", flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.xs },
  songText: { flex: 1 },
  spinner: { padding: spacing.xl },
  tab: { gap: spacing.md, paddingVertical: spacing.md },
});

const Spinner = () => <ActivityIndicator color={colors.accent} style={styles.spinner} />;

const ReviewCard = ({
  review,
}: {
  review: { id: number; author: string; score?: number; body: string; date?: string; spoiler: boolean };
}) => {
  const [expanded, setExpanded] = useState(false);
  const [revealed, setRevealed] = useState(!review.spoiler);
  return (
    <Section>
      <View style={styles.reviewHeader}>
        <AppText variant="label">{review.author}</AppText>
        <AppText variant="caption">
          {[review.score === undefined ? undefined : `${review.score.toFixed(1)}/10`, review.date]
            .filter(Boolean)
            .join(" · ")}
        </AppText>
      </View>
      {revealed ? (
        <Pressable
          onPress={() => {
            setExpanded(!expanded);
          }}
        >
          <AppText color={colors.textMuted} numberOfLines={expanded ? undefined : REVIEW_PREVIEW_LINES}>
            {review.body}
          </AppText>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setRevealed(true);
          }}
        >
          <AppText color={colors.warning} variant="label">
            Contains spoilers, tap to read
          </AppText>
        </Pressable>
      )}
    </Section>
  );
};

export const ReviewsTab = ({ anime }: { anime: AnimeDetail }) => {
  const reviews = useReviews(anime.source, anime.id);
  if (reviews.isPending) {
    return <Spinner />;
  }
  if (reviews.isError) {
    return (
      <ErrorState
        error={reviews.error}
        onRetry={() => {
          void reviews.refetch();
        }}
      />
    );
  }
  const items = reviews.data.pages.flatMap((page) => page.items);
  return (
    <View style={styles.tab}>
      {items.length === 0 ? (
        <AppText style={styles.pad} variant="caption">
          No reviews yet.
        </AppText>
      ) : null}
      {items.map((review) => (
        <ReviewCard key={review.id} review={review} />
      ))}
      {reviews.hasNextPage ? (
        <Pressable
          accessibilityRole="button"
          disabled={reviews.isFetchingNextPage}
          onPress={() => {
            void reviews.fetchNextPage();
          }}
          style={styles.more}
        >
          {reviews.isFetchingNextPage ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <AppText variant="label">Load more reviews</AppText>
          )}
        </Pressable>
      ) : null}
    </View>
  );
};

const DistributionBar = ({ label, value, max }: { label: string; value: number; max: number }) => (
  <View style={styles.barRow}>
    <AppText style={styles.barLabel} variant="caption">
      {label}
    </AppText>
    <View style={styles.barTrack}>
      <View style={[styles.barFill, { width: `${max > 0 ? (value / max) * 100 : 0}%` }]} />
    </View>
    <AppText style={styles.barValue} variant="caption">
      {value.toLocaleString()}
    </AppText>
  </View>
);

export const StatsTab = ({ anime }: { anime: AnimeDetail }) => {
  const stats = useAnimeStats(anime.source, anime.id);
  if (stats.isPending) {
    return <Spinner />;
  }
  if (stats.isError) {
    return (
      <ErrorState
        error={stats.error}
        onRetry={() => {
          void stats.refetch();
        }}
      />
    );
  }
  const maxStatus = Math.max(0, ...stats.data.statuses.map((status) => status.count));
  const maxScore = Math.max(0, ...stats.data.scores.map((score) => score.votes));
  return (
    <View style={styles.tab}>
      <Section title="What people are doing">
        {stats.data.statuses.map((status) => (
          <DistributionBar key={status.label} label={status.label} max={maxStatus} value={status.count} />
        ))}
      </Section>
      <Section title="Score distribution">
        {stats.data.scores
          .toSorted((a, b) => b.score - a.score)
          .map((score) => (
            <DistributionBar key={score.score} label={String(score.score)} max={maxScore} value={score.votes} />
          ))}
      </Section>
    </View>
  );
};

const SongList = ({ title, songs }: { title: string; songs: string[] }) => (
  <Section title={title}>
    {songs.length === 0 ? <AppText variant="caption">None listed.</AppText> : null}
    {songs.map((song) => (
      <Pressable
        accessibilityHint="Searches the song on YouTube"
        accessibilityRole="link"
        key={song}
        onPress={() => {
          void openLink(youtubeSearchUrl(song));
        }}
        style={styles.song}
      >
        <Ionicons color={colors.accent} name="musical-notes" size={18} />
        <AppText style={styles.songText}>{song}</AppText>
      </Pressable>
    ))}
  </Section>
);

export const SongsTab = ({ anime }: { anime: AnimeDetail }) => {
  const themes = useThemes(anime.source, anime.id, anime.ids.mal);
  if (anime.source === "anilist" && anime.ids.mal === undefined) {
    return (
      <AppText style={styles.pad} variant="caption">
        Song data comes from MyAnimeList and this show has no MyAnimeList entry.
      </AppText>
    );
  }
  if (themes.isPending) {
    return <Spinner />;
  }
  if (themes.isError) {
    return (
      <ErrorState
        error={themes.error}
        onRetry={() => {
          void themes.refetch();
        }}
      />
    );
  }
  return (
    <View style={styles.tab}>
      <SongList songs={themes.data.openings} title="Openings" />
      <SongList songs={themes.data.endings} title="Endings" />
    </View>
  );
};

export const EpisodesTab = ({ anime }: { anime: AnimeDetail }) => {
  const episodes = useAniDbEpisodes(anime);
  if (anidb === undefined) {
    return (
      <AppText style={styles.pad} variant="caption">
        Episode titles come from AniDB. Set EXPO_PUBLIC_ANIDB_CLIENT to a registered AniDB client to enable them.
      </AppText>
    );
  }
  if (episodes.isPending) {
    return <Spinner />;
  }
  if (episodes.isError) {
    return (
      <ErrorState
        error={episodes.error}
        onRetry={() => {
          void episodes.refetch();
        }}
      />
    );
  }
  if (episodes.data === null) {
    return (
      <AppText style={styles.pad} variant="caption">
        This show is not on AniDB yet.
      </AppText>
    );
  }
  const { url } = episodes.data;
  return (
    <View style={styles.tab}>
      <Section
        actionLabel="AniDB"
        onAction={() => {
          void openLink(url);
        }}
        title="Episodes"
      >
        {episodes.data.episodes.map((episode) => (
          <View key={episode.id} style={styles.episode}>
            <AppText style={styles.episodeNumber} variant="label">
              {episode.number}
            </AppText>
            <View style={styles.episodeBody}>
              <AppText>{episode.title ?? "Untitled"}</AppText>
              <AppText variant="caption">
                {[
                  episode.airDate,
                  episode.lengthMinutes === undefined ? undefined : `${episode.lengthMinutes} min`,
                  episode.titleNative,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </AppText>
            </View>
          </View>
        ))}
      </Section>
    </View>
  );
};
