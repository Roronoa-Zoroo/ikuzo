import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect } from "react";

import { setupNotifications, syncReminders } from "@/lib/notifications";
import { queryClient, useLibraryAiring } from "@/lib/queries";
import { useLibrary } from "@/lib/store";
import { colors } from "@/lib/theme";

/** Keeps scheduled episode notifications in sync with the library. */
const ReminderSync = () => {
  const airing = useLibraryAiring();
  const language = useLibrary((state) => state.settings.titleLanguage);

  useEffect(() => {
    void setupNotifications();
    void SystemUI.setBackgroundColorAsync(colors.background);
  }, []);

  useEffect(() => {
    if (airing.data !== undefined) {
      void syncReminders(airing.data, language);
    }
  }, [airing.data, language]);

  return null;
};

const RootLayout = () => (
  <QueryClientProvider client={queryClient}>
    {/* expo-status-bar takes a colour scheme name here, not a style object. */}
    {/* oxlint-disable-next-line react/style-prop-object */}
    <StatusBar style="light" />
    <ReminderSync />
    <Stack
      screenOptions={{
        animation: "slide_from_right",
        contentStyle: { backgroundColor: colors.background },
        headerShown: false,
      }}
    />
  </QueryClientProvider>
);

export default RootLayout;
