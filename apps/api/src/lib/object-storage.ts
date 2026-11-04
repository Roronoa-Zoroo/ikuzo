import { createObjectStorage } from "@repo/storage";
import { StorageError } from "@repo/storage/utils";

import { ENV } from "../env.ts";

export const objectStorage = createObjectStorage(
  {
    accountId: ENV.R2_ACCOUNT_ID,
    bucket: ENV.R2_BUCKET,
    provider: "cloudflare-r2",
  },
  {
    accessKeyId: ENV.R2_ACCESS_KEY_ID,
    kind: "access-key",
    secretAccessKey: ENV.R2_SECRET_ACCESS_KEY,
  }
);

export async function deleteStoredObjects(keys: string[]) {
  await Promise.all(
    keys.map(async (key) => {
      try {
        await objectStorage.deleteObject(key);
      } catch (error) {
        if (error instanceof StorageError && error.code === "NOT_FOUND") {
          return;
        }

        throw error;
      }
    })
  );
}
