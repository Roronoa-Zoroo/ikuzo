import type { AnimeDetail } from "@ikuzo/anime/types";
import { SOURCE_LABELS } from "@ikuzo/anime/types";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Share, StyleSheet, View } from "react-native";
import Animated, {
  Extrapolation,
  FadeIn,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
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
import { Touchable } from "@/components/touchable";
import { openLink } from "@/lib/links";
import { duration } from "@/lib/motion";
import { useAnime } from "@/lib/queries";
import { isSource } from "@/lib/sources";
import { animeKey, displayTitle, useLibrary, useLibraryActions, useEntry, entryKeyFor } from "@/lib/store";
import { colors, fontSize, radius, spacing, fontFamily } from "@/lib/theme";

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

/** Toolbar height below the status bar (Android's ?actionBarSize). */
const BAR_HEIGHT = 56;
/** The banner moves at half the scroll speed, like CollapsingToolbarLayout's parallax mode. */
const PARALLAX = 0.5;

const styles = StyleSheet.create({
  banner: { height: BANNER_HEIGHT, left: 0, position: "absolute", right: 0, top: 0 },
  bannerImage: { height: "100%", width: "100%" },
  bannerShade: { backgroundColor: colors.overlay, bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  barBackground: {
    backgroundColor: colors.surface,
    bottom: 0,
    elevation: 4,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  hero: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: spacing.lg,
    marginTop: BANNER_HEIGHT - POSTER_HEIGHT / 2,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  heroText: { flex: 1, gap: spacing.xs, paddingBottom: spacing.xs },
  optionsButton: { borderRadius: radius.sm, padding: spacing.sm },
  poster: { backgroundColor: colors.surface, borderRadius: radius.sm, height: POSTER_HEIGHT, width: POSTER_WIDTH },
  screen: { backgroundColor: colors.background, flex: 1 },
  tabs: { left: 0, position: "absolute", right: 0, top: 0, zIndex: 2 },
  title: { color: colors.text, flex: 1, fontFamily, fontSize: fontSize.lg, fontWeight: "700" },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    left: 0,
    paddingHorizontal: spacing.sm,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 3,
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
  const [tabsTop, setTabsTop] = useState(BANNER_HEIGHT + POSTER_HEIGHT / 2);
  const [tabsHeight, setTabsHeight] = useState(0);
  const title = displayTitle(anime, language);
  const options = useOptions(anime, title);
  const barHeight = insets.top + BAR_HEIGHT;
  const scrollY = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.set(event.contentOffset.y);
  });

  // Collapse range: the bar becomes solid as the banner disappears under it.
  const collapseStart = BANNER_HEIGHT - barHeight * 2;
  const collapseEnd = BANNER_HEIGHT - barHeight;

  const bannerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, collapseEnd], [1, 0.3], Extrapolation.CLAMP),
    transform: [
      { translateY: scrollY.value > 0 ? -scrollY.value * PARALLAX : -scrollY.value },
      // Pulling down past the top stretches the banner instead of showing a gap.
      { scale: scrollY.value < 0 ? 1 - scrollY.value / BANNER_HEIGHT : 1 },
    ],
  }));
  const barStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [collapseStart, collapseEnd], [0, 1], Extrapolation.CLAMP),
  }));
  const tabsStyle = useAnimatedStyle(() => ({
    // The tab strip scrolls with the content, then pins under the toolbar.
    transform: [{ translateY: Math.max(barHeight, tabsTop - scrollY.value) }],
  }));

  return (
    <View style={styles.screen}>
      <Animated.View pointerEvents="none" style={[styles.banner, bannerStyle]}>
        <Image
          blurRadius={anime.banner === undefined ? 12 : 0}
          contentFit="cover"
          source={anime.banner ?? anime.image}
          style={styles.bannerImage}
          transition={duration.image}
        />
        <View style={styles.bannerShade} />
      </Animated.View>

      <View style={[styles.topBar, { height: barHeight, paddingTop: insets.top }]}>
        <Animated.View style={[styles.barBackground, barStyle]} />
        <IconButton
          icon="arrow-back"
          label="Back"
          onPress={() => {
            router.back();
          }}
        />
        <Animated.Text numberOfLines={1} style={[styles.title, barStyle]}>
          {title}
        </Animated.Text>
        <Touchable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => {
            setOptionsOpen(true);
          }}
          style={styles.optionsButton}
        >
          <AppText variant="label">OPTIONS</AppText>
        </Touchable>
      </View>

      <Animated.View
        onLayout={(event) => {
          setTabsHeight(event.nativeEvent.layout.height);
        }}
        style={[styles.tabs, tabsStyle]}
      >
        <TabStrip onChange={setTab} tabs={TABS} value={tab} />
      </Animated.View>

      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16}>
        <View
          onLayout={(event) => {
            const { y, height } = event.nativeEvent.layout;
            setTabsTop(y + height);
          }}
          style={styles.hero}
        >
          <Image contentFit="cover" source={anime.image} style={styles.poster} transition={duration.image} />
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
        {/* Room for the floating tab strip. */}
        <View style={{ height: tabsHeight }} />
        <Animated.View
          entering={FadeIn.duration(duration.crossfade / 2)}
          key={tab}
          style={{ minHeight: BANNER_HEIGHT * 2, paddingBottom: insets.bottom + spacing.xl }}
        >
          {tab === "main" ? <MainTab anime={anime} /> : null}
          {tab === "episodes" ? <EpisodesTab anime={anime} /> : null}
          {tab === "notes" ? <NotesTab anime={anime} /> : null}
          {tab === "reviews" ? <ReviewsTab anime={anime} /> : null}
          {tab === "stats" ? <StatsTab anime={anime} /> : null}
          {tab === "songs" ? <SongsTab anime={anime} /> : null}
        </Animated.View>
      </Animated.ScrollView>

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
