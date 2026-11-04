import type { TrackerId, TrackerSession } from "@ikuzo/anime/trackers";

import { parseSession } from "./session";

/** Browsers have no keychain; the web build keeps tokens in localStorage. */
const keyFor = (tracker: TrackerId): string => `ikuzo.session.${tracker}`;

export const getSession = async (tracker: TrackerId): Promise<TrackerSession | undefined> => {
  await Promise.resolve();
  return parseSession(globalThis.localStorage.getItem(keyFor(tracker)));
};

export const setSession = async (tracker: TrackerId, session: TrackerSession): Promise<void> => {
  await Promise.resolve();
  globalThis.localStorage.setItem(keyFor(tracker), JSON.stringify(session));
};

export const clearSession = async (tracker: TrackerId): Promise<void> => {
  await Promise.resolve();
  globalThis.localStorage.removeItem(keyFor(tracker));
};
