import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { broadcastInLocalTime, estimateNextEpisode, formatCountdown } from "@ikuzo/anime/airing";
import { SOURCE_LABELS } from "@ikuzo/anime/types";
import type { AnimeDetail } from "@ikuzo/anime/types";
import { useState } from "react";
import { Alert, FlatList, StyleSheet, View } from "react-native";

import { AnimeCarousel } from "@/components/anime-carousel";
import { PosterTile } from "@/components/poster-tile";
import { Section } from "@/components/section";
import { AppText } from "@/components/text";
import { Touchable } from "@/components/touchable";
import { UpdateSheet } from "@/components/update-sheet";
import { watchNextEpisode } from "@/lib/episodes";
import { capitalize, formatAirTime, formatCount, formatDateRange } from "@/lib/format";
import { openLink, redditUrl } from "@/lib/links";
import { openAnime, openCharacter, openCharacters } from "@/lib/nav";
import { ensurePermission } from "@/lib/notifications";
import { useCharacters, useRecommendations } from "@/lib/queries";
import {
  animeKey,
  characterKey,
  entryKeyFor,
  findEntry,
  library,
  useEntry,
  useFavoriteCharacters,
  useIsBookmarked,
} from "@/lib/store";
import type { WatchStatus } from "@/lib/store";
import { colors, radius, spacing } from "@/lib/theme";
import { useNow } from "@/lib/use-now";

/** anYme's compact status words for the stat row. */
const SHORT_STATUS: Record<WatchStatus, string> = {
  completed: "Completed",
  dropped: "Dropped",
  onHold: "On hold",
  planned: "Planned",
  watching: "Watching",
};

const WEEKDAY_NAMES = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"] as const;
const SYNOPSIS_PREVIEW_LINES = 5;
const CHARACTER_PREVIEW = 12;
const CHARACTER_TILE_WIDTH = 110;

const styles = StyleSheet.create({
  buttonText: { color: colors.textStrong, fontSize: 15, fontWeight: "700", letterSpacing: 1.25 },
  carousel: { gap: spacing.md, paddingHorizontal: spacing.lg },
  center: { alignItems: "center", gap: spacing.sm },
  controls: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    gap: spacing.md,
    marginHorizontal: spacing.md,
    padding: spacing.lg,
  },
  genre: {
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  genres: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  infoLabel: { width: 96 },
  infoRow: { flexDirection: "row", gap: spacing.md },
  infoValue: { flex: 1 },
  linkButton: {
    alignItems: "center",
    backgroundColor: "#0c1220",
    borderColor: colors.textStrong,
    borderRadius: 12,
    borderWidth: 1.5,
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  linkLabel: { color: colors.textStrong, fontSize: 16, fontWeight: "600" },
  links: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, justifyContent: "center", marginTop: spacing.sm },
  // MaterialButton / AnYmeOutlinedButton: 4dp corners, 13dp vertical padding.
  outlineButton: {
    alignItems: "center",
    borderColor: colors.primary,
    borderRadius: 4,
    borderWidth: 2,
    paddingVertical: 11,
  },
  pad: { paddingHorizontal: spacing.lg },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 4,
    elevation: 2,
    paddingVertical: 13,
  },
  statLabel: { color: colors.textStrong, fontSize: 16, fontWeight: "700" },
  statRow: { flexDirection: "row", justifyContent: "space-between" },
  statTile: { alignItems: "center", borderRadius: radius.sm, flex: 1, gap: 2, paddingVertical: spacing.xs },
  tab: { gap: spacing.md, paddingVertical: spacing.md },
});

const pad = (value: number): string => String(value).padStart(2, "0");

const StatTile = ({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  onPress?: () => void;
}) => (
  <Touchable accessibilityRole="button" disabled={onPress === undefined} onPress={onPress} style={styles.statTile}>
    <MaterialCommunityIcons color={colors.textStrong} name={icon} size={30} />
    <AppText numberOfLines={1} style={styles.statLabel}>
      {label}
    </AppText>
  </Touchable>
);

const ListControls = ({ anime }: { anime: AnimeDetail }) => {
  const entry = useEntry(anime);
  const key = entry?.key ?? animeKey(anime);
  const bookmarked = useIsBookmarked(anime);
  const [editing, setEditing] = useState(false);
  const openEditor = () => {
    setEditing(true);
  };

  return (
    <View style={styles.controls}>
      <View style={styles.statRow}>
        <StatTile
          icon="movie-open"
          label={entry === undefined ? "Not in list" : SHORT_STATUS[entry.status]}
          onPress={openEditor}
        />
        <StatTile icon="eye" label={`${entry?.progress ?? 0}/${anime.episodes ?? "?"}`} onPress={openEditor} />
        <StatTile
          icon="thumb-up"
          label={entry === undefined || entry.score === 0 ? "–" : String(entry.score)}
          onPress={openEditor}
        />
        <StatTile
          icon={bookmarked ? "bookmark-multiple" : "bookmark-multiple-outline"}
          label="Bookmark"
          onPress={() => {
            library.toggleBookmark(anime);
          }}
        />
      </View>
      {entry === undefined ? (
        <Touchable accessibilityRole="button" onPress={openEditor} style={styles.primaryButton}>
          <AppText style={styles.buttonText}>ADD TO LIST</AppText>
        </Touchable>
      ) : (
        <>
          <Touchable
            accessibilityLabel="Watched one more episode"
            accessibilityRole="button"
            onPress={() => {
              watchNextEpisode(key);
            }}
            style={styles.primaryButton}
          >
            <AppText style={styles.buttonText}>+1</AppText>
          </Touchable>
          <Touchable accessibilityRole="button" onPress={openEditor} style={styles.outlineButton}>
            <AppText style={styles.buttonText}>UPDATE</AppText>
          </Touchable>
        </>
      )}
      <UpdateSheet
        anime={anime}
        onClose={() => {
          setEditing(false);
        }}
        visible={editing}
      />
    </View>
  );
};

