import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { FlatList, StyleSheet, View } from "react-native";

import { Header } from "@/components/header";
import { ErrorState, Loading } from "@/components/states";
import { AppText } from "@/components/text";
import { Touchable } from "@/components/touchable";
import { openCharacter } from "@/lib/nav";
import { useCharacters } from "@/lib/queries";
import { isSource } from "@/lib/sources";
import { colors, radius, spacing } from "@/lib/theme";

const AVATAR_WIDTH = 56;
const AVATAR_HEIGHT = 80;

const styles = StyleSheet.create({
  avatar: { backgroundColor: colors.surface, height: AVATAR_HEIGHT, width: AVATAR_WIDTH },
  list: { gap: spacing.sm, padding: spacing.md },
  right: { alignItems: "flex-end" },
  rightText: { textAlign: "right" },
  row: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    flexDirection: "row",
    gap: spacing.md,
    overflow: "hidden",
  },
  screen: { backgroundColor: colors.background, flex: 1 },
  side: { flex: 1, gap: 2, paddingVertical: spacing.sm },
});

/** Full cast: character on the left, Japanese voice actor on the right. */
const CharactersScreen = () => {
  const params = useLocalSearchParams<{ source: string; id: string }>();
  const source = isSource(params.source) ? params.source : "anilist";
  const characters = useCharacters(source, Number(params.id));

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
        title="Characters"
      />
      {characters.isPending ? <Loading /> : null}
      {characters.isError ? (
        <ErrorState
          error={characters.error}
          onRetry={() => {
            void characters.refetch();
          }}
        />
      ) : null}
      <FlatList
        contentContainerStyle={styles.list}
        data={characters.data ?? []}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => {
          const va = item.voiceActors.find((person) => person.language === "Japanese") ?? item.voiceActors[0];
          return (
            <Touchable
              accessibilityRole="button"
              onPress={() => {
                openCharacter(item.source ?? source, item.id);
              }}
              style={styles.row}
            >
              <Image source={item.image} style={styles.avatar} />
              <View style={styles.side}>
                <AppText numberOfLines={2} variant="label">
                  {item.name}
                </AppText>
                <AppText variant="caption">{item.role}</AppText>
              </View>
              {va === undefined ? null : (
                <>
                  <View style={[styles.side, styles.right]}>
                    <AppText numberOfLines={2} style={styles.rightText} variant="label">
                      {va.name}
                    </AppText>
                    <AppText style={styles.rightText} variant="caption">
                      {va.language}
                    </AppText>
                  </View>
                  <Image source={va.image} style={styles.avatar} />
                </>
              )}
            </Touchable>
          );
        }}
      />
    </View>
  );
};

export default CharactersScreen;
