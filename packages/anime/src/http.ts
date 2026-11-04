import { HttpError } from "./errors";

const MAX_RETRIES = 3;
const DEFAULT_RETRY_MS = 2000;
const MS_PER_SECOND = 1000;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR = 500;

const readBody = async (response: Response): Promise<string> => {
  try {
    return await response.text();
  } catch {
    return "";
  }
};

const sleep = async (ms: number): Promise<void> => {
  // Wrapping setTimeout is the one place a Promise has to be constructed by hand.
  // oxlint-disable-next-line promise/avoid-new
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

/**
 * Typed view of an API payload. The upstream APIs are not validated at runtime;
 * callers describe the fields they read and treat everything as optional where it can be missing.
 */
// T is the caller-declared payload shape, so it only appears in the return type.
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters
export const parseJson = <T>(text: string): T => {
  const value: unknown = JSON.parse(text);
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return value as T;
};

export const readJson = async <T>(response: Response): Promise<T> => parseJson<T>(await response.text());

/**
 * Serialises requests so they are at least `intervalMs` apart.
 * Public anime APIs ban clients that burst (Jikan: 3/s, AniList: ~30-90/min, AniDB: 1 per 2s).
 */
export const createRateLimiter = (intervalMs: number) => {
  let next = 0;
  return async <T>(task: () => Promise<T>): Promise<T> => {
    const now = Date.now();
    const startAt = Math.max(now, next);
    next = startAt + intervalMs;
    if (startAt > now) {
      await sleep(startAt - now);
    }
    return await task();
  };
};

const retryDelay = (response: Response, attempt: number): number => {
  const header = Number(response.headers.get("retry-after"));
  if (Number.isFinite(header) && header > 0) {
    return header * MS_PER_SECOND;
  }
  return DEFAULT_RETRY_MS * (attempt + 1);
};

/** fetch with retries on 429 / 5xx, honouring Retry-After. */
export const fetchWithRetry = async (url: string, init?: RequestInit): Promise<Response> => {
  for (let attempt = 0; ; attempt += 1) {
    // Retries must run one after another, so awaiting inside the loop is intended.
    // oxlint-disable-next-line no-await-in-loop
    const response = await fetch(url, init);
    const retryable = response.status === HTTP_TOO_MANY_REQUESTS || response.status >= HTTP_SERVER_ERROR;
    if (response.ok || !retryable || attempt >= MAX_RETRIES) {
      if (!response.ok) {
        // oxlint-disable-next-line no-await-in-loop
        throw new HttpError(response.status, url, await readBody(response));
      }
      return response;
    }
    // oxlint-disable-next-line no-await-in-loop
    await sleep(retryDelay(response, attempt));
  }
};
