import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { colors, radius, spacing } from "@/lib/theme";

import { AppText } from "./text";

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  center: { alignItems: "center", flex: 1, gap: spacing.md, justifyContent: "center", padding: spacing.xl },
  message: { textAlign: "center" },
});

export const Loading = () => (
  <View style={styles.center}>
    <ActivityIndicator color={colors.accent} size="large" />
  </View>
);

export const ErrorState = ({ error, onRetry }: { error: unknown; onRetry?: () => void }) => (
  <View style={styles.center}>
    <Ionicons color={colors.textMuted} name="cloud-offline-outline" size={40} />
    <AppText style={styles.message} variant="caption">
      {error instanceof Error ? error.message : "Something went wrong"}
    </AppText>
    {onRetry === undefined ? null : (
      <Pressable accessibilityRole="button" onPress={onRetry} style={styles.button}>
        <AppText variant="label">Try again</AppText>
      </Pressable>
    )}
  </View>
);

export const EmptyState = ({
  icon,
  title,
  message,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
}) => (
  <View style={styles.center}>
    <Ionicons color={colors.textSubtle} name={icon} size={48} />
    <AppText variant="label">{title}</AppText>
    {message === undefined ? null : (
      <AppText style={styles.message} variant="caption">
        {message}
      </AppText>
    )}
  </View>
);
