import type { AnimeSummary, Broadcast, NextEpisode } from "./types";

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const DAYS_PER_WEEK = 7;
const MS_PER_HOUR = MS_PER_MINUTE * MINUTES_PER_HOUR;
const MS_PER_DAY = MS_PER_HOUR * HOURS_PER_DAY;
const MS_PER_WEEK = MS_PER_DAY * DAYS_PER_WEEK;
const TIME_PATTERN = /^(?<hours>\d{1,2}):(?<minutes>\d{2})$/u;

/** Offset in minutes of `timeZone` from UTC at `date` (e.g. Asia/Tokyo → 540). */
const timeZoneOffset = (timeZone: string, date: Date): number => {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    hourCycle: "h23",
    minute: "numeric",
    month: "numeric",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"));
  return Math.round((asUtc - date.getTime()) / MS_PER_MINUTE);
};

/** The next time a weekly broadcast slot happens after `from`, as epoch milliseconds. */
export const nextBroadcast = (broadcast: Broadcast, from = Date.now()): number | undefined => {
  const match = TIME_PATTERN.exec(broadcast.time)?.groups;
  if (!match) {
    return undefined;
  }
  const offset = timeZoneOffset(broadcast.timezone, new Date(from));
  // "Now" expressed as wall-clock time in the broadcast timezone, stored in a UTC Date for arithmetic.
  const local = new Date(from + offset * MS_PER_MINUTE);
  const candidate = new Date(
    Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate() + ((broadcast.day - local.getUTCDay() + DAYS_PER_WEEK) % DAYS_PER_WEEK),
      Number(match.hours),
      Number(match.minutes)
    )
  );
  let at = candidate.getTime() - offset * MS_PER_MINUTE;
  if (at <= from) {
    at += MS_PER_WEEK;
  }
  return at;
};

/**
 * Best guess at the next episode: exact data (AniList) when present, otherwise
 * derived from the weekly broadcast slot and the premiere date (MyAnimeList).
 */
export const estimateNextEpisode = (anime: AnimeSummary, now = Date.now()): NextEpisode | undefined => {
  if (anime.nextEpisode && anime.nextEpisode.airingAt > now) {
    return anime.nextEpisode;
  }
  if (anime.status !== "airing" && anime.status !== "upcoming") {
    return undefined;
  }
  if (anime.broadcast === undefined) {
    return undefined;
  }
  const airingAt = nextBroadcast(anime.broadcast, now);
  if (airingAt === undefined) {
    return undefined;
  }
  const premiere = anime.airedFrom === undefined ? Number.NaN : Date.parse(anime.airedFrom);
  const episode = Number.isNaN(premiere) ? 1 : Math.max(1, Math.round((airingAt - premiere) / MS_PER_WEEK) + 1);
  if (anime.episodes !== null && episode > anime.episodes) {
    return undefined;
  }
  return { airingAt, episode };
};

/** "3w 2d 4h 10m" style countdown, matching what anime fans expect from trackers. */
export const formatCountdown = (ms: number): string => {
  const total = Math.abs(ms);
  const weeks = Math.floor(total / MS_PER_WEEK);
  const days = Math.floor((total % MS_PER_WEEK) / MS_PER_DAY);
  const hours = Math.floor((total % MS_PER_DAY) / MS_PER_HOUR);
  const minutes = Math.floor((total % MS_PER_HOUR) / MS_PER_MINUTE);
  const parts = [weeks ? `${weeks}w` : "", days ? `${days}d` : "", hours ? `${hours}h` : "", `${minutes}m`].filter(
    Boolean
  );
  return ms < 0 ? `${parts.join(" ")} ago` : `in ${parts.join(" ")}`;
};

/** Converts a broadcast slot to the device's local weekday (0 = Sunday), hour and minute. */
export const broadcastInLocalTime = (
  broadcast: Broadcast,
  from = Date.now()
): { weekday: number; hour: number; minute: number } | undefined => {
  const at = nextBroadcast(broadcast, from);
  if (at === undefined) {
    return undefined;
  }
  const date = new Date(at);
  return { hour: date.getHours(), minute: date.getMinutes(), weekday: date.getDay() };
};
