import type { TrackerId, TrackerSession } from "@ikuzo/anime/trackers";
import * as SecureStore from "expo-secure-store";

import { parseSession } from "./session";

/** Sign-in tokens live in the Android Keystore / iOS Keychain, never in the library store. */
const keyFor = (tracker: TrackerId): string => `ikuzo.session.${tracker}`;

export const getSession = async (tracker: TrackerId): Promise<TrackerSession | undefined> =>
  parseSession(await SecureStore.getItemAsync(keyFor(tracker)));

export const setSession = async (tracker: TrackerId, session: TrackerSession): Promise<void> => {
  await SecureStore.setItemAsync(keyFor(tracker), JSON.stringify(session));
};

export const clearSession = async (tracker: TrackerId): Promise<void> => {
  await SecureStore.deleteItemAsync(keyFor(tracker));
};
