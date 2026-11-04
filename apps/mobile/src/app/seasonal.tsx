import { SEASONS } from "@ikuzo/anime/types";
import type { Season } from "@ikuzo/anime/types";
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { AnimeResults } from "@/components/anime-results";
import { Header, IconButton } from "@/components/header";
import { AppText } from "@/components/text";
import { capitalize, currentSeason } from "@/lib/format";
import { useSeasonal } from "@/lib/queries";
import { useLibrary } from "@/lib/store";
import { colors, spacing } from "@/lib/theme";

const styles = StyleSheet.create({
  picker: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  screen: { backgroundColor: colors.background, flex: 1 },
});

const shift = (year: number, season: Season, by: 1 | -1): { year: number; season: Season } => {
  const index = SEASONS.indexOf(season) + by;
  if (index < 0) {
    return { season: "fall", year: year - 1 };
  }
  if (index >= SEASONS.length) {
    return { season: "winter", year: year + 1 };
  }
  return { season: SEASONS[index] ?? season, year };
};

const SeasonalScreen = () => {
  const source = useLibrary((state) => state.settings.source);
  const [selectedSeason, setSelectedSeason] = useState(currentSeason);
  const { season, year } = selectedSeason;
  const query = useSeasonal(source, year, season);

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
        title="Seasonal anime"
      />
      <View style={styles.picker}>
        <IconButton
          icon="chevron-back"
          label="Previous season"
          onPress={() => {
            setSelectedSeason(shift(year, season, -1));
          }}
        />
        <AppText variant="heading">
          {capitalize(season)} {year}
        </AppText>
        <IconButton
          icon="chevron-forward"
          label="Next season"
          onPress={() => {
            setSelectedSeason(shift(year, season, 1));
          }}
        />
      </View>
      <AnimeResults query={query} />
    </View>
  );
};

export default SeasonalScreen;
