import { describe, expect, it } from "vitest";

import { matchTitles, normalizeTitle, titleMatchScore } from "./title-match";

const show = (title: string, extra: { titleEnglish?: string; synonyms?: string[] } = {}) => ({
  synonyms: extra.synonyms ?? [],
  title,
  titleEnglish: extra.titleEnglish,
  titleNative: undefined,
});

describe("normalizeTitle", () => {
  it("drops case, accents and punctuation", () => {
    expect(normalizeTitle("Re:Zero − Kara Hajimeru")).toBe("re zero kara hajimeru");
    expect(normalizeTitle("Pokémon")).toBe("pokemon");
  });
});

describe("titleMatchScore", () => {
  it("ranks a title prefix above a word prefix above scattered words", () => {
    expect(titleMatchScore(show("Frieren"), "fri")).toBe(3);
    expect(titleMatchScore(show("Sousou no Frieren"), "fri")).toBe(2);
    expect(titleMatchScore(show("Shingeki no Kyojin"), "kyo shin")).toBe(1);
    expect(titleMatchScore(show("Bleach"), "naruto")).toBe(0);
  });

  it("checks the English title and synonyms", () => {
    expect(titleMatchScore(show("Shingeki no Kyojin", { titleEnglish: "Attack on Titan" }), "attack")).toBe(3);
    expect(titleMatchScore(show("Boku no Hero Academia", { synonyms: ["MHA"] }), "mha")).toBe(3);
  });

  it("matches nothing for an empty query", () => {
    expect(titleMatchScore(show("Frieren"), "  ")).toBe(0);
  });
});

describe("matchTitles", () => {
  it("puts the best matches first and keeps order within a score", () => {
    const items = [show("Sousou no Frieren"), show("Bleach"), show("Frieren 2"), show("Frieren")];
    expect(matchTitles(items, "frieren", (item) => item).map((item) => item.title)).toEqual([
      "Frieren 2",
      "Frieren",
      "Sousou no Frieren",
    ]);
  });
});
