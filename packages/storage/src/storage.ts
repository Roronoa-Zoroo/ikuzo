import { S3Client } from "@aws-sdk/client-s3";
import type { TokenCredential } from "@azure/core-auth";
import { BlobServiceClient, StorageSharedKeyCredential } from "@azure/storage-blob";

import { createAzureBlobStorage } from "./providers/azure-blob.ts";
import { createS3Storage } from "./providers/s3.ts";
import { StorageError } from "./storage-utils.ts";

type S3Config =
  | {
      provider: "aws-s3";
      bucket: string;
      region: string;
      endpoint?: string;
      forcePathStyle?: boolean;
    }
  | {
      provider: "cloudflare-r2";
      bucket: string;
      accountId: string;
      jurisdiction?: "eu" | "fedramp";
    };

type AzureConfig = {
  provider: "azure-blob";
  accountName: string;
  container: string;
  endpoint?: string;
};

type S3Credentials =
  | { kind: "default" }
  | {
      kind: "access-key";
      accessKeyId: string;
      secretAccessKey: string;
      sessionToken?: string;
    };

type AzureCredentials = { kind: "shared-key"; accountKey: string } | { kind: "token"; credential: TokenCredential };

export interface ObjectStorage {
  createDownloadUrl: (options: { key: string; expiresInSeconds?: number; fileName?: string }) => Promise<{
    key: string;
    url: string;
    method: "GET";
    expiresAt: Date;
  }>;
  createUploadUrl: (options: { key: string; contentType: string; expiresInSeconds?: number }) => Promise<{
    key: string;
    url: string;
    method: "PUT";
    headers: Record<string, string>;
    expiresAt: Date;
  }>;
  deleteObject: (key: string) => Promise<void>;
  getObjectMetadata: (key: string) => Promise<{
    key: string;
    contentType?: string;
    contentLength?: number;
    etag?: string;
    lastModified?: Date;
  }>;
}

export function createObjectStorage(config: S3Config, credentials: S3Credentials): ObjectStorage;
export function createObjectStorage(config: AzureConfig, credentials: AzureCredentials): ObjectStorage;
export function createObjectStorage(
  config: S3Config | AzureConfig,
  credentials: S3Credentials | AzureCredentials
): ObjectStorage {
  if (config.provider === "azure-blob") {
    if (credentials.kind !== "shared-key" && credentials.kind !== "token") {
      throw new StorageError("INVALID_CONFIG", "Azure Blob requires shared-key or token credentials");
    }

    const accountName = requireValue(config.accountName, "Azure account name");
    const credential =
      credentials.kind === "shared-key"
        ? new StorageSharedKeyCredential(accountName, requireValue(credentials.accountKey, "Azure account key"))
        : credentials.credential;

    return createAzureBlobStorage({
      accountName,
      container: requireValue(config.container, "Azure container"),
      serviceClient: new BlobServiceClient(
        config.endpoint ?? `https://${accountName}.blob.core.windows.net`,
        credential
      ),
      sharedKeyCredential: credential instanceof StorageSharedKeyCredential ? credential : undefined,
    });
  }

  if (credentials.kind !== "default" && credentials.kind !== "access-key") {
    throw new StorageError("INVALID_CONFIG", `${config.provider} requires S3 access-key or default credentials`);
  }

  if (config.provider === "cloudflare-r2") {
    if (credentials.kind !== "access-key") {
      throw new StorageError("INVALID_CONFIG", "Cloudflare R2 requires access-key credentials");
    }

    const accountId = requireValue(config.accountId, "Cloudflare R2 account id");
    return createS3Storage({
      bucket: requireValue(config.bucket, "Cloudflare R2 bucket"),
      client: new S3Client({
        credentials: resolveS3Credentials(credentials),
        endpoint: getR2Endpoint(accountId, config.jurisdiction),
        region: "auto",
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
      }),
    });
  }

  return createS3Storage({
    bucket: requireValue(config.bucket, "AWS S3 bucket"),
    client: new S3Client({
      credentials: credentials.kind === "access-key" ? resolveS3Credentials(credentials) : undefined,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      region: requireValue(config.region, "AWS S3 region"),
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    }),
  });
}

function resolveS3Credentials(credentials: Extract<S3Credentials, { kind: "access-key" }>) {
  return {
    accessKeyId: requireValue(credentials.accessKeyId, "S3 access key id"),
    secretAccessKey: requireValue(credentials.secretAccessKey, "S3 secret access key"),
    sessionToken: credentials.sessionToken,
  };
}

function requireValue(value: string, label: string): string {
  if (value.trim().length === 0) {
    throw new StorageError("INVALID_CONFIG", `${label} is required`);
  }
  return value;
}

function getR2Endpoint(
  accountId: string,
  jurisdiction: Extract<S3Config, { provider: "cloudflare-r2" }>["jurisdiction"]
) {
  if (jurisdiction === "eu") {
    return `https://${accountId}.eu.r2.cloudflarestorage.com`;
  }
  if (jurisdiction === "fedramp") {
    return `https://${accountId}.fedramp.r2.cloudflarestorage.com`;
  }
  return `https://${accountId}.r2.cloudflarestorage.com`;
}
