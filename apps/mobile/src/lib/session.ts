import type { TrackerSession } from "@ikuzo/anime/trackers";

/** Validates a stored session instead of trusting whatever JSON is in storage. */
export const parseSession = (raw: string | null): TrackerSession | undefined => {
  if (raw === null) {
    return undefined;
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const accessToken = "accessToken" in value ? value.accessToken : undefined;
  const expiresAt = "expiresAt" in value ? value.expiresAt : undefined;
  const refreshToken = "refreshToken" in value ? value.refreshToken : undefined;
  if (typeof accessToken !== "string" || typeof expiresAt !== "number") {
    return undefined;
  }
  return { accessToken, expiresAt, refreshToken: typeof refreshToken === "string" ? refreshToken : undefined };
};
