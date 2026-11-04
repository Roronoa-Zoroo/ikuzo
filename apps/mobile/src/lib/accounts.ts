import { enqueueOp } from "@ikuzo/anime/sync-queue";
import type { HoldReason, SyncOp } from "@ikuzo/anime/sync-queue";
import type { TrackerId, TrackerProfile } from "@ikuzo/anime/trackers";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { kv } from "./kv";

export type { HoldReason, SyncOp } from "@ikuzo/anime/sync-queue";

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

export const useAccounts = create<AccountsState & AccountsActions>()(
  persist(
    (set) => ({
      enqueue: (op) => {
        set((state) => ({ queue: enqueueOp(state.queue, op) }));
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
