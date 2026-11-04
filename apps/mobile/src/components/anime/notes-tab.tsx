import { Ionicons } from "@expo/vector-icons";
import type { AnimeDetail } from "@ikuzo/anime/types";
import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { Section } from "@/components/section";
import { AppText } from "@/components/text";
import { useLibraryActions, useEntry, entryKeyFor } from "@/lib/store";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

const styles = StyleSheet.create({
  episode: { textAlign: "center", width: 64 },
  form: { flexDirection: "row", gap: spacing.sm },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    color: colors.text,
    fontSize: fontSize.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  noteHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.sm },
  save: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
  },
  tab: { gap: spacing.md, paddingVertical: spacing.md },
  text: { flex: 1, minHeight: 80, textAlignVertical: "top" },
});

/** Personal notes, optionally tied to an episode. */
export const NotesTab = ({ anime }: { anime: AnimeDetail }) => {
  const entry = useEntry(anime);
  const { addNote, deleteNote, save } = useLibraryActions();
  const [text, setText] = useState("");
  const [episode, setEpisode] = useState(entry === undefined ? "" : String(entry.progress));

  const submit = () => {
    const trimmed = text.trim();
    if (trimmed === "") {
      return;
    }
    if (entry === undefined) {
      save(anime);
    }
    const key = entryKeyFor(anime);
    const number = Number(episode);
    addNote(key, trimmed, episode === "" || Number.isNaN(number) ? undefined : number);
    setText("");
  };

  return (
    <View style={styles.tab}>
      <Section title="New note">
        <View style={styles.form}>
          <TextInput
            accessibilityLabel="Episode number"
            inputMode="numeric"
            onChangeText={(value) => {
              setEpisode(value.replaceAll(/\D/gu, ""));
            }}
            placeholder="Ep"
            placeholderTextColor={colors.textSubtle}
            style={[styles.input, styles.episode]}
            value={episode}
          />
          <TextInput
            accessibilityLabel="Note"
            multiline
            onChangeText={setText}
            placeholder="What did you think of this episode?"
            placeholderTextColor={colors.textSubtle}
            style={[styles.input, styles.text]}
            value={text}
          />
        </View>
        <Pressable accessibilityRole="button" onPress={submit} style={styles.save}>
          <AppText variant="label">Save note</AppText>
        </Pressable>
      </Section>

      {(entry?.notes ?? []).map((note) => (
        <Section key={note.id}>
          <View style={styles.noteHeader}>
            <AppText variant="caption">
              {note.episode === undefined ? "General" : `Episode ${note.episode}`} ·{" "}
              {new Date(note.createdAt).toLocaleDateString()}
            </AppText>
            <Pressable
              accessibilityLabel="Delete note"
              hitSlop={8}
              onPress={() => {
                deleteNote(entry?.key ?? "", note.id);
              }}
            >
              <Ionicons color={colors.textMuted} name="trash-outline" size={18} />
            </Pressable>
          </View>
          <AppText>{note.text}</AppText>
        </Section>
      ))}
    </View>
  );
};
