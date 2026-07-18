# CLAUDE.md — agent guide for the Lupp repo

Shoppable-video widget platform. pnpm monorepo: `server/` (Fastify 5 + Prisma 7
+ Postgres), `client/` (Vite React SPA + the embeddable widget), and
`lib/api-client-react` (shared REST client). See `README.md` for the overview.

## Commands

```bash
pnpm run typecheck            # libs + client (app + widget-src) + server
cd server && pnpm test        # vitest e2e (needs docker postgres, port 5433)
cd server && pnpm dev         # API on :3333, Swagger at /docs
cd client && npm run dev      # SPA dev server
cd client && npm run build:widget   # esbuild widget-src/*.ts -> public/widget*.js
```

## Architecture facts that are easy to get wrong

- **The widget is compiled**: never edit `client/public/widget.js` (or the
  `widget-*.js` adapters) by hand — they are esbuild outputs of
  `client/widget-src/*.ts` (strict TS). Rebuild with `build:widget`; outputs
  are committed. `widget-src/types.ts` pins the server payload contract and
  the core↔adapter `window.__LUPP_WIDGET_BRIDGE__` bridge.
- **One bootstrap request (context mode)**: `GET /api/widget/bootstrap` with
  `url=` returns display rules, resolved config and slim video cards — all
  filtering/matching/price-formatting lives in
  `server/src/http/widget/context.ts` (mirrors old widget.js semantics; keep
  them in lockstep with the legacy no-`url` path used by old cached embeds).
- **Embed attribute precedence**: explicit `data-*` attrs on the script tag
  override dashboard settings, which override defaults. Attribute/query names
  and defaults in `widget-src/main.ts` (`SCRIPT_VALUE_SPECS`) are public
  contract — never rename.
- **Store resolution chain**: store_id → integration external id → slug →
  indexed `store_domains` table (self-heals from legacy scans on miss;
  `resolve-store.ts`).
- **Billing gate**: `storeHasBillingAccess` (trial `trial_ends_at > now()` or
  live subscription) empties the widget's video list (`trial_expired`).
  Admin trial extension: master console (`/master`, `MASTER_ADMIN_EMAILS`
  allowlist) or `POST /api/master-console {action:"extend_trial"}`.
- **Auth**: 15-min access JWT in localStorage + 7-day httpOnly refresh cookie.
  The refresh call in `client/src/services/auth.service.ts` deliberately uses
  raw `fetch` — routing it through the shared client re-enters the bearer
  token getter and recurses. Don't "simplify" that.
- **Adapters load lazily** from the same origin as widget.js after bootstrap
  identifies `store.platform`; deploys must ship all four `widget*.js` files.
- **Default hosts**: app/widget `https://luup.dzns.com.br`, API
  `https://luup.dzns.net` (client `env.ts` fallbacks, widget `PROD_API_URL`).
  playluup.com.br remains accepted in origin allowlists for old embeds.

## Verification rigs

- **Server**: vitest e2e per HTTP domain (`server/src/http/**/**.spec.ts`);
  every spec must run at least one prisma query or the worker hangs ~10s on
  teardown. Widget context tests: `context.spec.ts`.
- **Widget behavior harness**: a happy-dom harness (session scratchpads have
  `run-harness.mjs` + `cart-roundtrip.mjs` + captured fixtures) asserts the
  bootstrap URL, launcher render, adapter injection, overlay iframe URL, SPA
  refetch and trial-expired abort. When changing widget behavior, run it
  against the rebuilt bundle and compare with the previous one.
- Builds must stay deterministic: `build-widget.mjs` twice → byte-identical.

## Local environment

- Postgres in docker (`postgres-lupp`), host port **5433** (5432 is taken);
  compose project name `lupp`. API on **3333**.
- The local DB is a prod snapshot (`backup.sh`); trials lapse over time and
  the widget then returns `trial_expired` with no videos — extend with:
  `UPDATE stores SET trial_ends_at = now() + interval '30 days' WHERE status='active';`
- Production deploy is `deploy.sh` on the VPS: SPA published to
  `/var/www/<service>` (nginx can't traverse `/home/*` — that caused a
  site-wide static 403 once), API behind nginx `/api` proxy via systemd.

## Conventions

- Conventional Commits; branch off `main` (PRs usually target `main`).
- Server responses use loose zod schemas with typed known fields — extra row
  fields must keep passing through (`.loose()`), and response schemas are
  serialized/validated by fastify, so a wrongly-typed field breaks the route.
- Widget code must stay dependency-free at runtime (hls.js is lazy-loaded
  from jsdelivr only when native HLS is missing).
