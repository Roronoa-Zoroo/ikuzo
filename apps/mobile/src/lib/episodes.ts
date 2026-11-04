import type { AnimeSummary } from "@ikuzo/anime/types";
import * as Haptics from "expo-haptics";
import { Alert } from "react-native";

import { showToast } from "@/components/toast";

import { connectedTrackers } from "./accounts";
import type { LibraryEntry } from "./library-types";
import { entryKeyFor, findEntry, getEntry, library } from "./store";

/**
 * The library key for a show, adding it to Plan to watch first when it is not in the list
 * (turning on notifications or writing a note needs an entry). Says so, since it also syncs.
 */
export const ensureInLibrary = (anime: AnimeSummary): string => {
  if (findEntry(anime) === undefined) {
    library.save(anime, { status: "planned" });
    showToast("Added to Plan to watch");
  }
  return entryKeyFor(anime);
};

/** +1 episode with a haptic tick and an Undo bar, like a proper tracker should. */
export const watchNextEpisode = (key: string): void => {
  const before = getEntry(key);
  if (before === undefined) {
    return;
  }
  library.increment(key);
  const after = getEntry(key);
  if (after === undefined || after.progress === before.progress) {
    showToast("All episodes watched");
    return;
  }
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  const finished = after.status === "completed" && before.status !== "completed";
  showToast(finished ? `Completed · ${after.progress} episodes` : `Episode ${after.progress} watched`, {
    label: "Undo",
    onPress: () => {
      library.update(key, { progress: before.progress, status: before.status });
    },
  });
};

const removeWithUndo = (entry: LibraryEntry): void => {
  const removed = library.remove(entry.key);
  if (removed === undefined) {
    return;
  }
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  showToast("Removed from your list", {
    label: "Undo",
    onPress: () => {
      library.restoreEntry(removed);
    },
  });
};

/**
 * Asks before removing a show from the list. After a short delay that Undo can cancel, it is
 * also removed on the connected AniList / MyAnimeList accounts. Notes about it are kept.
 */
export const confirmRemove = (entry: LibraryEntry, title: string, onRemoved?: () => void): void => {
  const synced = connectedTrackers().length > 0;
  const details = synced ? "It is also removed from your connected accounts." : undefined;
  Alert.alert(`Remove ${title}?`, details, [
    { style: "cancel", text: "Cancel" },
    {
      onPress: () => {
        removeWithUndo(entry);
        onRemoved?.();
      },
      style: "destructive",
      text: "Remove",
    },
  ]);
};

export const deleteNoteWithUndo = (noteId: string): void => {
  const note = library.deleteNote(noteId);
  if (note !== undefined) {
    showToast("Note deleted", {
      label: "Undo",
      onPress: () => {
        library.restoreNote(note);
      },
    });
  }
};
