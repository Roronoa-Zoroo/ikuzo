/** Browser storage; expo-sqlite would need a WebAssembly worker for the same job. */
export const kv = {
  getItem: async (key: string): Promise<string | null> => {
    await Promise.resolve();
    return globalThis.localStorage.getItem(key);
  },
  removeItem: async (key: string): Promise<void> => {
    await Promise.resolve();
    globalThis.localStorage.removeItem(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    await Promise.resolve();
    globalThis.localStorage.setItem(key, value);
  },
};
