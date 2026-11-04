# @repo/storage

Provider-neutral object storage for private files. The package signs short-lived upload and download URLs for AWS S3, Cloudflare R2, and Azure Blob. It does not persist tenant records or credentials.

Callers resolve a trusted configuration and runtime credentials, then construct a client. Secrets never come from process environment variables inside this package.

## Direct-upload flow

1. Authorize the user against their tenant.
2. Resolve that tenant's storage configuration and a secret-manager reference (not raw keys in MongoDB).
3. Load credentials at request time and call `createObjectStorage(config, credentials)`.
4. Generate an application-owned object key. Keep original filenames as metadata only.
5. Return a signed PUT URL plus required headers to the browser.
6. After the browser uploads, verify object metadata and store `storageConfigId`, object key, content type, size, and checksum with the file record.

Existing objects must keep the configuration that created them. Changing a tenant's default provider must not orphan files.

```ts
import { createObjectStorage } from "@repo/storage";

const storage = createObjectStorage(
  {
    provider: "cloudflare-r2",
    accountId: tenant.storage.accountId,
    bucket: tenant.storage.bucket,
  },
  {
    kind: "access-key",
    accessKeyId: secret.accessKeyId,
    secretAccessKey: secret.secretAccessKey,
  }
);

const upload = await storage.createUploadUrl({
  key: `tenants/${tenant.id}/${crypto.randomUUID()}`,
  contentType: "image/png",
});

await fetch(upload.url, {
  method: upload.method,
  headers: upload.headers,
  body: file,
});
```

## Providers

| Config `provider` | Credentials | Notes |
| --- | --- | --- |
| `aws-s3` | `access-key` or `default` | `default` uses the AWS SDK credential chain (IRSA, instance role). |
| `cloudflare-r2` | `access-key` | Uses `https://<accountId>.r2.cloudflarestorage.com`. |
| `azure-blob` | `shared-key` or `token` | `token` signs a user-delegation SAS (managed identity compatible). |

Signed URLs default to 15 minutes and cannot exceed 1 hour. Uploads are PUT-only with a signed content type. Downloads are GET-only. Do not log credentials or signed URLs.

## Future tenant records

Store a provider config ID, location settings (bucket/container/region/account), and a secret-manager reference. File rows should retain `storageConfigId`, object key, content type, size, and checksum so reads and deletes continue against the original backend.
