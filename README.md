# starter-template

pnpm + Turborepo starter: Vite web app, Hono + tRPC API, Better Auth, MongoDB, Redis, Cloudflare R2, and Resend.

| Package            | Role                                                  |
| ------------------ | ----------------------------------------------------- |
| `apps/web`         | Vite + TanStack Router client                         |
| `apps/api`         | Hono + tRPC server                                    |
| `packages/ui`      | Shared shadcn/ui components                           |
| `packages/db`      | MongoDB + Papr models                                 |
| `packages/runtime` | Logging, boot, HTTP lifecycle                         |
| `packages/email`   | React Email templates and a Resend mailer             |
| `packages/storage` | Signed upload/download URLs for S3, R2, or Azure Blob |

Needs **Node 24+**, **pnpm**, **Docker**, and [Portless](https://github.com/vercel-labs/portless) (`pnpm add -g portless`).

## Run locally

```bash
docker compose up -d
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
pnpm install
pnpm dev
```

Set `BETTER_AUTH_SECRET` in `apps/api/.env` to a string of at least 32 characters. Fill in the `R2_*` values for attachments and `RESEND_API_KEY` / `EMAIL_FROM` for mail.

- Web: https://starter.localhost
- API: https://api.starter.localhost

Email previews: `pnpm run email:preview`

## Rename the product

1. Update the copy in `apps/web/src/lib/site.ts`.
2. Replace files in `apps/web/public/` (logo, favicons, Open Graph image, manifest).
3. Match the HTML fallback metadata in `apps/web/index.html`.
4. Update the product name in email templates (`packages/email/src/layout.tsx` and `packages/email/src/emails/`).
5. Change the Portless names in `apps/web/package.json` and `apps/api/package.json` (`starter` / `api.starter`), then update `VITE_APP_URL`, `VITE_API_URL`, `BETTER_AUTH_URL`, and `WEB_ORIGIN` to the new hosts.

## Add a tRPC module

1. Add a Papr model in `packages/db` if the module needs new collections.
2. Create `apps/api/src/modules/<name>/router.ts` using `protectedProcedure` or `publicProcedure` from `apps/api/src/trpc.ts`.
3. Mount it on `appRouter` in `apps/api/src/router.ts`.
4. Call it from the web app with `useTRPC()` (`apps/web/src/lib/trpc.ts`). Types come from the `api` workspace package.

## Add a route

Add a file under `apps/web/src/routes/`. TanStack Router generates `routeTree.gen.ts` in dev. Put authenticated screens under `apps/web/src/routes/_authenticated/`.

## Object storage

Todo attachments upload to Cloudflare R2 with signed URLs. Configure bucket CORS for `WEB_ORIGIN`. `packages/storage` also supports AWS S3 and Azure Blob if you swap the client in `apps/api/src/lib/object-storage.ts`.

## Email

Transactional mail goes through Resend. Templates live in `packages/email`; the API sends them with `createMailer` in `apps/api/src/lib/mail.ts`. Better Auth uses that for password reset.

Set `RESEND_API_KEY` and `EMAIL_FROM` in `apps/api/.env`. Until you verify a domain, `Starter <beth.t@example.com>` works and Resend only delivers to the email on your Resend account.

Preview templates: `pnpm --filter @repo/email preview`

## Portless

HTTPS URLs on `*.localhost` come from Portless. If they fail:

- Run `portless doctor`, then `portless trust` if the browser warns about the certificate.
- Start the proxy with `portless proxy start` if nothing is listening on 443.
- On Windows, bind to 443 may need an elevated terminal the first time.
- Bypass the proxy with `PORTLESS=0` only for debugging; the checked-in `.env` hosts expect Portless names.

## Checks

```bash
pnpm check
pnpm check-types
pnpm build
```
