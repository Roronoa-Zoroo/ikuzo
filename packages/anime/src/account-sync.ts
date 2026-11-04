import type { ListChange, ListUpdate, RemoteEntry } from "./trackers";
import type { AnimeSummary, ExternalIds } from "./types";

/**
 * Pure planning for "the account is the source of truth" sync, free of storage and network code
 * so it can be tested.
 *
 * - A pull makes the library equal the main account's list.
 * - Changes made in Ikuzo that the account may not reflect yet (queued offline, or sent while the
 *   list was downloading) are laid over the downloaded list, so a sync never undoes them.
 * - Local-only details (notes, notification switches, when a show was added) are the app's to
 *   keep; this only decides list membership and list values.
 */

/** The fields of a library entry that sync reads. */
export interface SyncedEntry extends ListUpdate {
  key: string;
  anime: AnimeSummary;
  updatedAt: number;
}

/** A change made in Ikuzo that the account may not show yet. */
export interface PendingChange {
  key: string;
  ids: ExternalIds;
  kind: "save" | "remove";
  change?: ListChange;
}

export interface PlannedInsert extends ListUpdate {
  key: string;
  anime: AnimeSummary;
  updatedAt: number;
}

export interface PlannedUpdate extends ListUpdate {
  key: string;
  anime: AnimeSummary;
  updatedAt: number;
}

export interface PullPlan {
  inserts: PlannedInsert[];
  updates: PlannedUpdate[];
  /** Library keys of shows that are no longer on the account. */
  deletes: string[];
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

const ID_NAMES = ["anidb", "anilist", "kitsu", "mal"] as const satisfies readonly (keyof ExternalIds)[];

/** Known ids win; the other side only fills gaps. */
const mergeIds = (known: ExternalIds, other: ExternalIds): ExternalIds => {
  const result: ExternalIds = { ...known };
  for (const name of ID_NAMES) {
    result[name] ??= other[name];
  }
  return result;
};

/** The snapshot fields worth rewriting an entry for. */
const snapshotOf = (anime: AnimeSummary): string =>
  JSON.stringify([
    anime.title,
    anime.titleEnglish,
    anime.image,
    anime.episodes,
    anime.status,
    anime.airedFrom,
    anime.airedTo,
    anime.nextEpisode?.airingAt,
  ]);

const sameIds = (a: ExternalIds, b: ExternalIds): boolean =>
  a.anidb === b.anidb && a.anilist === b.anilist && a.kitsu === b.kitsu && a.mal === b.mal;

/** Finds shows by MyAnimeList or AniList id (the same show can have different keys). */
export class ShowIndex<T> {
  private readonly byMal = new Map<number, T>();
  private readonly byAniList = new Map<number, T>();

  add(ids: ExternalIds, value: T): void {
    if (ids.mal !== undefined && !this.byMal.has(ids.mal)) {
      this.byMal.set(ids.mal, value);
    }
    if (ids.anilist !== undefined && !this.byAniList.has(ids.anilist)) {
      this.byAniList.set(ids.anilist, value);
    }
  }

  lookup(ids: ExternalIds): T | undefined {
    return (
      (ids.mal === undefined ? undefined : this.byMal.get(ids.mal)) ??
      (ids.anilist === undefined ? undefined : this.byAniList.get(ids.anilist))
    );
  }
}

/** Pending changes by show: the last one for a show decides (a save after a removal re-adds it). */
const indexPending = (pending: readonly PendingChange[]) => {
  const byKey = new Map<string, PendingChange>();
  const byIds = new ShowIndex<PendingChange>();
  for (const item of pending) {
    byKey.set(item.key, item);
  }
  for (const item of byKey.values()) {
    byIds.add(item.ids, item);
  }
  return {
    forShow: (key: string | undefined, ids: ExternalIds): PendingChange | undefined =>
      (key === undefined ? undefined : byKey.get(key)) ?? byIds.lookup(ids),
  };
};

/** The update that brings `current` in line with the account's copy, if anything differs. */
const planUpdate = (
  current: SyncedEntry,
  item: RemoteEntry,
  values: ListUpdate,
  changedAt: number
): PlannedUpdate | undefined => {
  const ids = mergeIds(current.anime.ids, item.anime.ids);
  // The account's snapshot is fresher (episode counts, air dates) when it is from the same database.
  const anime =
    current.anime.source === item.anime.source ? { ...current.anime, ...item.anime, ids } : { ...current.anime, ids };
  const valuesChanged = !isEmptyChange(diffList(current, values));
  const snapshotChanged = snapshotOf(anime) !== snapshotOf(current.anime) || !sameIds(ids, current.anime.ids);
  if (!valuesChanged && !snapshotChanged) {
    return undefined;
  }
  return { ...values, anime, key: current.key, updatedAt: valuesChanged ? changedAt : current.updatedAt };
};

/**
 * Plans a pull: the library becomes the account's list, with pending changes from Ikuzo laid
 * over it. `now` stands in for missing change times.
 */
export const planPull = (
  local: readonly SyncedEntry[],
  remote: readonly RemoteEntry[],
  pending: readonly PendingChange[],
  now: number
): PullPlan => {
  const localIndex = new ShowIndex<SyncedEntry>();
  for (const entry of local) {
    localIndex.add(entry.anime.ids, entry);
  }
  const overlay = indexPending(pending);
  const plan: PullPlan = { deletes: [], inserts: [], updates: [] };
  const onAccount = new Set<string>();

  for (const item of remote) {
    const current = localIndex.lookup(item.anime.ids);
    const key = current?.key ?? entryKeyOf(item.anime);
    if (onAccount.has(key)) {
      // The same show twice in one list: the first one counts.
      continue;
    }
    onAccount.add(key);
    const change = overlay.forShow(current?.key, item.anime.ids);
    if (change?.kind === "remove") {
      // Deleted in Ikuzo; the removal has not reached the account yet.
      continue;
    }
    const values = { ...pickList(item), ...change?.change };
    const changedAt = item.updatedAt > 0 ? item.updatedAt : now;
    if (current === undefined) {
      plan.inserts.push({ ...values, anime: item.anime, key, updatedAt: changedAt });
      continue;
    }
    const update = planUpdate(current, item, values, changedAt);
    if (update !== undefined) {
      plan.updates.push(update);
    }
  }

  for (const entry of local) {
    if (!onAccount.has(entry.key) && overlay.forShow(entry.key, entry.anime.ids)?.kind !== "save") {
      plan.deletes.push(entry.key);
    }
  }
  return plan;
};

/** Library shows that are not on the account: what "upload my list" would add. */
export const planUpload = <T extends SyncedEntry>(local: readonly T[], remote: readonly RemoteEntry[]): T[] => {
  const onAccount = new ShowIndex<true>();
  for (const item of remote) {
    onAccount.add(item.anime.ids, true);
  }
  return local.filter((entry) => onAccount.lookup(entry.anime.ids) === undefined);
};
