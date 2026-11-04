import { aniListRequest, SUMMARY_FIELDS, toSummary } from "./anilist";
import type { AniListMedia } from "./anilist";
import type { ListStatus, ListUpdate, RemoteEntry, TrackerAccount, TrackerSession } from "./trackers";

const AUTHORIZE_URL = "https://anilist.co/api/v2/oauth/authorize";
const MS_PER_SECOND = 1000;
const SCORE_RAW_SCALE = 10;

const FROM_ANILIST: Record<string, ListStatus> = {
  COMPLETED: "completed",
  CURRENT: "watching",
  DROPPED: "dropped",
  PAUSED: "onHold",
  PLANNING: "planned",
  REPEATING: "watching",
};

const TO_ANILIST: Record<ListStatus, string> = {
  completed: "COMPLETED",
  dropped: "DROPPED",
  onHold: "PAUSED",
  planned: "PLANNING",
  watching: "CURRENT",
};

/**
 * AniList's implicit grant: the token comes back in the redirect URL fragment,
 * so the app never needs the client secret.
 */
export const aniListAuthorizeUrl = (clientId: string): string =>
  `${AUTHORIZE_URL}?client_id=${encodeURIComponent(clientId)}&response_type=token`;

/** Reads `#access_token=…&expires_in=…` from the redirect AniList sends back. */
export const parseAniListRedirect = (url: string, now = Date.now()): TrackerSession => {
  const fragment = url.includes("#") ? url.slice(url.indexOf("#") + 1) : "";
  const params = new URLSearchParams(fragment);
  const accessToken = params.get("access_token");
  if (accessToken === null || accessToken === "") {
    throw new Error(params.get("error_description") ?? "AniList did not return a sign-in token");
  }
  const expiresIn = Number(params.get("expires_in") ?? "0");
  return { accessToken, expiresAt: now + expiresIn * MS_PER_SECOND };
};

interface ListCollection {
  MediaListCollection: {
    lists: {
      isCustomList: boolean;
      entries: {
        mediaId: number;
        status: string;
        progress: number | null;
        score: number | null;
        updatedAt: number | null;
        media: AniListMedia;
      }[];
    }[];
  } | null;
}

const LIST_QUERY = `
query ($userId: Int, $userName: String) {
  MediaListCollection(userId: $userId, userName: $userName, type: ANIME) {
    lists {
      isCustomList
      entries {
        mediaId status progress updatedAt
        score(format: POINT_10)
        media { ${SUMMARY_FIELDS} }
      }
    }
  }
}`;

export const createAniListAccount = (accessToken?: string): TrackerAccount => {
  const request = async <T>(document: string, variables: Record<string, unknown> = {}): Promise<T> =>
    await aniListRequest<T>(document, variables, accessToken);

  const viewerId = async (): Promise<number> => {
    const data = await request<{ Viewer: { id: number } }>("{ Viewer { id } }");
    return data.Viewer.id;
  };

  return {
    async list(userName) {
      const variables = userName === undefined ? { userId: await viewerId() } : { userName };
      const data = await request<ListCollection>(LIST_QUERY, variables);
      const seen = new Set<number>();
      const entries: RemoteEntry[] = [];
      // Custom lists repeat entries from the status lists, so only status lists count.
      for (const list of data.MediaListCollection?.lists ?? []) {
        if (list.isCustomList) {
          continue;
        }
        for (const entry of list.entries) {
          const status = FROM_ANILIST[entry.status];
          if (status === undefined || seen.has(entry.mediaId)) {
            continue;
          }
          seen.add(entry.mediaId);
          entries.push({
            anime: toSummary(entry.media),
            progress: entry.progress ?? 0,
            score: Math.round(entry.score ?? 0),
            status,
            updatedAt: (entry.updatedAt ?? 0) * MS_PER_SECOND,
          });
        }
      }
      return entries;
    },

    async profile() {
      const data = await request<{ Viewer: { id: number; name: string; avatar?: { medium?: string } } }>(
        "{ Viewer { id name avatar { medium } } }"
      );
      return { avatar: data.Viewer.avatar?.medium, id: data.Viewer.id, name: data.Viewer.name };
    },

    async remove(animeId) {
      const data = await request<{ Media: { mediaListEntry: { id: number } | null } | null }>(
        "query ($id: Int) { Media(id: $id) { mediaListEntry { id } } }",
        { id: animeId }
      );
      const listEntryId = data.Media?.mediaListEntry?.id;
      if (listEntryId === undefined) {
        return;
      }
      await request("mutation ($id: Int) { DeleteMediaListEntry(id: $id) { deleted } }", { id: listEntryId });
    },

    async save(animeId, update: ListUpdate) {
      await request(
        `mutation ($mediaId: Int, $status: MediaListStatus, $progress: Int, $scoreRaw: Int) {
          SaveMediaListEntry(mediaId: $mediaId, status: $status, progress: $progress, scoreRaw: $scoreRaw) { id }
        }`,
        {
          mediaId: animeId,
          progress: update.progress,
          // scoreRaw is 0–100 whatever score format the user picked on AniList.
          scoreRaw: update.score * SCORE_RAW_SCALE,
          status: TO_ANILIST[update.status],
        }
      );
    },

    tracker: "anilist",
  };
};
