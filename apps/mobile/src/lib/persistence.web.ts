import { localStorageCollectionOptions } from "@tanstack/react-db";

/** The web build (development only) keeps the library in localStorage instead of SQLite. */
export const persistedOptions = <T extends object>(id: string, getKey: (item: T) => string) =>
  localStorageCollectionOptions<T, string>({ getKey, id, storageKey: `ikuzo-db:${id}` });
