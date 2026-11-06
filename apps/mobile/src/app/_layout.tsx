import { parseJson } from "@ikuzo/anime/http";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect, useMemo, useState } from "react";
import { AppState, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { showToast, ToastHost } from "@/components/toast";
import { useAccounts } from "@/lib/accounts";
import { whenLibraryReady } from "@/lib/db";
import { openAnime } from "@/lib/nav";
import { handleNotificationTaps, setupNotifications, syncReminders } from "@/lib/notifications";
import type { Reminder } from "@/lib/notifications";
import { persistOptions, queryClient, useLibraryAiring } from "@/lib/queries";
import { displayTitle, getEntry, useSettings } from "@/lib/store";
import { pullQuietly, startSyncWatcher, syncOnForeground } from "@/lib/sync";
import { colors } from "@/lib/theme";

const styles = StyleSheet.create({ root: { backgroundColor: colors.background, flex: 1 } });

/** Shows the error and a retry button instead of closing the app when a screen throws. */
export { ErrorBoundary } from "expo-router";

// The splash stays up until the library has loaded from disk.
void SplashScreen.preventAutoHideAsync();

/** Keeps scheduled episode notifications in sync with the library. */
const ReminderSync = () => {
  const airing = useLibraryAiring();
  const language = useSettings().titleLanguage;

  // A string, so +1 episode or a score change (which do not change reminders) do not
  // reschedule every notification: the effect only runs when the reminders themselves change.
  const payload = useMemo(
    () =>
      airing.data === undefined
        ? undefined
        : JSON.stringify(
            airing.data
              .filter((item) => item.entry.notify)
              .map((item): Reminder => ({
                airingAt: item.airingAt,
                episode: item.episode,
                key: item.entry.key,
                title: displayTitle(item.entry.anime, language),
                total: item.entry.anime.episodes,
              }))
          ),
    [airing.data, language]
  );

  useEffect(() => {
    void setupNotifications();
    void SystemUI.setBackgroundColorAsync(colors.background);
  }, []);

  useEffect(() => {
    if (payload !== undefined) {
      void syncReminders(parseJson<Reminder[]>(payload));
    }
  }, [payload]);

  return null;
};

/** Tapping "Episode 5 is out now" opens that anime. */
const NotificationTaps = () => {
  useEffect(
    () =>
      handleNotificationTaps((key) => {
        const entry = getEntry(key);
        if (entry !== undefined) {
          openAnime(entry.anime);
        }
      }),
    []
  );
  return null;
};

/** Two-way sync with connected AniList / MyAnimeList accounts. */
const TrackerSync = () => {
  useEffect(() => {
    const stopWatcher = startSyncWatcher();
    let cancelled = false;
    const start = async () => {
      // The accounts store must be loaded before its queue and sign-ins are read.
      if (!useAccounts.persist.hasHydrated()) {
        // oxlint-disable-next-line promise/avoid-new
        await new Promise<void>((resolve) => {
          const unsubscribe = useAccounts.persist.onFinishHydration(() => {
            unsubscribe();
            resolve();
          });
        });
      }
      if (!cancelled) {
        // Errors are recorded in the accounts store and shown in Settings.
        await pullQuietly();
      }
    };
    void start();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        syncOnForeground();
      }
    });
    return () => {
      cancelled = true;
      stopWatcher();
      subscription.remove();
    };
  }, []);
  return null;
};

type LoadState = "loading" | "ready" | "failed";

const RootLayout = () => {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
    const load = async () => {
      let next: LoadState = "ready";
      try {
        await whenLibraryReady();
      } catch {
        next = "failed";
      }
      setState(next);
      void SplashScreen.hideAsync();
      if (next === "failed") {
        // Without its library the app must not sync (a pull would see an empty list) or touch reminders.
        showToast("Your list could not be loaded. Restart Ikuzo; nothing was synced or changed.");
      }
    };
    void load();
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
        {/* expo-status-bar takes a colour scheme name here, not a style object. */}
        {/* oxlint-disable-next-line react/style-prop-object */}
        <StatusBar style="light" />
        {state === "ready" ? (
          <>
            <ReminderSync />
            <TrackerSync />
            <NotificationTaps />
          </>
        ) : null}
        <Stack
          screenOptions={{
            // Android's own screen transition, as anYme's activities used.
            animation: "default",
            // Android draws edge to edge: this keeps every screen (the tab bar, the last row of a
            // list) above the phone's navigation bar instead of under it.
            contentStyle: { backgroundColor: colors.background, paddingBottom: insets.bottom },
            headerShown: false,
          }}
        />
        <ToastHost />
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  );
};

export default RootLayout;
