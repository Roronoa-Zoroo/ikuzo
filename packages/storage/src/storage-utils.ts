const DEFAULT_SIGNED_URL_EXPIRES_IN_SECONDS = 15 * 60;
const MAX_SIGNED_URL_EXPIRES_IN_SECONDS = 60 * 60;
const SIGNED_URL_CLOCK_SKEW_MS = 60_000;
const MAX_OBJECT_KEY_LENGTH = 1024;
const DELETE_CHAR_CODE = 127;
const CONTENT_TYPE_PATTERN = /^[\w!#$&.+\-^]+\/[\w!#$&.+\-^]+$/;

type StorageErrorCode = "INVALID_CONFIG" | "INVALID_INPUT" | "INVALID_KEY" | "NOT_FOUND" | "PROVIDER_ERROR";

export class StorageError extends Error {
  readonly code: StorageErrorCode;

  constructor(code: StorageErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "StorageError";
    this.code = code;
  }
}

export function assertObjectKey(key: string) {
  if (key.length === 0 || key.length > MAX_OBJECT_KEY_LENGTH) {
    throw new StorageError(
      "INVALID_KEY",
      "Object keys must be between 1 and 1024 characters and application-generated"
    );
  }

  if (key.startsWith("/") || key.startsWith("\\") || key.includes("\\")) {
    throw new StorageError("INVALID_KEY", "Object keys must be relative paths");
  }

  for (const character of key) {
    const characterCode = character.charCodeAt(0);
    if (characterCode <= 31 || characterCode === DELETE_CHAR_CODE) {
      throw new StorageError("INVALID_KEY", "Object keys cannot contain control characters");
    }
  }

  for (const segment of key.split("/")) {
    if (segment.length === 0 || segment === "." || segment === "..") {
      throw new StorageError("INVALID_KEY", "Object keys cannot contain empty or parent path segments");
    }
  }
}

export function resolveSignedUrlExpiry(expiresInSeconds?: number) {
  const expiresIn = expiresInSeconds ?? DEFAULT_SIGNED_URL_EXPIRES_IN_SECONDS;
  if (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > MAX_SIGNED_URL_EXPIRES_IN_SECONDS) {
    throw new StorageError(
      "INVALID_INPUT",
      `expiresInSeconds must be an integer between 1 and ${MAX_SIGNED_URL_EXPIRES_IN_SECONDS}`
    );
  }
  return expiresIn;
}

export function getExpiryDate(expiresInSeconds: number) {
  return new Date(Date.now() + expiresInSeconds * 1000);
}

export function getAzureSasWindow(expiresInSeconds: number) {
  const now = Date.now();
  return {
    expiresOn: getExpiryDate(expiresInSeconds),
    startsOn: new Date(now - SIGNED_URL_CLOCK_SKEW_MS),
  };
}

export function assertContentType(contentType: string) {
  if (!CONTENT_TYPE_PATTERN.test(contentType)) {
    throw new StorageError("INVALID_INPUT", "A valid content type is required to sign uploads");
  }
}

export function sanitizeFileName(fileName: string) {
  const sanitized = fileName.replace(/[\r\n"]/g, "").trim();
  if (sanitized.length === 0) {
    throw new StorageError("INVALID_INPUT", "fileName cannot be empty");
  }
  return sanitized;
}

export function toStorageError(error: unknown, fallbackMessage: string) {
  if (error instanceof StorageError) {
    return error;
  }
  if (isNotFoundError(error)) {
    return new StorageError("NOT_FOUND", "Object was not found", error);
  }
  return new StorageError("PROVIDER_ERROR", fallbackMessage, error);
}

export function isNotFoundError(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  if ("code" in error && error.code === "NOT_FOUND") {
    return true;
  }
  if ("name" in error && (error.name === "NotFound" || error.name === "NoSuchKey")) {
    return true;
  }
  if ("statusCode" in error && error.statusCode === 404) {
    return true;
  }
  return (
    "$metadata" in error &&
    typeof error.$metadata === "object" &&
    error.$metadata !== null &&
    "httpStatusCode" in error.$metadata &&
    error.$metadata.httpStatusCode === 404
  );
}
