import { SOURCE_LABELS, SOURCES } from "@ikuzo/anime/types";
import * as Clipboard from "expo-clipboard";
import Constants from "expo-constants";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, ScrollView, Share, StyleSheet, Switch, View } from "react-native";

import { AccountsSection } from "@/components/accounts-section";
import { ChipRow } from "@/components/chips";
import type { ChipOption } from "@/components/chips";
import { Header } from "@/components/header";
import { Section } from "@/components/section";
import { AppText } from "@/components/text";
import { showToast } from "@/components/toast";
import { Touchable } from "@/components/touchable";
import { canUndoRestore, createBackup, parseBackup, previewRestore, restoreBackup, undoRestore } from "@/lib/backup";
import type { ParsedBackup, RestoreMode } from "@/lib/backup";
import { openLink } from "@/lib/links";
import { anidb } from "@/lib/sources";
import { library, useSettings } from "@/lib/store";
import type { TitleLanguage } from "@/lib/store";
import { colors, radius, spacing } from "@/lib/theme";

const LANGUAGES: ChipOption<TitleLanguage>[] = [
  { label: "Romaji", value: "romaji" },
  { label: "English", value: "english" },
];

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: spacing.md,
  },
  content: { gap: spacing.md, paddingVertical: spacing.md },
  danger: { borderColor: colors.danger },
  row: { alignItems: "center", flexDirection: "row", gap: spacing.md, justifyContent: "space-between" },
  rowText: { flex: 1, gap: 2 },
  screen: { backgroundColor: colors.background, flex: 1 },
});

const Row = ({ label, detail, children }: { label: string; detail?: string; children?: React.ReactNode }) => (
  <View style={styles.row}>
    <View style={styles.rowText}>
      <AppText variant="label">{label}</AppText>
      {detail === undefined ? null : <AppText variant="caption">{detail}</AppText>}
    </View>
    {children}
  </View>
);

const Button = ({
  label,
  onPress,
  tone = "default",
}: {
  label: string;
  onPress: () => void;
  tone?: "default" | "danger";
}) => (
  <Touchable
    accessibilityRole="button"
    onPress={onPress}
    style={[styles.button, tone === "danger" ? styles.danger : null]}
  >
    <AppText color={tone === "danger" ? colors.danger : colors.text} variant="label">
      {label}
    </AppText>
  </Touchable>
);