const NextEpisodeCard = ({ anime }: { anime: AnimeDetail }) => {
  const notify = useEntry(anime)?.notify === true;
  const now = useNow();
  const next = estimateNextEpisode(anime, now);

  if (anime.status !== "airing" && anime.status !== "upcoming") {
    return null;
  }

  const toggleNotify = async () => {
    if (!notify && !(await ensurePermission())) {
      Alert.alert(
        "Notifications are off",
        "Allow notifications for Ikuzo in your system settings to get episode alerts."
      );
      return;
    }
    if (findEntry(anime) === undefined) {
      library.save(anime, { status: "planned" });
    }
    library.update(entryKeyFor(anime), { notify: !notify });
  };

  return (
    <Section>
      <View style={styles.center}>
        {next === undefined ? (
          <AppText variant="label">An episode will be released later.</AppText>
        ) : (
          <>
            <AppText variant="label">
              Episode {next.episode} · {formatAirTime(next.airingAt)}
            </AppText>
            <AppText color={colors.accent} variant="heading">
              {formatCountdown(next.airingAt - now)}
            </AppText>
          </>
        )}
        <Touchable
          accessibilityRole="switch"
          accessibilityState={{ checked: notify }}
          onPress={() => {
            void toggleNotify();
          }}
        >
          <AppText color={colors.accent} variant="heading">
            {notify ? "Notifications on ✓" : "Get notified"}
          </AppText>
        </Touchable>
      </View>
    </Section>
  );
};

const InfoRow = ({ label, value }: { label: string; value?: string }) =>
  value === undefined || value === "" ? null : (
    <View style={styles.infoRow}>
      <AppText style={styles.infoLabel} variant="caption">
        {label}
      </AppText>
      <AppText style={styles.infoValue}>{value}</AppText>
    </View>
  );

const LinkButton = ({
  icon,
  iconColor = colors.textStrong,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  label: string;
  onPress: () => void;
}) => (
  <Touchable accessibilityRole="link" onPress={onPress} style={styles.linkButton}>
    <Ionicons color={iconColor} name={icon} size={24} />
    <AppText style={styles.linkLabel}>{label}</AppText>
  </Touchable>
);

const localBroadcast = (anime: AnimeDetail): string | undefined => {
  if (anime.broadcast === undefined) {
    return undefined;
  }
  const local = broadcastInLocalTime(anime.broadcast);
  if (local === undefined) {
    return undefined;
  }
  return `${WEEKDAY_NAMES[local.weekday] ?? ""} at ${pad(local.hour)}:${pad(local.minute)} (your time)`;
};

const Info = ({ anime }: { anime: AnimeDetail }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <Section
      actionLabel={expanded ? "Less Information" : "More Information"}
      onAction={() => {
        setExpanded(!expanded);
      }}
      title="Info"
    >
      {expanded ? (
        <>
          <InfoRow label="Format" value={anime.format} />
          <InfoRow label="Episodes" value={anime.episodes === null ? "?" : String(anime.episodes)} />
          <InfoRow
            label="Duration"
            value={anime.durationMinutes === undefined ? undefined : `${anime.durationMinutes} min`}
          />
          <InfoRow label="Status" value={capitalize(anime.status)} />
          <InfoRow label="Aired" value={formatDateRange(anime.airedFrom, anime.airedTo, anime.status)} />
          <InfoRow
            label="Season"
            value={anime.season === undefined ? undefined : `${capitalize(anime.season)} ${anime.year ?? ""}`}
          />
          <InfoRow label="Broadcast" value={localBroadcast(anime)} />
          <InfoRow label="Studios" value={anime.studios.join(", ")} />
          <InfoRow label="Source" value={anime.sourceMaterial} />
          <InfoRow label="Rating" value={anime.rating} />
          <InfoRow label="Score" value={anime.score?.toFixed(2)} />
          <InfoRow label="Ranked" value={anime.rank === undefined ? undefined : `#${anime.rank}`} />
          <InfoRow label="Popularity" value={anime.popularity === undefined ? undefined : `#${anime.popularity}`} />
          <InfoRow label="Members" value={anime.members === undefined ? undefined : formatCount(anime.members)} />
          <InfoRow label="Japanese" value={anime.titleNative} />
          <InfoRow label="English" value={anime.titleEnglish} />
        </>
      ) : null}
      <View style={styles.links}>
        <LinkButton
          icon="logo-reddit"
          iconColor="#ff4500"
          label="Discuss"
          onPress={() => {
            void openLink(redditUrl(anime));
          }}
        />
        <LinkButton
          icon="open-outline"
          label={SOURCE_LABELS[anime.source]}
          onPress={() => {
            void openLink(anime.url);
          }}
        />
        {anime.trailerUrl === undefined ? null : (
          <LinkButton
            icon="logo-youtube"
            label="Trailer"
            onPress={() => {
              void openLink(anime.trailerUrl ?? "");
            }}
          />
        )}
      </View>
    </Section>
  );
};

