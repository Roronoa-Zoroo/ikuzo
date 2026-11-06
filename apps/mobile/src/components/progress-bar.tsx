import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { duration, easing } from "@/lib/motion";
import { colors, radius } from "@/lib/theme";

const styles = StyleSheet.create({
  fill: { backgroundColor: colors.accent, height: "100%", transformOrigin: "left", width: "100%" },
  track: { backgroundColor: colors.border, borderRadius: radius.pill, height: 4, overflow: "hidden" },
});

/**
 * Watched-episodes bar that grows smoothly on +1 instead of jumping. `id` names the show: when a
 * recycled list row is reused for another show the bar jumps straight to its value.
 */
export const ProgressBar = ({ ratio, id }: { ratio: number; id?: string }) => {
  const value = useSharedValue(ratio);
  const shown = useRef(id);
  useEffect(() => {
    const target = Math.max(0, Math.min(1, ratio));
    if (shown.current === id) {
      value.set(withTiming(target, { duration: duration.itemMove, easing: easing.standard }));
    } else {
      shown.current = id;
      value.set(target);
    }
  }, [id, ratio, value]);
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
