import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, fontSize, spacing } from "@/lib/theme";

import { AppText } from "./text";

export interface HeaderAction {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}

interface HeaderProps {
  title: string;
  /** Left button: hamburger opens the side menu, back pops the stack. */
  leading?: HeaderAction;
  actions?: HeaderAction[];
  right?: ReactNode;
  transparent?: boolean;
}

const styles = StyleSheet.create({
  actions: { alignItems: "center", flexDirection: "row", gap: spacing.xs },
  bar: {
    alignItems: "center",
    backgroundColor: colors.background,
    flexDirection: "row",
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  icon: { padding: spacing.sm },
  title: { color: colors.text, flex: 1, fontSize: fontSize.xl, fontWeight: "700", marginLeft: spacing.sm },
  transparent: { backgroundColor: "transparent" },
});

export const IconButton = ({ icon, label, onPress }: HeaderAction) => (
  <Pressable accessibilityLabel={label} accessibilityRole="button" hitSlop={8} onPress={onPress} style={styles.icon}>
    <Ionicons color={colors.text} name={icon} size={24} />
  </Pressable>
);

const NO_ACTIONS: HeaderAction[] = [];

export const Header = ({ title, leading, actions = NO_ACTIONS, right, transparent = false }: HeaderProps) => {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top + spacing.sm }, transparent ? styles.transparent : null]}>
      {leading === undefined ? null : <IconButton {...leading} />}
      <AppText accessibilityRole="header" numberOfLines={1} style={styles.title}>
        {title}
      </AppText>
      <View style={styles.actions}>
        {actions.map((action) => (
          <IconButton key={action.label} {...action} />
        ))}
        {right}
      </View>
    </View>
  );
};
