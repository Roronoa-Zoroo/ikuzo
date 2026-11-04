import type { ListChange, TrackerId, TrackerProfile } from "@ikuzo/anime/trackers";
import type { ExternalIds } from "@ikuzo/anime/types";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { kv } from "./kv";

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

interface AccountsState {
  /** Signed-in accounts. Tokens are kept separately in secure storage. */
  profiles: Partial<Record<TrackerId, TrackerProfile>>;
  queue: SyncOp[];
  lastSyncAt?: number;
  lastError?: string;
  /** Accounts whose token was rejected; they keep their queued changes until signed in again. */
  needsSignIn: TrackerId[];
  syncing: boolean;
}

interface AccountsActions {
  setProfile: (tracker: TrackerId, profile: TrackerProfile | undefined) => void;
  enqueue: (op: SyncOp) => void;
  setQueue: (update: (queue: SyncOp[]) => SyncOp[]) => void;
  setStatus: (status: Partial<Pick<AccountsState, "lastSyncAt" | "lastError" | "syncing">>) => void;
  setNeedsSignIn: (tracker: TrackerId, needed: boolean) => void;
}

const sameTarget = (a: Pick<SyncOp, "key" | "tracker">, b: Pick<SyncOp, "key" | "tracker">): boolean =>
  a.key === b.key && a.tracker === b.tracker;

/**
 * Folds a new change into the pending one for the same show and service:
 * save + save sends the union of the fields, anything + remove is a removal,
 * and remove + save (Undo, or added again) sends the full entry.
 */
export const mergeOp = (previous: SyncOp | undefined, next: SyncOp): SyncOp => {
  if (previous === undefined) {
    return next;
  }
  if (next.kind === "remove") {
    return { ...next, held: previous.held === "bulk-remove" ? previous.held : next.held };
  }
  if (previous.kind === "remove") {
    return next;
  }
  return { ...next, change: { ...previous.change, ...next.change }, held: previous.held ?? next.held };
};

export const useAccounts = create<AccountsState & AccountsActions>()(
  persist(
    (set) => ({
      enqueue: (op) => {
        set((state) => {
          const previous = state.queue.find((item) => sameTarget(item, op));
          return { queue: [...state.queue.filter((item) => !sameTarget(item, op)), mergeOp(previous, op)] };
        });
      },
      needsSignIn: [],
      profiles: {},
      queue: [],
      setNeedsSignIn: (tracker, needed) => {
        set((state) => ({
          needsSignIn: needed
            ? [...new Set([...state.needsSignIn, tracker])]
            : state.needsSignIn.filter((item) => item !== tracker),
        }));
      },
      setProfile: (tracker, profile) => {
        set((state) => ({ profiles: { ...state.profiles, [tracker]: profile } }));
      },
      setQueue: (update) => {
        set((state) => ({ queue: update(state.queue) }));
      },
      setStatus: (status) => {
        set(status);
      },
      syncing: false,
    }),
    {
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<AccountsState>;
        // Queues from older versions had another shape; they are dropped (the next sync re-sends differences).
        const queue = Array.isArray(saved.queue)
          ? saved.queue.filter((op) => typeof op.tracker === "string" && typeof op.title === "string")
          : [];
        return { ...current, ...saved, queue, syncing: false };
      },
      name: "ikuzo-accounts",
      partialize: ({ profiles, queue, lastSyncAt, lastError, needsSignIn }) => ({
        lastError,
        lastSyncAt,
        needsSignIn,
        profiles,
        queue,
      }),
      storage: createJSONStorage(() => kv),
      // No version bump: zustand drops saved state on a version change without a migrate
      // function, which would sign everyone out. Old queues are filtered in merge() instead.
    }
  )
);

export const connectedTrackers = (): TrackerId[] => {
  const { profiles } = useAccounts.getState();
  const trackers: TrackerId[] = [];
  if (profiles.anilist !== undefined) {
    trackers.push("anilist");
  }
  if (profiles.mal !== undefined) {
    trackers.push("mal");
  }
  return trackers;
};

export interface HeldGroup {
  tracker: TrackerId;
  reason: HoldReason;
  ops: SyncOp[];
}

/** Changes waiting for the user's OK, grouped by service and kind. */
export const groupHeld = (queue: SyncOp[]): HeldGroup[] => {
  const groups = new Map<string, HeldGroup>();
  for (const op of queue) {
    if (op.held !== undefined) {
      const id = `${op.tracker}:${op.held}`;
      const group = groups.get(id) ?? { ops: [], reason: op.held, tracker: op.tracker };
      group.ops.push(op);
      groups.set(id, group);
    }
  }
  return [...groups.values()];
};
