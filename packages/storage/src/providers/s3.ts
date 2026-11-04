import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type { ObjectStorage } from "../storage.ts";
import {
  assertContentType,
  assertObjectKey,
  getExpiryDate,
  resolveSignedUrlExpiry,
  sanitizeFileName,
  toStorageError,
} from "../storage-utils.ts";

export function createS3Storage(options: { bucket: string; client: S3Client }) {
  return {
    async createDownloadUrl(input) {
      assertObjectKey(input.key);
      const expiresInSeconds = resolveSignedUrlExpiry(input.expiresInSeconds);

      try {
        const url = await getSignedUrl(
          options.client,
          new GetObjectCommand({
            Bucket: options.bucket,
            Key: input.key,
            ResponseContentDisposition: input.fileName
              ? `attachment; filename="${sanitizeFileName(input.fileName)}"`
              : undefined,
          }),
          { expiresIn: expiresInSeconds }
        );

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
        const url = await getSignedUrl(
          options.client,
          new PutObjectCommand({
            Bucket: options.bucket,
            ContentType: input.contentType,
            Key: input.key,
          }),
          { expiresIn: expiresInSeconds }
        );

        return {
          expiresAt: getExpiryDate(expiresInSeconds),
          headers: { "Content-Type": input.contentType },
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
        await options.client.send(
          new DeleteObjectCommand({
            Bucket: options.bucket,
            Key: key,
          })
        );
      } catch (error) {
        throw toStorageError(error, "Failed to delete object");
      }
    },

    async getObjectMetadata(key) {
      assertObjectKey(key);

      try {
        const result = await options.client.send(
          new HeadObjectCommand({
            Bucket: options.bucket,
            Key: key,
          })
        );

        return {
          contentLength: result.ContentLength,
          contentType: result.ContentType,
          etag: result.ETag,
          key,
          lastModified: result.LastModified,
        };
      } catch (error) {
        throw toStorageError(error, "Failed to read object metadata");
      }
    },
  } satisfies ObjectStorage;
}
