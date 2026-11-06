import type { AnimeSummary, Source } from "@ikuzo/anime/types";
import { router } from "expo-router";

/** Most recently opened shows kept as previews; enough for any back stack. */
const PREVIEW_LIMIT = 50;
const previews = new Map<string, AnimeSummary>();

const hasSummary = (anime: Pick<AnimeSummary, "source" | "id"> | AnimeSummary): anime is AnimeSummary =>
  "title" in anime && "ids" in anime;

/**
 * The card that was tapped (title, poster, dates…), so the show page can draw it at once while
 * the full details load, instead of a spinner.
 */
export const previewOf = (source: Source, id: number): AnimeSummary | undefined => previews.get(`${source}:${id}`);

export const openAnime = (anime: Pick<AnimeSummary, "source" | "id"> | AnimeSummary): void => {
  if (hasSummary(anime)) {
    const key = `${anime.source}:${anime.id}`;
    previews.delete(key);
    previews.set(key, anime);
    if (previews.size > PREVIEW_LIMIT) {
      const oldest = previews.keys().next();
      if (oldest.done !== true) {
        previews.delete(oldest.value);
      }
    }
  }
  router.push({ params: { id: String(anime.id), source: anime.source }, pathname: "/anime/[source]/[id]" });
};

export const openCharacter = (source: Source, id: number): void => {
  router.push({ params: { id: String(id), source }, pathname: "/character/[source]/[id]" });
};

export const openCharacters = (source: Source, id: number): void => {
  router.push({ params: { id: String(id), source }, pathname: "/characters/[source]/[id]" });
};
