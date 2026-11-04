import * as DocumentPicker from "expo-document-picker";

/** The browser build downloads the backup instead of opening a share sheet. */
export const shareBackupFile = async (json: string): Promise<void> => {
  await Promise.resolve();
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `ikuzo-backup-${new Date().toISOString().slice(0, "YYYY-MM-DD".length)}.json`;
  link.click();
  URL.revokeObjectURL(url);
};

export const pickBackupFile = async (): Promise<string | undefined> => {
  const result = await DocumentPicker.getDocumentAsync({ type: "application/json" });
  const [asset] = result.assets ?? [];
  if (result.canceled || asset === undefined) {
    return undefined;
  }
  const response = await fetch(asset.uri);
  return await response.text();
};
