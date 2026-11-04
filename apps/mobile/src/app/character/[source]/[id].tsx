import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { FlatList, ScrollView, StyleSheet, View } from "react-native";

import { Header } from "@/components/header";
import { PosterTile } from "@/components/poster-tile";
import { Section } from "@/components/section";
import { ErrorState, Loading } from "@/components/states";
import { AppText } from "@/components/text";
import { Touchable } from "@/components/touchable";
import { openLink } from "@/lib/links";
import { openAnime } from "@/lib/nav";
import { useCharacter } from "@/lib/queries";
import { isSource } from "@/lib/sources";
import { characterKey, useLibrary } from "@/lib/store";
import { colors, radius, spacing } from "@/lib/theme";

const ABOUT_PREVIEW_LINES = 8;
const PORTRAIT_WIDTH = 140;
const PORTRAIT_HEIGHT = 210;
const TILE_WIDTH = 110;

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xl },
  hero: { flexDirection: "row", gap: spacing.lg, padding: spacing.lg },
  heroText: { flex: 1, gap: spacing.xs },
  portrait: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    height: PORTRAIT_HEIGHT,
    width: PORTRAIT_WIDTH,
  },
  row: { gap: spacing.md, paddingHorizontal: spacing.lg },
  screen: { backgroundColor: colors.background, flex: 1 },
});

const CharacterScreen = () => {
  const params = useLocalSearchParams<{ source: string; id: string }>();
  const source = isSource(params.source) ? params.source : "anilist";
  const id = Number(params.id);
  const character = useCharacter(source, id);
  const favorite = useLibrary((state) => state.favoriteCharacters[characterKey(source, id)] !== undefined);
  const toggle = useLibrary((state) => state.toggleFavoriteCharacter);
  const [expanded, setExpanded] = useState(false);

  const back = {
    icon: "arrow-back" as const,
    label: "Back",
    onPress: () => {
      router.back();
    },
  };
  if (character.isPending) {
    return (
      <View style={styles.screen}>
        <Header leading={back} title="Character" />
        <Loading />
      </View>
    );
  }
  if (character.isError) {
    return (
      <View style={styles.screen}>
        <Header leading={back} title="Character" />
        <ErrorState
          error={character.error}
          onRetry={() => {
            void character.refetch();
          }}
        />
      </View>
    );
  }
  const { data } = character;

  return (
    <View style={styles.screen}>
      <Header
        actions={[
          {
            icon: favorite ? "heart" : "heart-outline",
            label: favorite ? "Remove from favourites" : "Add to favourites",
            onPress: () => {
              toggle(source, data);
            },
          },
          {
            icon: "open-outline",
            label: "Open in browser",
            onPress: () => {
              void openLink(data.url);
            },
          },
        ]}
        leading={back}
        title={data.name}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Image contentFit="cover" source={data.image} style={styles.portrait} />
          <View style={styles.heroText}>
            <AppText variant="title">{data.name}</AppText>
            {data.nameNative === undefined ? null : <AppText variant="caption">{data.nameNative}</AppText>}
            {data.nicknames.length === 0 ? null : (
              <AppText variant="caption">Also: {data.nicknames.join(", ")}</AppText>
            )}
            {data.favorites === undefined ? null : (
              <AppText variant="caption">♥ {data.favorites.toLocaleString()} favourites</AppText>
            )}
          </View>
        </View>

        {data.about === undefined ? null : (
          <Section title="About">
            <Touchable
              onPress={() => {
                setExpanded(!expanded);
              }}
            >
              <AppText color={colors.textMuted} numberOfLines={expanded ? undefined : ABOUT_PREVIEW_LINES}>
                {data.about}
              </AppText>
            </Touchable>
          </Section>
        )}

        <Section flush title="Anime">
          <FlatList
            contentContainerStyle={styles.row}
            data={data.appearances}
            horizontal
            keyExtractor={(item) => String(item.anime.id)}
            renderItem={({ item }) => (
              <PosterTile
                image={item.anime.image}
                onPress={() => {
                  openAnime({ id: item.anime.id, source });
                }}
                subtitle={item.role}
                title={item.anime.title}
                width={TILE_WIDTH}
              />
            )}
            showsHorizontalScrollIndicator={false}
          />
        </Section>

        <Section flush title="Voice actors">
          <FlatList
            contentContainerStyle={styles.row}
            data={data.voiceActors}
            horizontal
            keyExtractor={(item) => `${item.id}-${item.language ?? ""}`}
            ListEmptyComponent={<AppText variant="caption">No voice actors listed.</AppText>}
            renderItem={({ item }) => (
              <PosterTile
                image={item.image}
                onPress={() => {
                  void openLink(
                    source === "mal"
                      ? `https://myanimelist.net/people/${item.id}`
                      : `https://anilist.co/staff/${item.id}`
                  );
                }}
                subtitle={item.language}
                title={item.name}
                width={TILE_WIDTH}
              />
            )}
            showsHorizontalScrollIndicator={false}
          />
        </Section>
      </ScrollView>
    </View>
  );
};

export default CharacterScreen;
