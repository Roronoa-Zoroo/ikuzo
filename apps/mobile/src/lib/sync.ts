import { aniListAuthorizeUrl, createAniListAccount, parseAniListRedirect } from "@ikuzo/anime/anilist-account";
import { AuthError } from "@ikuzo/anime/auth-error";
import { HttpError } from "@ikuzo/anime/errors";
import { completeIds } from "@ikuzo/anime/ids";
import {
  createMalAccount,
  exchangeMalCode,
  malAuthorizeUrl,
  parseMalRedirect,
  refreshMalSession,
} from "@ikuzo/anime/mal-account";
import type { TrackerAccount, TrackerId, TrackerSession } from "@ikuzo/anime/trackers";
import { TRACKER_LABELS } from "@ikuzo/anime/trackers";
import type { ExternalIds } from "@ikuzo/anime/types";
import { getRandomBytes } from "expo-crypto";
import * as WebBrowser from "expo-web-browser";

import { connectedTrackers, useAccounts } from "./accounts";
import type { SyncOp } from "./accounts";
import { clearSession, getSession, setSession } from "./secrets";
import { useLibrary } from "./store";
import type { LibraryEntry, MergeResult } from "./store";
import { ANILIST_CLIENT_ID, ANILIST_REDIRECT, MAL_CLIENT_ID, MAL_REDIRECT } from "./trackers-config";

const DAY_MS = 24 * 60 * 60 * 1000;
const FLUSH_DELAY_MS = 1500;
const VERIFIER_BYTES = 48;
const STATE_BYTES = 16;
const HEX = 16;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_CLIENT_ERROR = 400;
const HTTP_SERVER_ERROR = 500;
const HTTP_UNAUTHORIZED = 401;

/** True while list data from a service is written into the library, so it is not sent straight back. */
let applyingRemote = false;
let flushing = false;
let flushTimer: ReturnType<typeof setTimeout> | undefined;

const randomHex = (bytes: number): string =>
  Array.from(getRandomBytes(bytes), (byte) => byte.toString(HEX).padStart(2, "0")).join("");

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

// ── Sessions ────────────────────────────────────────────────────────────────

export class SignInRequiredError extends Error {
  constructor(tracker: TrackerId) {
    super(`Your ${TRACKER_LABELS[tracker]} sign-in expired. Connect the account again in Settings.`);
    this.name = "SignInRequiredError";
  }
}

const isAuthProblem = (error: unknown): boolean => error instanceof AuthError || error instanceof SignInRequiredError;

const liveSession = async (tracker: TrackerId): Promise<TrackerSession | undefined> => {
  const session = await getSession(tracker);
  if (session === undefined) {
    return undefined;
  }
  const expiresSoon = session.expiresAt - Date.now() < DAY_MS;
  if (!expiresSoon) {
    return session;
  }
  // MyAnimeList tokens last about a month and can be refreshed; AniList tokens last a year and cannot.
  if (tracker === "mal" && session.refreshToken !== undefined) {
    const refreshed = await refreshMalSession(MAL_CLIENT_ID, session.refreshToken);
    await setSession(tracker, refreshed);
    return refreshed;
  }
  return session.expiresAt > Date.now() ? session : undefined;
};

const accountFor = async (tracker: TrackerId): Promise<TrackerAccount> => {
  const session = await liveSession(tracker);
  if (session === undefined) {
    throw new SignInRequiredError(tracker);
  }
  return tracker === "anilist"
    ? createAniListAccount(session.accessToken)
    : createMalAccount(MAL_CLIENT_ID, session.accessToken);
};

/** The show's id on `tracker`, looked up through the cross-database map when the library doesn't know it. */
const remoteId = async (tracker: TrackerId, ids: ExternalIds): Promise<number | undefined> => {
  const known = tracker === "anilist" ? ids.anilist : ids.mal;
  if (known !== undefined) {
    return known;
  }
  const complete = await completeIds(ids);
  return tracker === "anilist" ? complete.anilist : complete.mal;
};

// ── Outgoing changes ────────────────────────────────────────────────────────

const opFor = (entry: LibraryEntry, targets: TrackerId[]): SyncOp => ({
  at: Date.now(),
  ids: entry.anime.ids,
  key: entry.key,
  kind: "save",
  targets,
  update: { progress: entry.progress, score: entry.score, status: entry.status },
});

/**
 * Keep the change for later on network trouble, rate limits and expired sign-ins
 * (it goes out once the user reconnects); drop it only when the service refuses it outright.
 */
