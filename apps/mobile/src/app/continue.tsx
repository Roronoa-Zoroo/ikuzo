import { router } from "expo-router";
import { useMemo } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";

import { AnimeRow } from "@/components/anime-row";
import { Header } from "@/components/header";
import { EmptyState } from "@/components/states";
import { AppText } from "@/components/text";
import { openAnime } from "@/lib/nav";
import { useLibrary } from "@/lib/store";
import { colors, radius, spacing } from "@/lib/theme";

const styles = StyleSheet.create({
  list: { flexGrow: 1, gap: spacing.md, paddingVertical: spacing.md },
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
  const entries = useLibrary((state) => state.entries);
  const increment = useLibrary((state) => state.increment);
  const watching = useMemo(
    () =>
      Object.values(entries)
        .filter((entry) => entry.status === "watching")
        .toSorted((a, b) => b.updatedAt - a.updatedAt),
    [entries]
  );

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
              <Pressable
                accessibilityLabel={`Watched episode ${item.progress + 1}`}
                accessibilityRole="button"
                onPress={() => {
                  increment(item.key);
                }}
                style={styles.plus}
              >
                <AppText variant="label">+1</AppText>
              </Pressable>
            }
          />
        )}
      />
    </View>
  );
};

export default ContinueScreen;
