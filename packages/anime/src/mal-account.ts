import { AuthError } from "./auth-error";
import { HttpError } from "./errors";
import { createRateLimiter, fetchWithRetry, readJson } from "./http";
import type { ListChange, ListStatus, RemoteEntry, TrackerAccount, TrackerSession } from "./trackers";
import type { AiringStatus, AnimeSummary, MediaFormat, Season } from "./types";

const API = "https://api.myanimelist.net/v2";
const AUTHORIZE_URL = "https://myanimelist.net/v1/oauth2/authorize";
const TOKEN_URL = "https://myanimelist.net/v1/oauth2/token";
const REQUEST_INTERVAL_MS = 400;
const PAGE_SIZE = 1000;
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const HTTP_NOT_FOUND = 404;
const HTTP_UNAUTHORIZED = 401;
const HTTP_BAD_REQUEST = 400;
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const LIST_FIELDS = [
  "list_status",
  "alternative_titles",
  "media_type",
  "status",
  "num_episodes",
  "start_date",
  "end_date",
  "start_season",
  "mean",
  "num_list_users",
  "genres",
  "broadcast",
  "average_episode_duration",
  "nsfw",
].join(",");

const FROM_MAL: Record<string, ListStatus> = {
  completed: "completed",
  dropped: "dropped",
  on_hold: "onHold",
  plan_to_watch: "planned",
  watching: "watching",
};

const TO_MAL: Record<ListStatus, string> = {
  completed: "completed",
  dropped: "dropped",
  onHold: "on_hold",
  planned: "plan_to_watch",
  watching: "watching",
};

const FORMATS: Record<string, MediaFormat> = {
  movie: "Movie",
  music: "Music",
  ona: "ONA",
  ova: "OVA",
  special: "Special",
  tv: "TV",
  tv_special: "Special",
};

const STATUSES: Record<string, AiringStatus> = {
  currently_airing: "airing",
  finished_airing: "finished",
  not_yet_aired: "upcoming",
};

export interface MalNode {
  id: number;
  title: string;
  main_picture?: { medium?: string; large?: string };
  alternative_titles?: { synonyms?: string[]; en?: string; ja?: string };
  media_type?: string;
  status?: string;
  num_episodes?: number;
  start_date?: string;
  end_date?: string;
  start_season?: { year: number; season: string };
  mean?: number;
  num_list_users?: number;
  genres?: { name: string }[];
  broadcast?: { day_of_the_week?: string; start_time?: string };
  average_episode_duration?: number;
  nsfw?: string;
}

interface MalListItem {
  node: MalNode;
  list_status: { status: string; score: number; num_episodes_watched: number; updated_at: string };
}

interface MalListPage {
  data: MalListItem[];
  paging?: { next?: string };
}

const toSeason = (value?: string): Season | undefined =>
  value === "winter" || value === "spring" || value === "summer" || value === "fall" ? value : undefined;

const toBroadcast = (broadcast: MalNode["broadcast"]): AnimeSummary["broadcast"] => {
  const day = WEEKDAYS.indexOf(broadcast?.day_of_the_week ?? "");
  const time = broadcast?.start_time ?? "";
  return day === -1 || time === "" ? undefined : { day, time, timezone: "Asia/Tokyo" };
};

const toEpisodes = (count?: number): number | null => (count === undefined || count === 0 ? null : count);

const toDuration = (seconds?: number): number | undefined =>
  seconds === undefined || seconds === 0 ? undefined : Math.round(seconds / SECONDS_PER_MINUTE);

const toEnglish = (titles: MalNode["alternative_titles"]): string | undefined =>
  titles?.en === undefined || titles.en === "" ? undefined : titles.en;

/** The official MAL API's anime node in Ikuzo's shared shape. */
export const malNodeToSummary = (node: MalNode): AnimeSummary => ({
  airedFrom: node.start_date,
  airedTo: node.end_date,
  broadcast: toBroadcast(node.broadcast),
  durationMinutes: toDuration(node.average_episode_duration),
  episodes: toEpisodes(node.num_episodes),
  format: FORMATS[node.media_type ?? ""] ?? "Unknown",
  genres: (node.genres ?? []).map((genre) => genre.name),
  id: node.id,
  ids: { mal: node.id },
  image: node.main_picture?.large ?? node.main_picture?.medium,
  isAdult: node.nsfw === "black",
  members: node.num_list_users,
  score: node.mean,
  season: toSeason(node.start_season?.season),
  source: "mal",
  status: STATUSES[node.status ?? ""] ?? "unknown",
  synonyms: node.alternative_titles?.synonyms ?? [],
  title: node.title,
  titleEnglish: toEnglish(node.alternative_titles),
  titleNative: node.alternative_titles?.ja,
  year: node.start_season?.year,
});

// ── OAuth 2 with PKCE. MAL only supports the "plain" challenge method. ─────

export interface MalAuthRequest {
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  state: string;
}

