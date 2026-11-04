import { SOURCE_LABELS, SOURCES } from "@ikuzo/anime/types";
import { router } from "expo-router";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { create } from "zustand";

import { openLink } from "@/lib/links";
import { openAnime } from "@/lib/nav";
import { useLibrary } from "@/lib/store";
import { colors, radius, spacing } from "@/lib/theme";

import { OptionsSheet } from "./options-sheet";
import { AppText } from "./text";

const REPOSITORY_URL = "https://github.com/Roronoa-Zoroo/ikuzo";

export const useSideMenu = create<{ open: boolean; setOpen: (open: boolean) => void }>()((set) => ({
  open: false,
  setOpen: (open) => {
    set({ open });
  },
}));

const styles = StyleSheet.create({
  header: { gap: spacing.sm, paddingBottom: spacing.lg, paddingHorizontal: spacing.xl },
  option: { alignItems: "center", borderRadius: radius.sm, flex: 1, paddingVertical: spacing.sm },
  optionActive: { backgroundColor: colors.accentMuted },
  switch: { backgroundColor: colors.card, borderRadius: radius.md, flexDirection: "row", padding: spacing.xs },
});

const pickRandomPlanned = () => {
  const planned = Object.values(useLibrary.getState().entries).filter((entry) => entry.status === "planned");
  const pick = planned[Math.floor(Math.random() * planned.length)];
  if (pick === undefined) {
    Alert.alert("Nothing planned yet", "Add shows to Plan to watch and Ikuzo will pick one for you.");
    return;
  }
  openAnime(pick.anime);
};

const SourceSwitch = () => {
  const source = useLibrary((state) => state.settings.source);
  const setSettings = useLibrary((state) => state.setSettings);
  return (
    <View style={styles.header}>
      <AppText variant="title">Ikuzo</AppText>
      <AppText variant="caption">Browse with</AppText>
      <View accessibilityRole="radiogroup" style={styles.switch}>
        {SOURCES.map((value) => (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: source === value }}
            key={value}
            onPress={() => {
              setSettings({ source: value });
            }}
            style={[styles.option, source === value ? styles.optionActive : null]}
          >
            <AppText color={source === value ? colors.text : colors.textMuted} variant="label">
              {SOURCE_LABELS[value]}
            </AppText>
          </Pressable>
        ))}
      </View>
    </View>
  );
};

export const SideMenu = () => {
  const open = useSideMenu((state) => state.open);
  const setOpen = useSideMenu((state) => state.setOpen);

  return (
    <OptionsSheet
      header={<SourceSwitch />}
      items={[
        {
          detail: "Shows and characters",
          icon: "heart",
          label: "Favorites",
          onPress: () => {
            router.push("/favorites");
          },
        },
        { detail: "From your plan to watch", icon: "shuffle", label: "Random anime", onPress: pickRandomPlanned },
        {
          icon: "thumbs-up-outline",
          label: "Recommendations",
          onPress: () => {
            router.push("/recommendations");
          },
        },
        {
          icon: "arrow-forward",
          label: "Continue watching",
          onPress: () => {
            router.push("/continue");
          },
        },
        {
          icon: "search",
          label: "Anime search",
          onPress: () => {
            router.push("/search");
          },
          separated: true,
        },
        {
          icon: "pricetags-outline",
          label: "Advanced search",
          onPress: () => {
            router.push({ params: { advanced: "1" }, pathname: "/search" });
          },
        },
        {
          icon: "calendar-outline",
          label: "Seasonal anime",
          onPress: () => {
            router.push("/seasonal");
          },
        },
        {
          icon: "logo-github",
          label: "Source code & feedback",
          onPress: () => {
            void openLink(REPOSITORY_URL);
          },
          separated: true,
        },
        {
          icon: "settings-outline",
          label: "Settings",
          onPress: () => {
            router.push("/settings");
          },
        },
      ]}
      onClose={() => {
        setOpen(false);
      }}
      side="left"
      visible={open}
    />
  );
};
