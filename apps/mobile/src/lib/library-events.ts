import type { ListChange } from "@ikuzo/anime/trackers";

import type { LibraryEntry } from "./library-types";

/**
 * Changes the user made to their list, for the sync engine to send to AniList / MyAnimeList.
 * Data that came from those services, restores and snapshot refreshes are never announced here.
 */
export type LibraryChange =
  | { kind: "save"; entry: LibraryEntry; change: ListChange; isNew: boolean }
  | { kind: "remove"; entry: LibraryEntry };

type Listener = (change: LibraryChange) => void;

const listeners = new Set<Listener>();

export const onLibraryChange = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const emitLibraryChange = (change: LibraryChange): void => {
  for (const listener of listeners) {
    listener(change);
  }
};
