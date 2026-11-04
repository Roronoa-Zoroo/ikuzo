import { describe, expect, it } from "vitest";

import { diffList, planPull, planUpload } from "./account-sync";
import type { PendingChange, SyncedEntry } from "./account-sync";
import type { RemoteEntry } from "./trackers";
import type { AnimeSummary } from "./types";

const NOW = 1_000_000;

const anime = (source: "anilist" | "mal", id: number, ids: AnimeSummary["ids"]): AnimeSummary => ({
  episodes: 12,
  format: "TV",
  genres: [],
  id,
  ids,
  source,
  status: "finished",
  synonyms: [],
  title: `Show ${id}`,
});

const FRIEREN = anime("anilist", 1, { anilist: 1, mal: 101 });

const local = (overrides: Partial<SyncedEntry> = {}): SyncedEntry => ({
  anime: FRIEREN,
  key: "anilist:1",
  progress: 3,
  score: 7,
  status: "watching",
  updatedAt: 500,
  ...overrides,
});

const remote = (overrides: Partial<RemoteEntry> = {}): RemoteEntry => ({
  anime: FRIEREN,
  progress: 3,
  score: 7,
  status: "watching",
  updatedAt: 500,
  ...overrides,
});

const pending = (overrides: Partial<PendingChange> = {}): PendingChange => ({
  ids: { anilist: 1, mal: 101 },
  key: "anilist:1",
  kind: "save",
  ...overrides,
});

describe("diffList", () => {
  it("returns only the changed fields", () => {
    expect(
      diffList({ progress: 1, score: 5, status: "watching" }, { progress: 2, score: 5, status: "watching" })
    ).toEqual({ progress: 2 });
  });
});

describe("planPull", () => {
  it("makes the library equal the account's list", () => {
    const plan = planPull([local({ progress: 9, updatedAt: 900 })], [remote({ progress: 4 })], [], NOW);
    // The account wins even though the phone's copy looks newer.
    expect(plan.updates).toEqual([expect.objectContaining({ key: "anilist:1", progress: 4 })]);
  });

  it("changes nothing when the library already matches", () => {
    expect(planPull([local()], [remote()], [], NOW)).toEqual({ deletes: [], inserts: [], updates: [] });
  });

  it("adds shows from the account and removes shows that are gone from it", () => {
    const other = anime("mal", 202, { mal: 202 });
    const plan = planPull([local()], [remote({ anime: other })], [], NOW);
    expect(plan.inserts).toEqual([expect.objectContaining({ key: "mal:202" })]);
    expect(plan.deletes).toEqual(["anilist:1"]);
  });

  it("matches a show across databases by id", () => {
    const fromMal = anime("mal", 101, { mal: 101 });
    const plan = planPull([local()], [remote({ anime: fromMal, progress: 5 })], [], NOW);
    expect(plan.inserts).toEqual([]);
    expect(plan.deletes).toEqual([]);
    expect(plan.updates).toEqual([expect.objectContaining({ key: "anilist:1", progress: 5 })]);
  });

  it("keeps a change that has not reached the account yet", () => {
    const plan = planPull(
      [local({ progress: 6 })],
      [remote({ progress: 3 })],
      [pending({ change: { progress: 6 } })],
      NOW
    );
    expect(plan.updates).toEqual([]);
  });

  it("does not bring back a show whose removal has not reached the account yet", () => {
    const plan = planPull([], [remote()], [pending({ kind: "remove" })], NOW);
    expect(plan.inserts).toEqual([]);
  });

  it("keeps a show added in Ikuzo that the account does not have yet", () => {
    const plan = planPull([local()], [], [pending({ change: { progress: 3, score: 7, status: "watching" } })], NOW);
    expect(plan.deletes).toEqual([]);
  });

  it("refreshes the snapshot when the account knows more", () => {
    const plan = planPull([local()], [remote({ anime: { ...FRIEREN, episodes: 28 } })], [], NOW);
    expect(plan.updates[0]?.anime.episodes).toBe(28);
  });
});

describe("planUpload", () => {
  it("lists the shows the account does not have", () => {
    const missing = local({ anime: anime("anilist", 2, { anilist: 2 }), key: "anilist:2" });
    expect(planUpload([local(), missing], [remote()])).toEqual([missing]);
  });
});
