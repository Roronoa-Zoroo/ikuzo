import { planPull, planUpload } from "@ikuzo/anime/account-sync";
import type { PendingChange } from "@ikuzo/anime/account-sync";
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
import { holdBulkRemovals as holdRemovals } from "@ikuzo/anime/sync-queue";
import type { ListChange, RemoteEntry, TrackerAccount, TrackerId, TrackerSession } from "@ikuzo/anime/trackers";
import { TRACKER_LABELS } from "@ikuzo/anime/trackers";
import type { ExternalIds } from "@ikuzo/anime/types";
import { getRandomBytes } from "expo-crypto";
import * as WebBrowser from "expo-web-browser";

import { connectedTrackers, mainTracker, mirrorTrackers, useAccounts } from "./accounts";
import type { SyncOp } from "./accounts";
import { saveUndoSnapshot } from "./backup";
import { onLibraryChange } from "./library-events";
import type { LibraryChange } from "./library-events";
import type { LibraryEntry } from "./library-types";
import { clearSession, getSession, setSession } from "./secrets";
import { getEntries, library } from "./store";
import { ANILIST_CLIENT_ID, ANILIST_REDIRECT, MAL_CLIENT_ID, MAL_REDIRECT } from "./trackers-config";

/*
 * Sync model: the main account (AniList or MyAnimeList) owns the list.
 * - Edits in Ikuzo are written locally at once and queued for the main account (and copied to the
 *   other connected account, which is never read back).
 * - A pull makes the library equal the main account's list. Changes still queued, or sent while
 *   the list was downloading, are laid over it so a pull never undoes them.
 * - Without accounts the list lives only on the phone and nothing syncs.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const FLUSH_DELAY_MS = 1500;
/** Removals wait this long before they are sent, so Undo can still cancel them. */
export const UNDO_WINDOW_MS = 10_000;
/** More removals than this for one account at once are held until the user confirms them. */
const BULK_REMOVE_LIMIT = 5;
/**
 * A pull that would remove more than this many shows (and this share of the list) from Ikuzo
 * waits for the user's OK: it is more likely an API hiccup or another account than real removals.
 */
const BULK_LOCAL_DELETE_MIN = 5;
const BULK_LOCAL_DELETE_SHARE = 0.25;
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

/**
 * Changes sent to the main account recently. A pull whose download started before one was sent
 * may not show it yet, so it is laid over the list until a later pull has seen it.
 */
let recentlySent: { change: PendingChange; at: number }[] = [];

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
      // A caller that read the session before the previous renewal finished would hold a
      // refresh token MAL has already replaced; the stored session is the renewed one.
      const stored = await getSession("mal");
      if (stored !== undefined && stored.refreshToken !== refreshToken && stored.expiresAt - Date.now() >= DAY_MS) {
        return stored;
      }
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

/** Holds removals when there are suspiciously many for one account at once (see holdBulkRemovals). */
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

const toPending = (op: SyncOp): PendingChange => ({ change: op.change, ids: op.ids, key: op.key, kind: op.kind });

