import { createAniDbClient } from "@ikuzo/anime/anidb";
import type { AniDbClient } from "@ikuzo/anime/anidb";
import { createAniListProvider } from "@ikuzo/anime/anilist";
import { createJikanProvider } from "@ikuzo/anime/jikan";
import type { AnimeProvider, Source } from "@ikuzo/anime/types";

import { kv } from "./kv";

export const anilist = createAniListProvider();

const providers: Record<Source, AnimeProvider> = {
  anilist,
  mal: createJikanProvider(),
};

export const getProvider = (source: Source): AnimeProvider => providers[source];

const readEnv = (value: unknown, fallback: string): string =>
  typeof value === "string" && value !== "" ? value : fallback;

// Expo inlines EXPO_PUBLIC_* variables at build time, so they must be read by their full name.
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
