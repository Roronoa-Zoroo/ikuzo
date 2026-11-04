import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

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

/** One show to remind about, reduced to what a notification needs. */
export interface Reminder {
  key: string;
  title: string;
  airingAt: number;
  episode: number;
  /** Total episodes, when known. */
  total: number | null;
}

/** Replaces every episode reminder with fresh ones for shows the user wants notifications for. */
export const syncReminders = async (reminders: Reminder[]): Promise<void> => {
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

  if (reminders.length === 0) {
    return;
  }
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) {
    return;
  }

  const now = Date.now();
  const requests = reminders.flatMap((item) =>
    Array.from({ length: EPISODES_AHEAD }, (_, offset) => ({
      at: item.airingAt + offset * WEEK_MS,
      episode: item.episode + offset,
      item,
    })).filter(({ at, episode }) => at > now && (item.total === null || episode <= item.total))
  );

  await Promise.all(
    requests.map(async ({ at, episode, item }) => {
      await Notifications.scheduleNotificationAsync({
        content: {
          body: `Episode ${episode} is out now`,
          data: { key: item.key, kind: KIND },
          title: item.title,
        },
        trigger: { channelId: CHANNEL_ID, date: at, type: Notifications.SchedulableTriggerInputTypes.DATE },
      });
    })
  );
};

/**
 * Opens the anime of a tapped episode notification: one that launched the app, and any tapped
 * while it runs. Returns the cleanup for the listener.
 */
export const handleNotificationTaps = (open: (key: string) => void): (() => void) => {
  if (Platform.OS === "web") {
    return () => {
      // Web has no scheduled notifications to tap.
    };
  }
  const handle = (response: Notifications.NotificationResponse | null) => {
    const data = response?.notification.request.content.data;
    if (
      response?.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER &&
      data?.kind === KIND &&
      typeof data.key === "string"
    ) {
      open(data.key);
      // Handled once: not again on the next launch.
      Notifications.clearLastNotificationResponse();
    }
  };
  handle(Notifications.getLastNotificationResponse());
  const subscription = Notifications.addNotificationResponseReceivedListener(handle);
  return () => {
    subscription.remove();
  };
};
