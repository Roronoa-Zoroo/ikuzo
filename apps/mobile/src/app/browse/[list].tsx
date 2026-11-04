import type { BrowseList } from "@ikuzo/anime/types";
import { router, useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";

import { AnimeResults } from "@/components/anime-results";
import { Header } from "@/components/header";
import { useBrowse } from "@/lib/queries";
import { useLibrary } from "@/lib/store";
import { colors } from "@/lib/theme";

const LISTS: readonly BrowseList[] = ["airing", "popular", "upcoming", "top", "movies"];

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
});

const isBrowseList = (value: unknown): value is BrowseList => LISTS.some((list) => list === value);

const BrowseScreen = () => {
  const params = useLocalSearchParams<{ list: string; title?: string }>();
  const list = isBrowseList(params.list) ? params.list : "popular";
  const source = useLibrary((state) => state.settings.source);
  const query = useBrowse(source, list);

  return (
    <View style={styles.screen}>
      <Header
        leading={{
          icon: "arrow-back",
          label: "Back",
          onPress: () => {
            router.back();
          },
        }}
        title={params.title ?? "Browse"}
      />
      <AnimeResults query={query} />
    </View>
  );
};

export default BrowseScreen;
