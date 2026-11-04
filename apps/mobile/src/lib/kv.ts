import Storage from "expo-sqlite/kv-store";

/** Key-value storage backed by SQLite on iOS and Android (see kv.web.ts for the browser). */
export const kv = {
  getItem: async (key: string): Promise<string | null> => await Storage.getItem(key),
  removeItem: async (key: string): Promise<void> => {
    await Storage.removeItem(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    await Storage.setItem(key, value);
  },
};
