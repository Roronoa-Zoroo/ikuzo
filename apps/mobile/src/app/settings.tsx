import { SOURCE_LABELS, SOURCES } from "@ikuzo/anime/types";
import * as Clipboard from "expo-clipboard";
import Constants from "expo-constants";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Switch, View } from "react-native";

import { AccountsSection } from "@/components/accounts-section";
import { ChipRow } from "@/components/chips";
import type { ChipOption } from "@/components/chips";
import { Header } from "@/components/header";
import { Section } from "@/components/section";
import { AppText } from "@/components/text";
import { showToast } from "@/components/toast";
import { Touchable } from "@/components/touchable";
import { connectedTrackers } from "@/lib/accounts";
import { createBackup, parseBackup, previewRestore, restoreBackup, undoableRestoreAt, undoRestore } from "@/lib/backup";
import type { ParsedBackup, RestoreMode, RestorePreview } from "@/lib/backup";
import { pickBackupFile, shareBackupFile } from "@/lib/backup-file";
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

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const exportBackup = async () => {
  try {
    await shareBackupFile(JSON.stringify(createBackup()));
  } catch (error) {
    Alert.alert("Export failed", errorText(error));
  }
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
    Alert.alert("Restore failed", `${errorText(error)}\n\nYour list was not changed.`);
  }
};

/** What a restore will do, in plain words, before anything changes. */
const describeRestore = (backup: ParsedBackup, preview: RestorePreview, synced: boolean): string =>
  [
    `The backup has ${plural(preview.shows, "show")}${
      backup.exportedAt === undefined ? "" : ` (saved ${new Date(backup.exportedAt).toLocaleDateString()})`
    }.`,
    `"Add & update" adds ${plural(preview.added, "show")} and updates ${preview.changed} with newer copies from the backup.${
      preview.newerHere > 0 ? ` ${plural(preview.newerHere, "show")} you changed since then stay as they are.` : ""
    }`,
    preview.onlyHere > 0 || preview.newerHere > 0
      ? `"Replace" makes your list exactly like the backup${
          preview.onlyHere > 0 ? `, removing ${plural(preview.onlyHere, "show")} that are not in it` : ""
        }.`
      : undefined,
    synced
      ? "Nothing is deleted on AniList or MyAnimeList. The next sync keeps the newest copy of each show: removed shows that are on your accounts come back, and restored shows missing there are added to them (you are asked first when there are many)."
      : undefined,
    "You can undo the restore for a day.",
  ]
    .filter(Boolean)
    .join("\n\n");

/**
 * Restores after showing exactly what will change. "Add & update" never removes anything or
 * overwrites newer changes; "Replace" asks again when shows (and their notes) would be removed.
 */
const confirmRestore = (text: string) => {
  const backup = parseBackup(text);
  if (backup === undefined) {
    Alert.alert("Not an Ikuzo backup", "Pick a backup file exported from Ikuzo, or copy the text of one.");
    return;
  }
  const preview = previewRestore(backup);
  const confirmReplace = () => {
    if (preview.onlyHere === 0) {
      void runRestore(backup, "replace");
      return;
    }
    Alert.alert(
      `Remove ${plural(preview.onlyHere, "show")}?`,
      `They are not in the backup${
        preview.notesLost > 0 ? `, and ${plural(preview.notesLost, "note")} would be deleted with them` : ""
      }. You can undo this for a day.`,
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
  Alert.alert("Restore backup?", describeRestore(backup, preview, connectedTrackers().length > 0), [
    { style: "cancel", text: "Cancel" },
    { onPress: confirmReplace, style: "destructive", text: "Replace" },
    {
      onPress: () => {
        void runRestore(backup, "merge");
      },
      text: "Add & update",
    },
  ]);
};

const restoreFromFile = async () => {
  try {
    const text = await pickBackupFile();
    if (text !== undefined) {
      confirmRestore(text);
    }
  } catch (error) {
    Alert.alert("Could not open the file", errorText(error));
  }
};

const restoreFromClipboard = async () => {
  confirmRestore(await Clipboard.getStringAsync());
};

const UndoRestoreButton = () => {
  const [restoredAt, setRestoredAt] = useState<number | undefined>();
  useEffect(() => {
    const check = async () => {
      setRestoredAt(await undoableRestoreAt());
    };
    void check();
  }, []);
  if (restoredAt === undefined) {
    return null;
  }
  const when = new Date(restoredAt).toLocaleString();
  const runUndo = async () => {
    const done = await undoRestore();
    setRestoredAt(undefined);
    showToast(done ? "Restore undone" : "Nothing to undo");
  };
  return (
    <Button
      label="Undo last restore"
      onPress={() => {
        Alert.alert(
          "Undo last restore?",
          `Your list goes back to exactly how it was before the restore on ${when}. Changes made since then are lost.`,
          [
            { style: "cancel", text: "Cancel" },
            {
              onPress: () => {
                void runUndo();
              },
              style: "destructive",
              text: "Undo restore",
            },
          ]
        );
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
            label="Export backup file"
            onPress={() => {
              void exportBackup();
            }}
          />
          <Button
            label="Restore from file"
            onPress={() => {
              void restoreFromFile();
            }}
            tone="danger"
          />
          <Button
            label="Restore from clipboard"
            onPress={() => {
              void restoreFromClipboard();
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
