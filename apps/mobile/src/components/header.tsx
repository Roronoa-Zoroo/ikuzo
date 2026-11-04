import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, spacing } from "@/lib/theme";

import { MaterialIcon } from "./material-icon";
import type { IconName } from "./material-icon";
import { AppText } from "./text";
import { Touchable } from "./touchable";

export interface HeaderAction {
  icon: IconName;
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

const ICON_SIZE = 26;
/** Material keyline: titles start 72dp from the left edge. */
const TITLE_KEYLINE = 72;

const styles = StyleSheet.create({
  actions: { alignItems: "center", flexDirection: "row", gap: spacing.xs },
  bar: {
    alignItems: "center",
    backgroundColor: colors.background,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 56,
    paddingBottom: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  icon: { padding: spacing.sm },
  title: { color: colors.textStrong, flex: 1, fontSize: 21, fontWeight: "500" },
  transparent: { backgroundColor: "transparent" },
});

export const IconButton = ({ icon, label, onPress }: HeaderAction) => (
  <Touchable
    accessibilityLabel={label}
    accessibilityRole="button"
    borderless
    hitSlop={8}
    onPress={onPress}
    style={styles.icon}
  >
    <MaterialIcon color={colors.textStrong} name={icon} size={ICON_SIZE} />
  </Touchable>
);

const NO_ACTIONS: HeaderAction[] = [];

export const Header = ({ title, leading, actions = NO_ACTIONS, right, transparent = false }: HeaderProps) => {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top + spacing.sm }, transparent ? styles.transparent : null]}>
      {leading === undefined ? null : <IconButton {...leading} />}
      <AppText
        accessibilityRole="header"
        numberOfLines={1}
        style={[
          styles.title,
          {
            marginLeft:
              leading === undefined ? spacing.md : TITLE_KEYLINE - ICON_SIZE - spacing.sm * 2 - spacing.xs * 2,
          },
        ]}
      >
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
