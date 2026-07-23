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
| `db:generate` / `db:push` / `db:migrate` / `db:seed` / `db:studio` | Prisma CLI wrappers (seed runs `prisma/seed.ts`) |

## Test architecture

Vitest runs two projects:

- **unit** — plain `node` environment, every `src/**/*.spec.ts` outside `src/http/`.
- **http** — `src/http/**/*.spec.ts`, running in a custom Prisma environment
  (`prisma/vitest-environment-prisma/`) that gives each test file an isolated,
  ephemeral Postgres schema (`?schema=<uuid>` + `prisma db push --force-reset`),
  dropped on teardown. Requires the docker-compose Postgres to be up.

## Routes

The API originated as a 1:1 port of the legacy Supabase edge functions — same
status codes and machine-readable `{ "error": "snake_case_code" }` bodies the
SPA switches on ("original edge function" below is the historical name; the
functions themselves no longer exist in this repo). Swagger UI at `/docs`
documents everything, including the auth/stores/products/feed/comments/
analytics/videos/widgets/integrations domains not listed here.

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
| `GET /api/widget/bootstrap` | lupp-widget-bootstrap (GET) — now also "context mode" (`url=` param → server-side display rules, page/product matching and slim render-ready cards under ETag/60s cache; see `src/http/widget/context.ts`) | public + billing gate |
| `POST /api/widget/events` | lupp-widget-bootstrap (POST) | public |
| `POST /api/widget/likes` | — (new; per-visitor like beacon, idempotent) | public |
| `GET\|POST /api/admin-console` (+ `GET /users` and `GET /stores/:storeId[/events\|products\|videos\|comments]` sub-lists) | admin-console (lived at `/api/master-console` before the rename) | JWT + admin role (re-read from DB) |

Known deferred seams (marked with TODO comments at the exact plug-in points):
the Bunny processing-status refresh inside `GET /api/widget/bootstrap`, and
the storefront HTML-scraping fallback source in the Upzero product sync. (The
Upzero storefront-id/cart-action discovery is implemented: the proxy's
`discover_cart_context` action scrapes server-side and caches into
`integrations.settings`.)

## Nuvemshop client

`src/lib/nuvemshop/` follows the crm-dzns client pattern: `core/` sub-clients
(`ProductsClient`, `StoreClient`, `ScriptsClient`, `OauthClient`), each
extending `BaseClient`, behind a `NuvemshopClient` facade. `BaseClient`
records capped
`lastRequest(s)`/`lastResponse(s)` inspection buffers
(`src/lib/http/request-buffer.ts`). The legacy flat helpers are re-exported
from `index.ts`, so existing `@/lib/nuvemshop` imports keep resolving.
Live-API specs are gated on `NUVEMSHOP_TEST_ACCESS_TOKEN` +
`NUVEMSHOP_TEST_STORE_ID` (`src/lib/nuvemshop/test/env.ts`, lenient — never
throws) and skip entirely when the credentials are absent.

## Conventions

- Route domains live under `src/http/<domain>/` — one handler+schema per file,
  registered in the domain's `routes.ts`, aggregated in `src/routes.ts`
  (`src/http/health/` is the exemplar).
- Env vars are validated in `src/env.ts` (zod); production refuses to boot with
  placeholder secrets.
- The widget settings contract (types, enums, defaults, `mergeWidgetSettings` /
  `normalizeWidgetSettings`) is imported from `@workspace/widget-config` — used
  by `src/http/widgets/update-widget.ts` (section-wise PATCH merge),
  `src/lib/widget-defaults.ts` and the bootstrap/context resolvers. Don't
  redeclare defaults locally.
- Error responses are centralized in `src/errors.ts` (custom error classes →
  HTTP status mapping, zod validation/serialization handling, Prisma error
  mapping).
