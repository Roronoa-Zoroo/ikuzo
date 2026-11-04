import { Ionicons } from "@expo/vector-icons";
import type { AnimeSummary } from "@ikuzo/anime/types";
import { useState } from "react";
import { ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useLibrary, WATCH_STATUS_LABELS, WATCH_STATUSES, useEntry, entryKeyFor } from "@/lib/store";
import type { WatchStatus } from "@/lib/store";
import { colors, fontSize, radius, spacing, fontFamily } from "@/lib/theme";

import { SlidePanel } from "./slide-panel";
import { AppText } from "./text";
import { Touchable } from "./touchable";

interface UpdateSheetProps {
  anime: AnimeSummary;
  visible: boolean;
  onClose: () => void;
}

const SCORES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

const styles = StyleSheet.create({
  button: { alignItems: "center", borderRadius: radius.md, flex: 1, paddingVertical: spacing.md },
  buttons: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  chip: {
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipActive: { backgroundColor: colors.accentMuted, borderColor: colors.accent },
  content: { gap: spacing.md, padding: spacing.lg },
  danger: { borderColor: colors.danger, borderWidth: 1 },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    color: colors.text,
    fontFamily,
    fontSize: fontSize.lg,
    minWidth: 64,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    textAlign: "center",
  },
  primary: { backgroundColor: colors.accent },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: "85%",
  },
  stepButton: { backgroundColor: colors.surface, borderRadius: radius.pill, padding: spacing.sm },
  stepper: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});

const Chip = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
  <Touchable
    accessibilityRole="radio"
    accessibilityState={{ selected: active }}
    onPress={onPress}
    style={[styles.chip, active ? styles.chipActive : null]}
  >
    <AppText color={active ? colors.text : colors.textMuted} variant="label">
      {label}
    </AppText>
  </Touchable>
);

const Form = ({ anime, onClose }: Omit<UpdateSheetProps, "visible">) => {
  const entry = useEntry(anime);
  const save = useLibrary((state) => state.save);
  const remove = useLibrary((state) => state.remove);
  const [status, setStatus] = useState<WatchStatus>(entry?.status ?? "planned");
  const [progress, setProgress] = useState(entry?.progress ?? 0);
  const [score, setScore] = useState(entry?.score ?? 0);
  const max = anime.episodes ?? Number.POSITIVE_INFINITY;

  const changeProgress = (value: number) => {
    setProgress(Math.max(0, Math.min(max, value)));
  };

  return (
    <>
      <AppText variant="heading">{entry === undefined ? "Add to list" : "Update"}</AppText>

      <AppText variant="caption">Status</AppText>
      <View style={styles.wrap}>
        {WATCH_STATUSES.map((value) => (
          <Chip
            active={status === value}
            key={value}
            label={WATCH_STATUS_LABELS[value]}
            onPress={() => {
              setStatus(value);
              if (value === "completed" && anime.episodes !== null) {
                setProgress(anime.episodes);
              }
            }}
          />
        ))}
      </View>

      <AppText variant="caption">Episodes watched</AppText>
      <View style={styles.stepper}>
        <Touchable
          accessibilityLabel="One episode less"
          onPress={() => {
            changeProgress(progress - 1);
          }}
          style={styles.stepButton}
        >
          <Ionicons color={colors.text} name="remove" size={22} />
        </Touchable>
        <TextInput
          accessibilityLabel="Episodes watched"
          inputMode="numeric"
          onChangeText={(text) => {
            changeProgress(Number(text.replaceAll(/\D/gu, "")));
          }}
          style={styles.input}
          value={String(progress)}
        />
        <AppText variant="caption">/ {anime.episodes ?? "?"}</AppText>
        <Touchable
          accessibilityLabel="One episode more"
          onPress={() => {
            changeProgress(progress + 1);
          }}
          style={styles.stepButton}
        >
          <Ionicons color={colors.text} name="add" size={22} />
        </Touchable>
      </View>

      <AppText variant="caption">Your score</AppText>
      <View style={styles.wrap}>
        {SCORES.map((value) => (
          <Chip
            active={score === value}
            key={value}
            label={value === 0 ? "-" : String(value)}
            onPress={() => {
              setScore(value);
            }}
          />
        ))}
      </View>

      <View style={styles.buttons}>
        {entry === undefined ? null : (
          <Touchable
            accessibilityRole="button"
            onPress={() => {
              remove(entryKeyFor(anime));
              onClose();
            }}
            style={[styles.button, styles.danger]}
          >
            <AppText color={colors.danger} variant="label">
              Remove
            </AppText>
          </Touchable>
        )}
        <Touchable
          accessibilityRole="button"
          onPress={() => {
            save(anime, { progress, score, status });
            onClose();
          }}
          style={[styles.button, styles.primary]}
        >
          <AppText variant="label">Save</AppText>
        </Touchable>
      </View>
    </>
  );
};

/** Bottom sheet to set status, watched episodes and score. */
export const UpdateSheet = ({ anime, visible, onClose }: UpdateSheetProps) => {
  const insets = useSafeAreaInsets();
  return (
    <SlidePanel edge="bottom" onClose={onClose} panelStyle={styles.sheet} visible={visible}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.lg }]}>
        {/* The panel mounts on open, so the form starts from the saved values every time. */}
        <Form anime={anime} onClose={onClose} />
      </ScrollView>
    </SlidePanel>
  );
};
