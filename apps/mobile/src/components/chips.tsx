import { ScrollView, StyleSheet } from "react-native";

import { colors, radius, spacing } from "@/lib/theme";

import { AppText } from "./text";
import { Touchable } from "./touchable";

export interface ChipOption<T> {
  value: T;
  label: string;
}

interface ChipRowProps<T> {
  options: readonly ChipOption<T>[];
  /** Selected values; single-select rows pass one value. */
  selected: readonly T[];
  onToggle: (value: T) => void;
  label?: string;
}

const styles = StyleSheet.create({
  active: { backgroundColor: colors.accentMuted, borderColor: colors.accent },
  chip: {
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  label: { alignSelf: "center", width: 56 },
  row: { alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md },
});

/** Horizontally scrolling filter chips. */
export const ChipRow = <T extends string | number>({ options, selected, onToggle, label }: ChipRowProps<T>) => (
  <ScrollView contentContainerStyle={styles.row} horizontal showsHorizontalScrollIndicator={false}>
    {label === undefined ? null : (
      <AppText style={styles.label} variant="caption">
        {label}
      </AppText>
    )}
    {options.map((option) => {
      const active = selected.includes(option.value);
      return (
        <Touchable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: active }}
          key={String(option.value)}
          onPress={() => {
            onToggle(option.value);
          }}
          style={[styles.chip, active ? styles.active : null]}
        >
          <AppText color={active ? colors.text : colors.textMuted} variant="caption">
            {option.label}
          </AppText>
        </Touchable>
      );
    })}
  </ScrollView>
);
