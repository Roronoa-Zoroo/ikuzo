import type { ListUpdate, TrackerId, TrackerProfile } from "@ikuzo/anime/trackers";
import type { ExternalIds } from "@ikuzo/anime/types";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { kv } from "./kv";

/** A change made in Ikuzo that still has to reach one or more services. */
export interface SyncOp {
  /** Library entry key; a newer change to the same show replaces the older op. */
  key: string;
  kind: "save" | "remove";
  ids: ExternalIds;
  update?: ListUpdate;
  targets: TrackerId[];
  at: number;
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
  setQueue: (queue: SyncOp[]) => void;
  setStatus: (status: Partial<Pick<AccountsState, "lastSyncAt" | "lastError" | "syncing">>) => void;
  setNeedsSignIn: (tracker: TrackerId, needed: boolean) => void;
}

export const useAccounts = create<AccountsState & AccountsActions>()(
  persist(
    (set) => ({
      enqueue: (op) => {
        set((state) => {
          const previous = state.queue.find((item) => item.key === op.key);
          const targets = [...new Set([...(previous?.targets ?? []), ...op.targets])];
          return { queue: [...state.queue.filter((item) => item.key !== op.key), { ...op, targets }] };
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
      setQueue: (queue) => {
        set({ queue });
      },
      setStatus: (status) => {
        set(status);
      },
      syncing: false,
    }),
    {
      name: "ikuzo-accounts",
      partialize: ({ profiles, queue, lastSyncAt, lastError, needsSignIn }) => ({
        lastError,
        lastSyncAt,
        needsSignIn,
        profiles,
        queue,
      }),
      storage: createJSONStorage(() => kv),
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
