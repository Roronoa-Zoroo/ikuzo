import { FlatList, StyleSheet, View } from "react-native";

import { AnimeRow } from "@/components/anime-row";
import { Header } from "@/components/header";
import { useSideMenu } from "@/components/side-menu";
import { EmptyState } from "@/components/states";
import { openAnime } from "@/lib/nav";
import { animeKey, useBookmarks, useEntryLookup } from "@/lib/store";
import { colors } from "@/lib/theme";

const styles = StyleSheet.create({
  list: { flexGrow: 1, gap: 10, paddingVertical: 10 },
  screen: { backgroundColor: colors.background, flex: 1 },
});

const BookmarksScreen = () => {
  const bookmarks = useBookmarks();
  const lookup = useEntryLookup();
  const openMenu = useSideMenu((state) => state.setOpen);

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
        data={bookmarks}
        keyExtractor={(item) => animeKey(item.anime)}
        ListEmptyComponent={
          <EmptyState
            icon="bookmark-outline"
            message="Bookmark shows from their page to keep them here."
            title="No bookmarks yet"
          />
        }
        renderItem={({ item }) => {
          const entry = lookup(item.anime);
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
