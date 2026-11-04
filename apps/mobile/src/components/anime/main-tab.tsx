import { Ionicons } from "@expo/vector-icons";
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
  useLibrary,
  useLibraryActions,
  WATCH_STATUS_LABELS,
  useEntry,
  entryKeyFor,
  findEntry,
} from "@/lib/store";
import { colors, radius, spacing } from "@/lib/theme";
import { useNow } from "@/lib/use-now";

const WEEKDAY_NAMES = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"] as const;
const SYNOPSIS_PREVIEW_LINES = 5;
const CHARACTER_PREVIEW = 12;
const CHARACTER_TILE_WIDTH = 110;

const styles = StyleSheet.create({
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
    borderColor: colors.text,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  links: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, justifyContent: "center", marginTop: spacing.sm },
  outlineButton: {
    alignItems: "center",
    borderColor: colors.accent,
    borderRadius: radius.sm,
    borderWidth: 2,
    paddingVertical: spacing.md,
  },
  pad: { paddingHorizontal: spacing.lg },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
  },
  relation: { gap: spacing.xs },
  statRow: { flexDirection: "row", justifyContent: "space-between" },
  statTile: { alignItems: "center", flex: 1, gap: spacing.xs },
  tab: { gap: spacing.md, paddingVertical: spacing.md },
});

const pad = (value: number): string => String(value).padStart(2, "0");

const StatTile = ({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
}) => (
  <Touchable accessibilityRole="button" disabled={onPress === undefined} onPress={onPress} style={styles.statTile}>
    <Ionicons color={colors.text} name={icon} size={26} />
    <AppText numberOfLines={1} variant="label">
      {label}
    </AppText>
  </Touchable>
);

const ListControls = ({ anime }: { anime: AnimeDetail }) => {
  const entry = useEntry(anime);
  const key = entry?.key ?? animeKey(anime);
  const bookmarked = useLibrary((state) => state.bookmarks[animeKey(anime)] !== undefined);
  const { toggleBookmark } = useLibraryActions();
  const [editing, setEditing] = useState(false);
  const openEditor = () => {
    setEditing(true);
  };

  return (
    <View style={styles.controls}>
      <View style={styles.statRow}>
        <StatTile
          icon="film-outline"
          label={entry === undefined ? "Not in list" : WATCH_STATUS_LABELS[entry.status]}
          onPress={openEditor}
        />
        <StatTile icon="eye-outline" label={`${entry?.progress ?? 0}/${anime.episodes ?? "?"}`} onPress={openEditor} />
        <StatTile
          icon="thumbs-up-outline"
          label={entry === undefined || entry.score === 0 ? "-" : String(entry.score)}
          onPress={openEditor}
        />
        <StatTile
          icon={bookmarked ? "bookmark" : "bookmark-outline"}
          label="Bookmark"
          onPress={() => {
            toggleBookmark(anime);
          }}
        />
      </View>
      {entry === undefined ? (
        <Touchable accessibilityRole="button" onPress={openEditor} style={styles.primaryButton}>
          <AppText variant="label">ADD TO LIST</AppText>
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
            <AppText variant="label">+1</AppText>
          </Touchable>
          <Touchable accessibilityRole="button" onPress={openEditor} style={styles.outlineButton}>
            <AppText variant="label">UPDATE</AppText>
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
  const { save, update } = useLibraryActions();
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
    if (findEntry(useLibrary.getState().entries, anime) === undefined) {
      save(anime, { status: "planned" });
    }
    update(entryKeyFor(anime), { notify: !notify });
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
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) => (
  <Touchable accessibilityRole="link" onPress={onPress} style={styles.linkButton}>
    <Ionicons color={colors.text} name={icon} size={20} />
    <AppText variant="label">{label}</AppText>
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
    <Section title="Info">
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
      {expanded ? (
        <>
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
      <Touchable
        accessibilityRole="button"
        onPress={() => {
          setExpanded(!expanded);
        }}
      >
        <AppText color={colors.accent} variant="label">
          {expanded ? "Less information" : "More information"}
        </AppText>
      </Touchable>
      <View style={styles.links}>
        <LinkButton
          icon="logo-reddit"
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
  const favorites = useLibrary((state) => state.favoriteCharacters);
  const toggle = useLibrary((state) => state.toggleFavoriteCharacter);
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
              active: favorites[characterKey(item.source ?? anime.source, item.id)] !== undefined,
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

const Related = ({ anime }: { anime: AnimeDetail }) => {
  const groups = anime.relations
    .map((group) => ({ ...group, items: group.items.filter((item) => item.kind === "anime") }))
    .filter((group) => group.items.length > 0);
  return (
    <Section title="Related">
      {groups.length === 0 ? <AppText variant="caption">No related anime.</AppText> : null}
      {groups.map((group) => (
        <View key={group.relation} style={styles.relation}>
          <AppText variant="caption">{group.relation}</AppText>
          {group.items.map((item) => (
            <Touchable
              accessibilityRole="link"
              key={item.id}
              onPress={() => {
                openAnime({ id: item.id, source: anime.source });
              }}
            >
              <AppText color={colors.accent} variant="label">
                {item.title}
              </AppText>
            </Touchable>
          ))}
        </View>
      ))}
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
