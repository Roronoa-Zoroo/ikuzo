import { toast } from "sonner";

export function toastError(error: unknown) {
  const message = error instanceof Error && error.message ? error.message : "Something went wrong";
  toast.error(message);
}
