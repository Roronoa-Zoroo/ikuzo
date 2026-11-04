import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { duration, easing } from "@/lib/motion";
import { colors, radius } from "@/lib/theme";

const styles = StyleSheet.create({
  fill: { backgroundColor: colors.accent, height: "100%", transformOrigin: "left", width: "100%" },
  track: { backgroundColor: colors.border, borderRadius: radius.pill, height: 4, overflow: "hidden" },
});

/** Watched-episodes bar that grows smoothly on +1 instead of jumping. */
export const ProgressBar = ({ ratio }: { ratio: number }) => {
  const value = useSharedValue(ratio);
  useEffect(() => {
    value.set(withTiming(Math.max(0, Math.min(1, ratio)), { duration: duration.itemMove, easing: easing.standard }));
  }, [ratio, value]);
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: value.value }] }));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ max: 100, min: 0, now: Math.round(ratio * 100) }}
      style={styles.track}
    >
      <Animated.View style={[styles.fill, fillStyle]} />
    </View>
  );
};
