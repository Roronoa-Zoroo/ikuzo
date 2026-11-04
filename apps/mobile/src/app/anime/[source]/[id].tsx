import type { AnimeDetail } from "@ikuzo/anime/types";
import { SOURCE_LABELS } from "@ikuzo/anime/types";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, Share, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EpisodesTab, ReviewsTab, SongsTab, StatsTab } from "@/components/anime/community-tabs";
import { MainTab } from "@/components/anime/main-tab";
import { NotesTab } from "@/components/anime/notes-tab";
import { IconButton } from "@/components/header";
import { OptionsSheet } from "@/components/options-sheet";
import type { OptionItem } from "@/components/options-sheet";
import { ErrorState, Loading } from "@/components/states";
import { TabStrip } from "@/components/tab-strip";
import { AppText } from "@/components/text";
import { openLink } from "@/lib/links";
import { useAnime } from "@/lib/queries";
import { isSource } from "@/lib/sources";
import { animeKey, displayTitle, useLibrary, useLibraryActions, useEntry, entryKeyFor } from "@/lib/store";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

type DetailTab = "main" | "episodes" | "notes" | "reviews" | "stats" | "songs";

const TABS: { key: DetailTab; label: string }[] = [
  { key: "main", label: "Main" },
  { key: "episodes", label: "Episodes" },
  { key: "notes", label: "Notes" },
  { key: "reviews", label: "Reviews" },
  { key: "stats", label: "Stats" },
  { key: "songs", label: "Songs" },
];

const BANNER_HEIGHT = 240;
const POSTER_WIDTH = 120;
const POSTER_HEIGHT = 175;

const styles = StyleSheet.create({
  banner: { height: BANNER_HEIGHT, width: "100%" },
  bannerShade: {
    backgroundColor: colors.overlay,
    height: BANNER_HEIGHT,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  hero: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: spacing.lg,
    marginTop: -POSTER_HEIGHT / 2,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  heroText: { flex: 1, gap: spacing.xs, paddingBottom: spacing.xs },
  optionsButton: { padding: spacing.sm },
  poster: { backgroundColor: colors.surface, borderRadius: radius.sm, height: POSTER_HEIGHT, width: POSTER_WIDTH },
  screen: { backgroundColor: colors.background, flex: 1 },
  title: { color: colors.text, flex: 1, fontSize: fontSize.lg, fontWeight: "700" },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    left: 0,
    paddingHorizontal: spacing.sm,
    position: "absolute",
    right: 0,
    top: 0,
  },
});

const useOptions = (anime: AnimeDetail, title: string): OptionItem[] => {
  const key = animeKey(anime);
  const inList = useEntry(anime) !== undefined;
  const bookmarked = useLibrary((state) => state.bookmarks[key] !== undefined);
  const favorite = useLibrary((state) => state.favoriteShows[key] !== undefined);
  const { remove, toggleBookmark, toggleFavoriteShow } = useLibraryActions();

  const items: OptionItem[] = [];
  if (inList) {
    items.push({
      icon: "trash",
      label: "Delete anime",
      onPress: () => {
        Alert.alert("Delete anime", `Remove ${title} and its notes from your list?`, [
          { style: "cancel", text: "Cancel" },
          {
            onPress: () => {
              remove(entryKeyFor(anime));
            },
            style: "destructive",
            text: "Delete",
          },
        ]);
      },
      tone: "danger",
    });
  }
  items.push(
    {
      icon: bookmarked ? "bookmark" : "bookmark-outline",
      label: bookmarked ? "Remove bookmark" : "Add to bookmarks",
      onPress: () => {
        toggleBookmark(anime);
      },
      separated: inList,
    },
    {
      icon: favorite ? "heart" : "heart-outline",
      label: favorite ? "Remove from favorites" : "Add to favorites",
      onPress: () => {
        toggleFavoriteShow(anime);
      },
    },
    {
      icon: "copy-outline",
      label: "Copy title",
      onPress: () => {
        void Clipboard.setStringAsync(title);
      },
    },
    {
      icon: "share-social-outline",
      label: "Share anime",
      onPress: () => {
        void Share.share({ message: `${title}\n${anime.url}` });
      },
    },
    {
      icon: "text",
      label: "Show synonyms",
      onPress: () => {
        const names = [anime.title, anime.titleEnglish, anime.titleNative, ...anime.synonyms].filter(Boolean);
        Alert.alert("Also known as", [...new Set(names)].join("\n"));
      },
    },
    {
      icon: "open-outline",
      label: `Open on ${SOURCE_LABELS[anime.source]}`,
      onPress: () => {
        void openLink(anime.url);
      },
      separated: true,
    }
  );
  return items;
};

const Detail = ({ anime }: { anime: AnimeDetail }) => {
  const insets = useSafeAreaInsets();
  const language = useLibrary((state) => state.settings.titleLanguage);
  const [tab, setTab] = useState<DetailTab>("main");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const title = displayTitle(anime, language);
  const options = useOptions(anime, title);

  return (
    <View style={styles.screen}>
      <ScrollView stickyHeaderIndices={[1]}>
        <View>
          <Image
            blurRadius={anime.banner === undefined ? 12 : 0}
            contentFit="cover"
            source={anime.banner ?? anime.image}
            style={styles.banner}
          />
          <View style={styles.bannerShade} />
          <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
            <IconButton
              icon="arrow-back"
              label="Back"
              onPress={() => {
                router.back();
              }}
            />
            <AppText numberOfLines={1} style={styles.title}>
              {title}
            </AppText>
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => {
                setOptionsOpen(true);
              }}
              style={styles.optionsButton}
            >
              <AppText variant="label">OPTIONS</AppText>
            </Pressable>
          </View>
          <View style={styles.hero}>
            <Image contentFit="cover" source={anime.image} style={styles.poster} transition={150} />
            <View style={styles.heroText}>
              <AppText numberOfLines={3} variant="heading">
                {title}
              </AppText>
              <AppText variant="caption">
                {[anime.format, anime.year, anime.score === undefined ? undefined : `★ ${anime.score.toFixed(2)}`]
                  .filter(Boolean)
                  .join(" · ")}
              </AppText>
            </View>
          </View>
        </View>
        <TabStrip onChange={setTab} tabs={TABS} value={tab} />
        <View style={{ paddingBottom: insets.bottom + spacing.xl }}>
          {tab === "main" ? <MainTab anime={anime} /> : null}
          {tab === "episodes" ? <EpisodesTab anime={anime} /> : null}
          {tab === "notes" ? <NotesTab anime={anime} /> : null}
          {tab === "reviews" ? <ReviewsTab anime={anime} /> : null}
          {tab === "stats" ? <StatsTab anime={anime} /> : null}
          {tab === "songs" ? <SongsTab anime={anime} /> : null}
        </View>
      </ScrollView>
      <OptionsSheet
        items={options}
        onClose={() => {
          setOptionsOpen(false);
        }}
        visible={optionsOpen}
      />
    </View>
  );
};

const AnimeScreen = () => {
  const params = useLocalSearchParams<{ source: string; id: string }>();
  const source = isSource(params.source) ? params.source : "anilist";
  const id = Number(params.id);
  const anime = useAnime(source, id);

  if (anime.isPending) {
    return <Loading />;
  }
  if (anime.isError) {
    return (
      <ErrorState
        error={anime.error}
        onRetry={() => {
          void anime.refetch();
        }}
      />
    );
  }
  return <Detail anime={anime.data} />;
};

export default AnimeScreen;
