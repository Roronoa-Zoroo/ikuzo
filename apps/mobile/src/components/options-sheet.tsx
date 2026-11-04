import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, spacing } from "@/lib/theme";

import { SlidePanel } from "./slide-panel";
import { AppText } from "./text";
import { Touchable } from "./touchable";

export interface OptionItem {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  /** Second line under the label */
  detail?: string;
  onPress: () => void;
  tone?: "default" | "accent" | "danger";
  /** Draws a divider above this item */
  separated?: boolean;
}

interface OptionsSheetProps {
  visible: boolean;
  onClose: () => void;
  items: OptionItem[];
  /** Panel slides in from this side, like the options and side menu panels. */
  side?: "left" | "right";
  header?: ReactNode;
}

const TONES = { accent: colors.accent, danger: colors.danger, default: colors.text } as const;
const PANEL_WIDTH = "78%";

const styles = StyleSheet.create({
  divider: { backgroundColor: colors.border, height: 1, marginVertical: spacing.sm },
  icon: { width: 32 },
  item: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  panel: { backgroundColor: colors.surface, elevation: 16, width: PANEL_WIDTH },
  text: { flex: 1 },
});

/** Side panel of actions: the drawer when `side="left"`, the Options menu when right. */
export const OptionsSheet = ({ visible, onClose, items, side = "right", header }: OptionsSheetProps) => {
  const insets = useSafeAreaInsets();
  return (
    <SlidePanel edge={side} onClose={onClose} panelStyle={styles.panel} visible={visible}>
      <View style={{ flex: 1, paddingBottom: insets.bottom, paddingTop: insets.top + spacing.lg }}>
        {header}
        <ScrollView>
          {items.map((item) => (
            <View key={item.label}>
              {item.separated === true ? <View style={styles.divider} /> : null}
              <Touchable
                accessibilityRole="menuitem"
                onPress={() => {
                  onClose();
                  item.onPress();
                }}
                style={styles.item}
              >
                <Ionicons color={TONES[item.tone ?? "default"]} name={item.icon} size={24} style={styles.icon} />
                <View style={styles.text}>
                  <AppText color={TONES[item.tone ?? "default"]} variant="label">
                    {item.label}
                  </AppText>
                  {item.detail === undefined ? null : <AppText variant="caption">{item.detail}</AppText>}
                </View>
              </Touchable>
            </View>
          ))}
        </ScrollView>
      </View>
    </SlidePanel>
  );
};
