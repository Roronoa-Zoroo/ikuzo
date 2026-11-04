import type { ListChange, TrackerId } from "./trackers";
import type { ExternalIds } from "./types";

/** Why a change waits for the user before it is sent. */
export type HoldReason = "bulk-remove" | "bulk-add";

/** One change made in Ikuzo that still has to reach one service. */
export interface SyncOp {
  /** Library entry key. There is at most one op per key and tracker; newer changes merge into it. */
  key: string;
  tracker: TrackerId;
  kind: "save" | "remove";
  ids: ExternalIds;
  /** Fields to send (save only). A show new to the service gets all of them. */
  change?: ListChange;
  /** Title for messages ("Could not update Frieren on AniList"). */
  title: string;
  at: number;
  /** Not sent before this time (removals wait, so Undo can cancel them). */
  notBefore?: number;
  /** Waits for the user's OK in Settings. */
  held?: HoldReason;
  /** The user confirmed this held change; it is not held again. */
  approved?: boolean;
}

export const sameTarget = (a: Pick<SyncOp, "key" | "tracker">, b: Pick<SyncOp, "key" | "tracker">): boolean =>
  a.key === b.key && a.tracker === b.tracker;

/**
 * Folds a new change into the pending one for the same show and service:
 * - save + save sends the union of the fields. Whether it waits for the user's OK is decided by
 *   the pending op: a change the user made never becomes held because a sync offered it later,
 *   and a held addition stays held until the user decides.
 * - anything + remove is a removal (held only if the pending removal was).
 * - remove + save (Undo, or added again) replaces the removal.
 */
export const mergeOp = (previous: SyncOp | undefined, next: SyncOp): SyncOp => {
  if (previous === undefined) {
    return next;
  }
  if (next.kind === "remove") {
    return {
      ...next,
      approved: previous.kind === "remove" ? previous.approved : undefined,
      held: previous.kind === "remove" ? previous.held : next.held,
    };
  }
  if (previous.kind === "remove") {
    return next;
  }
  return {
    ...next,
    approved: previous.approved,
    change: { ...previous.change, ...next.change },
    held: previous.held,
  };
};

/** Adds `op` to `queue`, merged with any pending op for the same show and service. */
export const enqueueOp = (queue: readonly SyncOp[], op: SyncOp): SyncOp[] => {
  const previous = queue.find((item) => sameTarget(item, op));
  return [...queue.filter((item) => !sameTarget(item, op)), mergeOp(previous, op)];
};

/**
 * Holds removals when there are more than `limit` for one service at once, so a mistake (or a
 * bug) can never empty someone's list on a service without them confirming it.
 */
export const holdBulkRemovals = (queue: readonly SyncOp[], limit: number): SyncOp[] => {
  const unconfirmed = (op: SyncOp): boolean => op.kind === "remove" && op.held === undefined && op.approved !== true;
  const counts = new Map<TrackerId, number>();
  for (const op of queue) {
    if (unconfirmed(op)) {
      counts.set(op.tracker, (counts.get(op.tracker) ?? 0) + 1);
    }
  }
  return queue.map((op) =>
    unconfirmed(op) && (counts.get(op.tracker) ?? 0) > limit ? { ...op, held: "bulk-remove" } : op
  );
};
