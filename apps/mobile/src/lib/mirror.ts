import type { Collection } from "@tanstack/react-db";

/** TanStack DB adds virtual `$…` fields to rows it returns; they must not be written back. */
export const stripVirtual = <T extends object>(row: T): T => {
  const copy = { ...row };
  for (const name of Object.keys(copy)) {
    if (name.startsWith("$")) {
      Reflect.deleteProperty(copy, name);
    }
  }
  return copy;
};

export interface Mirror<T extends object> {
  /** For useSyncExternalStore. */
  subscribe: (onChange: () => void) => () => void;
  /** Every row; the same array until something changes. */
  list: () => readonly T[];
  get: (key: string) => T | undefined;
  has: (key: string) => boolean;
  /** A value computed from the rows, kept until the next change (sorted lists, id indexes). */
  derive: <R>(compute: (rows: readonly T[]) => R) => () => R;
  /** Copies everything from the collection again (after the library has loaded from disk). */
  resync: () => void;
}

/**
 * One in-memory copy of a collection that every screen reads, kept current from the collection's
 * change events.
 *
 * Screens used to run a live query each; a query over the whole library takes tens of
 * milliseconds to start and every screen (and every hook on it) paid that again. Reading from
 * the mirror costs nothing, and a row keeps its identity until it changes, so only the parts of
 * the screen showing a changed row re-render.
 */
export const createMirror = <T extends object>(collection: Collection<T, string>): Mirror<T> => {
  const rows = new Map<string, T>();
  const listeners = new Set<() => void>();
  let started = false;
  let version = 0;
  let listCache: readonly T[] | undefined;

  const notify = () => {
    version += 1;
    listCache = undefined;
    for (const listener of listeners) {
      listener();
    }
  };

  /** Copies every row from the collection (at start, and again once it has loaded from disk). */
  const copyAll = () => {
    rows.clear();
    for (const key of collection.keys()) {
      const row = collection.get(key);
      if (row !== undefined) {
        rows.set(key, stripVirtual(row));
      }
    }
  };

  const start = () => {
    if (started) {
      return;
    }
    started = true;
    copyAll();
    // Never unsubscribed: collections live as long as the app, and a mirror that stopped
    // listening would have to be rebuilt from scratch on the next read.
    collection.subscribeChanges((changes) => {
      for (const change of changes) {
        if (change.type === "delete") {
          rows.delete(change.key);
        } else {
          rows.set(change.key, stripVirtual(change.value));
        }
      }
      notify();
    });
    // Rows read from disk when the app starts are not announced as changes: a screen that
    // mounted before the load finished would otherwise keep showing an empty list.
    collection.onFirstReady(() => {
      copyAll();
      notify();
    });
  };

  const list = (): readonly T[] => {
    start();
    listCache ??= [...rows.values()];
    return listCache;
  };

  return {
    derive: <R>(compute: (all: readonly T[]) => R) => {
      let at = -1;
      let value: R | undefined;
      return () => {
        const all = list();
        if (at !== version || value === undefined) {
          value = compute(all);
          at = version;
        }
        return value;
      };
    },
    get: (key) => {
      start();
      return rows.get(key);
    },
    has: (key) => {
      start();
      return rows.has(key);
    },
    list,
    resync: () => {
      if (started) {
        copyAll();
        notify();
      }
    },
    subscribe: (onChange) => {
      start();
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
  };
};
