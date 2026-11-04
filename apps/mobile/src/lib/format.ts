import type { AiringStatus, Season } from "@ikuzo/anime/types";

const MONTHS_PER_SEASON = 3;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 1440;

const SEASON_BY_MONTH: readonly Season[] = ["winter", "spring", "summer", "fall"];

/** "2026-10-02 - ???" like the classic tracker list rows. */
export const formatDateRange = (from?: string, to?: string, status?: AiringStatus): string | undefined => {
  if (from === undefined) {
    return undefined;
  }
  if (to !== undefined) {
    return `${from} - ${to}`;
  }
  return status === "finished" ? `${from} - ${from}` : `${from} - ???`;
};

export const formatAirTime = (epochMs: number): string =>
  new Date(epochMs).toLocaleString(undefined, {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "long",
  });

export const capitalize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

export const currentSeason = (date = new Date()): { year: number; season: Season } => ({
  season: SEASON_BY_MONTH[Math.floor(date.getMonth() / MONTHS_PER_SEASON)] ?? "winter",
  year: date.getFullYear(),
});

/** "4d 3h" of watch time for the stats screen. */
export const formatWatchTime = (minutes: number): string => {
  const days = Math.floor(minutes / MINUTES_PER_DAY);
  const hours = Math.floor((minutes % MINUTES_PER_DAY) / MINUTES_PER_HOUR);
  const mins = Math.round(minutes % MINUTES_PER_HOUR);
  return [days > 0 ? `${days}d` : "", hours > 0 ? `${hours}h` : "", `${mins}m`].filter(Boolean).join(" ");
};

export const formatCount = (value?: number): string => (value === undefined ? "-" : value.toLocaleString());
