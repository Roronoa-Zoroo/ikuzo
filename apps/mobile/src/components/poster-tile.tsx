import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Pressable, StyleSheet, View } from "react-native";

import { colors, radius, spacing } from "@/lib/theme";

import { AppText } from "./text";

interface PosterTileProps {
  title: string;
  subtitle?: string;
  image?: string;
  onPress: () => void;
  width?: number;
  /** Heart toggle in the corner (favourite characters). */
  favorite?: { active: boolean; onToggle: () => void };
}

const ASPECT_RATIO = 1.5;
const DEFAULT_WIDTH = 120;

const styles = StyleSheet.create({
  heart: { position: "absolute", right: spacing.sm, top: spacing.sm },
  image: { backgroundColor: colors.surface, borderRadius: radius.sm },
  title: { marginTop: spacing.sm },
});

export const PosterTile = ({ title, subtitle, image, onPress, width = DEFAULT_WIDTH, favorite }: PosterTileProps) => (
  <Pressable accessibilityLabel={title} accessibilityRole="button" onPress={onPress} style={{ width }}>
    <View>
      <Image
        contentFit="cover"
        source={image}
        style={[styles.image, { height: width * ASPECT_RATIO, width }]}
        transition={150}
      />
      {favorite === undefined ? null : (
        <Pressable
          accessibilityLabel={favorite.active ? "Remove from favourites" : "Add to favourites"}
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => {
            favorite.onToggle();
          }}
          style={styles.heart}
        >
          <Ionicons
            color={favorite.active ? colors.danger : colors.text}
            name={favorite.active ? "heart" : "heart-outline"}
            size={26}
          />
        </Pressable>
      )}
    </View>
    <AppText numberOfLines={2} style={styles.title} variant="label">
      {title}
    </AppText>
    {subtitle === undefined ? null : (
      <AppText numberOfLines={1} variant="caption">
        {subtitle}
      </AppText>
    )}
  </Pressable>
);
