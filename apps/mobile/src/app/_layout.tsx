import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect } from "react";
import { AppState } from "react-native";

import { ToastHost } from "@/components/toast";
import { setupNotifications, syncReminders } from "@/lib/notifications";
import { queryClient, useLibraryAiring } from "@/lib/queries";
import { useLibrary } from "@/lib/store";
import { flush, pullQuietly, startSyncWatcher, whenHydrated } from "@/lib/sync";
import { colors } from "@/lib/theme";

/** Shows the error and a retry button instead of closing the app when a screen throws. */
export { ErrorBoundary } from "expo-router";

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

/** Two-way sync with connected AniList / MyAnimeList accounts. */
const TrackerSync = () => {
  useEffect(() => {
    let stopWatcher: (() => void) | undefined;
    let cancelled = false;
    const start = async () => {
      await whenHydrated();
      if (cancelled) {
        return;
      }
      stopWatcher = startSyncWatcher();
      // Errors are recorded in the accounts store and shown in Settings.
      await pullQuietly();
    };
    void start();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void flush();
      }
    });
    return () => {
      cancelled = true;
      stopWatcher?.();
      subscription.remove();
    };
  }, []);
  return null;
};

const RootLayout = () => (
  <QueryClientProvider client={queryClient}>
    {/* expo-status-bar takes a colour scheme name here, not a style object. */}
    {/* oxlint-disable-next-line react/style-prop-object */}
    <StatusBar style="light" />
    <ReminderSync />
    <TrackerSync />
    <Stack
      screenOptions={{
        // Android's own screen transition, as anYme's activities used.
        animation: "default",
        contentStyle: { backgroundColor: colors.background },
        headerShown: false,
      }}
    />
    <ToastHost />
  </QueryClientProvider>
);

export default RootLayout;
