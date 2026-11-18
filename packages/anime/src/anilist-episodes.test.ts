import { describe, expect, it } from "vitest";

import { mergeAniListEpisodes } from "./anilist";

describe("mergeAniListEpisodes", () => {
  it("joins air dates and streaming titles by episode number", () => {
    const schedule = [
      { airingAt: 1_704_067_200, episode: 1 },
      { airingAt: 1_704_672_000, episode: 2 },
    ];
    const streaming = [
      { title: "Episode 2 - The Second One" },
      { title: "Episode 1 - Start" },
      { title: "Episode 3 – Leaked Early" },
      { title: "Trailer" },
    ];
    expect(mergeAniListEpisodes(schedule, streaming)).toEqual([
      { airDate: "2024-01-01", key: "1", number: "1", title: "Start" },
      { airDate: "2024-01-08", key: "2", number: "2", title: "The Second One" },
      { key: "3", number: "3", title: "Leaked Early" },
    ]);
  });
});
