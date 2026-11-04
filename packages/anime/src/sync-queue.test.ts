import { describe, expect, it } from "vitest";

import { enqueueOp, holdBulkRemovals, mergeOp } from "./sync-queue";
import type { SyncOp } from "./sync-queue";

const op = (overrides: Partial<SyncOp> = {}): SyncOp => ({
  at: 1,
  ids: { anilist: 1 },
  key: "anilist:1",
  kind: "save",
  title: "Show",
  tracker: "anilist",
  ...overrides,
});

const removals = (count: number): SyncOp[] =>
  Array.from({ length: count }, (_, index) => op({ key: `anilist:${index}`, kind: "remove" }));

describe("mergeOp", () => {
  it("sends the union of changed fields", () => {
    expect(mergeOp(op({ change: { progress: 2 } }), op({ at: 2, change: { score: 8 } })).change).toEqual({
      progress: 2,
      score: 8,
    });
  });

  it("never holds a change the user already made", () => {
    const merged = mergeOp(op({ change: { progress: 1 } }), op({ at: 2, change: { progress: 1 }, held: "bulk-add" }));
    expect(merged.held).toBeUndefined();
  });

  it("keeps a held addition held when the show is edited", () => {
    expect(mergeOp(op({ held: "bulk-add" }), op({ at: 2, change: { progress: 3 } })).held).toBe("bulk-add");
  });

  it("lets Undo replace a pending removal", () => {
    const merged = mergeOp(op({ held: "bulk-remove", kind: "remove" }), op({ at: 2, change: { progress: 3 } }));
    expect(merged).toMatchObject({ kind: "save" });
    expect(merged.held).toBeUndefined();
  });

  it("turns a pending save into a removal", () => {
    expect(mergeOp(op({ change: { progress: 3 } }), op({ at: 2, kind: "remove" })).kind).toBe("remove");
  });
});

describe("enqueueOp", () => {
  it("keeps one op per show and service", () => {
    const queue = enqueueOp(enqueueOp([op()], op({ at: 2 })), op({ at: 3, tracker: "mal" }));
    expect(queue).toHaveLength(2);
  });
});

describe("holdBulkRemovals", () => {
  it("sends a few removals", () => {
    expect(holdBulkRemovals(removals(5), 5).every((item) => item.held === undefined)).toBe(true);
  });

  it("holds many removals for one service", () => {
    expect(holdBulkRemovals(removals(6), 5).every((item) => item.held === "bulk-remove")).toBe(true);
  });

  it("does not hold removals the user approved", () => {
    const approved = removals(6).map((item) => ({ ...item, approved: true }));
    expect(holdBulkRemovals(approved, 5).every((item) => item.held === undefined)).toBe(true);
  });
});
