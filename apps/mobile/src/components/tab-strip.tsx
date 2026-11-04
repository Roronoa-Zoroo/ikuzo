import { useEffect, useRef, useState } from "react";
import type { ComponentRef } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import type { LayoutChangeEvent } from "react-native";
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";

import { duration, easing } from "@/lib/motion";
import { colors, fontSize, spacing } from "@/lib/theme";

import { AppText } from "./text";
import { Touchable } from "./touchable";

export interface TabItem<T extends string> {
  key: T;
  label: string;
}

interface TabStripProps<T extends string> {
  tabs: readonly TabItem<T>[];
  value: T;
  onChange: (key: T) => void;
  /**
   * Fractional page position from a pager (1.5 = halfway between tab 1 and 2).
   * When given, the underline follows the finger; otherwise it slides on change.
   */
  position?: SharedValue<number>;
}

interface TabFrame {
  x: number;
  width: number;
}

const INDICATOR_HEIGHT = 3;

const styles = StyleSheet.create({
  indicator: {
    backgroundColor: colors.text,
    bottom: 0,
    height: INDICATOR_HEIGHT,
    left: 0,
    position: "absolute",
    width: 1,
  },
  label: { fontSize: fontSize.sm, fontWeight: "600", letterSpacing: 1 },
  row: { paddingHorizontal: spacing.sm },
  tab: { paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  wrapper: { backgroundColor: colors.background, borderBottomColor: colors.border, borderBottomWidth: 1 },
});

/** Scrollable top tabs whose underline slides (or tracks a swipe) like Material's TabLayout. */
export const TabStrip = <T extends string>({ tabs, value, onChange, position }: TabStripProps<T>) => {
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const [frames, setFrames] = useState<TabFrame[]>([]);
  const [viewport, setViewport] = useState(0);
  const index = Math.max(
    0,
    tabs.findIndex((tab) => tab.key === value)
  );
  const internal = useSharedValue(index);
  const xs = useSharedValue<number[]>([]);
  const widths = useSharedValue<number[]>([]);

  useEffect(() => {
    if (position === undefined) {
      internal.set(withTiming(index, { duration: duration.tabIndicator, easing: easing.standard }));
    }
    const frame = frames[index];
    if (frame !== undefined) {
      // Centre the selected tab, like Material's scrollable TabLayout.
      scrollRef.current?.scrollTo({ animated: true, x: Math.max(0, frame.x + frame.width / 2 - viewport / 2) });
    }
  }, [frames, index, internal, position, viewport]);

  useEffect(() => {
    xs.set(frames.map((frame) => frame.x));
    widths.set(frames.map((frame) => frame.width));
  }, [frames, widths, xs]);

  const indicatorStyle = useAnimatedStyle(() => {
    const count = xs.value.length;
    if (count === 0) {
      return { opacity: 0 };
    }
    const at = position === undefined ? internal.value : position.value;
    const steps = xs.value.map((_, step) => step);
    const x = interpolate(
      at,
      steps.length > 1 ? steps : [0, 1],
      steps.length > 1 ? xs.value : [xs.value[0] ?? 0, xs.value[0] ?? 0]
    );
    const width = interpolate(
      at,
      steps.length > 1 ? steps : [0, 1],
      steps.length > 1 ? widths.value : [widths.value[0] ?? 0, widths.value[0] ?? 0]
    );
    return { opacity: 1, transform: [{ translateX: x + width / 2 - 0.5 }, { scaleX: width }] };
  });

  const onTabLayout = (tabIndex: number) => (event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    setFrames((current) => {
      const next = [...current];
      next[tabIndex] = { width, x };
      return next;
    });
  };

  return (
    <View style={styles.wrapper}>
      <ScrollView
        contentContainerStyle={styles.row}
        horizontal
        onLayout={(event) => {
          setViewport(event.nativeEvent.layout.width);
        }}
        ref={scrollRef}
        showsHorizontalScrollIndicator={false}
      >
        {tabs.map((tab, tabIndex) => {
          const active = tabIndex === index;
          return (
            <Touchable
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              key={tab.key}
              onLayout={onTabLayout(tabIndex)}
              onPress={() => {
                onChange(tab.key);
              }}
              style={styles.tab}
            >
              <AppText color={active ? colors.text : colors.textMuted} style={styles.label}>
                {tab.label.toUpperCase()}
              </AppText>
            </Touchable>
          );
        })}
        <Animated.View pointerEvents="none" style={[styles.indicator, indicatorStyle]} />
      </ScrollView>
    </View>
  );
};