const Synopsis = ({ text }: { text?: string }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <Section title="Synopsis">
      <Touchable
        accessibilityHint="Shows the full synopsis"
        onPress={() => {
          setExpanded(!expanded);
        }}
      >
        <AppText color={colors.textMuted} numberOfLines={expanded ? undefined : SYNOPSIS_PREVIEW_LINES}>
          {text ?? "No synopsis yet."}
        </AppText>
      </Touchable>
    </Section>
  );
};

const Characters = ({ anime }: { anime: AnimeDetail }) => {
  const characters = useCharacters(anime.source, anime.id);
  const favoriteList = useFavoriteCharacters();
  const favorites = new Set(favoriteList.map((favorite) => favorite.key));
  const toggle = library.toggleFavoriteCharacter;
  return (
    <Section
      actionLabel="View all"
      flush
      onAction={() => {
        openCharacters(anime.source, anime.id);
      }}
      title="Characters"
    >
      {characters.isPending ? (
        <AppText style={styles.pad} variant="caption">
          Loading…
        </AppText>
      ) : null}
      <FlatList
        contentContainerStyle={styles.carousel}
        data={characters.data?.slice(0, CHARACTER_PREVIEW) ?? []}
        horizontal
        keyExtractor={(character) => String(character.id)}
        renderItem={({ item }) => (
          <PosterTile
            favorite={{
              active: favorites.has(characterKey(item.source ?? anime.source, item.id)),
              onToggle: () => {
                toggle(item.source ?? anime.source, item);
              },
            }}
            image={item.image}
            onPress={() => {
              openCharacter(item.source ?? anime.source, item.id);
            }}
            subtitle={item.role}
            title={item.name}
            width={CHARACTER_TILE_WIDTH}
          />
        )}
        showsHorizontalScrollIndicator={false}
      />
    </Section>
  );
};

/** Story order first: what comes before and after, then everything else. */
const RELATION_ORDER = ["Prequel", "Sequel", "Parent story", "Side story", "Alternative version", "Spin-off"];

const relationRank = (relation: string): number => {
  const rank = RELATION_ORDER.findIndex((name) => name.toLowerCase() === relation.toLowerCase());
  return rank === -1 ? RELATION_ORDER.length : rank;
};

/** Related anime as poster cards (relation underneath) that open their own page. */
const Related = ({ anime }: { anime: AnimeDetail }) => {
  const items = anime.relations
    .toSorted((a, b) => relationRank(a.relation) - relationRank(b.relation))
    .flatMap((group) =>
      group.items.filter((item) => item.kind === "anime").map((item) => ({ ...item, relation: group.relation }))
    );
  return (
    <Section flush title="Related">
      {items.length === 0 ? (
        <AppText style={styles.pad} variant="caption">
          No related anime.
        </AppText>
      ) : null}
      <FlatList
        contentContainerStyle={styles.carousel}
        data={items}
        horizontal
        keyExtractor={(item) => `${item.relation}-${item.id}`}
        renderItem={({ item }) => (
          <PosterTile
            image={item.image}
            onPress={() => {
              openAnime({ id: item.id, source: anime.source });
            }}
            subtitle={item.relation}
            title={item.title}
            width={CHARACTER_TILE_WIDTH}
          />
        )}
        showsHorizontalScrollIndicator={false}
      />
    </Section>
  );
};

const Recommendations = ({ anime }: { anime: AnimeDetail }) => {
  const recommendations = useRecommendations(anime.source, anime.id);
  return (
    <AnimeCarousel
      error={recommendations.error}
      items={recommendations.data}
      loading={recommendations.isPending}
      title="Recommendations"
    />
  );
};

export const MainTab = ({ anime }: { anime: AnimeDetail }) => (
  <View style={styles.tab}>
    <ListControls anime={anime} />
    <NextEpisodeCard anime={anime} />
    <Info anime={anime} />
    {anime.genres.length === 0 ? null : (
      <Section title="Genres">
        <View style={styles.genres}>
          {anime.genres.map((genre) => (
            <View key={genre} style={styles.genre}>
              <AppText variant="caption">{genre}</AppText>
            </View>
          ))}
        </View>
      </Section>
    )}
    <Synopsis text={anime.synopsis} />
    <Characters anime={anime} />
    <Related anime={anime} />
    <Recommendations anime={anime} />
  </View>
);
