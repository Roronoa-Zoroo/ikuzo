import { parseJson } from "@ikuzo/anime/http";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";

import { ToastHost } from "@/components/toast";
import { useAccounts } from "@/lib/accounts";
import { whenLibraryReady } from "@/lib/db";
import { openAnime } from "@/lib/nav";
import { handleNotificationTaps, setupNotifications, syncReminders } from "@/lib/notifications";
import type { Reminder } from "@/lib/notifications";
import { queryClient, useLibraryAiring } from "@/lib/queries";
import { displayTitle, getEntry, useSettings } from "@/lib/store";
import { pullQuietly, startSyncWatcher, syncOnForeground } from "@/lib/sync";
import { colors } from "@/lib/theme";

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

const RootLayout = () => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const show = () => {
      setReady(true);
      void SplashScreen.hideAsync();
    };
    const load = async () => {
      try {
        await whenLibraryReady();
      } catch {
        // Even if loading fails the app opens (an empty library, not a frozen splash).
      }
      show();
    };
    void load();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {/* expo-status-bar takes a colour scheme name here, not a style object. */}
      {/* oxlint-disable-next-line react/style-prop-object */}
      <StatusBar style="light" />
      {ready ? (
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
          contentStyle: { backgroundColor: colors.background },
          headerShown: false,
        }}
      />
      <ToastHost />
    </QueryClientProvider>
  );
};

export default RootLayout;
