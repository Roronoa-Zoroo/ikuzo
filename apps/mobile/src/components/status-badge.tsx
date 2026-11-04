import type { AiringStatus } from "@ikuzo/anime/types";
import { StyleSheet, View } from "react-native";

import { colors, fontSize, radius, spacing } from "@/lib/theme";

import { AppText } from "./text";

const BADGES: Partial<Record<AiringStatus, { label: string; color: string }>> = {
  airing: { color: colors.accent, label: "AIRING" },
  cancelled: { color: colors.danger, label: "CANCELLED" },
  hiatus: { color: colors.textSubtle, label: "HIATUS" },
  upcoming: { color: colors.warning, label: "NYA" },
};

const styles = StyleSheet.create({
  badge: { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  text: { fontSize: fontSize.xs, fontWeight: "700", letterSpacing: 0.5 },
});

/** "NYA" = not yet aired, the shorthand anime trackers have always used. */
export const StatusBadge = ({ status }: { status: AiringStatus }) => {
  const badge = BADGES[status];
  if (badge === undefined) {
    return null;
  }
  return (
    <View
      accessibilityLabel={status === "upcoming" ? "Not yet aired" : badge.label}
      style={[styles.badge, { backgroundColor: badge.color }]}
    >
      <AppText color={colors.background} style={styles.text}>
        {badge.label}
      </AppText>
    </View>
  );
};
