import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { AnimeDetail } from "@ikuzo/anime/types";
import { SOURCE_LABELS } from "@ikuzo/anime/types";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, PanResponder, Share, StyleSheet, View } from "react-native";
import Animated, {
  Extrapolation,
  FadeIn,
  interpolate,
  SlideInLeft,
  SlideInRight,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EpisodesTab, ReviewsTab, SongsTab, StatsTab } from "@/components/anime/community-tabs";
import { MainTab } from "@/components/anime/main-tab";
import { NotesTab } from "@/components/anime/notes-tab";
import { IconButton } from "@/components/header";
import { ImageViewer } from "@/components/image-viewer";
import { OptionsSheet } from "@/components/options-sheet";
import type { OptionItem } from "@/components/options-sheet";
import { ErrorState, Loading } from "@/components/states";
import { TabStrip } from "@/components/tab-strip";
import { AppText } from "@/components/text";
import { Touchable } from "@/components/touchable";
import { confirmRemove } from "@/lib/episodes";
import { openLink } from "@/lib/links";
import { duration } from "@/lib/motion";
import { previewDetail, useAnime } from "@/lib/queries";
import { isSource } from "@/lib/sources";
import { displayTitle, library, useEntry, useIsBookmarked, useIsFavoriteShow, useSettings } from "@/lib/store";
import type { LibraryEntry } from "@/lib/store";
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
/** A sideways drag this long (or a quick flick) moves to the next tab, like a pager. */
const SWIPE_DISTANCE = 70;
const SWIPE_VELOCITY = 0.5;
/** How far a drag must go sideways, and how much more sideways than down, before it counts as a swipe. */
const SWIPE_SLOP = 20;
/** Past the first or last tab the content only gives a little, so the swipe feels blocked. */
const EDGE_RESISTANCE = 0.15;

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
  page: { minHeight: BANNER_HEIGHT * 2, paddingBottom: spacing.xl },
  pages: { overflow: "hidden" },
  poster: { backgroundColor: colors.surface, borderRadius: 4, height: POSTER_HEIGHT, width: POSTER_WIDTH },
  posterButton: { alignSelf: "flex-start", borderRadius: 4 },
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

/** What the library knows about the show on screen, read once here and passed down as props. */
interface ShowState {
  entry: LibraryEntry | undefined;
  bookmarked: boolean;
}

