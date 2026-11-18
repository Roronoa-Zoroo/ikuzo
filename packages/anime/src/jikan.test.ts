import { afterEach, describe, expect, it, vi } from "vitest";

import { createJikanProvider } from "./jikan";

/** Two pages shaped like Jikan's /anime/{id}/episodes response (only the fields Ikuzo reads). */
const pages: Record<string, unknown> = {
  "1": {
    data: [
      {
        aired: "2004-10-05T00:00:00+00:00",
        filler: false,
        mal_id: 1,
        recap: false,
        title: "Pilot",
        title_japanese: "第一話",
      },
      { aired: null, filler: true, mal_id: 2, recap: false, title: "Beach Day", title_japanese: null },
    ],
    pagination: { has_next_page: true },
  },
  "2": {
    data: [{ aired: "2004-10-19T00:00:00+00:00", filler: false, mal_id: 3, recap: true, title: null }],
    pagination: { has_next_page: false },
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getEpisodes", () => {
  it("reads every page and maps episodes", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        const page = new URL(url).searchParams.get("page") ?? "1";
        return await Promise.resolve(Response.json(pages[page]));
      })
    );
    const episodes = await createJikanProvider().getEpisodes?.(21);
    expect(urls.map((url) => new URL(url).pathname + new URL(url).search)).toEqual([
      "/v4/anime/21/episodes?page=1",
      "/v4/anime/21/episodes?page=2",
    ]);
    expect(episodes).toEqual([
      {
        airDate: "2004-10-05",
        filler: false,
        key: "1",
        number: "1",
        recap: false,
        title: "Pilot",
        titleNative: "第一話",
      },
      {
        airDate: undefined,
        filler: true,
        key: "2",
        number: "2",
        recap: false,
        title: "Beach Day",
        titleNative: undefined,
      },
      {
        airDate: "2004-10-19",
        filler: false,
        key: "3",
        number: "3",
        recap: true,
        title: undefined,
        titleNative: undefined,
      },
    ]);
  });
});
