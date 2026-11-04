import { createAniDbClient } from "@ikuzo/anime/anidb";
import type { AniDbClient } from "@ikuzo/anime/anidb";
import { createAniListProvider } from "@ikuzo/anime/anilist";
import { createJikanProvider } from "@ikuzo/anime/jikan";
import { createMalProvider } from "@ikuzo/anime/mal";
import type { AnimeProvider, Source } from "@ikuzo/anime/types";

import { readEnv } from "./env";
import { kv } from "./kv";
import { MAL_CLIENT_ID } from "./trackers-config";

export const anilist = createAniListProvider();

const providers: Record<Source, AnimeProvider> = {
  anilist,
  // Official MyAnimeList API first; Jikan and AniList fill in what it lacks or when Jikan is down.
  mal: createMalProvider({ anilist, clientId: MAL_CLIENT_ID, jikan: createJikanProvider() }),
};

export const getProvider = (source: Source): AnimeProvider => providers[source];

const anidbClientName = readEnv(process.env.EXPO_PUBLIC_ANIDB_CLIENT, "");
const anidbClientVersion = Number(readEnv(process.env.EXPO_PUBLIC_ANIDB_CLIENT_VERSION, "1"));

/** AniDB is only enabled when a registered client name is configured (see .env.example). */
export const anidb: AniDbClient | undefined =
  anidbClientName === ""
    ? undefined
    : createAniDbClient({
        cache: {
          get: kv.getItem,
          set: kv.setItem,
        },
        client: anidbClientName,
        clientVersion: Number.isFinite(anidbClientVersion) ? anidbClientVersion : 1,
      });

export const isSource = (value: unknown): value is Source => value === "mal" || value === "anilist";
