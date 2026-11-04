import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import type { ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import type { EasingFunction, EasingFunctionFactory } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { duration, easing } from "@/lib/motion";
import { colors } from "@/lib/theme";

export type PanelEdge = "left" | "right" | "bottom";

interface SlidePanelProps {
  visible: boolean;
  onClose: () => void;
  edge: PanelEdge;
  panelStyle?: ViewStyle;
  children: ReactNode;
}

interface Timing {
  in: number;
  out: number;
  inEasing: EasingFunction | EasingFunctionFactory;
  outEasing: EasingFunction | EasingFunctionFactory;
}

/** Side panels slide like DrawerLayout; bottom sheets use anYme's overshoot/anticipate pair. */
const TIMINGS: Record<PanelEdge, Timing> = {
  bottom: { in: duration.sheetIn, inEasing: easing.overshoot, out: duration.sheetOut, outEasing: easing.anticipate },
  left: { in: duration.panel, inEasing: easing.standard, out: duration.panel, outEasing: easing.standard },
  right: { in: duration.panel, inEasing: easing.standard, out: duration.panel, outEasing: easing.standard },
};

const OVERSHOOT_ROOM = 48;

const styles = StyleSheet.create({
  backdrop: { backgroundColor: colors.overlay },
  // Extends below the screen so the overshoot never shows a gap under the sheet.
  bottom: { bottom: -OVERSHOOT_ROOM, left: 0, paddingBottom: OVERSHOOT_ROOM, position: "absolute", right: 0 },
  left: { bottom: 0, left: 0, position: "absolute", top: 0 },
  right: { bottom: 0, position: "absolute", right: 0, top: 0 },
});

/**
 * A modal panel that slides in from an edge over a fading backdrop, and slides
 * out again before unmounting (a plain Modal would just vanish).
 */
export const SlidePanel = ({ visible, onClose, edge, panelStyle, children }: SlidePanelProps) => {
  const { width, height } = useWindowDimensions();
  // Stays rendered while the closing animation plays.
  const [closing, setClosing] = useState(false);
  const [wasVisible, setWasVisible] = useState(visible);
  const progress = useSharedValue(0);
  const timing = TIMINGS[edge];

  // Adjusting state during render when a prop changes (React's recommended pattern).
  if (visible !== wasVisible) {
    setWasVisible(visible);
    setClosing(!visible);
  }

  useEffect(() => {
    if (visible) {
      progress.set(withTiming(1, { duration: timing.in, easing: timing.inEasing }));
      return;
    }
    const finish = (finished?: boolean) => {
      "worklet";
      if (finished === true) {
        scheduleOnRN(setClosing, false);
      }
    };
    progress.set(withTiming(0, { duration: timing.out, easing: timing.outEasing }, finish));
  }, [progress, timing, visible]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, progress.value)) }));
  const panelAnimatedStyle = useAnimatedStyle(() => {
    const hidden = 1 - progress.value;
    if (edge === "bottom") {
      return { transform: [{ translateY: hidden * height }] };
    }
    return { transform: [{ translateX: (edge === "left" ? -hidden : hidden) * width }] };
  });

  if (!visible && !closing) {
    return null;
  }

  return (
    <Modal animationType="none" onRequestClose={onClose} statusBarTranslucent transparent visible>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View style={[styles[edge], panelStyle, panelAnimatedStyle]}>
        <View style={{ flex: edge === "bottom" ? 0 : 1 }}>{children}</View>
      </Animated.View>
    </Modal>
  );
};
