import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { colors, radius, spacing } from "@/lib/theme";

import { AppText } from "./text";

interface SectionProps {
  title?: string;
  actionLabel?: string;
  onAction?: () => void;
  children?: ReactNode;
  flush?: boolean;
}

const styles = StyleSheet.create({
  action: { textDecorationLine: "underline" },
  body: { paddingHorizontal: spacing.lg },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    gap: spacing.md,
    marginHorizontal: spacing.md,
    paddingVertical: spacing.lg,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
  },
});

/** Rounded card with a heading and optional underlined action ("View all"). */
export const Section = ({ title, actionLabel, onAction, children, flush = false }: SectionProps) => (
  <View style={styles.card}>
    {title === undefined ? null : (
      <View style={styles.header}>
        <AppText variant="heading">{title}</AppText>
        {actionLabel === undefined || onAction === undefined ? null : (
          <Pressable accessibilityRole="link" hitSlop={8} onPress={onAction}>
            <AppText style={styles.action} variant="label">
              {actionLabel}
            </AppText>
          </Pressable>
        )}
      </View>
    )}
    <View style={flush ? null : styles.body}>{children}</View>
  </View>
);
