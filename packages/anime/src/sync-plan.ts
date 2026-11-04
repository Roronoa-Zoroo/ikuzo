import { TRACKERS } from "./trackers";
import type { ListChange, ListUpdate, RemoteEntry, TrackerId } from "./trackers";
import type { AnimeSummary, ExternalIds } from "./types";

/**
 * Pure planning for two-way list sync, kept free of storage and network code so it can be tested.
 *
 * The rules:
 * - For each show, the newest change wins: Ikuzo's copy or any connected service's copy.
 * - Each service then receives only the fields that differ from the winner.
 * - A show Ikuzo has never seen on a service is "missing" there. Adding it is left to the caller,
 *   which asks the user first when there are many (connecting a service to a big list).
 * - A show that was on a service and is gone now was removed there on purpose. It is reported,
 *   never re-added and never deleted from Ikuzo.
 */

/** When a show was last seen on each service (epoch ms). 0 means it was removed on that service. */
export type TrackerMarks = Partial<Record<TrackerId, number>>;

/** The fields of a library entry that sync reads. */
export interface SyncedEntry extends ListUpdate {
  key: string;
  anime: AnimeSummary;
  updatedAt: number;
  trackers?: TrackerMarks;
}

export interface PlannedInsert extends ListUpdate {
  key: string;
  anime: AnimeSummary;
  updatedAt: number;
  trackers: TrackerMarks;
}

export interface PlannedUpdate {
  key: string;
  /** New list values when a service had a newer copy, otherwise undefined. */
  values?: ListUpdate & { updatedAt: number };
  /** Ids learnt from the services (a MAL id for an AniList show and the other way round). */
  ids: ExternalIds;
  trackers: TrackerMarks;
}

export interface PlannedPush {
  key: string;
  tracker: TrackerId;
  change: ListChange;
  ids: ExternalIds;
}

export interface TrackerRef {
  key: string;
  tracker: TrackerId;
  ids: ExternalIds;
}

export interface SyncPlan {
  inserts: PlannedInsert[];
  updates: PlannedUpdate[];
  /** Differences to send to services that already have the show. */
  pushes: PlannedPush[];
  /** Shows in Ikuzo that a service has never had. */
  missing: TrackerRef[];
  /** Shows that were removed on a service since the last sync. */
  removedRemotely: TrackerRef[];
}

export const LIST_FIELDS = ["status", "progress", "score"] as const satisfies readonly (keyof ListUpdate)[];

export const entryKeyOf = (anime: Pick<AnimeSummary, "source" | "id">): string => `${anime.source}:${anime.id}`;

/** Only the list fields that differ between `from` and `to`. */
export const diffList = (from: ListUpdate, to: ListUpdate): ListChange => {
  const change: ListChange = {};
  for (const field of LIST_FIELDS) {
    if (from[field] !== to[field]) {
      Object.assign(change, { [field]: to[field] });
    }
  }
  return change;
};

export const isEmptyChange = (change: ListChange): boolean => Object.keys(change).length === 0;

const pickList = (value: ListUpdate): ListUpdate => ({
  progress: value.progress,
  score: value.score,
  status: value.status,
});

/** Known ids win; the other side only fills gaps. */
const ID_NAMES = ["anidb", "anilist", "kitsu", "mal"] as const satisfies readonly (keyof ExternalIds)[];

const mergeIds = (known: ExternalIds, other: ExternalIds): ExternalIds => {
  const result: ExternalIds = { ...known };
  for (const name of ID_NAMES) {
    result[name] ??= other[name];
  }
  return result;
};

const sameIds = (a: ExternalIds, b: ExternalIds): boolean =>
  a.anidb === b.anidb && a.anilist === b.anilist && a.kitsu === b.kitsu && a.mal === b.mal;

const sameMarks = (a: TrackerMarks, b: TrackerMarks): boolean => a.anilist === b.anilist && a.mal === b.mal;

interface Working extends ListUpdate {
  key: string;
  anime: AnimeSummary;
  ids: ExternalIds;
  updatedAt: number;
  trackers: TrackerMarks;
  isNew: boolean;
  valuesChanged: boolean;
}

/** Index of shows by MyAnimeList and AniList id. */
class ShowIndex {
  private readonly byMal = new Map<number, string>();
  private readonly byAniList = new Map<number, string>();

  add(key: string, ids: ExternalIds): void {
    if (ids.mal !== undefined && !this.byMal.has(ids.mal)) {
      this.byMal.set(ids.mal, key);
    }
    if (ids.anilist !== undefined && !this.byAniList.has(ids.anilist)) {
      this.byAniList.set(ids.anilist, key);
    }
  }

  lookup(ids: ExternalIds): string | undefined {
    return (
      (ids.mal === undefined ? undefined : this.byMal.get(ids.mal)) ??
      (ids.anilist === undefined ? undefined : this.byAniList.get(ids.anilist))
    );
  }
}

