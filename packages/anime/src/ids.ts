import { fetchWithRetry, HttpError, readJson } from "./http";
import type { ExternalIds } from "./types";

/**
 * Cross-database ID mapping via ARM (https://arm.haglund.dev), an open
 * community service built on Fribb/anime-lists and anime-offline-database.
 */
const ARM_URL = "https://arm.haglund.dev/api/v2/ids";
const HTTP_NOT_FOUND = 404;

type ArmSource = "anidb" | "anilist" | "kitsu" | "myanimelist";

interface ArmResponse {
  anidb?: number | null;
  anilist?: number | null;
  kitsu?: number | null;
  myanimelist?: number | null;
}

export const resolveIds = async (source: ArmSource, id: number): Promise<ExternalIds> => {
  try {
    const response = await fetchWithRetry(`${ARM_URL}?source=${source}&id=${id}`);
    const body = await readJson<ArmResponse | null>(response);
    return {
      anidb: body?.anidb ?? undefined,
      anilist: body?.anilist ?? undefined,
      kitsu: body?.kitsu ?? undefined,
      mal: body?.myanimelist ?? undefined,
    };
  } catch (error) {
    if (error instanceof HttpError && error.status === HTTP_NOT_FOUND) {
      return {};
    }
    throw error;
  }
};

/** Fills in missing IDs (AniDB, AniList, MAL) for a show we already know one ID of. */
export const completeIds = async (ids: ExternalIds): Promise<ExternalIds> => {
  if (ids.anidb !== undefined && ids.anilist !== undefined && ids.mal !== undefined) {
    return ids;
  }
  let resolved: ExternalIds = {};
  if (ids.mal !== undefined) {
    resolved = await resolveIds("myanimelist", ids.mal);
  } else if (ids.anilist !== undefined) {
    resolved = await resolveIds("anilist", ids.anilist);
  }
  return { ...resolved, ...Object.fromEntries(Object.entries(ids).filter(([, value]) => value !== undefined)) };
};
