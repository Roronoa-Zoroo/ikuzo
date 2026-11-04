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
  /** The account whose list Ikuzo shows. The other connected account only receives a copy of changes. */
  main?: TrackerId;
  /**
   * Shows a sync found missing from the main account, when there were suspiciously many: they
   * stay in Ikuzo until the user confirms (an account switch or an API hiccup must not empty the list).
   */
  heldDeletes?: { tracker: TrackerId; keys: string[] };
  /**
   * The first account was connected while the phone had its own list, and the user has not yet
   * chosen between uploading it and using the account's list. Nothing syncs until they do.
   */
  awaitingChoice?: TrackerId;
}

interface AccountsActions {
  setProfile: (tracker: TrackerId, profile: TrackerProfile | undefined) => void;
  enqueue: (op: SyncOp) => void;
  setQueue: (update: (queue: SyncOp[]) => SyncOp[]) => void;
  setStatus: (status: Partial<Pick<AccountsState, "lastSyncAt" | "lastError" | "syncing">>) => void;
  setNeedsSignIn: (tracker: TrackerId, needed: boolean) => void;
  setMain: (tracker: TrackerId | undefined) => void;
  setHeldDeletes: (held: AccountsState["heldDeletes"]) => void;
  setAwaitingChoice: (tracker: TrackerId | undefined) => void;
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
      setAwaitingChoice: (awaitingChoice) => {
        set({ awaitingChoice });
      },
      setHeldDeletes: (heldDeletes) => {
        set({ heldDeletes });
      },
      setMain: (main) => {
        set({ main });
      },
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
          ? saved.queue.filter(
              (op) =>
                typeof op.tracker === "string" &&
                typeof op.title === "string" &&
                (op.held === undefined || op.held === "bulk-remove")
            )
          : [];
        return { ...current, ...saved, queue, syncing: false };
      },
      name: "ikuzo-accounts",
      partialize: ({ awaitingChoice, heldDeletes, lastError, lastSyncAt, main, needsSignIn, profiles, queue }) => ({
        awaitingChoice,
        heldDeletes,
        lastError,
        lastSyncAt,
        main,
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

/** The account whose list Ikuzo shows, or undefined without accounts (the list lives on the phone). */
export const mainTracker = (): TrackerId | undefined => {
  const { main } = useAccounts.getState();
  const connected = connectedTrackers();
  return main !== undefined && connected.includes(main) ? main : connected[0];
};

/** Connected accounts that only receive a copy of the changes. */
export const mirrorTrackers = (): TrackerId[] => {
  const main = mainTracker();
  return connectedTrackers().filter((tracker) => tracker !== main);
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
