import { readEnv } from "./env";

/*
 * OAuth client IDs of the official Ikuzo app. They are public identifiers (no
 * secret is used: AniList uses the implicit grant, MyAnimeList PKCE), so they
 * ship inside every build anyway. Forks should register their own clients.
 */
export const ANILIST_CLIENT_ID = readEnv(process.env.EXPO_PUBLIC_ANILIST_CLIENT_ID, "55958");
export const MAL_CLIENT_ID = readEnv(process.env.EXPO_PUBLIC_MAL_CLIENT_ID, "1713c8cabf956e2f3942c454d2956328");

/** Must match the redirect URLs registered with each service. */
export const ANILIST_REDIRECT = "ikuzo://auth/anilist";
export const MAL_REDIRECT = "ikuzo://auth/mal";