const isRetryable = (error: unknown): boolean => {
  if (error instanceof SignInRequiredError || error instanceof AuthError) {
    return true;
  }
  if (error instanceof HttpError) {
    return (
      error.status === HTTP_TOO_MANY_REQUESTS ||
      error.status === HTTP_UNAUTHORIZED ||
      error.status >= HTTP_SERVER_ERROR ||
      error.status < HTTP_CLIENT_ERROR
    );
  }
  return true;
};

const sendOp = async (op: SyncOp, tracker: TrackerId): Promise<void> => {
  const id = await remoteId(tracker, op.ids);
  if (id === undefined) {
    // The show doesn't exist on this service; nothing to send.
    return;
  }
  const account = await accountFor(tracker);
  if (op.kind === "remove") {
    await account.remove(id);
  } else if (op.update !== undefined) {
    await account.save(id, op.update);
  }
};

/** Sends queued changes. Stops at the first network error and keeps the rest for next time. */
export const flush = async (): Promise<void> => {
  if (flushing) {
    return;
  }
  flushing = true;
  const { setQueue, setStatus } = useAccounts.getState();
  const connected = new Set(connectedTrackers());
  let lastError: string | undefined;
  try {
    for (const op of useAccounts.getState().queue) {
      const remaining: TrackerId[] = [];
      let offline = false;
      for (const tracker of op.targets) {
        if (!connected.has(tracker) || offline) {
          if (offline) {
            remaining.push(tracker);
          }
          continue;
        }
        try {
          // Changes go out one at a time and in order, so the service ends up with the latest one.
          // oxlint-disable-next-line no-await-in-loop
          await sendOp(op, tracker);
        } catch (error) {
          if (isAuthProblem(error)) {
            useAccounts.getState().setNeedsSignIn(tracker, true);
            lastError = errorMessage(error);
          } else {
            lastError = `${TRACKER_LABELS[tracker]}: ${errorMessage(error)}`;
          }
          if (isRetryable(error)) {
            remaining.push(tracker);
            offline = true;
          }
        }
      }
      const latest = useAccounts.getState().queue;
      // A newer change to the same show may have been queued while this one was being sent.
      const replaced = latest.find((item) => item.key === op.key && item.at !== op.at);
      const rest = latest.filter((item) => item.key !== op.key);
      setQueue(
        replaced === undefined
          ? [...rest, ...(remaining.length > 0 ? [{ ...op, targets: remaining }] : [])]
          : [...rest, replaced]
      );
      if (offline) {
        break;
      }
    }
  } finally {
    flushing = false;
    // Only report problems here; pull() clears old errors when a new sync starts.
    if (lastError !== undefined) {
      setStatus({ lastError });
    }
  }
};

const scheduleFlush = () => {
  if (flushTimer !== undefined) {
    clearTimeout(flushTimer);
  }
  flushTimer = setTimeout(() => {
    flushTimer = undefined;
    void flush();
  }, FLUSH_DELAY_MS);
};

const changed = (a: LibraryEntry, b: LibraryEntry): boolean =>
  a.status !== b.status || a.progress !== b.progress || a.score !== b.score;

/** Watches the library and queues every status, progress, score or removal change for connected services. */
export const startSyncWatcher = (): (() => void) =>
  useLibrary.subscribe((state, previous) => {
    if (applyingRemote || state.entries === previous.entries) {
      return;
    }
    const targets = connectedTrackers();
    if (targets.length === 0) {
      return;
    }
    const { enqueue } = useAccounts.getState();
    let queued = false;
    for (const entry of Object.values(state.entries)) {
      const before = previous.entries[entry.key];
      if (before === undefined || changed(before, entry)) {
        enqueue(opFor(entry, targets));
        queued = true;
      }
    }
    for (const before of Object.values(previous.entries)) {
      if (state.entries[before.key] === undefined) {
        enqueue({ at: Date.now(), ids: before.anime.ids, key: before.key, kind: "remove", targets });
        queued = true;
      }
    }
    if (queued) {
      scheduleFlush();
    }
  });

/** Resolves once both persisted stores have loaded, so loading saved data is not mistaken for new changes. */
export const whenHydrated = async (): Promise<void> => {
  const stores = [useLibrary.persist, useAccounts.persist];
  await Promise.all(
    stores.map(async (store) => {
      if (store.hasHydrated()) {
        return;
      }
      // oxlint-disable-next-line promise/avoid-new
      await new Promise<void>((resolve) => {
        const unsubscribe = store.onFinishHydration(() => {
          unsubscribe();
          resolve();
        });
      });
    })
  );
};

// ── Incoming lists ──────────────────────────────────────────────────────────

