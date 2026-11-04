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
import { planSync } from "@ikuzo/anime/sync-plan";
import { holdBulkRemovals as holdRemovals } from "@ikuzo/anime/sync-queue";
import type { TrackerAccount, TrackerId, TrackerSession, RemoteEntry } from "@ikuzo/anime/trackers";
import { TRACKER_LABELS } from "@ikuzo/anime/trackers";
import type { ExternalIds } from "@ikuzo/anime/types";
import { getRandomBytes } from "expo-crypto";
import * as WebBrowser from "expo-web-browser";

import { connectedTrackers, useAccounts } from "./accounts";
import type { HoldReason, SyncOp } from "./accounts";
import { onLibraryChange } from "./library-events";
import type { LibraryChange } from "./library-events";
import type { LibraryEntry } from "./library-types";
import { clearSession, getSession, setSession } from "./secrets";
import { getEntries, getEntry, library } from "./store";
import { ANILIST_CLIENT_ID, ANILIST_REDIRECT, MAL_CLIENT_ID, MAL_REDIRECT } from "./trackers-config";

const DAY_MS = 24 * 60 * 60 * 1000;
const FLUSH_DELAY_MS = 1500;
/** Removals wait this long before they are sent, so Undo can still cancel them. */
export const UNDO_WINDOW_MS = 10_000;
/** More removals than this for one service at once are held until the user confirms them. */
const BULK_REMOVE_LIMIT = 5;
/** More shows than this to add to a service at once (connecting to a big list) need the user's OK. */
const BULK_ADD_LIMIT = 5;
const RETRY_BASE_MS = 30_000;
const RETRY_MAX_MS = 15 * 60 * 1000;
/** Coming back to the app syncs again when the last sync is older than this. */
export const FOREGROUND_SYNC_AFTER_MS = 15 * 60 * 1000;
const VERIFIER_BYTES = 48;
const STATE_BYTES = 16;
const HEX = 16;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_CLIENT_ERROR = 400;
const HTTP_SERVER_ERROR = 500;
const HTTP_UNAUTHORIZED = 401;

let flushing = false;
let flushAgain = false;
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let failures = 0;

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

/** One renewal at a time: MyAnimeList issues a new refresh token each time and the old one stops working. */
let malRefresh: Promise<TrackerSession> | undefined;

const refreshMal = async (refreshToken: string): Promise<TrackerSession> => {
  malRefresh ??= (async () => {
    try {
      const refreshed = await refreshMalSession(MAL_CLIENT_ID, refreshToken);
      await setSession("mal", refreshed);
      return refreshed;
    } finally {
      malRefresh = undefined;
    }
  })();
  return await malRefresh;
};

