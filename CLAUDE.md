# CLAUDE.md — agent guide for the Lupp repo

Shoppable-video widget platform. pnpm monorepo: `server/` (Fastify 5 + Prisma 7
+ Postgres), `client/` (Vite React SPA + the embeddable widget),
`lib/api-client` (shared REST client) and `lib/widget-config` (shared widget
settings contract). See `README.md` for the overview.

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
  the core↔adapter `window.__LUPP_WIDGET_BRIDGE__` bridge. The `nuvemshop-*`
  files in `client/public/` (script loader, NubeSDK loader, cart bridge,
  widget frame) are hand-maintained sources, NOT build outputs.
- **One bootstrap request (context mode)**: `GET /api/widget/bootstrap` with
  `url=` returns display rules, resolved config (incl.
  `display.home_ordering`) and slim video cards — all
  filtering/matching/price-formatting lives in
  `server/src/http/widget/context.ts` (mirrors old widget.js semantics; keep
  them in lockstep with the legacy no-`url` path used by old cached embeds).
- **Widget settings live in `lib/widget-config`**: one module owns the types,
  enums, canonical defaults and normalize/merge helpers, consumed by the
  dashboard form, the server write path and the bootstrap resolver. Changing
  a default there changes what un-configured stores render.
  `PATCH /api/widgets/:id` MERGES settings section-wise and normalizes
  (enums/colors/ranges) via `mergeWidgetSettings` — it is not a whole-object
  replace (`server/src/http/widgets/update-widget.ts`).
- **Embed attribute precedence**: explicit `data-*` attrs on the script tag
  override dashboard settings, which override defaults. Attribute/query names
  and defaults in `widget-src/main.ts` (`SCRIPT_VALUE_SPECS`) are public
  contract — never rename.
- **Store resolution chain**: store_id → integration external id → slug →
  indexed `store_domains` table (self-heals from legacy scans on miss;
  `resolve-store.ts`).
- **Billing gate**: `storeHasBillingAccess` (trial `trial_ends_at > now()` or
  live subscription) empties the widget's video list (`trial_expired`).
  Admin trial extension: admin console (`/admin`; access requires
  `users.role = 'admin'`, roles admin|manager|agent) or
  `POST /api/admin-console {action:"extend_trial"}`. `/master` redirects.
- **Auth**: 15-min access JWT in localStorage + 7-day httpOnly refresh cookie.
  The refresh call in `client/src/services/auth.service.ts` deliberately uses
  raw `fetch` — routing it through the shared client re-enters the bearer
  token getter and recurses. Don't "simplify" that.
- **Adapters load lazily** from the same origin as widget.js after bootstrap
  identifies `store.platform`; deploys must ship all four `widget*.js` files
  plus the Nuvemshop loaders — `deploy.sh`'s `publish_client_dist` fails loud
  if any of `widget.js`, the three adapters, `nuvemshop-script.js` or
  `nuvemshop-nubesdk.js` is missing from the published tree (the SPA fallback
  otherwise serves index.html as text/html for missing JS paths).
- **Nuvemshop API access** goes through `server/src/lib/nuvemshop/` (crm-style
  pattern: `core/` sub-clients Products/Store/Scripts/Oauth + `NuvemshopClient`
  facade; `BaseClient` keeps capped `lastRequest(s)`/`lastResponse(s)`
  inspection buffers via `src/lib/http/request-buffer.ts`). The legacy flat
  helpers are re-exported from its `index.ts`, so `@/lib/nuvemshop` imports
  still resolve. App id is 36726 (`NUVEMSHOP_APP_ID` default in `env.ts`).
- **Nuvemshop script install**: the Scripts API rejects association writes for
  auto-installed scripts (POST 422, PUT 404), so when `install-script` finds
  an active auto-installed Luup script, that listing IS terminal success
  (`AUTO_INSTALL_VERIFIED`) — don't "fix" it by retrying writes.
- **Two Nuvemshop script modes** (NubeSDK is mandatory for new installations
  from 2026-08-30):
  - *NubeSDK mode* (portal toggle ON): upload `public/nuvemshop-nubesdk-app.js`
    — built from `client/nubesdk-src/main.ts` via `npm run build:nubesdk`
    (esbuild ESM bundle, committed, deterministic). It runs in Nuvemshop's
    web worker (no DOM): renders `nuvemshop-widget-frame.html` through the
    SDK iframe component in the corner slot matching the dashboard position,
    relies on iframe `autoresize` for the frame's `{type:"resize"}` messages,
    and relays `LUPP_NUBESDK_CART_ADD` → `nube.send("cart:add")` →
    `LUPP_NUBESDK_CART_RESULT`. The frame installs
    `window.__LUUP_NUVEMSHOP_ADD_TO_CART__` as that relay — the widget's
    nuvemshop adapter prefers it over the form-POST fallback, so widget.js
    needs no changes. Caveat: NubeSDK storefront UI slots only work on the
    Patagonia theme.
  - *Classic mode* (toggle OFF): upload `public/nuvemshop-nubesdk.js`, the
    DOM loader that chain-loads `nuvemshop-script.js` → `widget.js` directly
    on the page (works on any theme; used by the legacy app).
- **Default hosts**: app/widget `https://luup.dzns.com.br`, API
  `https://luup.dzns.net` (client `env.ts` fallbacks, widget `PROD_API_URL`).
  API CORS is currently `origin: true` (allow-all; the old allowlist is
  commented out in `server/src/app.ts`). playluup.com.br is still accepted by
  the widget-side hostname checks (`widget-src/overlay.ts`) for old embeds.

## Verification rigs

- **Server**: vitest e2e per HTTP domain (`server/src/http/**/**.spec.ts`);
  every spec must run at least one prisma query or the worker hangs ~10s on
  teardown. Widget context tests: `context.spec.ts`. Nuvemshop live-API specs
  are gated on `NUVEMSHOP_TEST_ACCESS_TOKEN`/`NUVEMSHOP_TEST_STORE_ID`
  (`src/lib/nuvemshop/test/env.ts`) and skip when unset.
- **Real-widget preview**: `/test-store/:storeSlug` renders the live widget
  against a demo storefront; `lupp_*` query params on the page URL ride along
  on the script src as overrides (used by the `/app/widgets` editors' live
  preview — appearance is no longer hardcoded via data-attrs there).
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
- **SPA design tokens** (Tailwind v4, `client/src/index.css` `@theme`): never
  hardcode palette classes (`bg-white`, `text-slate-*`, `bg-blue-50`) or
  arbitrary sizes (`text-[11px]`, `max-h-[28rem]`) in app/admin surfaces — use
  the semantic tokens (`bg-card`, `text-foreground`/`text-muted-foreground`,
  `border-border`, status `*-surface` scales for success/warning/info/
  destructive), typography presets (`text-page-title`, `text-section-title`,
  `text-overline`, `text-2xs`…) and named sizes (`max-h-scroll-panel`,
  `min-w-table-min`…). All tokens have light **and** dark values (`.dark`
  via `ThemeProvider`/`ThemeToggle`); raw palette classes are only allowed on
  deliberately theme-independent visuals (landing/marketing, phone bezels,
  video overlays).
- Server responses use loose zod schemas with typed known fields — extra row
  fields must keep passing through (`.loose()`), and response schemas are
  serialized/validated by fastify, so a wrongly-typed field breaks the route.
- Widget code must stay dependency-free at runtime (hls.js is lazy-loaded
  from jsdelivr only when native HLS is missing).
