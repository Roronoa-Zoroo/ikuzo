import { MaterialCommunityIcons } from "@expo/vector-icons";
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

/** Sizes measured from anYme's anime screen (activity_anime_info). */
const BANNER_HEIGHT = 190;
const POSTER_WIDTH = 96;
const POSTER_HEIGHT = 135;
/** How far the poster hangs below the banner's bottom edge. */
const POSTER_OVERHANG = 30;

/** Toolbar height below the status bar (Android's ?actionBarSize). */
const BAR_HEIGHT = 56;
/** The banner moves at half the scroll speed, like CollapsingToolbarLayout's parallax mode. */
const PARALLAX = 0.5;

const styles = StyleSheet.create({
  banner: { left: 0, position: "absolute", right: 0, top: 0 },
  bannerImage: { height: "100%", width: "100%" },
  // A light wash keeps the art bright; a darker band behind the toolbar keeps its text readable.
  bannerShade: { backgroundColor: "rgba(0, 0, 0, 0.18)", bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  bannerTopScrim: { backgroundColor: "rgba(0, 0, 0, 0.32)", left: 0, position: "absolute", right: 0, top: 0 },
  barBackground: {
    backgroundColor: colors.surface,
    bottom: 0,
    elevation: 4,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  hero: { paddingBottom: spacing.md, paddingHorizontal: 15 },
  optionsButton: { borderRadius: radius.sm, padding: spacing.sm },
  poster: { backgroundColor: colors.surface, borderRadius: 4, height: POSTER_HEIGHT, width: POSTER_WIDTH },
  screen: { backgroundColor: colors.background, flex: 1 },
  tabs: { left: 0, position: "absolute", right: 0, top: 0, zIndex: 2 },
  title: { color: colors.textStrong, flexShrink: 1, fontFamily, fontSize: fontSize.xl, fontWeight: "700" },
  titleButton: { alignItems: "center", flex: 1, flexDirection: "row", gap: spacing.xs, paddingVertical: spacing.xs },
  titleShadow: {
    textShadowColor: "rgba(0, 0, 0, 0.6)",
    textShadowOffset: { height: 1, width: 0 },
    textShadowRadius: 4,
  },
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

const showSynonyms = (anime: AnimeDetail) => {
  const names = [anime.title, anime.titleEnglish, anime.titleNative, ...anime.synonyms].filter(
    (name): name is string => name !== undefined && name !== ""
  );
  Alert.alert("Also known as", [...new Set(names)].join("\n"));
};

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
        showSynonyms(anime);
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
  const collapseStart = insets.top + BANNER_HEIGHT - barHeight * 2;
  const collapseEnd = insets.top + BANNER_HEIGHT - barHeight;

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
      <Animated.View pointerEvents="none" style={[styles.banner, { height: insets.top + BANNER_HEIGHT }, bannerStyle]}>
        <Image
          blurRadius={anime.banner === undefined ? 12 : 0}
          contentFit="cover"
          source={anime.banner ?? anime.image}
          style={styles.bannerImage}
          transition={duration.image}
        />
        <View style={styles.bannerShade} />
        <View style={[styles.bannerTopScrim, { height: barHeight }]} />
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
        {/* Title always in the toolbar, like anYme; the ▼ lists the other titles. */}
        <Touchable
          accessibilityHint="Shows the other titles of this anime"
          accessibilityRole="button"
          onPress={() => {
            showSynonyms(anime);
          }}
          style={styles.titleButton}
        >
          <AppText numberOfLines={1} style={[styles.title, styles.titleShadow]}>
            {title}
          </AppText>
          <MaterialCommunityIcons color={colors.textStrong} name="menu-down" size={26} style={styles.titleShadow} />
        </Touchable>
        <Touchable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => {
            setOptionsOpen(true);
          }}
          style={styles.optionsButton}
        >
          <AppText style={styles.titleShadow} variant="label">
            OPTIONS
          </AppText>
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
          style={[styles.hero, { marginTop: insets.top + BANNER_HEIGHT - (POSTER_HEIGHT - POSTER_OVERHANG) }]}
        >
          <Image contentFit="cover" source={anime.image} style={styles.poster} transition={duration.image} />
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