/** Sends queued changes that are due. A failing account is skipped until the retry; others carry on. */
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
    const main = mainTracker();
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
        // Changes go out one at a time and in order, so the account ends up with the latest one.
        // oxlint-disable-next-line no-await-in-loop
        await sendOp(op);
        removeOp(op);
        if (op.tracker === main) {
          recentlySent.push({ at: Date.now(), change: toPending(op) });
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

const fullChange = (entry: LibraryEntry): ListChange => ({
  progress: entry.progress,
  score: entry.score,
  status: entry.status,
});

const saveOp = (entry: LibraryEntry, tracker: TrackerId, change: ListChange, at: number): SyncOp => ({
  at,
  change,
  ids: entry.anime.ids,
  key: entry.key,
  kind: "save",
  title: entry.anime.title,
  tracker,
});

/**
 * Undo after a delete: the pending removals are cancelled, so the accounts keep the show as it is.
 * Only where a removal already went out is the show added back.
 */
const queueRestore = (entry: LibraryEntry): void => {
  const { enqueue, queue, setQueue } = useAccounts.getState();
  const pending = new Set(queue.filter((op) => op.key === entry.key && op.kind === "remove").map((op) => op.tracker));
  setQueue((current) => current.filter((op) => !(op.key === entry.key && op.kind === "remove")));
  const now = Date.now();
  for (const tracker of connectedTrackers()) {
    if (!pending.has(tracker)) {
      enqueue(saveOp(entry, tracker, fullChange(entry), now));
    }
  }
  scheduleFlush(FLUSH_DELAY_MS);
};

/** Turns a change made in Ikuzo into queued ops for the main account and the copy account. */
const queueChange = (change: LibraryChange): void => {
  const main = mainTracker();
  if (main === undefined || useAccounts.getState().awaitingChoice !== undefined) {
    // No accounts (the list lives on the phone only), or the user has not chosen yet what happens
    // to the phone's list: changes stay local, and the choice decides what reaches the account.
    return;
  }
  if (change.kind === "restore") {
    queueRestore(change.entry);
    return;
  }
  const { entry } = change;
  const { enqueue } = useAccounts.getState();
  const now = Date.now();
  for (const tracker of [main, ...mirrorTrackers()]) {
    if (change.kind === "remove") {
      enqueue({
        at: now,
        ids: entry.anime.ids,
        key: entry.key,
        kind: "remove",
        notBefore: now + UNDO_WINDOW_MS,
        title: entry.anime.title,
        tracker,
      });
    } else {
      // The copy account is never read, so it may not have the show yet: it always gets every field.
      const fields = change.isNew || tracker !== main ? fullChange(entry) : change.change;
      enqueue(saveOp(entry, tracker, fields, now));
    }
  }
  scheduleFlush(FLUSH_DELAY_MS);
};

/** Sends every list change made in Ikuzo to the connected accounts. */
export const startSyncWatcher = (): (() => void) => onLibraryChange(queueChange);

/** Sends a group of held removals. */
export const approveHeldRemovals = (tracker: TrackerId): void => {
  useAccounts
    .getState()
    .setQueue((queue) =>
      queue.map((op) =>
        op.tracker === tracker && op.held !== undefined
          ? { ...op, approved: true, held: undefined, notBefore: undefined }
          : op
      )
    );
  void flush();
};

/** Cancels held removals: the shows stay on the account and come back into Ikuzo with a sync. */
export const discardHeldRemovals = (tracker: TrackerId): void => {
  useAccounts.getState().setQueue((queue) => queue.filter((op) => !(op.tracker === tracker && op.held !== undefined)));
  // oxlint-disable-next-line no-use-before-define
  void pullQuietly();
};

// ── Incoming list ───────────────────────────────────────────────────────────

export interface PullSummary {
  added: number;
  updated: number;
  removed: number;
  /** Shows missing from the account that wait for the user's OK before they leave Ikuzo. */
  heldRemovals: number;
}

const EMPTY_SUMMARY: PullSummary = { added: 0, heldRemovals: 0, removed: 0, updated: 0 };

/** The main account's list, with sign-in problems recorded for Settings. */
const downloadList = async (tracker: TrackerId): Promise<RemoteEntry[]> => {
  const { setNeedsSignIn } = useAccounts.getState();
  try {
    const account = await accountFor(tracker);
    const list = await account.list();
    setNeedsSignIn(tracker, false);
    return list;
  } catch (error) {
    if (isAuthProblem(error)) {
      setNeedsSignIn(tracker, true);
    }
    throw error;
  }
};

/** Changes the main account may not show yet: queued ones and ones sent since `since`. */
const pendingChanges = (tracker: TrackerId, since: number): PendingChange[] => [
  ...recentlySent.filter((item) => item.at >= since).map((item) => item.change),
  ...useAccounts
    .getState()
    .queue.filter((op) => op.tracker === tracker)
    .map(toPending),
];

const pullOnce = async ({ allowBulkRemoval = false } = {}): Promise<PullSummary> => {
  const tracker = mainTracker();
  if (tracker === undefined || useAccounts.getState().awaitingChoice !== undefined) {
    return EMPTY_SUMMARY;
  }
  const { setHeldDeletes, setStatus } = useAccounts.getState();
  setStatus({ lastError: undefined, syncing: true });
  const startedAt = Date.now();
  try {
    const list = await downloadList(tracker);
    const local = getEntries();
    const plan = planPull(local, list, pendingChanges(tracker, startedAt), Date.now());
    const suspicious =
      plan.deletes.length > BULK_LOCAL_DELETE_MIN && plan.deletes.length > local.length * BULK_LOCAL_DELETE_SHARE;
    const holdDeletes = suspicious && !allowBulkRemoval;
    await library.applyPull({ ...plan, deletes: holdDeletes ? [] : plan.deletes });
    setHeldDeletes(holdDeletes ? { keys: plan.deletes, tracker } : undefined);
    // This pull saw everything sent before it started.
    recentlySent = recentlySent.filter((item) => item.at >= startedAt);
    setStatus({ lastSyncAt: Date.now() });
    return {
      added: plan.inserts.length,
      heldRemovals: holdDeletes ? plan.deletes.length : 0,
      removed: holdDeletes ? 0 : plan.deletes.length,
      updated: plan.updates.length,
    };
  } catch (error) {
    setStatus({
      lastError: isAuthProblem(error) ? errorMessage(error) : `${TRACKER_LABELS[tracker]}: ${errorMessage(error)}`,
    });
    throw error;
  } finally {
    setStatus({ syncing: false });
    // Also sends (or holds) changes queued earlier.
    await flush();
  }
};

/** The sync that is running or last ran; the next one waits for it. */
let lastPull: Promise<unknown> = Promise.resolve();

/**
 * Makes the library equal the main account's list (keeping changes still on their way). Syncs
 * never overlap: one asked for while another runs starts when it is done.
 */
export const pull = async (options: { allowBulkRemoval?: boolean } = {}): Promise<PullSummary> => {
  const previous = lastPull;
  const run = (async () => {
    try {
      await previous;
    } catch {
      // The earlier sync's error was already reported to its caller.
    }
    return await pullOnce(options);
  })();
  lastPull = run;
  return await run;
};

/** Background sync (app start, pull-to-refresh, back to the app): errors are stored for Settings to show. */
export const pullQuietly = async (): Promise<void> => {
  try {
    await pull();
  } catch {
    // pullOnce stored the error for Settings.
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

/** Removes the held shows from Ikuzo too (the account no longer has them). */
export const approveHeldDeletes = async (): Promise<void> => {
  const { heldDeletes, setHeldDeletes } = useAccounts.getState();
  if (heldDeletes !== undefined) {
    await saveUndoSnapshot();
    await library.removeLocally(heldDeletes.keys);
    setHeldDeletes(undefined);
  }
};

/** Keeps the held shows in Ikuzo for now; the next sync asks again if they are still missing. */
export const dismissHeldDeletes = (): void => {
  useAccounts.getState().setHeldDeletes(undefined);
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

/** What connecting an account found, for the screen to ask the right question. */
export type ConnectResult =
  | { kind: "cancelled" }
  /** First account and the phone's list was empty (or the same): the account's list is shown now. */
  | { kind: "synced"; summary: PullSummary }
  /** First account, but the phone has its own list: upload it or replace it with the account's? */
  | { kind: "choose"; localShows: number; accountShows: number; toUpload: number }
  /** A second account: it only receives a copy of changes. Copy the whole list to it now? */
  | { kind: "copy"; shows: number }
  /** An account that was already connected signed in again. */
  | { kind: "reconnected" };

/**
 * Signs in. The first account becomes the main one; what happens to a list already on the phone
 * is the user's choice (uploadLocalList or replaceWithAccountList). A second account becomes the copy.
 */
export const connect = async (tracker: TrackerId): Promise<ConnectResult> => {
  const session = tracker === "anilist" ? await signInAniList() : await signInMal();
  if (session === undefined) {
    return { kind: "cancelled" };
  }
  const account =
    tracker === "anilist"
      ? createAniListAccount(session.accessToken)
      : createMalAccount(MAL_CLIENT_ID, session.accessToken);
  // Profile first: a session is only stored for an account that answers.
  const profile = await account.profile();
  await setSession(tracker, session);
  const { profiles, setMain, setNeedsSignIn, setProfile, setQueue, setStatus } = useAccounts.getState();
  const previous = profiles[tracker];
  if (previous !== undefined && previous.id !== profile.id) {
    // Signed in as someone else: changes meant for the other account are not sent to this one.
    setQueue((queue) => queue.filter((op) => op.tracker !== tracker));
  }
  const hadMain = mainTracker();
  const local = getEntries();
  const becomesMain = hadMain === undefined || hadMain === tracker;
  const mustChoose = becomesMain && local.length > 0 && previous?.id !== profile.id;
  // Before the account counts as connected, so no sync can touch the phone's list before the choice.
  useAccounts.getState().setAwaitingChoice(mustChoose ? tracker : undefined);
  setProfile(tracker, profile);
  setNeedsSignIn(tracker, false);
  setStatus({ lastError: undefined });

  if (!becomesMain) {
    void flush();
    return previous === undefined ? { kind: "copy", shows: local.length } : { kind: "reconnected" };
  }
  setMain(tracker);
  if (!mustChoose) {
    return { kind: "synced", summary: await pull() };
  }
  const list = await downloadList(tracker);
  return {
    accountShows: list.length,
    kind: "choose",
    localShows: local.length,
    toUpload: planUpload(local, list).length,
  };
};

/** Adds the phone's shows that the main account does not have to it, then shows the account's list. */
export const uploadLocalList = async (): Promise<PullSummary> => {
  useAccounts.getState().setAwaitingChoice(undefined);
  const tracker = mainTracker();
  if (tracker === undefined) {
    return EMPTY_SUMMARY;
  }
  const missing = planUpload(getEntries(), await downloadList(tracker));
  const { enqueue } = useAccounts.getState();
  const now = Date.now();
  for (const entry of missing) {
    enqueue(saveOp(entry, tracker, fullChange(entry), now));
  }
  // Queued additions stay in the library while they upload; everything else follows the account.
  return await pull({ allowBulkRemoval: true });
};

/** Replaces the phone's list with the main account's list (the old one can be restored for a day). */
export const replaceWithAccountList = async (): Promise<PullSummary> => {
  useAccounts.getState().setAwaitingChoice(undefined);
  await saveUndoSnapshot();
  return await pull({ allowBulkRemoval: true });
};

/** Copies every show to the copy account (it may have none of them yet). */
export const copyListTo = (tracker: TrackerId): number => {
  const { enqueue } = useAccounts.getState();
  const now = Date.now();
  const entries = getEntries();
  for (const entry of entries) {
    enqueue(saveOp(entry, tracker, fullChange(entry), now));
  }
  void flush();
  return entries.length;
};

/** Makes `tracker` the main account: Ikuzo then shows its list (the current one can be restored for a day). */
export const switchMain = async (tracker: TrackerId): Promise<PullSummary> => {
  useAccounts.getState().setMain(tracker);
  return await replaceWithAccountList();
};

/** Changes for `tracker` still waiting to be sent. */
export const pendingFor = (tracker: TrackerId): number =>
  useAccounts.getState().queue.filter((op) => op.tracker === tracker).length;

/**
 * Signs out and drops the account's unsent changes. Disconnecting the main account makes the
 * copy account the main one (its list is then shown); without accounts the list stays on the phone.
 */
export const disconnect = async (tracker: TrackerId): Promise<void> => {
  const wasMain = mainTracker() === tracker;
  await clearSession(tracker);
  const { awaitingChoice, setAwaitingChoice, setHeldDeletes, setMain, setNeedsSignIn, setProfile, setQueue } =
    useAccounts.getState();
  if (awaitingChoice === tracker) {
    setAwaitingChoice(undefined);
  }
  setProfile(tracker, undefined);
  setNeedsSignIn(tracker, false);
  setQueue((queue) => queue.filter((op) => op.tracker !== tracker));
  if (wasMain) {
    setHeldDeletes(undefined);
    recentlySent = [];
    const [next] = connectedTrackers();
    setMain(next);
    if (next !== undefined) {
      // The copy account may hold only part of the list: removals it implies wait for the
      // user's OK as usual instead of replacing the list outright. (No new undo snapshot: that
      // would overwrite the one kept from before an earlier list replacement.)
      await pullQuietly();
    }
  }
};
