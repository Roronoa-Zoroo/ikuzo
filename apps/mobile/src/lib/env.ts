/** Expo inlines EXPO_PUBLIC_* variables at build time, so callers must pass them by their full name. */
export const readEnv = (value: unknown, fallback: string): string =>
  typeof value === "string" && value !== "" ? value : fallback;
