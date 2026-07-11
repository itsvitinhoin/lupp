# @workspace/server

Lupp API server — Fastify 5 + Zod 4 type provider + Prisma 7 (PrismaPg adapter) + PostgreSQL 18.

## Setup

```bash
# From the repo root (pnpm workspace)
pnpm install

# From server/ — start Postgres (host port 5433; 5432 is taken locally)
docker compose up -d

cp .env.example .env
pnpm db:generate   # generate the Prisma client into generated/prisma
pnpm db:push       # sync the schema into the lupp database

pnpm dev           # http://localhost:3333 — Swagger UI at /docs
```

## Scripts

| Script | Purpose |
| --- | --- |
| `dev` | tsx watch mode on `src/server.ts` |
| `build` / `start` | tsup ESM build to `dist/` (prebuild runs `prisma generate`), then `node dist/server.js` |
| `test` / `test:watch` / `test:http` | Vitest (see test architecture below) |
| `lint` / `typecheck` | ESLint (flat config) / `tsc --noEmit` |
| `db:generate` / `db:push` / `db:migrate` / `db:studio` | Prisma CLI wrappers |

## Test architecture

Vitest runs two projects:

- **unit** — plain `node` environment, every `src/**/*.spec.ts` outside `src/http/`.
- **http** — `src/http/**/*.spec.ts`, running in a custom Prisma environment
  (`prisma/vitest-environment-prisma/`) that gives each test file an isolated,
  ephemeral Postgres schema (`?schema=<uuid>` + `prisma db push --force-reset`),
  dropped on teardown. Requires the docker-compose Postgres to be up.

## Routes (ported from supabase/functions)

Every Supabase edge function was ported 1:1 — same status codes and
machine-readable `{ "error": "snake_case_code" }` bodies the SPA switches on.
Swagger UI at `/docs` documents all of them.

| Route | Original edge function | Auth |
| --- | --- | --- |
| `GET /health` | — | public |
| `POST /api/billing/trial-plan` | lupp-change-trial-plan | JWT + membership |
| `POST /api/billing/subscriptions` | asaas-create-subscription | JWT + membership |
| `POST /api/billing/checkout` | asaas-create-checkout | JWT + membership |
| `POST /api/billing/change-plan` | asaas-change-plan | JWT + membership |
| `POST /api/billing/cancel-subscription` | asaas-cancel-subscription | JWT + membership |
| `POST /api/webhooks/asaas` | asaas-webhook | webhook token |
| `POST /api/videos/upload` | bunny-upload-video | JWT + membership |
| `POST /api/videos/status` | bunny-video-status | JWT + membership |
| `POST /api/videos/delete` | bunny-delete-video | JWT + membership |
| `POST /api/integrations/nuvemshop/oauth/start` | nuvemshop-oauth-start | JWT + membership |
| `GET /api/integrations/nuvemshop/oauth/callback` | nuvemshop-oauth-callback | signed state |
| `POST /api/integrations/nuvemshop/install-script` | nuvemshop-install-script | JWT + membership |
| `POST /api/integrations/nuvemshop/sync-products` | nuvemshop-sync-products | JWT + membership |
| `POST /api/webhooks/nuvemshop-lgpd/:event` | nuvemshop-lgpd-webhooks | HMAC signature |
| `POST /api/integrations/shopify/app-config` | shopify-app-config | public |
| `POST /api/integrations/shopify/oauth/start` | shopify-oauth-start | JWT + membership |
| `GET /api/integrations/shopify/oauth/callback` | shopify-oauth-callback | signed state + HMAC |
| `POST /api/integrations/shopify/embedded-session` | shopify-embedded-session | Shopify session token |
| `POST /api/integrations/shopify/session-token-ping` | shopify-session-token-ping | Shopify session token |
| `POST /api/integrations/shopify/connect-custom-app` | shopify-connect-custom-app | JWT + membership |
| `POST /api/integrations/shopify/sync-products` | shopify-sync-products | JWT + membership |
| `POST /api/webhooks/shopify-compliance[/:event]` | shopify-compliance-webhooks | HMAC signature |
| `POST /api/integrations/upzero/connect` | upzero-connect | JWT + membership |
| `POST /api/integrations/upzero/sync-products` | upzero-sync-products | JWT + membership |
| `POST /api/widget/upzero-proxy` | upzero-storefront-proxy | public + origin gate |
| `GET /api/widget/bootstrap` | lupp-widget-bootstrap (GET) | public + billing gate |
| `POST /api/widget/events` | lupp-widget-bootstrap (POST) | public |
| `GET\|POST /api/master-console` | master-console | JWT + admin allowlist |

Known deferred seams (marked with TODO comments at the exact plug-in points):
the Bunny processing-status refresh and Upzero storefront-id discovery inside
`GET /api/widget/bootstrap`, and the storefront HTML-scraping fallback source
in the Upzero product sync.

## Conventions

- Route domains live under `src/http/<domain>/` — one handler+schema per file,
  registered in the domain's `routes.ts`, aggregated in `src/routes.ts`
  (`src/http/health/` is the exemplar).
- Env vars are validated in `src/env.ts` (zod); production refuses to boot with
  placeholder secrets.
- Error responses are centralized in `src/errors.ts` (custom error classes →
  HTTP status mapping, zod validation/serialization handling, Prisma error
  mapping).
