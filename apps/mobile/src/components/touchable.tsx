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

/** A card that shrinks a little while pressed (120 ms, on the UI thread so it never stutters). */
const ScalingTouchable = ({ style, borderless = false, onPressIn, onPressOut, ...props }: TouchableProps) => {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      android_ripple={{ borderless, color: colors.ripple, foreground: !borderless }}
      onPressIn={(event) => {
        scale.set(withTiming(PRESSED_SCALE, { duration: duration.press, easing: easing.standard }));
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        scale.set(withTiming(1, { duration: duration.press, easing: easing.standard }));
        onPressOut?.(event);
      }}
      style={[style, animatedStyle]}
      {...props}
    />
  );
};

/**
 * Pressable with Android's native ripple (what anYme's Material cards used). Most buttons only
 * ripple and are a plain Pressable; `scaleOnPress` adds the press animation for cards.
 */
export const Touchable = ({ scaleOnPress = false, borderless = false, style, ...props }: TouchableProps) =>
  scaleOnPress ? (
    <ScalingTouchable borderless={borderless} style={style} {...props} />
  ) : (
    <Pressable
      android_ripple={{ borderless, color: colors.ripple, foreground: !borderless }}
      style={style}
      {...props}
    />
  );
