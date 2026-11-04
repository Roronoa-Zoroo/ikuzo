import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";
import { create } from "zustand";

import { duration, easing } from "@/lib/motion";
import { colors, radius, spacing } from "@/lib/theme";

import { AppText } from "./text";
import { Touchable } from "./touchable";

interface ToastMessage {
  id: number;
  text: string;
  action?: { label: string; onPress: () => void };
}

interface ToastState {
  current?: ToastMessage;
  show: (text: string, action?: ToastMessage["action"]) => void;
  hide: () => void;
}

let nextId = 1;

export const useToast = create<ToastState>()((set) => ({
  hide: () => {
    set({ current: undefined });
  },
  show: (text, action) => {
    nextId += 1;
    set({ current: { action, id: nextId, text } });
  },
}));

const hideToast = () => {
  useToast.getState().hide();
};

/** Animation callback: unmount the bar once it has fully slid away. */
const hideWhenFinished = (finished?: boolean) => {
  "worklet";
  if (finished === true) {
    scheduleOnRN(hideToast);
  }
};

/** Shortcut for code outside components. */
export const showToast = (text: string, action?: ToastMessage["action"]): void => {
  useToast.getState().show(text, action);
};

const VISIBLE_MS = 3500;
/** Toasts with an action (Undo) stay longer, so there is time to reach the button. */
const ACTION_VISIBLE_MS = 6000;
/** Space for the bottom tab bar, so the bar never covers it. */
const TAB_BAR_CLEARANCE = 64;

const styles = StyleSheet.create({
  bar: {
    alignItems: "center",
    backgroundColor: colors.text,
    borderRadius: radius.md,
    elevation: 6,
    flexDirection: "row",
    gap: spacing.md,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    paddingVertical: spacing.xs,
  },
  button: { borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  root: { left: spacing.md, position: "absolute", right: spacing.md },
  text: { flex: 1, paddingVertical: spacing.sm },
});

/**
 * Confirmation bar ("Episode 5 watched · Undo"). Slides in with anYme's 700 ms
 * overshoot and out with its 500 ms anticipate curve.
 */
export const ToastHost = () => {
  const insets = useSafeAreaInsets();
  const message = useToast((state) => state.current);
  const hide = useToast((state) => state.hide);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (message === undefined) {
      return () => {
        // Nothing is showing, so there is no timer to clear.
      };
    }
    progress.set(0);
    progress.set(withTiming(1, { duration: duration.slideIn, easing: easing.overshoot }));
    const timer = setTimeout(
      () => {
        progress.set(withTiming(0, { duration: duration.slideOut, easing: easing.anticipate }, hideWhenFinished));
      },
      message.action === undefined ? VISIBLE_MS : ACTION_VISIBLE_MS
    );
    return () => {
      clearTimeout(timer);
    };
  }, [message, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, progress.value * 2),
    transform: [{ translateY: (1 - progress.value) * 120 }],
  }));

  if (message === undefined) {
    return null;
  }

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      pointerEvents="box-none"
      style={[styles.root, { bottom: insets.bottom + TAB_BAR_CLEARANCE }, style]}
    >
      <View style={styles.bar}>
        <AppText color={colors.background} style={styles.text} variant="label">
          {message.text}
        </AppText>
        {message.action === undefined ? null : (
          <Touchable
            accessibilityRole="button"
            onPress={() => {
              message.action?.onPress();
              hide();
            }}
            style={styles.button}
          >
            <AppText color={colors.accent} variant="label">
              {message.action.label.toUpperCase()}
            </AppText>
          </Touchable>
        )}
      </View>
    </Animated.View>
  );
};
