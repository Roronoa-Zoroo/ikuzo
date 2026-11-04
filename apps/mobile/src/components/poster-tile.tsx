import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";

import { duration, easing } from "@/lib/motion";
import { colors, radius, spacing } from "@/lib/theme";

import { AppText } from "./text";
import { Touchable } from "./touchable";

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
const BOUNCE_SCALE = 1.35;

const styles = StyleSheet.create({
  heart: { borderRadius: radius.pill, padding: 2, position: "absolute", right: spacing.sm, top: spacing.sm },
  image: { backgroundColor: colors.surface, borderRadius: radius.sm },
  title: { marginTop: spacing.sm },
});

/** Heart that bounces when toggled (MaterialFavoriteButton's 300 ms bounce). */
const FavoriteHeart = ({ active, onToggle }: { active: boolean; onToggle: () => void }) => {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Touchable
      accessibilityLabel={active ? "Remove from favourites" : "Add to favourites"}
      accessibilityRole="button"
      borderless
      hitSlop={8}
      onPress={() => {
        scale.set(
          withSequence(
            withTiming(BOUNCE_SCALE, { duration: duration.bounce / 2, easing: easing.standard }),
            withTiming(1, { duration: duration.bounce / 2, easing: easing.overshoot })
          )
        );
        void Haptics.selectionAsync();
        onToggle();
      }}
      style={styles.heart}
    >
      <Animated.View style={style}>
        <Ionicons color={active ? colors.danger : colors.text} name={active ? "heart" : "heart-outline"} size={26} />
      </Animated.View>
    </Touchable>
  );
};

export const PosterTile = ({ title, subtitle, image, onPress, width = DEFAULT_WIDTH, favorite }: PosterTileProps) => (
  <Touchable accessibilityLabel={title} accessibilityRole="button" onPress={onPress} scaleOnPress style={{ width }}>
    <View>
      <Image
        contentFit="cover"
        source={image}
        style={[styles.image, { height: width * ASPECT_RATIO, width }]}
        transition={duration.image}
      />
      {favorite === undefined ? null : <FavoriteHeart {...favorite} />}
    </View>
    <AppText numberOfLines={2} style={styles.title} variant="label">
      {title}
    </AppText>
    {subtitle === undefined ? null : (
      <AppText numberOfLines={1} variant="caption">
        {subtitle}
      </AppText>
    )}
  </Touchable>
);
