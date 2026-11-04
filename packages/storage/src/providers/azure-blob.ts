import {
  BlobSASPermissions,
  type BlobServiceClient,
  generateBlobSASQueryParameters,
  SASProtocol,
  type StorageSharedKeyCredential,
} from "@azure/storage-blob";

import type { ObjectStorage } from "../storage.ts";
import {
  assertContentType,
  assertObjectKey,
  getAzureSasWindow,
  getExpiryDate,
  isNotFoundError,
  resolveSignedUrlExpiry,
  sanitizeFileName,
  toStorageError,
} from "../storage-utils.ts";

export function createAzureBlobStorage(options: {
  accountName: string;
  container: string;
  serviceClient: BlobServiceClient;
  sharedKeyCredential?: StorageSharedKeyCredential;
}) {
  const containerClient = options.serviceClient.getContainerClient(options.container);

  const createSasUrl = async (input: {
    key: string;
    permissions: string;
    expiresInSeconds: number;
    fileName?: string;
  }) => {
    const { startsOn, expiresOn } = getAzureSasWindow(input.expiresInSeconds);
    const blobClient = containerClient.getBlockBlobClient(input.key);
    const sasValues = {
      blobName: input.key,
      containerName: options.container,
      contentDisposition: input.fileName ? `attachment; filename="${sanitizeFileName(input.fileName)}"` : undefined,
      expiresOn,
      permissions: BlobSASPermissions.parse(input.permissions),
      protocol: SASProtocol.Https,
      startsOn,
    };
    const sas = options.sharedKeyCredential
      ? generateBlobSASQueryParameters(sasValues, options.sharedKeyCredential)
      : generateBlobSASQueryParameters(
          sasValues,
          await options.serviceClient.getUserDelegationKey(startsOn, expiresOn),
          options.accountName
        );

    return `${blobClient.url}?${sas.toString()}`;
  };

  return {
    async createDownloadUrl(input) {
      assertObjectKey(input.key);
      const expiresInSeconds = resolveSignedUrlExpiry(input.expiresInSeconds);

      try {
        const url = await createSasUrl({
          expiresInSeconds,
          fileName: input.fileName,
          key: input.key,
          permissions: "r",
        });

        return {
          expiresAt: getExpiryDate(expiresInSeconds),
          key: input.key,
          method: "GET" as const,
          url,
        };
      } catch (error) {
        throw toStorageError(error, "Failed to create a download URL");
      }
    },
    async createUploadUrl(input) {
      assertObjectKey(input.key);
      assertContentType(input.contentType);
      const expiresInSeconds = resolveSignedUrlExpiry(input.expiresInSeconds);

      try {
        const url = await createSasUrl({
          expiresInSeconds,
          key: input.key,
          permissions: "cw",
        });

        return {
          expiresAt: getExpiryDate(expiresInSeconds),
          headers: {
            "Content-Type": input.contentType,
            "x-ms-blob-type": "BlockBlob",
          },
          key: input.key,
          method: "PUT" as const,
          url,
        };
      } catch (error) {
        throw toStorageError(error, "Failed to create an upload URL");
      }
    },

    async deleteObject(key) {
      assertObjectKey(key);

      try {
        await containerClient.getBlockBlobClient(key).delete();
      } catch (error) {
        if (isNotFoundError(error)) {
          return;
        }
        throw toStorageError(error, "Failed to delete object");
      }
    },

    async getObjectMetadata(key) {
      assertObjectKey(key);

      try {
        const properties = await containerClient.getBlockBlobClient(key).getProperties();
        return {
          contentLength: properties.contentLength,
          contentType: properties.contentType,
          etag: properties.etag,
          key,
          lastModified: properties.lastModified,
        };
      } catch (error) {
        throw toStorageError(error, "Failed to read object metadata");
      }
    },
  } satisfies ObjectStorage;
}
