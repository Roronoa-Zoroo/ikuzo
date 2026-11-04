import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import type { Airing } from "./queries";
import { displayTitle } from "./store";
import type { TitleLanguage } from "./store";

const CHANNEL_ID = "episodes";
const KIND = "episode-reminder";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** Schedule the next episode and the one after, in case the app is not opened for a while. */
const EPISODES_AHEAD = 2;

export const setupNotifications = async (): Promise<void> => {
  if (Platform.OS === "web") {
    return;
  }
  Notifications.setNotificationHandler({
    handleNotification: async () => {
      await Promise.resolve();
      return { shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true };
    },
  });
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      importance: Notifications.AndroidImportance.DEFAULT,
      name: "New episodes",
    });
  }
};

export const ensurePermission = async (): Promise<boolean> => {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) {
    return true;
  }
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
};

/** Replaces every episode reminder with fresh ones for shows the user wants notifications for. */
export const syncReminders = async (airing: Airing[], language: TitleLanguage): Promise<void> => {
  // Scheduled local notifications only exist on iOS and Android.
  if (Platform.OS === "web") {
    return;
  }
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((request) => request.content.data?.kind === KIND)
      .map(async (request) => {
        await Notifications.cancelScheduledNotificationAsync(request.identifier);
      })
  );

  const wanted = airing.filter((item) => item.entry.notify);
  if (wanted.length === 0) {
    return;
  }
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) {
    return;
  }

  const now = Date.now();
  const requests = wanted.flatMap((item) => {
    const total = item.entry.anime.episodes;
    return Array.from({ length: EPISODES_AHEAD }, (_, offset) => ({
      at: item.airingAt + offset * WEEK_MS,
      episode: item.episode + offset,
      item,
    })).filter(({ at, episode }) => at > now && (total === null || episode <= total));
  });

  await Promise.all(
    requests.map(async ({ at, episode, item }) => {
      await Notifications.scheduleNotificationAsync({
        content: {
          body: `Episode ${episode} is out now`,
          data: { key: item.entry.key, kind: KIND },
          title: displayTitle(item.entry.anime, language),
        },
        trigger: { channelId: CHANNEL_ID, date: at, type: Notifications.SchedulableTriggerInputTypes.DATE },
      });
    })
  );
};
