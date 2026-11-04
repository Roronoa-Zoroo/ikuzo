import { Ionicons } from "@expo/vector-icons";
import type { BrowseList } from "@ikuzo/anime/types";
import { SOURCE_LABELS } from "@ikuzo/anime/types";
import { useMutation } from "@tanstack/react-query";
import { router } from "expo-router";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { AnimeCarousel } from "@/components/anime-carousel";
import { Header } from "@/components/header";
import { useSideMenu } from "@/components/side-menu";
import { AppText } from "@/components/text";
import { capitalize, currentSeason } from "@/lib/format";
import { openAnime } from "@/lib/nav";
import { useBrowse, useSeasonal } from "@/lib/queries";
import { getProvider } from "@/lib/sources";
import { useLibrary } from "@/lib/store";
import { colors, radius, spacing } from "@/lib/theme";

const LISTS: { list: BrowseList; title: string }[] = [
  { list: "airing", title: "Airing now" },
  { list: "popular", title: "Most popular" },
  { list: "upcoming", title: "Upcoming" },
  { list: "top", title: "Top rated" },
  { list: "movies", title: "Top movies" },
];

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xl },
  random: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "center",
    marginHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  screen: { backgroundColor: colors.background, flex: 1 },
  source: { paddingHorizontal: spacing.lg },
});

const BrowseRow = ({ list, title }: { list: BrowseList; title: string }) => {
  const source = useLibrary((state) => state.settings.source);
  const query = useBrowse(source, list);
  return (
    <AnimeCarousel
      error={query.error}
      items={query.data?.pages[0]?.items}
      loading={query.isPending}
      onViewAll={() => {
        router.push({ params: { list, title }, pathname: "/browse/[list]" });
      }}
      title={title}
    />
  );
};

const SeasonRow = () => {
  const source = useLibrary((state) => state.settings.source);
  const { season, year } = currentSeason();
  const query = useSeasonal(source, year, season);
  return (
    <AnimeCarousel
      error={query.error}
      items={query.data?.pages[0]?.items}
      loading={query.isPending}
      onViewAll={() => {
        router.push("/seasonal");
      }}
      title={`${capitalize(season)} ${year}`}
    />
  );
};

const DiscoverScreen = () => {
  const source = useLibrary((state) => state.settings.source);
  const openMenu = useSideMenu((state) => state.setOpen);
  const random = useMutation({
    mutationFn: async () => await getProvider(source).random(),
    onError: (error) => {
      Alert.alert("Random anime", error.message);
    },
    onSuccess: openAnime,
  });

  return (
    <View style={styles.screen}>
      <Header
        actions={[
          {
            icon: "search",
            label: "Search",
            onPress: () => {
              router.push("/search");
            },
          },
        ]}
        leading={{
          icon: "menu",
          label: "Open menu",
          onPress: () => {
            openMenu(true);
          },
        }}
        title="Discover"
      />
      <ScrollView contentContainerStyle={styles.content}>
        <AppText style={styles.source} variant="caption">
          Showing {SOURCE_LABELS[source]} data · change it in the side menu
        </AppText>
        <Pressable
          accessibilityRole="button"
          disabled={random.isPending}
          onPress={() => {
            random.mutate();
          }}
          style={styles.random}
        >
          {random.isPending ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Ionicons color={colors.text} name="shuffle" size={22} />
          )}
          <AppText variant="label">Don&apos;t know what to watch? Random anime</AppText>
        </Pressable>
        <SeasonRow />
        {LISTS.map((item) => (
          <BrowseRow key={item.list} {...item} />
        ))}
      </ScrollView>
    </View>
  );
};

export default DiscoverScreen;
