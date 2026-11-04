import { showToast } from "@/components/toast";

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * A change could not be written to the phone's storage. TanStack DB has already rolled it back
 * on screen; this tells the user instead of failing silently.
 */
export const reportWriteError = (error: unknown): void => {
  showToast(`Could not save that change: ${errorText(error)}`);
};
