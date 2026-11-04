import { Pressable } from "react-native";
import type { PressableProps, StyleProp, ViewStyle } from "react-native";
import { createAnimatedComponent, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { duration, easing, PRESSED_SCALE } from "@/lib/motion";
import { colors } from "@/lib/theme";

const AnimatedPressable = createAnimatedComponent(Pressable);

interface TouchableProps extends Omit<PressableProps, "style"> {
  style?: StyleProp<ViewStyle>;
  /** Shrink slightly while pressed (cards); buttons usually only ripple. */
  scaleOnPress?: boolean;
  /** Ripple spreads outside the bounds (icon buttons). */
  borderless?: boolean;
}

/**
 * Pressable with Android's native ripple (what anYme's Material cards used) and an
 * optional 120 ms press scale. The scale runs on the UI thread, so it never stutters.
 */
export const Touchable = ({
  style,
  scaleOnPress = false,
  borderless = false,
  onPressIn,
  onPressOut,
  ...props
}: TouchableProps) => {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      android_ripple={{ borderless, color: colors.ripple, foreground: !borderless }}
      onPressIn={(event) => {
        if (scaleOnPress) {
          scale.set(withTiming(PRESSED_SCALE, { duration: duration.press, easing: easing.standard }));
        }
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        if (scaleOnPress) {
          scale.set(withTiming(1, { duration: duration.press, easing: easing.standard }));
        }
        onPressOut?.(event);
      }}
      style={[style, scaleOnPress ? animatedStyle : null]}
      {...props}
    />
  );
};
