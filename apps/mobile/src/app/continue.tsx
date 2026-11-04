import { eq, useLiveQuery } from "@tanstack/react-db";
import { router } from "expo-router";
import { FlatList, StyleSheet, View } from "react-native";

import { AnimeRow } from "@/components/anime-row";
import { Header } from "@/components/header";
import { EmptyState } from "@/components/states";
import { AppText } from "@/components/text";
import { Touchable } from "@/components/touchable";
import { entriesCollection } from "@/lib/db";
import { watchNextEpisode } from "@/lib/episodes";
import { openAnime } from "@/lib/nav";
import { colors, radius, spacing } from "@/lib/theme";

const styles = StyleSheet.create({
  list: { flexGrow: 1, gap: 10, paddingVertical: 10 },
  plus: {
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  screen: { backgroundColor: colors.background, flex: 1 },
});

/** Shows you are watching, most recently touched first, with a one-tap +1. */
const ContinueScreen = () => {
  const { data: watching } = useLiveQuery({
    query: (q) =>
      q
        .from({ entry: entriesCollection })
        .where(({ entry }) => eq(entry.status, "watching"))
        .orderBy(({ entry }) => entry.updatedAt, "desc"),
  });

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
        title="Continue watching"
      />
      <FlatList
        contentContainerStyle={styles.list}
        data={watching}
        keyExtractor={(entry) => entry.key}
        ListEmptyComponent={<EmptyState icon="play-outline" title="You are not watching anything" />}
        renderItem={({ item }) => (
          <AnimeRow
            anime={item.anime}
            onPress={() => {
              openAnime(item.anime);
            }}
            progress={item.progress}
            trailing={
              <Touchable
                accessibilityLabel={`Watched episode ${item.progress + 1}`}
                accessibilityRole="button"
                onPress={() => {
                  watchNextEpisode(item.key);
                }}
                style={styles.plus}
              >
                <AppText variant="label">+1</AppText>
              </Touchable>
            }
          />
        )}
      />
    </View>
  );
};

export default ContinueScreen;