const toWorking = (entry: SyncedEntry): Working => ({
  ...pickList(entry),
  anime: entry.anime,
  ids: entry.anime.ids,
  isNew: false,
  key: entry.key,
  trackers: { ...entry.trackers },
  updatedAt: entry.updatedAt,
  valuesChanged: false,
});

/** Folds one service's copy of a show into the working set (newest change wins). */
const absorb = (working: Map<string, Working>, index: ShowIndex, item: RemoteEntry, now: number): string => {
  const key = index.lookup(item.anime.ids) ?? entryKeyOf(item.anime);
  const changedAt = item.updatedAt > 0 ? item.updatedAt : now;
  let show = working.get(key);
  if (show === undefined) {
    show = {
      ...pickList(item),
      anime: item.anime,
      ids: item.anime.ids,
      isNew: true,
      key,
      trackers: {},
      updatedAt: changedAt,
      valuesChanged: true,
    };
    working.set(key, show);
  } else if (!isEmptyChange(diffList(show, item)) && item.updatedAt > show.updatedAt) {
    Object.assign(show, pickList(item), { updatedAt: changedAt, valuesChanged: true });
  }
  show.ids = mergeIds(show.ids, item.anime.ids);
  index.add(key, show.ids);
  return key;
};

/** Decides, for one show and one service, whether to send a change, offer an add, or note a removal. */
const compareWithService = (
  plan: SyncPlan,
  show: Working,
  tracker: TrackerId,
  remote: RemoteEntry | undefined,
  now: number
): void => {
  const ref = { ids: show.ids, key: show.key, tracker };
  if (remote !== undefined) {
    show.trackers[tracker] = now;
    const change = diffList(remote, show);
    if (!isEmptyChange(change)) {
      plan.pushes.push({ ...ref, change });
    }
  } else if (show.trackers[tracker] === undefined) {
    plan.missing.push(ref);
  } else if (show.trackers[tracker] !== 0) {
    show.trackers[tracker] = 0;
    plan.removedRemotely.push(ref);
  }
};

const recordShow = (plan: SyncPlan, show: Working, before: TrackerMarks): void => {
  if (show.isNew) {
    plan.inserts.push({
      ...pickList(show),
      anime: { ...show.anime, ids: show.ids },
      key: show.key,
      trackers: show.trackers,
      updatedAt: show.updatedAt,
    });
  } else if (show.valuesChanged || !sameIds(show.ids, show.anime.ids) || !sameMarks(before, show.trackers)) {
    plan.updates.push({
      ids: show.ids,
      key: show.key,
      trackers: show.trackers,
      values: show.valuesChanged ? { ...pickList(show), updatedAt: show.updatedAt } : undefined,
    });
  }
};

export interface PlanOptions {
  /**
   * Shows deleted in Ikuzo whose removal has not reached the services yet (waiting for Undo,
   * offline, or held for the user's OK). Their remote copies are ignored, so a sync never
   * brings a deleted show back.
   */
  removed?: readonly ExternalIds[];
}

/**
 * Plans one sync run. `lists` holds the full list downloaded from each service that answered;
 * services that failed are left out and keep their state for the next run.
 */
export const planSync = (
  local: readonly SyncedEntry[],
  lists: Partial<Record<TrackerId, readonly RemoteEntry[]>>,
  now: number,
  options: PlanOptions = {}
): SyncPlan => {
  const working = new Map<string, Working>();
  const index = new ShowIndex();
  for (const entry of local) {
    working.set(entry.key, toWorking(entry));
    index.add(entry.key, entry.anime.ids);
  }
  const removed = new ShowIndex();
  for (const [position, ids] of (options.removed ?? []).entries()) {
    removed.add(String(position), ids);
  }

  const trackers = TRACKERS.filter((tracker) => lists[tracker] !== undefined);
  const remoteByTracker = new Map<TrackerId, Map<string, RemoteEntry>>();
  for (const tracker of trackers) {
    const seen = new Map<string, RemoteEntry>();
    remoteByTracker.set(tracker, seen);
    for (const item of lists[tracker] ?? []) {
      // A show deleted here but still on the service is waiting for its removal to go out.
      if (index.lookup(item.anime.ids) === undefined && removed.lookup(item.anime.ids) !== undefined) {
        continue;
      }
      const key = absorb(working, index, item, now);
      // A list can name the same show twice (AniList custom lists); the first one counts.
      if (!seen.has(key)) {
        seen.set(key, item);
      }
    }
  }

  const plan: SyncPlan = { inserts: [], missing: [], pushes: [], removedRemotely: [], updates: [] };
  for (const show of working.values()) {
    const before = { ...show.trackers };
    for (const tracker of trackers) {
      compareWithService(plan, show, tracker, remoteByTracker.get(tracker)?.get(show.key), now);
    }
    recordShow(plan, show, before);
  }
  return plan;
};