const exportBackup = async () => {
  const backup = JSON.stringify(createBackup());
  await Share.share({ message: backup, title: "Ikuzo backup" });
};

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? "" : "s"}`;

const runRestore = async (backup: ParsedBackup, mode: RestoreMode) => {
  try {
    await restoreBackup(backup, mode);
    showToast("Backup restored", {
      label: "Undo",
      onPress: () => {
        void undoRestore();
      },
    });
  } catch (error) {
    Alert.alert(
      "Restore failed",
      `${error instanceof Error ? error.message : String(error)}\n\nYour list was not changed.`
    );
  }
};

/**
 * Restores from the clipboard after showing exactly what will change. "Add & update" never
 * removes anything; "Replace" asks again when shows (and their notes) would be removed.
 * Nothing is deleted on AniList or MyAnimeList either way.
 */
const importFromClipboard = async () => {
  const backup = parseBackup(await Clipboard.getStringAsync());
  if (backup === undefined) {
    Alert.alert("No backup found", "Copy the text of an Ikuzo backup to the clipboard first.");
    return;
  }
  const preview = previewRestore(backup);
  const lines = [
    `The backup has ${plural(preview.shows, "show")}${backup.exportedAt === undefined ? "" : ` (${new Date(backup.exportedAt).toLocaleDateString()})`}.`,
    `${plural(preview.added, "show")} would be added and ${preview.changed} changed.`,
    preview.onlyHere > 0
      ? `${plural(preview.onlyHere, "show")} in your list are not in the backup: "Add & update" keeps them, "Replace" removes them.`
      : undefined,
    "Your AniList and MyAnimeList lists are not changed by a restore.",
  ].filter(Boolean);

  const confirmReplace = () => {
    if (preview.onlyHere === 0) {
      void runRestore(backup, "replace");
      return;
    }
    Alert.alert(
      `Remove ${plural(preview.onlyHere, "show")}?`,
      `They are not in the backup${preview.notesLost > 0 ? `, and ${plural(preview.notesLost, "note")} would be deleted with them` : ""}. You can undo this right after.`,
      [
        { style: "cancel", text: "Cancel" },
        {
          onPress: () => {
            void runRestore(backup, "replace");
          },
          style: "destructive",
          text: "Replace",
        },
      ]
    );
  };

  Alert.alert("Restore backup?", lines.join("\n\n"), [
    { style: "cancel", text: "Cancel" },
    {
      onPress: confirmReplace,
      style: "destructive",
      text: "Replace",
    },
    {
      onPress: () => {
        void runRestore(backup, "merge");
      },
      text: "Add & update",
    },
  ]);
};

const UndoRestoreButton = () => {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    const check = async () => {
      setAvailable(await canUndoRestore());
    };
    void check();
  }, []);
  const runUndo = async () => {
    const done = await undoRestore();
    setAvailable(false);
    showToast(done ? "Restore undone" : "Nothing to undo");
  };
  if (!available) {
    return null;
  }
  return (
    <Button
      label="Undo last restore"
      onPress={() => {
        Alert.alert("Undo last restore?", "Your list goes back to exactly how it was before the last restore.", [
          { style: "cancel", text: "Cancel" },
          {
            onPress: () => {
              void runUndo();
            },
            text: "Undo restore",
          },
        ]);
      }}
    />
  );
};

const SettingsScreen = () => {
  const settings = useSettings();
  const { setSettings } = library;

  return (
    <View style={styles.screen}>
      <Header
        leading={{
          icon: "arrow-back",
          label: "Back",
          onPress: () => {
            router.back();
          },
        }}
        title="Settings"
      />
      <ScrollView contentContainerStyle={styles.content}>
        <AccountsSection />

        <Section title="Data">
          <Row detail="Used for Discover, Search, Seasonal and Calendar" label="Browse with" />
          <ChipRow
            onToggle={(source) => {
              setSettings({ source });
            }}
            options={SOURCES.map((source) => ({ label: SOURCE_LABELS[source], value: source }))}
            selected={[settings.source]}
          />
          <Row
            detail={
              anidb === undefined
                ? "Off: set EXPO_PUBLIC_ANIDB_CLIENT to a registered AniDB client"
                : "On: episode titles load from AniDB"
            }
            label="AniDB episodes"
          />
        </Section>

        <Section title="Display">
          <Row label="Titles" />
          <ChipRow
            onToggle={(titleLanguage) => {
              setSettings({ titleLanguage });
            }}
            options={LANGUAGES}
            selected={[settings.titleLanguage]}
          />
          <Row detail="Only show shows that already started in Calendar → My shows" label="Hide not-yet-aired">
            <Switch
              onValueChange={(calendarHideUpcoming) => {
                setSettings({ calendarHideUpcoming });
              }}
              thumbColor={colors.text}
              trackColor={{ false: colors.border, true: colors.accent }}
              value={settings.calendarHideUpcoming}
            />
          </Row>
        </Section>

        <Section title="Backup">
          <AppText variant="caption">
            Your list lives on this device (and on AniList or MyAnimeList when connected). Export it now and then, or
            before switching phones.
          </AppText>
          <Button
            label="Export backup"
            onPress={() => {
              void exportBackup();
            }}
          />
          <Button
            label="Restore from clipboard"
            onPress={() => {
              void importFromClipboard();
            }}
            tone="danger"
          />
          <UndoRestoreButton />
        </Section>

        <Section title="About">
          <AppText variant="caption">
            Ikuzo {Constants.expoConfig?.version ?? ""} is free, open source and has no ads or tracking. Anime data
            comes from AniList, MyAnimeList (its official API, with Jikan for characters, reviews and songs) and AniDB.
            Ikuzo is not affiliated with any of them.
          </AppText>
          <Button
            label="Source code on GitHub"
            onPress={() => {
              void openLink("https://github.com/Roronoa-Zoroo/ikuzo");
            }}
          />
          <Button
            label="Jikan API"
            onPress={() => {
              void openLink("https://jikan.moe");
            }}
          />
        </Section>
      </ScrollView>
    </View>
  );
};

export default SettingsScreen;
