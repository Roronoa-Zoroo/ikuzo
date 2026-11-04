import * as Haptics from "expo-haptics";

import { showToast } from "@/components/toast";

import { useLibrary } from "./store";

/** +1 episode with a haptic tick and an Undo bar, like a proper tracker should. */
export const watchNextEpisode = (key: string): void => {
  const before = useLibrary.getState().entries[key];
  if (before === undefined) {
    return;
  }
  useLibrary.getState().increment(key);
  const after = useLibrary.getState().entries[key];
  if (after === undefined || after.progress === before.progress) {
    showToast("All episodes watched");
    return;
  }
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  const finished = after.status === "completed" && before.status !== "completed";
  showToast(finished ? `Completed · ${after.progress} episodes` : `Episode ${after.progress} watched`, {
    label: "Undo",
    onPress: () => {
      useLibrary.getState().update(key, { progress: before.progress, status: before.status });
    },
  });
};