const liveSession = async (tracker: TrackerId): Promise<TrackerSession | undefined> => {
  const session = await getSession(tracker);
  if (session === undefined) {
    return undefined;
  }
  if (session.expiresAt - Date.now() >= DAY_MS) {
    return session;
  }
  // MyAnimeList tokens last about a month and can be renewed; AniList tokens last a year and cannot.
  if (tracker === "mal" && session.refreshToken !== undefined) {
    return await refreshMal(session.refreshToken);
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

/**
 * Keep the change for later on network trouble, rate limits and expired sign-ins
 * (it goes out once the user reconnects); drop it only when the service refuses it outright.
 */
const isRetryable = (error: unknown): boolean => {
  if (isAuthProblem(error)) {
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

/** Sends one op. Returns false when the show does not exist on that service. */
const sendOp = async (op: SyncOp): Promise<boolean> => {
  const id = await remoteId(op.tracker, op.ids);
  if (id === undefined) {
    return false;
  }
  const account = await accountFor(op.tracker);
  await (op.kind === "remove" ? account.remove(id) : account.save(id, op.change ?? {}));
  return true;
};

const scheduleFlush = (delay: number): void => {
  if (flushTimer !== undefined) {
    clearTimeout(flushTimer);
  }
  flushTimer = setTimeout(() => {
    flushTimer = undefined;
    // flush() and scheduleFlush() call each other (retries), so one has to come first.
    // oxlint-disable-next-line no-use-before-define
    void flush();
  }, delay);
};

/**
 * Holds removals when there are suspiciously many for one service at once, so a mistake
 * (or a bug) can never empty someone's AniList or MyAnimeList without them confirming it.
 */
const holdBulkRemovals = (): void => {
  useAccounts.getState().setQueue((queue) => holdRemovals(queue, BULK_REMOVE_LIMIT));
};

const removeOp = (op: SyncOp): void => {
  useAccounts
    .getState()
    .setQueue((queue) =>
      queue.filter((item) => !(item.key === op.key && item.tracker === op.tracker && item.at === op.at))
    );
};

/** Sends queued changes that are due. A failing service is skipped until the retry; others carry on. */
export const flush = async (): Promise<void> => {
  if (flushing) {
    flushAgain = true;
    return;
  }
  flushing = true;
  const { setNeedsSignIn, setStatus } = useAccounts.getState();
  let lastError: string | undefined;
  let nextDue: number | undefined;
  let retry = false;
  try {
    holdBulkRemovals();
    const connected = new Set(connectedTrackers());
    const blocked = new Set<TrackerId>(useAccounts.getState().needsSignIn);
    const now = Date.now();
    for (const op of useAccounts.getState().queue.toSorted((a, b) => a.at - b.at)) {
      if (op.held !== undefined || !connected.has(op.tracker) || blocked.has(op.tracker)) {
        continue;
      }
      if (op.notBefore !== undefined && op.notBefore > now) {
        nextDue = Math.min(nextDue ?? op.notBefore, op.notBefore);
        continue;
      }
      try {
        // Changes go out one at a time and in order, so the service ends up with the latest one.
        // oxlint-disable-next-line no-await-in-loop
        const exists = await sendOp(op);
        removeOp(op);
        if (op.kind === "save") {
          // A show the service does not list is marked as such, so it is not offered again.
          library.markTracker(op.key, op.tracker, exists ? Date.now() : 0);
        }
      } catch (error) {
        const label = TRACKER_LABELS[op.tracker];
        if (isAuthProblem(error)) {
          setNeedsSignIn(op.tracker, true);
          lastError = errorMessage(error);
          blocked.add(op.tracker);
        } else if (isRetryable(error)) {
          lastError = `${label}: ${errorMessage(error)}`;
          blocked.add(op.tracker);
          retry = true;
        } else {
          lastError = `Could not update ${op.title} on ${label}: ${errorMessage(error)}`;
          removeOp(op);
        }
      }
    }
  } finally {
    flushing = false;
    if (lastError !== undefined) {
      setStatus({ lastError });
    }
  }
  failures = retry ? failures + 1 : 0;
  if (flushAgain) {
    flushAgain = false;
    scheduleFlush(0);
  } else if (retry) {
    scheduleFlush(Math.min(RETRY_BASE_MS * 2 ** (failures - 1), RETRY_MAX_MS));
  } else if (nextDue !== undefined) {
    scheduleFlush(Math.max(0, nextDue - Date.now()) + 50);
  }
};

const fullChange = (entry: LibraryEntry) => ({ progress: entry.progress, score: entry.score, status: entry.status });

/** Turns a change made in Ikuzo into queued ops for every connected service that should get it. */
const queueChange = (change: LibraryChange): void => {
  const { entry } = change;
  const { enqueue } = useAccounts.getState();
  const now = Date.now();
  for (const tracker of connectedTrackers()) {
    // A show removed on the service stays removed there unless it is added again in Ikuzo.
    const removedThere = entry.trackers?.[tracker] === 0;
    if (change.kind === "remove") {
      if (!removedThere) {
        enqueue({
          at: now,
          ids: entry.anime.ids,
          key: entry.key,
          kind: "remove",
          notBefore: now + UNDO_WINDOW_MS,
          title: entry.anime.title,
          tracker,
        });
      }
    } else if (change.isNew || !removedThere) {
      const neverThere = entry.trackers?.[tracker] === undefined;
      enqueue({
        at: now,
        change: change.isNew || neverThere ? fullChange(entry) : change.change,
        ids: entry.anime.ids,
        key: entry.key,
        kind: "save",
        title: entry.anime.title,
        tracker,
      });
    }
  }
  scheduleFlush(FLUSH_DELAY_MS);
};

/** Sends every list change made in Ikuzo to the connected services. */
export const startSyncWatcher = (): (() => void) => onLibraryChange(queueChange);

// ── Held changes (need the user's OK) ───────────────────────────────────────

/** Sends a group of held changes. */
export const approveHeld = (tracker: TrackerId, reason: HoldReason): void => {
  useAccounts
    .getState()
    .setQueue((queue) =>
      queue.map((op) =>
        op.tracker === tracker && op.held === reason
          ? { ...op, approved: true, held: undefined, notBefore: undefined }
          : op
      )
    );
  void flush();
};

/**
 * Drops a group of held changes. Held additions are not offered again. Held removals are
 * cancelled: the shows stay on the service and come back into Ikuzo with a fresh sync.
 */
export const discardHeld = (tracker: TrackerId, reason: HoldReason): void => {
  const { queue, setQueue } = useAccounts.getState();
  const dropped = queue.filter((op) => op.tracker === tracker && op.held === reason);
  setQueue((current) => current.filter((op) => !(op.tracker === tracker && op.held === reason)));
  if (reason === "bulk-add") {
    for (const op of dropped) {
      library.markTracker(op.key, tracker, 0);
    }
  } else {
    // oxlint-disable-next-line no-use-before-define
    void pullQuietly();
  }
};

// ── Incoming lists ──────────────────────────────────────────────────────────

export interface PullSummary {
  added: number;
  updated: number;
  sent: number;
  /** Shows waiting for the user's OK before they are added to a service, by service. */
  toAdd: Partial<Record<TrackerId, number>>;
  /** Shows removed on a service since the last sync (kept in Ikuzo). */
  removedRemotely: number;
}

const queueAdditions = (missing: { key: string; tracker: TrackerId }[]): Partial<Record<TrackerId, number>> => {
  const { enqueue, queue } = useAccounts.getState();
  const held: Partial<Record<TrackerId, number>> = {};
  const now = Date.now();
  // Shows that already have a change on its way (added in Ikuzo while offline) are not "offered".
  const pending = new Set(queue.map((op) => `${op.tracker}|${op.key}`));
  const offered = missing.filter((item) => !pending.has(`${item.tracker}|${item.key}`));
  for (const tracker of new Set(offered.map((item) => item.tracker))) {
    const items = offered.filter((item) => item.tracker === tracker);
    const hold = items.length > BULK_ADD_LIMIT;
    for (const item of items) {
      const entry = getEntry(item.key);
      if (entry !== undefined) {
        enqueue({
          at: now,
          change: fullChange(entry),
          held: hold ? "bulk-add" : undefined,
          ids: entry.anime.ids,
          key: entry.key,
          kind: "save",
          title: entry.anime.title,
          tracker,
        });
      }
    }
    if (hold) {
      held[tracker] = items.length;
    }
  }
  return held;
};

/** The sync that is running or last ran; the next one waits for it. */
let lastPull: Promise<unknown> = Promise.resolve();

/**
 * Downloads the lists of the connected accounts, merges them into the library (newest change
 * wins), then sends each service what it is missing. Syncs never overlap: one that is asked for
 * while another runs starts when it is done.
 */
export const pull = async (trackers: TrackerId[] = connectedTrackers()): Promise<PullSummary> => {
  const previous = lastPull;
  const run = (async () => {
    try {
      await previous;
    } catch {
      // The earlier sync's error was already reported to its caller.
    }
    // oxlint-disable-next-line no-use-before-define
    return await pullOnce(trackers);
  })();
  lastPull = run;
  return await run;
};

const pullOnce = async (trackers: TrackerId[]): Promise<PullSummary> => {
  const { enqueue, setNeedsSignIn, setStatus } = useAccounts.getState();
  const summary: PullSummary = { added: 0, removedRemotely: 0, sent: 0, toAdd: {}, updated: 0 };
  if (trackers.length === 0) {
    return summary;
  }
  setStatus({ lastError: undefined, syncing: true });
  try {
    const lists: Partial<Record<TrackerId, RemoteEntry[]>> = {};
    const errors: string[] = [];
    for (const tracker of trackers) {
      try {
        // oxlint-disable-next-line no-await-in-loop
        const account = await accountFor(tracker);
        // oxlint-disable-next-line no-await-in-loop
        lists[tracker] = await account.list();
        setNeedsSignIn(tracker, false);
      } catch (error) {
        if (isAuthProblem(error)) {
          setNeedsSignIn(tracker, true);
        }
        errors.push(isAuthProblem(error) ? errorMessage(error) : `${TRACKER_LABELS[tracker]}: ${errorMessage(error)}`);
      }
    }
    if (Object.keys(lists).length > 0) {
      const removed = useAccounts
        .getState()
        .queue.filter((op) => op.kind === "remove")
        .map((op) => op.ids);
      const plan = planSync(getEntries(), lists, Date.now(), { removed });
      await library.applySyncPlan(plan.inserts, plan.updates);
      const now = Date.now();
      for (const push of plan.pushes) {
        enqueue({
          at: now,
          change: push.change,
          ids: push.ids,
          key: push.key,
          kind: "save",
          title: getEntry(push.key)?.anime.title ?? push.key,
          tracker: push.tracker,
        });
      }
      summary.added = plan.inserts.length;
      summary.updated = plan.updates.filter((item) => item.values !== undefined).length;
      summary.sent = plan.pushes.length;
      summary.removedRemotely = plan.removedRemotely.length;
      summary.toAdd = queueAdditions(plan.missing);
      setStatus({ lastSyncAt: Date.now() });
    }
    // Also sends (or holds) changes queued earlier, even when no list could be downloaded.
    await flush();
    if (errors.length > 0) {
      setStatus({ lastError: errors.join("\n") });
    }
    return summary;
  } finally {
    setStatus({ syncing: false });
  }
};

/** Background sync (app start, pull-to-refresh, back to the app): errors are stored for Settings to show. */
export const pullQuietly = async (): Promise<void> => {
  try {
    await pull();
  } catch (error) {
    useAccounts.getState().setStatus({ lastError: errorMessage(error) });
  }
};

/** Pulls when the last sync is old, and sends anything still waiting. */
export const syncOnForeground = (): void => {
  const { lastSyncAt, syncing } = useAccounts.getState();
  if (!syncing && (lastSyncAt === undefined || Date.now() - lastSyncAt > FOREGROUND_SYNC_AFTER_MS)) {
    void pullQuietly();
  } else {
    void flush();
  }
};

/**
 * Reads someone's public list without signing in and adds the shows that are not in the library
 * yet. Shows already in the library are left as they are, and nothing is sent anywhere.
 */
export const previewPublicList = async (tracker: TrackerId, userName: string): Promise<RemoteEntry[]> => {
  const account = tracker === "anilist" ? createAniListAccount() : createMalAccount(MAL_CLIENT_ID);
  const list = await account.list(userName.trim());
  const plan = planSync(getEntries(), { [tracker]: list }, Date.now());
  const fresh = new Set(plan.inserts.map((item) => item.key));
  return list.filter((item) => fresh.has(`${item.anime.source}:${item.anime.id}`));
};

export const importPublicList = async (shows: RemoteEntry[]): Promise<number> => {
  const inserts = shows
    .filter((item) => getEntry(`${item.anime.source}:${item.anime.id}`) === undefined)
    .map((item) => ({
      anime: item.anime,
      key: `${item.anime.source}:${item.anime.id}`,
      progress: item.progress,
      score: item.score,
      status: item.status,
      // Someone else's list: never marks the shows as being on the user's own accounts.
      trackers: {},
      updatedAt: item.updatedAt > 0 ? item.updatedAt : Date.now(),
    }));
  await library.applySyncPlan(inserts, []);
  return inserts.length;
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
  const account =
    tracker === "anilist"
      ? createAniListAccount(session.accessToken)
      : createMalAccount(MAL_CLIENT_ID, session.accessToken);
  // Profile first: a session is only stored for an account that answers.
  const profile = await account.profile();
  await setSession(tracker, session);
  const { profiles, setNeedsSignIn, setProfile, setStatus } = useAccounts.getState();
  // Reconnecting as someone else: what was on the old account says nothing about the new one.
  const previous = profiles[tracker];
  if (previous !== undefined && previous.id !== profile.id) {
    await library.clearTrackerMarks(tracker);
  }
  setProfile(tracker, profile);
  setNeedsSignIn(tracker, false);
  setStatus({ lastError: undefined });
  return await pull([tracker]);
};

/** Changes for `tracker` still waiting to be sent. */
export const pendingFor = (tracker: TrackerId): number =>
  useAccounts.getState().queue.filter((op) => op.tracker === tracker).length;

/**
 * Signs out. Unsent changes for the service are dropped, and the library forgets which shows
 * were on that account (another account may be connected next).
 */
export const disconnect = async (tracker: TrackerId): Promise<void> => {
  await clearSession(tracker);
  const { setNeedsSignIn, setProfile, setQueue } = useAccounts.getState();
  setProfile(tracker, undefined);
  setNeedsSignIn(tracker, false);
  setQueue((queue) => queue.filter((op) => op.tracker !== tracker));
  await library.clearTrackerMarks(tracker);
};
