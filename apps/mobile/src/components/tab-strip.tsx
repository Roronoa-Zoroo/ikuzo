import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { colors, fontSize, spacing } from "@/lib/theme";

import { AppText } from "./text";

export interface TabItem<T extends string> {
  key: T;
  label: string;
}

interface TabStripProps<T extends string> {
  tabs: readonly TabItem<T>[];
  value: T;
  onChange: (key: T) => void;
}

const styles = StyleSheet.create({
  active: { borderBottomColor: colors.text },
  label: { fontSize: fontSize.sm, fontWeight: "600", letterSpacing: 1 },
  row: { paddingHorizontal: spacing.sm },
  tab: {
    borderBottomColor: "transparent",
    borderBottomWidth: 3,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  wrapper: { backgroundColor: colors.background, borderBottomColor: colors.border, borderBottomWidth: 1 },
});

/** Scrollable top tabs with an underline, used by Home, Calendar and the anime page. */
export const TabStrip = <T extends string>({ tabs, value, onChange }: TabStripProps<T>) => (
  <View style={styles.wrapper}>
    <ScrollView contentContainerStyle={styles.row} horizontal showsHorizontalScrollIndicator={false}>
      {tabs.map((tab) => {
        const active = tab.key === value;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            key={tab.key}
            onPress={() => {
              onChange(tab.key);
            }}
            style={[styles.tab, active ? styles.active : null]}
          >
            <AppText color={active ? colors.text : colors.textMuted} style={styles.label}>
              {tab.label.toUpperCase()}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  </View>
);
