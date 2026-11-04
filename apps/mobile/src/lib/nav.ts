import type { AnimeSummary, Source } from "@ikuzo/anime/types";
import { router } from "expo-router";

export const openAnime = (anime: Pick<AnimeSummary, "source" | "id">): void => {
  router.push({ params: { id: String(anime.id), source: anime.source }, pathname: "/anime/[source]/[id]" });
};

export const openCharacter = (source: Source, id: number): void => {
  router.push({ params: { id: String(id), source }, pathname: "/character/[source]/[id]" });
};

export const openCharacters = (source: Source, id: number): void => {
  router.push({ params: { id: String(id), source }, pathname: "/characters/[source]/[id]" });
};
