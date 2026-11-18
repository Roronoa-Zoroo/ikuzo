import Ionicons from "@expo/vector-icons/Ionicons";
import { HttpError } from "@ikuzo/anime/errors";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { colors, radius, spacing } from "@/lib/theme";

import { AppText } from "./text";
import { Touchable } from "./touchable";

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

const HTTP_SERVER_ERROR = 500;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_NOT_FOUND = 404;
/** What fetch throws on Android, iOS and the web when there is no connection to the server. */
const OFFLINE_PATTERN =
  /fetch failed|network request failed|failed to fetch|connectexception|unknownhost|no answer from/iu;

/** A sentence for people, not a Java stack trace: what went wrong and what to do about it. */
export const describeError = (error: unknown): string => {
  if (error instanceof HttpError) {
    if (error.status === HTTP_TOO_MANY_REQUESTS) {
      return "Too many requests right now. Wait a moment and try again.";
    }
    if (error.status === HTTP_NOT_FOUND) {
      return "This could not be found.";
    }
    if (error.status >= HTTP_SERVER_ERROR) {
      return "The server is having trouble. Try again later.";
    }
  }
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
  const message = error instanceof Error ? `${error.message} ${cause}` : "";
  if (OFFLINE_PATTERN.test(message)) {
    return "Could not connect. Check your internet connection and try again.";
  }
  return "Something went wrong. Try again.";
};

export const ErrorState = ({ error, onRetry }: { error: unknown; onRetry?: () => void }) => (
  <View style={styles.center}>
    <Ionicons color={colors.textMuted} name="cloud-offline-outline" size={40} />
    <AppText style={styles.message} variant="caption">
      {describeError(error)}
    </AppText>
    {onRetry === undefined ? null : (
      <Touchable accessibilityRole="button" onPress={onRetry} style={styles.button}>
        <AppText variant="label">Try again</AppText>
      </Touchable>
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
