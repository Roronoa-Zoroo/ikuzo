import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, spacing } from "@/lib/theme";

import { AppText } from "./text";

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
  header?: React.ReactNode;
}

const TONES = { accent: colors.accent, danger: colors.danger, default: colors.text } as const;
const PANEL_WIDTH = "78%";

const styles = StyleSheet.create({
  backdrop: { backgroundColor: colors.overlay, flex: 1 },
  divider: { backgroundColor: colors.border, height: 1, marginVertical: spacing.sm },
  icon: { width: 32 },
  item: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  panel: { backgroundColor: colors.surface, height: "100%", width: PANEL_WIDTH },
  pressed: { backgroundColor: colors.cardPressed },
  root: { flex: 1, flexDirection: "row", justifyContent: "flex-end" },
  rootLeft: { justifyContent: "flex-start" },
  text: { flex: 1 },
});

export const OptionsSheet = ({ visible, onClose, items, side = "right", header }: OptionsSheetProps) => {
  const insets = useSafeAreaInsets();
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={[styles.root, side === "left" ? styles.rootLeft : null]}>
        <Pressable accessibilityLabel="Close menu" onPress={onClose} style={StyleSheet.absoluteFill}>
          <View style={styles.backdrop} />
        </Pressable>
        <View style={[styles.panel, { paddingBottom: insets.bottom, paddingTop: insets.top + spacing.lg }]}>
          {header}
          <ScrollView>
            {items.map((item) => (
              <View key={item.label}>
                {item.separated === true ? <View style={styles.divider} /> : null}
                <Pressable
                  accessibilityRole="menuitem"
                  onPress={() => {
                    onClose();
                    item.onPress();
                  }}
                  style={({ pressed }) => [styles.item, pressed ? styles.pressed : null]}
                >
                  <Ionicons color={TONES[item.tone ?? "default"]} name={item.icon} size={24} style={styles.icon} />
                  <View style={styles.text}>
                    <AppText color={TONES[item.tone ?? "default"]} variant="label">
                      {item.label}
                    </AppText>
                    {item.detail === undefined ? null : <AppText variant="caption">{item.detail}</AppText>}
                  </View>
                </Pressable>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};