const applyRemote = (remote: Awaited<ReturnType<TrackerAccount["list"]>>): MergeResult => {
  applyingRemote = true;
  try {
    return useLibrary.getState().mergeRemote(remote);
  } finally {
    applyingRemote = false;
  }
};

export interface PullSummary {
  added: number;
  updated: number;
  sent: number;
}

/** Downloads the lists of the connected accounts, merges them, then sends anything newer in Ikuzo. */
export const pull = async (trackers: TrackerId[] = connectedTrackers()): Promise<PullSummary> => {
  const { enqueue, setStatus } = useAccounts.getState();
  const summary: PullSummary = { added: 0, sent: 0, updated: 0 };
  let synced = 0;
  if (trackers.length === 0) {
    return summary;
  }
  setStatus({ lastError: undefined, syncing: true });
  try {
    for (const tracker of trackers) {
      let result: MergeResult;
      try {
        // oxlint-disable-next-line no-await-in-loop
        const account = await accountFor(tracker);
        // oxlint-disable-next-line no-await-in-loop
        result = applyRemote(await account.list());
      } catch (error) {
        if (!isAuthProblem(error)) {
          throw error;
        }
        // Keep going with the other account; this one waits for the user to reconnect.
        useAccounts.getState().setNeedsSignIn(tracker, true);
        setStatus({ lastError: errorMessage(error) });
        continue;
      }
      useAccounts.getState().setNeedsSignIn(tracker, false);
      synced += 1;
      summary.added += result.added;
      summary.updated += result.updated;
      const { entries } = useLibrary.getState();
      for (const key of result.localNewer) {
        const entry = entries[key];
        if (entry !== undefined) {
          enqueue(opFor(entry, [tracker]));
          summary.sent += 1;
        }
      }
    }
    await flush();
    if (synced > 0) {
      setStatus({ lastSyncAt: Date.now() });
    }
    return summary;
  } catch (error) {
    setStatus({ lastError: errorMessage(error) });
    throw error;
  } finally {
    setStatus({ syncing: false });
  }
};

/** Background sync (app start, pull-to-refresh): failures are already recorded for Settings to show. */
export const pullQuietly = async (): Promise<void> => {
  try {
    await pull();
  } catch {
    // pull() stored the error in the accounts store.
  }
};

/** Reads someone's public list without signing in and merges it into the library (nothing is sent back). */
export const importPublicList = async (tracker: TrackerId, userName: string): Promise<MergeResult> => {
  const account = tracker === "anilist" ? createAniListAccount() : createMalAccount(MAL_CLIENT_ID);
  return applyRemote(await account.list(userName.trim()));
};

// ── Connecting accounts ─────────────────────────────────────────────────────

const signInAniList = async (): Promise<TrackerSession | undefined> => {
  const result = await WebBrowser.openAuthSessionAsync(aniListAuthorizeUrl(ANILIST_CLIENT_ID), ANILIST_REDIRECT);
  return result.type === "success" ? parseAniListRedirect(result.url) : undefined;
};

const signInMal = async (): Promise<TrackerSession | undefined> => {
  const codeVerifier = randomHex(VERIFIER_BYTES);
  const state = randomHex(STATE_BYTES);
  const request = { clientId: MAL_CLIENT_ID, codeVerifier, redirectUri: MAL_REDIRECT };
  const result = await WebBrowser.openAuthSessionAsync(malAuthorizeUrl({ ...request, state }), MAL_REDIRECT);
  if (result.type !== "success") {
    return undefined;
  }
  return await exchangeMalCode({ ...request, code: parseMalRedirect(result.url, state) });
};

/**
 * Signs in, then merges the account's list into the library. Returns false when
 * the user closed the sign-in page.
 */
export const connect = async (tracker: TrackerId): Promise<PullSummary | false> => {
  const session = tracker === "anilist" ? await signInAniList() : await signInMal();
  if (session === undefined) {
    return false;
  }
  await setSession(tracker, session);
  const account =
    tracker === "anilist"
      ? createAniListAccount(session.accessToken)
      : createMalAccount(MAL_CLIENT_ID, session.accessToken);
  const { setNeedsSignIn, setProfile, setStatus } = useAccounts.getState();
  setProfile(tracker, await account.profile());
  setNeedsSignIn(tracker, false);
  setStatus({ lastError: undefined });
  return await pull([tracker]);
};

export const disconnect = async (tracker: TrackerId): Promise<void> => {
  await clearSession(tracker);
  const { queue, setProfile, setQueue } = useAccounts.getState();
  setProfile(tracker, undefined);
  setQueue(
    queue
      .map((op) => ({ ...op, targets: op.targets.filter((target) => target !== tracker) }))
      .filter((op) => op.targets.length > 0)
  );
};
