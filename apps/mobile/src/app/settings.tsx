import { SOURCE_LABELS, SOURCES } from "@ikuzo/anime/types";
import * as Clipboard from "expo-clipboard";
import Constants from "expo-constants";
import { router } from "expo-router";
import { Alert, Pressable, ScrollView, Share, StyleSheet, Switch, View } from "react-native";

import { AccountsSection } from "@/components/accounts-section";
import { ChipRow } from "@/components/chips";
import type { ChipOption } from "@/components/chips";
import { Header } from "@/components/header";
import { Section } from "@/components/section";
import { AppText } from "@/components/text";
import { openLink } from "@/lib/links";
import { anidb } from "@/lib/sources";
import { createBackup, isBackup, useLibrary } from "@/lib/store";
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
  <Pressable
    accessibilityRole="button"
    onPress={onPress}
    style={[styles.button, tone === "danger" ? styles.danger : null]}
  >
    <AppText color={tone === "danger" ? colors.danger : colors.text} variant="label">
      {label}
    </AppText>
  </Pressable>
);

const exportBackup = async () => {
  const backup = JSON.stringify(createBackup(useLibrary.getState()));
  await Share.share({ message: backup, title: "Ikuzo backup" });
};

const importFromClipboard = async () => {
  const text = await Clipboard.getStringAsync();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = undefined;
  }
  if (!isBackup(parsed)) {
    Alert.alert("No backup found", "Copy the text of an Ikuzo backup to the clipboard first.");
    return;
  }
  const count = Object.keys(parsed.entries).length;
  Alert.alert("Restore backup?", `This replaces your current list with ${count} shows from the backup.`, [
    { style: "cancel", text: "Cancel" },
    {
      onPress: () => {
        useLibrary.getState().importBackup(parsed);
      },
      style: "destructive",
      text: "Restore",
    },
  ]);
};

const SettingsScreen = () => {
  const settings = useLibrary((state) => state.settings);
  const setSettings = useLibrary((state) => state.setSettings);

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
            Your list lives only on this device. Export it now and then, or before switching phones.
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
        </Section>

        <Section title="About">
          <AppText variant="caption">
            Ikuzo {Constants.expoConfig?.version ?? ""} is free, open source and has no ads, accounts or tracking. Anime
            data comes from AniList, MyAnimeList (through the Jikan API) and AniDB. Ikuzo is not affiliated with any of
            them.
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
