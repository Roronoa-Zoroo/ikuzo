import { describe, expect, it } from "vitest";

import { diffList, planSync } from "./sync-plan";
import type { SyncedEntry } from "./sync-plan";
import type { RemoteEntry } from "./trackers";
import type { AnimeSummary } from "./types";

const NOW = 1_000_000;
const EARLIER = 500_000;
const LATER = 900_000;

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

const local = (overrides: Partial<SyncedEntry> = {}): SyncedEntry => ({
  anime: anime("anilist", 1, { anilist: 1, mal: 101 }),
  key: "anilist:1",
  progress: 3,
  score: 7,
  status: "watching",
  updatedAt: EARLIER,
  ...overrides,
});

const remote = (overrides: Partial<RemoteEntry> = {}): RemoteEntry => ({
  anime: anime("anilist", 1, { anilist: 1, mal: 101 }),
  progress: 3,
  score: 7,
  status: "watching",
  updatedAt: EARLIER,
  ...overrides,
});

describe("diffList", () => {
  it("returns only the changed fields", () => {
    expect(
      diffList({ progress: 1, score: 5, status: "watching" }, { progress: 2, score: 5, status: "watching" })
    ).toEqual({ progress: 2 });
  });
});

describe("planSync", () => {
  it("takes a newer copy from the service and sends nothing back", () => {
    const plan = planSync([local()], { anilist: [remote({ progress: 5, updatedAt: LATER })] }, NOW);
    expect(plan.updates).toEqual([
      expect.objectContaining({
        key: "anilist:1",
        values: { progress: 5, score: 7, status: "watching", updatedAt: LATER },
      }),
    ]);
    expect(plan.pushes).toEqual([]);
  });

  it("sends only the changed fields when Ikuzo's copy is newer", () => {
    const plan = planSync([local({ progress: 6, updatedAt: LATER })], { anilist: [remote()] }, NOW);
    expect(plan.pushes).toEqual([
      { change: { progress: 6 }, ids: { anilist: 1, mal: 101 }, key: "anilist:1", tracker: "anilist" },
    ]);
    expect(plan.updates[0]?.values).toBeUndefined();
  });

  it("adds shows that only exist on the service", () => {
    const plan = planSync([], { mal: [remote({ anime: anime("mal", 202, { mal: 202 }) })] }, NOW);
    expect(plan.inserts).toEqual([expect.objectContaining({ key: "mal:202", trackers: { mal: NOW } })]);
    expect(plan.missing).toEqual([]);
  });

  it("matches the same show across services by MAL id", () => {
    const fromMal = remote({ anime: anime("mal", 101, { mal: 101 }), progress: 9, updatedAt: LATER });
    const plan = planSync([local({ trackers: { anilist: EARLIER } })], { anilist: [remote()], mal: [fromMal] }, NOW);
    expect(plan.inserts).toEqual([]);
    // MAL had the newest progress, so AniList gets it.
    expect(plan.pushes).toEqual([
      { change: { progress: 9 }, ids: { anilist: 1, mal: 101 }, key: "anilist:1", tracker: "anilist" },
    ]);
  });

  it("reports shows a service has never had instead of adding them", () => {
    const plan = planSync([local()], { mal: [] }, NOW);
    expect(plan.missing).toEqual([{ ids: { anilist: 1, mal: 101 }, key: "anilist:1", tracker: "mal" }]);
    expect(plan.pushes).toEqual([]);
  });

  it("never re-adds or deletes a show removed on the service", () => {
    const plan = planSync([local({ trackers: { anilist: EARLIER } })], { anilist: [] }, NOW);
    expect(plan.removedRemotely).toEqual([{ ids: { anilist: 1, mal: 101 }, key: "anilist:1", tracker: "anilist" }]);
    expect(plan.missing).toEqual([]);
    expect(plan.updates).toEqual([expect.objectContaining({ trackers: { anilist: 0 } })]);

    const again = planSync([local({ trackers: { anilist: 0 } })], { anilist: [] }, NOW);
    expect(again.removedRemotely).toEqual([]);
    expect(again.missing).toEqual([]);
  });

  it("leaves services that did not answer alone", () => {
    const plan = planSync([local({ trackers: { anilist: EARLIER, mal: EARLIER } })], { anilist: [remote()] }, NOW);
    expect(plan.removedRemotely).toEqual([]);
    expect(plan.missing).toEqual([]);
  });

  it("keeps Ikuzo's copy on a tie", () => {
    const plan = planSync([local({ progress: 4 })], { anilist: [remote({ progress: 2 })] }, NOW);
    expect(plan.pushes).toEqual([expect.objectContaining({ change: { progress: 4 } })]);
  });

  it("learns ids from the services", () => {
    const plan = planSync(
      [local({ anime: anime("anilist", 1, { anilist: 1 }) })],
      { anilist: [remote({ anime: anime("anilist", 1, { anilist: 1, mal: 101 }) })] },
      NOW
    );
    expect(plan.updates[0]?.ids).toEqual({ anilist: 1, mal: 101 });
  });
});