export const malAuthorizeUrl = ({ clientId, redirectUri, codeVerifier, state }: MalAuthRequest): string => {
  const params = new URLSearchParams({
    client_id: clientId,
    code_challenge: codeVerifier,
    code_challenge_method: "plain",
    redirect_uri: redirectUri,
    response_type: "code",
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
};

/** Pulls the authorization code out of the redirect and checks it belongs to this sign-in. */
export const parseMalRedirect = (url: string, expectedState: string): string => {
  const query = url.includes("?") ? url.slice(url.indexOf("?") + 1).split("#")[0] : "";
  const params = new URLSearchParams(query);
  if (params.get("state") !== expectedState) {
    throw new Error("MyAnimeList sign-in was interrupted, please try again");
  }
  const code = params.get("code");
  if (code === null || code === "") {
    throw new Error(params.get("message") ?? params.get("error") ?? "MyAnimeList did not return a sign-in code");
  }
  return code;
};

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

const requestToken = async (body: Record<string, string>, now: number): Promise<TrackerSession> => {
  const response = await fetchWithRetry(TOKEN_URL, {
    body: new URLSearchParams(body).toString(),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
  const token = await readJson<TokenResponse>(response);
  return {
    accessToken: token.access_token,
    expiresAt: now + token.expires_in * MS_PER_SECOND,
    refreshToken: token.refresh_token,
  };
};

export const exchangeMalCode = async (
  request: Omit<MalAuthRequest, "state"> & { code: string }
): Promise<TrackerSession> =>
  await requestToken(
    {
      client_id: request.clientId,
      code: request.code,
      code_verifier: request.codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: request.redirectUri,
    },
    Date.now()
  );

/** Renews the sign-in. A refused refresh token means the user has to sign in again (AuthError). */
export const refreshMalSession = async (clientId: string, refreshToken: string): Promise<TrackerSession> => {
  try {
    return await requestToken(
      { client_id: clientId, grant_type: "refresh_token", refresh_token: refreshToken },
      Date.now()
    );
  } catch (error) {
    // MyAnimeList answers 400 invalid_grant or 401 for expired and revoked refresh tokens.
    if (error instanceof HttpError && (error.status === HTTP_BAD_REQUEST || error.status === HTTP_UNAUTHORIZED)) {
      throw new AuthError("MyAnimeList");
    }
    throw error;
  }
};

// ── API client ──────────────────────────────────────────────────────────────

const limit = createRateLimiter(REQUEST_INTERVAL_MS);

/**
 * Signed in, `accessToken` reads and edits the user's own list. Without it the
 * client ID alone can read any public list by user name.
 */
export const createMalAccount = (clientId: string, accessToken?: string): TrackerAccount => {
  const headers = (): Record<string, string> =>
    accessToken === undefined ? { "X-MAL-CLIENT-ID": clientId } : { Authorization: `Bearer ${accessToken}` };

  const call = async (
    url: string,
    init: { method?: string; body?: string; headers?: Record<string, string> } = {}
  ): Promise<Response> =>
    await limit(async () => {
      try {
        return await fetchWithRetry(url, { ...init, headers: { ...headers(), ...init.headers } });
      } catch (error) {
        if (accessToken !== undefined && error instanceof HttpError && error.status === HTTP_UNAUTHORIZED) {
          throw new AuthError("MyAnimeList");
        }
        throw error;
      }
    });

  return {
    async list(userName) {
      const user = userName === undefined ? "@me" : encodeURIComponent(userName);
      let next: string | undefined =
        `${API}/users/${user}/animelist?limit=${PAGE_SIZE}&nsfw=true&fields=${LIST_FIELDS}`;
      const entries: RemoteEntry[] = [];
      while (next !== undefined) {
        // Each page links to the next one, so pages are fetched in order.
        // oxlint-disable-next-line no-await-in-loop
        const page: MalListPage = await readJson<MalListPage>(await call(next));
        for (const item of page.data) {
          const status = FROM_MAL[item.list_status.status];
          if (status !== undefined) {
            entries.push({
              anime: malNodeToSummary(item.node),
              progress: item.list_status.num_episodes_watched,
              score: item.list_status.score,
              status,
              updatedAt: Date.parse(item.list_status.updated_at),
            });
          }
        }
        next = page.paging?.next;
      }
      return entries;
    },

    async profile() {
      const response = await call(`${API}/users/@me?fields=picture`);
      const user = await readJson<{ id: number; name: string; picture?: string }>(response);
      return { avatar: user.picture, id: user.id, name: user.name };
    },

    async remove(animeId) {
      try {
        await call(`${API}/anime/${animeId}/my_list_status`, { method: "DELETE" });
      } catch (error) {
        // Already gone from the list is fine.
        if (!(error instanceof HttpError && error.status === HTTP_NOT_FOUND)) {
          throw error;
        }
      }
    },

    async save(animeId, change: ListChange) {
      const body = new URLSearchParams();
      if (change.status !== undefined) {
        body.set("status", TO_MAL[change.status]);
      }
      if (change.progress !== undefined) {
        body.set("num_watched_episodes", String(change.progress));
      }
      if (change.score !== undefined) {
        body.set("score", String(change.score));
      }
      await call(`${API}/anime/${animeId}/my_list_status`, {
        body: body.toString(),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        method: "PATCH",
      });
    },

    tracker: "mal",
  };
};
