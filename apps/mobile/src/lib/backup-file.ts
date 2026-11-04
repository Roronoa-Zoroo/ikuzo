import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

/**
 * Backups travel as .json files: a share sheet carries a file of any size, while sharing the
 * text itself crashes on Android once a big list passes the ~1 MB limit of an Intent.
 */
export const shareBackupFile = async (json: string): Promise<void> => {
  const name = `ikuzo-backup-${new Date().toISOString().slice(0, "YYYY-MM-DD".length)}.json`;
  const file = new File(Paths.cache, name);
  if (file.exists) {
    file.delete();
  }
  file.create();
  await file.write(json);
  await Sharing.shareAsync(file.uri, {
    UTI: "public.json",
    dialogTitle: "Save your Ikuzo backup",
    mimeType: "application/json",
  });
};

/** Lets the user pick a backup file; undefined when they cancel. */
export const pickBackupFile = async (): Promise<string | undefined> => {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    // Some file managers label .json files as plain text or a generic binary.
    type: ["application/json", "text/plain", "application/octet-stream"],
  });
  const [asset] = result.assets ?? [];
  if (result.canceled || asset === undefined) {
    return undefined;
  }
  return await new File(asset.uri).text();
};