const useOptions = (anime: AnimeDetail, title: string, { entry, bookmarked }: ShowState): OptionItem[] => {
  const favorite = useIsFavoriteShow(anime);
  const inList = entry !== undefined;

  const items: OptionItem[] = [];
  if (entry !== undefined) {
    items.push({
      icon: "trash",
      label: "Delete anime",
      onPress: () => {
        confirmRemove(entry, title);
      },
      tone: "danger",
    });
  }
  items.push(
    {
      icon: bookmarked ? "bookmark" : "bookmark-outline",
      label: bookmarked ? "Remove bookmark" : "Add to bookmarks",
      onPress: () => {
        library.toggleBookmark(anime);
      },
      separated: inList,
    },
    {
      icon: favorite ? "heart" : "heart-outline",
      label: favorite ? "Remove from favorites" : "Add to favorites",
      onPress: () => {
        library.toggleFavoriteShow(anime);
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

const Detail = ({ anime, partial }: { anime: AnimeDetail; partial: boolean }) => {
  const insets = useSafeAreaInsets();
  const language = useSettings().titleLanguage;
  const [tab, setTab] = useState<DetailTab>("main");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [viewing, setViewing] = useState(false);
  /** Which way the last tab change went, so the new tab slides in from that side. */
  const [direction, setDirection] = useState(0);
  const [tabsTop, setTabsTop] = useState(BANNER_HEIGHT + POSTER_HEIGHT / 2);
  const [tabsHeight, setTabsHeight] = useState(0);
  const title = displayTitle(anime, language);
  // One query each for the whole page: the tabs get the results as props instead of asking again.
  const entry = useEntry(anime);
  const bookmarked = useIsBookmarked(anime);
  const options = useOptions(anime, title, { bookmarked, entry });
  const barHeight = insets.top + BAR_HEIGHT;
  const scrollY = useSharedValue(0);
  const dragX = useSharedValue(0);
  const tabIndex = TABS.findIndex((item) => item.key === tab);

  const chooseTab = (next: DetailTab) => {
    const nextIndex = TABS.findIndex((item) => item.key === next);
    setDirection(Math.sign(nextIndex - tabIndex));
    setTab(next);
  };

  // Swiping sideways over the content moves between tabs. Horizontal carousels inside a tab
  // still scroll: their native scroll view claims the drag first and ends this one.
  const swipe = useMemo(() => {
    const neighbour = (offset: number) => TABS[tabIndex + offset];
    const settle = () => {
      dragX.set(withTiming(0, { duration: duration.itemMove }));
    };
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) =>
        Math.abs(gesture.dx) > SWIPE_SLOP && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 2,
      onPanResponderMove: (_event, gesture) => {
        const blocked = neighbour(gesture.dx < 0 ? 1 : -1) === undefined;
        dragX.set(gesture.dx * (blocked ? EDGE_RESISTANCE : 1));
      },
      onPanResponderRelease: (_event, gesture) => {
        const forward = gesture.dx < -SWIPE_DISTANCE || gesture.vx < -SWIPE_VELOCITY;
        const back = gesture.dx > SWIPE_DISTANCE || gesture.vx > SWIPE_VELOCITY;
        let offset = 0;
        if (forward) {
          offset = 1;
        } else if (back) {
          offset = -1;
        }
        const next = offset === 0 ? undefined : neighbour(offset);
        if (next === undefined) {
          settle();
          return;
        }
        dragX.set(0);
        setDirection(offset);
        setTab(next.key);
      },
      onPanResponderTerminate: settle,
      onPanResponderTerminationRequest: () => true,
    });
  }, [dragX, tabIndex]);

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
  const dragStyle = useAnimatedStyle(() => ({ transform: [{ translateX: dragX.value }] }));
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
        <TabStrip onChange={chooseTab} tabs={TABS} value={tab} />
      </Animated.View>

      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16}>
        <View
          onLayout={(event) => {
            const { y, height } = event.nativeEvent.layout;
            setTabsTop(y + height);
          }}
          style={[styles.hero, { marginTop: insets.top + BANNER_HEIGHT - (POSTER_HEIGHT - POSTER_OVERHANG) }]}
        >
          <Touchable
            accessibilityLabel="View poster"
            accessibilityRole="imagebutton"
            disabled={anime.image === undefined}
            onPress={() => {
              setViewing(true);
            }}
            style={styles.posterButton}
          >
            <Image contentFit="cover" source={anime.image} style={styles.poster} transition={duration.image} />
          </Touchable>
        </View>
        {/* Room for the floating tab strip. */}
        <View style={{ height: tabsHeight }} />
        <Animated.View {...swipe.panHandlers} style={[styles.pages, dragStyle]}>
          <Animated.View
            entering={
              direction === 0
                ? FadeIn.duration(duration.crossfade / 2)
                : (direction > 0 ? SlideInRight : SlideInLeft).duration(duration.itemMove)
            }
            key={tab}
            style={styles.page}
          >
            {tab === "main" ? <MainTab anime={anime} bookmarked={bookmarked} entry={entry} partial={partial} /> : null}
            {tab === "episodes" ? <EpisodesTab anime={anime} /> : null}
            {tab === "notes" ? <NotesTab anime={anime} entry={entry} /> : null}
            {tab === "reviews" ? <ReviewsTab anime={anime} /> : null}
            {tab === "stats" ? <StatsTab anime={anime} /> : null}
            {tab === "songs" ? <SongsTab anime={anime} /> : null}
          </Animated.View>
        </Animated.View>
      </Animated.ScrollView>

      <ImageViewer
        onClose={() => {
          setViewing(false);
        }}
        uri={anime.image}
        visible={viewing}
      />
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
  // Offline (paused) or failed with nothing saved: a show in the library still opens from its list copy.
  const fallback = anime.isError || anime.fetchStatus === "paused" ? previewDetail(source, id) : undefined;
  const data = anime.data ?? fallback;

  // Drawn at once from the tapped card (or a saved copy); the rest fills in when it arrives.
  if (data !== undefined) {
    return <Detail anime={data} partial={anime.isPlaceholderData || anime.data === undefined} />;
  }
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
  return <Loading />;
};

export default AnimeScreen;
