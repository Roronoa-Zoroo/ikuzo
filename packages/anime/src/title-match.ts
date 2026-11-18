import type { AnimeSummary } from "./types";

type Titled = Pick<AnimeSummary, "title" | "titleEnglish" | "titleNative" | "synonyms">;

/** Lowercase, accents removed, punctuation turned into spaces: "Re:Zero − Kara" → "re zero kara". */
export const normalizeTitle = (text: string): string =>
  text
    .normalize("NFKD")
    .replaceAll(/\p{M}/gu, "")
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/**
 * How well a show's titles match what was typed: 3 a title starts with it, 2 a word in a title
 * starts with it, 1 every typed word appears somewhere, 0 no match.
 */
export const titleMatchScore = (anime: Titled, query: string): number => {
  const needle = normalizeTitle(query);
  if (needle === "") {
    return 0;
  }
  const words = needle.split(" ");
  let best = 0;
  for (const raw of [anime.title, anime.titleEnglish, anime.titleNative, ...anime.synonyms]) {
    if (raw === undefined || raw === "") {
      continue;
    }
    const title = normalizeTitle(raw);
    if (title.startsWith(needle)) {
      return 3;
    }
    if (best < 2 && ` ${title}`.includes(` ${needle}`)) {
      best = 2;
    } else if (best < 1 && words.every((word) => title.includes(word))) {
      best = 1;
    }
  }
  return best;
};

/** The items whose titles match, best matches first; ties keep their original order. */
export const matchTitles = <T>(items: readonly T[], query: string, titled: (item: T) => Titled): T[] =>
  items
    .map((item, index) => ({ index, item, score: titleMatchScore(titled(item), query) }))
    .filter((match) => match.score > 0)
    .toSorted((a, b) => b.score - a.score || a.index - b.index)
    .map((match) => match.item);
