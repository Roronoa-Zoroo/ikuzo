import { useMemo } from "react";
import { FlatList, StyleSheet, View } from "react-native";

import { AnimeRow } from "@/components/anime-row";
import { Header } from "@/components/header";
import { useSideMenu } from "@/components/side-menu";
import { EmptyState } from "@/components/states";
import { openAnime } from "@/lib/nav";
import { animeKey, useLibrary, findEntry } from "@/lib/store";
import { colors, spacing } from "@/lib/theme";

const styles = StyleSheet.create({
  list: { flexGrow: 1, gap: spacing.md, paddingVertical: spacing.md },
  screen: { backgroundColor: colors.background, flex: 1 },
});

const BookmarksScreen = () => {
  const bookmarks = useLibrary((state) => state.bookmarks);
  const entries = useLibrary((state) => state.entries);
  const openMenu = useSideMenu((state) => state.setOpen);
  const items = useMemo(() => Object.values(bookmarks).toSorted((a, b) => b.addedAt - a.addedAt), [bookmarks]);

  return (
    <View style={styles.screen}>
      <Header
        leading={{
          icon: "menu",
          label: "Open menu",
          onPress: () => {
            openMenu(true);
          },
        }}
        title="Bookmarks"
      />
      <FlatList
        contentContainerStyle={styles.list}
        data={items}
        keyExtractor={(item) => animeKey(item.anime)}
        ListEmptyComponent={
          <EmptyState
            icon="bookmark-outline"
            message="Bookmark shows from their page to keep them here."
            title="No bookmarks yet"
          />
        }
        renderItem={({ item }) => {
          const entry = findEntry(entries, item.anime);
          return (
            <AnimeRow
              anime={entry?.anime ?? item.anime}
              onPress={() => {
                openAnime(item.anime);
              }}
              progress={entry?.progress}
            />
          );
        }}
      />
    </View>
  );
};

export default BookmarksScreen;
