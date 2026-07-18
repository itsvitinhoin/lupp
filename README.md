# Lupp (Luup)

Shoppable-video widget platform for e-commerce storefronts: merchants upload
short videos, link them to products, and embed a floating launcher / carousel
that opens a fullscreen, TikTok-style shopping feed on their store.

## Workspace layout (pnpm monorepo)

| Path | What it is |
| --- | --- |
| `server/` | Fastify 5 API — auth, stores, videos, widgets, billing, analytics, platform integrations (Nuvemshop, Shopify, Upzero), public widget endpoints. Prisma 7 + PostgreSQL. |
| `client/` | Vite + React SPA — merchant dashboard (`/app/*`), public feed pages (`/s/:slug/feed`), landing. Serves the built widget from `public/`. |
| `client/widget-src/` | The embeddable storefront widget, written in strict TypeScript, bundled by esbuild (`client/build-widget.mjs`) into `client/public/widget.js` plus lazily-loaded platform adapters (`widget-upzero.js`, `widget-shopify.js`, `widget-nuvemshop.js`). |
| `lib/api-client-react/` | Shared REST client used by the SPA (`customFetch`, base-url + bearer-token wiring). |
| `deploy.sh` | Production deploy (VPS): build server+client, prisma migrate, systemd unit for the API, publish the SPA to `/var/www`, nginx vhost + TLS. |
| `backup.sh` | Snapshot-syncs production data into the local dev database. |

## Widget architecture (one request, server-side logic)

The embed script reads `data-*` attributes from its own `<script>` tag
(`data-store-id` is the only required identity) and makes **one** call:

```
GET {api}/api/widget/bootstrap?widget=...&url={page origin+path}&store_id=...
```

The server resolves the store (id → external id → slug → indexed
`store_domains`), applies billing gating, evaluates display rules and
product/page matching for the given URL, resolves the merchant's saved
settings over defaults, and returns **slim render-ready video cards**
(pre-formatted prices, resolved names/images) under ETag + 60s cache. The
client only renders; SPA navigations refetch per URL. Platform-specific code
(carts, Upzero customer status) loads on demand as adapter bundles from the
same origin as `widget.js`.

## Development

```bash
pnpm install
cd server && docker compose up -d   # postgres on host port 5433
cp server/.env.example server/.env
cd server && pnpm db:generate && pnpm db:push
pnpm --filter @workspace/server dev  # API on http://localhost:3333 (docs at /docs)
pnpm --filter @workspace/lupp dev    # SPA (Vite)
```

- Widget: edit `client/widget-src/*.ts`, then `cd client && npm run build:widget`
  (also chained into the client `build`). Typecheck: `npm run typecheck`
  (app + widget tsconfigs).
- Tests: `cd server && pnpm test` (vitest e2e against the dockerized DB).

## Production

- Default hosts: app/widget `https://luup.dzns.com.br`, API `https://luup.dzns.net`.
- `./deploy.sh` on the VPS (see the script header for the run model). The SPA
  is published to `/var/www/<service>` — nginx cannot serve from `/home/*`.
- Embed snippets are generated in the dashboard (`/app/widgets`,
  `/app/integrations`) and carry identity-only attributes; appearance and
  display rules live in the dashboard and are resolved server-side.
