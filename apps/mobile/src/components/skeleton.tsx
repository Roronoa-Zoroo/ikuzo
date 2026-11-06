import { useEffect } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import type { DimensionValue, StyleProp, ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { colors, radius, spacing } from "@/lib/theme";

const PULSE_MS = 700;
const POSTER_ASPECT = 1.5;
const TILE_COUNT = 4;

const styles = StyleSheet.create({
  // Lighter than the cards it sits on, so the shapes read as "loading" rather than empty.
  block: { backgroundColor: colors.border, borderRadius: radius.sm },
  lines: { gap: spacing.sm },
  row: { gap: spacing.md, paddingHorizontal: spacing.lg },
  tile: { gap: spacing.sm },
});

/**
 * A grey placeholder in the shape of the content that is coming. It keeps the layout still while
 * data loads, instead of a spinner that is replaced (and pushes things around) when it arrives.
 */
export const Skeleton = ({
  width = "100%",
  height,
  style,
}: {
  width?: DimensionValue;
  height: number;
  style?: StyleProp<ViewStyle>;
}) => {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.set(withRepeat(withTiming(0.45, { duration: PULSE_MS }), -1, true));
    return () => {
      cancelAnimation(opacity);
    };
  }, [opacity]);
  const pulse = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.block, { height, width }, pulse, style]} />;
};

/** Lines of text still loading (a synopsis). */
export const SkeletonLines = ({ lines = 4 }: { lines?: number }) => (
  <View style={styles.lines}>
    {Array.from({ length: lines }, (_, line) => (
      <Skeleton height={12} key={line} width={line === lines - 1 ? "60%" : "100%"} />
    ))}
  </View>
);

/** A row of poster tiles still loading (characters, recommendations, Discover rows). */
export const SkeletonTiles = ({ width = 120 }: { width?: number }) => (
  <ScrollView contentContainerStyle={styles.row} horizontal scrollEnabled={false}>
    {Array.from({ length: TILE_COUNT }, (_, tile) => (
      <View key={tile} style={styles.tile}>
        <Skeleton height={width * POSTER_ASPECT} width={width} />
        <Skeleton height={12} width={width * 0.8} />
      </View>
    ))}
  </ScrollView>
);
