import { createExpoSQLitePersistence, persistedCollectionOptions } from "@tanstack/expo-db-sqlite-persistence";
import { openDatabaseSync } from "expo-sqlite";

/**
 * Library data lives in its own SQLite file through TanStack DB's Expo adapter.
 *
 * SCHEMA_VERSION must stay at 1: TanStack DB refuses to open local-only collections whose stored
 * version differs and has no migrations. New fields are added as optional fields instead.
 */
const SCHEMA_VERSION = 1;

const persistence = createExpoSQLitePersistence({ database: openDatabaseSync("ikuzo-library.db") });

export const persistedOptions = <T extends object>(id: string, getKey: (item: T) => string) =>
  persistedCollectionOptions<T, string>({ getKey, id, persistence, schemaVersion: SCHEMA_VERSION });
