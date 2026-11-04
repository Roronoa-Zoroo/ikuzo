import type { AnimeSummary, Source } from "@ikuzo/anime/types";
import * as WebBrowser from "expo-web-browser";

export const animeUrl = (source: Source, id: number): string =>
  source === "mal" ? `https://myanimelist.net/anime/${id}` : `https://anilist.co/anime/${id}`;

export const characterUrl = (source: Source, id: number): string =>
  source === "mal" ? `https://myanimelist.net/character/${id}` : `https://anilist.co/character/${id}`;

/** Episode discussion threads on r/anime. */
export const redditUrl = (anime: AnimeSummary): string => {
  const query = encodeURIComponent(`${anime.titleEnglish ?? anime.title} discussion`);
  return `https://www.reddit.com/r/anime/search/?q=${query}&restrict_sr=1&sort=new`;
};

export const anidbUrl = (aid: number): string => `https://anidb.net/anime/${aid}`;

export const youtubeSearchUrl = (song: string): string =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(song)}`;

export const openLink = async (url: string): Promise<void> => {
  await WebBrowser.openBrowserAsync(url);
};
