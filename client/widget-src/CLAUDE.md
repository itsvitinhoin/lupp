# CLAUDE.md — widget-src agent guide

Storefront embed source (Fastify-free, dependency-free at runtime). Read the
repo-root `CLAUDE.md` and `client/CLAUDE.md` first. **Read `README.md` in
this directory before any non-trivial change** — it's a full file-by-file
architecture and server-integration analysis; this file is just the
condensed rule list.

`main.ts` is a thin orchestrator (parses embed config, resolves store
identity, builds the window bridge, populates `ctx`, kicks off the first
render) — the actual logic lives in one small, purpose-named module per
concern under `core/`. Don't pile new logic back into `main.ts`; add or
extend a `core/*.ts` module instead, matching the existing granularity (one
concern per file: config parsing, adapter loading, cart-sync, etc.).

## Hard rules

- **Never hand-edit `client/public/widget*.js`** — they're esbuild output of
  this directory (`npm run build:widget` from `client/`, or the root command).
  Build twice → must be byte-identical.
- **`SCRIPT_VALUE_SPECS` in `core/embed-config.ts` is a frozen public
  contract** — every `data-*` attribute name and script-src query alias it
  declares is already live on installed embeds. Add fields freely; never
  rename or remove one. `client/src/lib/widget-embed.ts` (the dashboard's
  generated snippet) must stay in lockstep with whatever subset it emits.
- **Config precedence is explicit-embed > dashboard-settings > default**
  (`applyContextConfig` + `hasExplicitScriptValue` in `core/embed-config.ts`).
  Don't "simplify" this back to dashboard-wins — that was a real regression
  that broke `/test-store/:storeSlug` and dashboard-editor live-preview
  overrides.
- **Keep `server/src/http/widget/context.ts` and this directory's
  bootstrap/config logic in lockstep.** Every filtering/display/matching
  function in the server file mirrors a client-side counterpart by name and
  by design (`core/embed-config.ts`'s `applyContextConfig`,
  `core/bootstrap-client.ts`'s `contextUrl`, `core/upzero-product-url.ts`'s
  `repairUpzeroProductUrl`, or `render/carousel.ts` for carousel-specific
  heuristics) — the server is the source of truth for context-mode
  responses, but the client still runs equivalent logic for the legacy
  no-`url` path old cached embeds hit. Changing one without the other makes
  storefront behavior depend on which cached widget version happens to be
  loaded.
- **`window.__LUPP_WIDGET_BRIDGE__` is the only channel into the platform
  adapters** (`platforms/*.ts`, built to separate `widget-{platform}.js`
  files and lazily injected by `core/adapter-loader.ts`). Never import
  `ctx` (`context.ts`) or anything under `core/`/`render/` from a
  `platforms/*.ts` file — they're separate esbuild entry points (separate
  bundles), so such an import would silently create its own disconnected
  copy of that module's state rather than sharing the one in `widget.js`.
  Add new shared surface to `BridgeConfig`/`BridgeState`/`BridgeUtils`/
  `AdapterRegistry` in `types.ts` instead.
- **`ctx` (`context.ts`) is populated exactly once, by `main.ts`, before any
  render/overlay code runs.** `render/*.ts` and `feed.ts` only ever read from
  it — never import from `core/*` there, only from `ctx` and their own
  sibling modules. `core/*` modules may write specific `ctx` fields they own
  after that point (e.g. `core/spa-navigation.ts` owns
  `ctx.lastRenderedUrl`/`ctx.lastRequestedContextUrl`).
- **Every inbound `postMessage` handler must check
  `isTrustedLuppFrameOrigin(event.origin)`** before doing anything (cart
  adds, product lookups, customer-status requests). This is the widget's
  only trust boundary against a malicious page embedding the feed iframe's
  message vocabulary.
- **No runtime dependencies beyond lazily-loaded hls.js.** Don't add an
  npm dependency that ends up in the widget bundle — `build-widget.mjs`
  bundles whatever `widget-src/` imports into a single IIFE shipped on every
  storefront page view.
- **No ES2015+ polyfills** — the widget's own gate
  (`!window.Promise || !window.fetch`) already assumes any browser that
  passes it also has `Array.find`, `Number.isFinite`, `Math.trunc`,
  `Element.closest`. Don't add a feature that needs anything newer without
  re-checking that gate.
- **Upzero `cart_batch` body is spec-pinned**: `{items:
  [{product_variant_id, quantity, asset_id?}], type}` only — see root
  `CLAUDE.md` and `platforms/upzero.ts`'s comment on the historical
  "missing field `items`" incident before changing this shape.
- **Upzero customer-status detection has several fallback strategies with
  real false-positive risk** (`platforms/upzero.ts`'s
  `detectUpzeroCustomerStatus`) — page-text inference, a `window.UPZERO_*`
  global, a scanned localStorage/cookie JWT, then a server-proxied
  `/v1/clients/me` call. Each logs its outcome via `debugLogCustomerStatus`
  when `window.__LUUP_DEBUG__` is set; if you're chasing a
  price-visibility/approval-gating bug, check
  `window.__LUPP_WIDGET_BRIDGE__.state.upzeroCustomerStatusCache.source`
  before assuming the bug is elsewhere.

## Where things live (see README.md §1–§4 for detail)

- `main.ts` — orchestrator only: parses embed config, resolves store
  identity, builds the window bridge, populates `ctx`, starts the first
  render. Add new *behavior* to a `core/*.ts` module, not here.
- `core/` — one focused module per main.ts concern (config parsing, adapter
  loading, cart-sync, Upzero product-URL repair, analytics, bootstrap
  fetching, SPA-navigation watching, render dispatch, message routing —
  see README.md's directory map for the full list). These may freely import
  each other and `ctx`; they must never be imported by `platforms/*.ts`.
- `context.ts` — the `ctx` shared-state object; `render/*.ts`, `feed.ts` and
  `core/*.ts` all read it, only `main.ts` performs the initial write.
- `feed.ts` — feed overlay iframe, postMessage envelope helpers, origin
  trust check.
- `render/launcher.ts`, `render/carousel.ts` — the two DOM renderers; the
  carousel file also owns home-carousel anchor-placement heuristics.
- `platforms/{upzero,nuvemshop,shopify}.ts` — one file per e-commerce
  platform, each built to its own `widget-{platform}.js`.
- `hls.ts` — lazy video attachment / lazy hls.js load.
- `utils.ts` / `types.ts` — shared helpers and TS contracts, re-exposed
  through the bridge for adapters to reuse.

## Testing

- `render/carousel.spec.ts` — unit tests for pure, DOM-independent helpers.
  When adding a new placement/scoring heuristic, extract the decision into a
  pure function and test it here rather than only exercising it via a live
  DOM. Run with `npx vitest run widget-src` from `client/`.
- After any change here, verify in this order: `npx tsc -p widget-src/tsconfig.json --noEmit`,
  `node build-widget.mjs` (rebuild twice and diff — must be byte-identical),
  `npx vitest run widget-src`.
- No live-DOM harness is committed here (assembled per-session against the
  rebuilt bundle — see root `CLAUDE.md`'s "Verification rigs"). Rebuild
  before relying on any browser-behavior claim.
