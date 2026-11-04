import * as Haptics from "expo-haptics";
import { Alert } from "react-native";

import { showToast } from "@/components/toast";

import { connectedTrackers } from "./accounts";
import type { LibraryEntry } from "./library-types";
import { getEntry, library } from "./store";

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
 * Asks before removing a show from the list: it also deletes the notes and, after a short
 * delay that Undo can cancel, the entry on connected AniList / MyAnimeList accounts.
 */
export const confirmRemove = (entry: LibraryEntry, title: string, onRemoved?: () => void): void => {
  const notes = entry.notes.length;
  const synced = connectedTrackers().length > 0;
  const details = [
    notes > 0 ? `${notes} ${notes === 1 ? "note" : "notes"} will be deleted.` : undefined,
    synced ? "It is also removed from your connected accounts." : undefined,
  ]
    .filter(Boolean)
    .join(" ");
  Alert.alert(`Remove ${title}?`, details === "" ? undefined : details, [
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

export const deleteNoteWithUndo = (key: string, noteId: string): void => {
  const note = library.deleteNote(key, noteId);
  if (note !== undefined) {
    showToast("Note deleted", {
      label: "Undo",
      onPress: () => {
        library.restoreNote(key, note);
      },
    });
  }
};
