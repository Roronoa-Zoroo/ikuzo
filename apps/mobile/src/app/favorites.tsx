import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";

import { Header } from "@/components/header";
import { PosterTile } from "@/components/poster-tile";
import { EmptyState } from "@/components/states";
import { TabStrip } from "@/components/tab-strip";
import { openAnime, openCharacter } from "@/lib/nav";
import { displayTitle, useLibrary } from "@/lib/store";
import { colors, spacing } from "@/lib/theme";

type FavoriteTab = "shows" | "characters";
const COLUMNS = 3;
const TILE_WIDTH = 108;

const styles = StyleSheet.create({
  columns: { gap: spacing.md },
  grid: { flexGrow: 1, gap: spacing.lg, padding: spacing.md },
  screen: { backgroundColor: colors.background, flex: 1 },
});

const FavoritesScreen = () => {
  const [tab, setTab] = useState<FavoriteTab>("shows");
  const shows = useLibrary((state) => state.favoriteShows);
  const characters = useLibrary((state) => state.favoriteCharacters);
  const language = useLibrary((state) => state.settings.titleLanguage);
  const toggleCharacter = useLibrary((state) => state.toggleFavoriteCharacter);
  const showList = useMemo(() => Object.values(shows).toSorted((a, b) => b.addedAt - a.addedAt), [shows]);
  const characterList = useMemo(
    () => Object.values(characters).toSorted((a, b) => b.addedAt - a.addedAt),
    [characters]
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
        title="Favorites"
      />
      <TabStrip
        onChange={setTab}
        tabs={[
          { key: "shows", label: `Shows (${showList.length})` },
          { key: "characters", label: `Characters (${characterList.length})` },
        ]}
        value={tab}
      />
      {tab === "shows" ? (
        <FlatList
          columnWrapperStyle={styles.columns}
          contentContainerStyle={styles.grid}
          data={showList}
          key="shows"
          keyExtractor={(item) => `${item.anime.source}:${item.anime.id}`}
          ListEmptyComponent={
            <EmptyState
              icon="heart-outline"
              message="Use Options → Add to favorites on any show."
              title="No favourite shows"
            />
          }
          numColumns={COLUMNS}
          renderItem={({ item }) => (
            <PosterTile
              image={item.anime.image}
              onPress={() => {
                openAnime(item.anime);
              }}
              title={displayTitle(item.anime, language)}
              width={TILE_WIDTH}
            />
          )}
        />
      ) : (
        <FlatList
          columnWrapperStyle={styles.columns}
          contentContainerStyle={styles.grid}
          data={characterList}
          key="characters"
          keyExtractor={(item) => item.key}
          ListEmptyComponent={
            <EmptyState
              icon="heart-outline"
              message="Tap the heart on a character to save them here."
              title="No favourite characters"
            />
          }
          numColumns={COLUMNS}
          renderItem={({ item }) => (
            <PosterTile
              favorite={{
                active: true,
                onToggle: () => {
                  toggleCharacter(item.source, item);
                },
              }}
              image={item.image}
              onPress={() => {
                openCharacter(item.source, item.id);
              }}
              title={item.name}
              width={TILE_WIDTH}
            />
          )}
        />
      )}
    </View>
  );
};

export default FavoritesScreen;
