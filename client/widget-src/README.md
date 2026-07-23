# Lupp widget — architecture and integration reference

This is the source for the storefront embed: a dependency-free (at runtime)
TypeScript bundle that merchants drop into their storefront as a single
`<script>` tag. It renders a floating video launcher, a full-bleed vertical
feed overlay, and/or a horizontal "home carousel" of shoppable videos, and it
talks to the Lupp API and to the merchant's e-commerce platform (Nuvemshop,
Shopify or Upzero) to read products and write cart items.

This document is a from-the-source analysis of every file in `widget-src/`,
how they fit together at runtime, and how the browser-side code integrates
with the server (`server/src/http/widget/*`, `server/src/http/upzero/*`) and
with each platform. See the repo-root `CLAUDE.md` and `client/CLAUDE.md` for
the broader project conventions this file specializes; see `CLAUDE.md` in
this directory for the terse agent-facing rules.

## 1. Directory map

```
widget-src/
├── main.ts                  core entry (orchestrator only) — bundled to public/widget.js
├── context.ts                shared mutable runtime state (ctx)
├── types.ts                  shared TS contracts (bootstrap payload, bridge)
├── utils.ts                  URL/hostname/query/HTML-escape/event helpers
├── hls.ts                    lazy HLS.js attachment for <video> playback
├── feed.ts                   feed overlay (iframe), postMessage envelope + origin trust check
├── core/                     main.ts's concerns, one focused module each
│   ├── constants.ts           values shared with render/carousel.ts (the mobile breakpoint)
│   ├── widget-type.ts         widgetType classification (isCarouselWidgetType, etc.)
│   ├── embed-config.ts        SCRIPT_VALUE_SPECS, raw-value resolution, config builders, precedence merge
│   ├── store-identity.ts      platform-global inference (Nuvemshop/Shopify store id), store classification
│   ├── adapter-loader.ts      lazy-loads a widget-{platform}.js next to widget.js
│   ├── customer-status.ts     core-side Upzero-vs-everyone-else customer status resolver
│   ├── cart-sync.ts           reflects a cart update onto the storefront's own cart badges/events
│   ├── upzero-product-url.ts  Upzero saved-product-URL repair (slim server products carry no variant path)
│   ├── analytics.ts           POST /api/widget/events beacon + visitor/session id generation
│   ├── bootstrap-client.ts    context-mode bootstrap request (GET /api/widget/bootstrap)
│   ├── spa-navigation.ts      SPA URL-change + carousel-viewport-breakpoint watching
│   ├── upzero-customer-watch.ts  re-checks Upzero login state on focus/pageshow/storage/account-link clicks
│   ├── load-strategy.ts       data-load-strategy gating (immediate/delayed/idle)
│   ├── render-dispatch.ts     picks launcher vs carousel vs stories_bar, owns the widget root element
│   └── message-handlers.ts    top-level postMessage router (customer-status / open-product-page requests)
├── render/
│   ├── launcher.ts           floating bubble: DOM, drag, impression tracking
│   ├── carousel.ts           home carousel: card rendering + anchor discovery
│   └── carousel.spec.ts      unit tests for the pure carousel helpers
├── platforms/
│   ├── upzero.ts              Upzero adapter — bundled to widget-upzero.js
│   ├── nuvemshop.ts           Nuvemshop adapter — bundled to widget-nuvemshop.js
│   └── shopify.ts            Shopify adapter — bundled to widget-shopify.js
└── tsconfig.json             strict, standalone TS config (own from client's)
```

**Import boundary**: `render/*.ts` and `feed.ts` only ever depend on `ctx`
(`context.ts`) plus their own sibling modules — never on `core/*` directly.
`main.ts` and `core/*` may freely import each other (they're all "core
orchestration"). This is the same boundary that existed before the refactor
(the render/overlay modules never reached into `main.ts`'s internals); it's
now enforced by there being no import path from `render/`/`feed.ts` into
`core/` rather than by convention alone. `platforms/*.ts` remain forbidden
from importing `ctx` or anything under `core/`/`render/` at all — they are
separate esbuild entry points (separate bundles), so any such import would
silently create a second, disconnected copy of that module's state rather
than sharing the one in `widget.js`; the window bridge
(`window.__LUPP_WIDGET_BRIDGE__`) is their only channel.

Build outputs (committed, never hand-edited):
`client/public/widget.js`, `widget-upzero.js`, `widget-shopify.js`,
`widget-nuvemshop.js` (plus `.js.map` sourcemaps), produced by
`client/build-widget.mjs` (esbuild, IIFE, minified, `target: es2017`).

Related but **not** part of this TS source tree (hand-maintained, live in
`client/public/`):
- `nuvemshop-script.js` — classic Nuvemshop portal-script loader that
  chain-loads `widget.js` on any theme.
- `nuvemshop-nubesdk.js` — the classic-mode NubeSDK entry (uploaded when the
  merchant's portal toggle is OFF); also exposes
  `window.__LUUP_NUVEMSHOP_ADD_TO_CART__`, the cart bridge the Nuvemshop
  adapter (`platforms/nuvemshop.ts`) looks for.
- `nuvemshop-nubesdk-app.js` — built from **`client/nubesdk-src/main.ts`**
  (separate esbuild ESM entry, `npm run build:nubesdk`), the NubeSDK
  worker-mode entry (uploaded when the portal toggle is ON).
- `nuvemshop-widget-frame.html` — the iframe page NubeSDK renders into its
  corner/section slots (launcher + home carousel UI on Patagonia theme).

## 2. Runtime architecture

### 2.1 One core bundle, lazily-loaded platform adapters

`main.ts` is a single self-invoking function (`(function () { "use strict"; ... })()`)
that runs the instant `widget.js` is parsed via `document.currentScript`. It
never imports the platform files directly — instead it exposes a **window
bridge**, `window.__LUPP_WIDGET_BRIDGE__` (typed as `WidgetBridge` in
`types.ts`), which carries:

- `config` — read-only startup values (`apiUrl`, `storeId`, `storeSlug`,
  `externalStoreId`, `luppBaseUrl`, `upzeroProxyBase`, `widgetType`, …)
- `state` (`BridgeState`) — mutable cross-module state: `activeStore`,
  `upzeroConfig`, the pending storefront-cart-refresh flag/detail, and the
  Upzero customer-status cache
- `utils` (`BridgeUtils`) — URL/hostname/HTML-escape/event helpers so the
  adapters don't duplicate them
- `adapters` (`AdapterRegistry`) — where each platform file registers itself
  once loaded (`bridge.adapters.upzero = {...}`)
- shared functions: `isUpzeroStore`/`isNuvemshopStore`/`isShopifyStore`,
  `isTrustedLuppFrameOrigin`, `postFrameResponse`,
  `updateXCartCounters`, `track`

`core/adapter-loader.ts`'s `loadAdapter(platform)` decides *which* adapter
file to inject, called once the bootstrap response identifies
`store.platform` (`core/store-identity.ts`'s `resolveAdapterPlatform`, or a
storefront-global heuristic finds one first — see §2.3). It reads
`window.__LUPP_WIDGET_BRIDGE__` directly (the same way the adapter files
themselves do) rather than taking the bridge as a parameter — there is only
ever one bridge instance. The adapter script is fetched from the same
directory as `widget.js` itself (`widget-{platform}.js`), so a deploy that
ships `widget.js` without all three `widget-*.js` files breaks silently for
that platform (this is why `deploy.sh` fails loud on a missing adapter file —
see root `CLAUDE.md`).

Exception: in **NubeSDK frame mode** (`nubesdkFrameMode` truthy — see §2.6),
the Nuvemshop adapter is loaded immediately at startup instead of waiting for
bootstrap, because cart-bridge `postMessage`s can arrive before the first
bootstrap round-trip resolves.

### 2.2 `context.ts` — the second shared object

Where the window bridge is the contract *between* the core and the platform
adapters, `context.ts` exports a second shared mutable object, `ctx`
(`WidgetRuntimeContext`), that every module bundled into `widget.js` reads
from — not just `render/`/`feed.ts` but the `core/*` modules main.ts
orchestrates too. Only `main.ts` *writes* the initial values (once, at
startup, before any render call — function declarations are hoisted so this
is safe); `core/*` modules mutate specific fields they own from then on
(e.g. `core/spa-navigation.ts` owns `ctx.lastRenderedUrl`/
`ctx.lastRequestedContextUrl`), while `feed.ts`, `render/launcher.ts` and
`render/carousel.ts` treat it as read-only. This avoids threading a dozen
parameters through every render call.

### 2.3 Startup sequence (`main.ts`)

1. **Read `SCRIPT_VALUE_SPECS`** — every embeddable setting (store identity,
   API/app URLs, launcher appearance, display flags, carousel config, load
   strategy) is declared once as `{ attr, query, def }`: a `data-*` attribute
   name, a list of script-src query-param aliases, and a default. One pass
   (`readScriptValue`) resolves each into `rawScript`. This table is the
   **public embed contract** — attribute/query names are frozen; adding a
   field is fine, renaming one breaks every already-installed embed.
2. **Infer store identity** when not explicit: `inferNuvemshopStoreId()`
   reads `window.LS`/`window.Tiendanube`/the `N.lojavirtualnuvem.com.br`
   hostname pattern; `inferShopifyStoreId()` reads `window.Shopify.shop` /
   `window.ShopifyAnalytics.meta.shop`.
3. **Resolve `apiUrl`**: explicit `data-api-url` wins; else `localhost:3333`
   on a localhost `luppBaseUrl`, else the `PROD_API_URL` constant
   (`https://luup.dzns.net`).
4. **Initial gate**: if there's no store identity at all
   (`storeId`/`storeSlug`/`externalStoreId`/`storeDomain`) or the widget type
   can't use bootstrap, the widget aborts (`emitWidgetAborted("initial_gate")`)
   and logs a Portuguese console warning. This is the only place the widget
   can fail to load entirely rather than just render nothing.
5. **Populate the window bridge and `ctx`**, call `preconnectFeedOrigin` (DNS/TLS
   warm-up for the feed iframe's origin, paid back the instant the launcher
   is clicked), create the root element, and start watching URL changes,
   Upzero customer-state changes, and the carousel's mobile breakpoint —
   **before** the first bootstrap fetch, so an SPA navigation mid-flight is
   never silently dropped (see §2.4's out-of-order guard).
6. **`runAfterPageReady(startWidget)`** — gates the actual first render on
   `data-load-strategy`: `immediate` runs synchronously, `delayed` waits
   ~2.2s, the default (`idle`) waits for `window.load` then
   `requestIdleCallback` (falling back to `setTimeout`).
7. **`startWidget()`** fetches context-mode bootstrap (see §3), applies the
   response, decides the adapter platform, and renders.

### 2.4 Context-mode bootstrap and SPA navigation

Every bootstrap call carries `url=` (origin + pathname of the current page,
or `data-product-url` inside a sandboxed iframe with no usable origin — see
`hasUsablePageOrigin`/`contextUrl`). The server (§3) answers with the
**already-filtered, already-ordered, already-formatted** video list for that
exact page plus a fully-evaluated `display`/`config` block — the browser does
no filtering, matching, or price formatting itself in this mode (context
mode is the only mode `widget.js` speaks in production; see
`shouldUseBootstrap`/`canUseBootstrap`, which is always true in the current
gate — the legacy PostgREST fallback was removed with the Supabase migration).

SPA navigations are not filtered client-side either: `watchUrlChanges` patches
`history.pushState`/`replaceState` and listens for `popstate`/`hashchange`,
and on a real URL change it calls `refreshContextForUrl`, which **re-fetches
bootstrap for the new URL**. The browser's HTTP cache plus the response's
`ETag`/`Cache-Control: public, max-age=60` (set by
`server/src/http/widget/bootstrap.ts`) make repeat visits to the same page
cheap. An out-of-order guard (`lastRequestedContextUrl`) ensures that if two
fetches are in flight (e.g. a fast double-navigation), only the response
matching the *latest* requested URL is allowed to render.

`watchCarouselViewportBreakpoint` listens for the exact `(max-width: 640px)`
media query (must match the CSS breakpoint `render/carousel.ts` injects) and
re-renders — using the already-fetched video list, no new network request —
whenever the viewport crosses that boundary, so `max_items` vs
`mobile_max_items` re-slice correctly on rotation/resize.

### 2.5 Config precedence: explicit embed > dashboard > defaults

`applyContextConfig` merges the server's resolved `config.launcher` /
`config.display` / `config.carousel` into the local `launcherConfig` /
`displayConfig` / `carouselConfig` objects — but **only for fields the embed
did not set explicitly** (`hasExplicitScriptValue`, checked per-field against
the same `SCRIPT_VALUE_SPECS` table). This makes the precedence chain:

```
explicit data-* attribute / script-src query param
  > dashboard-configured widget settings (echoed back by bootstrap)
    > SCRIPT_VALUE_SPECS default
```

This is deliberate and was previously backwards (dashboard settings used to
silently override explicit attributes, which broke override query params on
the `/test-store/:storeSlug` live-preview page — see §7).

### 2.6 Widget types and rendering surfaces

`widgetType` (from `data-widget` / `lupp_widget`, hyphens normalized to
underscores) selects one of:

| `widgetType`                                        | Rendered by          | Notes |
|------------------------------------------------------|-----------------------|-------|
| `floating_launcher` / `floating_video` (default)     | `render/launcher.ts`  | Draggable bubble; opens the feed overlay on click. Also injects the embedded home carousel alongside itself on the storefront home (see below). |
| `home_carousel` / `horizontal_feed` / `home_video_carousel` | `render/carousel.ts` | Standalone horizontal carousel widget (no launcher bubble). |
| `carousel` / `video_carousel`                         | `render/carousel.ts` | Same renderer, non-home-scoped variant. |
| `stories_bar`                                         | `renderStoriesBar` (`core/render-dispatch.ts`) | Simple horizontal avatar-ring row, up to 8 videos. |

`mappedWidgetType()` collapses `floating_launcher` and every carousel variant
down to the single server-side widget row type `floating_video` when calling
bootstrap (`isCarouselWidget()`/`isHomeCarouselWidget()` gate this) — the
distinction between "just a launcher" and "launcher + embedded home carousel"
is a *display*-time decision (`display.show_home_carousel`, server-evaluated,
see §3), not a different dashboard widget row.

A `floating_launcher`/`floating_video` widget additionally renders an
**embedded home carousel** (`renderEmbeddedHomeCarousel` in
`render/carousel.ts`) directly into the storefront's own DOM — not inside the
launcher's root — whenever the server says `display.show_home_carousel ===
true` (home path, home experience enabled, carousel plan-allowed). Placement
uses a cascade of heuristics tuned per platform (`ensureHomeCarouselRoot`):
1. `carousel.anchor_selector` (dashboard-configured CSS selector) if set and
   matched, inserted `before`/`after` per `carousel.anchor_placement`.
2. Upzero stores: a detected "shipping/payment benefits" strip
   (`findHomeBenefitsSection`, scored by keyword heuristic —
   `scoreBenefitsSectionText`/`HOME_BENEFITS_SECTION_MIN_SCORE`), then a
   heading matching `carousel.before_heading` ("Com Capa" by default), then a
   detected product-showcase section (`findUpzeroProductShowcaseSection`).
3. Non-Upzero (Shopify/Nuvemshop) stores: heading match first, then the
   benefits strip, then a Shopify-flavored product-grid heuristic
   (`findShopifyProductShowcaseSection`).
4. Fallback: `<main>` element, at the top or appended at the bottom per
   `carousel.anchor_fallback`.

If no anchor exists yet (the theme hasn't rendered it), a `MutationObserver`
(debounced 150ms) plus a capped retry timer (12 attempts, up to 1.6s apart)
keep re-checking until an anchor appears or the page is torn down
(`scheduleHomeCarouselAnchorRetry`/`hasHomeCarouselAnchor`).

### 2.7 The feed overlay (`feed.ts`)

`openFeedOverlay` builds a fullscreen `<div role="dialog">` containing an
`<iframe>` pointed at `{luppBaseUrl}/s/{storeSlug}/feed?embed=1&...` — the
Lupp SPA's own vertical-feed route, rendered as a separate page, not part of
this bundle. Notable behavior:

- **Focus trap + Escape-to-feedback**: Tab/Shift+Tab cycle within the overlay
  (`focusableOverlayElements`/`onOverlayKeydown`); Escape (and the × button,
  and a backdrop click) opens a 5-star feedback micro-form instead of closing
  immediately, tracked as `widget_view` events with
  `action: feedback_submit|feedback_skip`.
- **Reduced-motion aware**: `prefersReducedMotion()` skips the fade/scale
  transitions and the close-button-focus animation.
- **Upzero customer status gating**: the iframe `src` is built twice for
  Upzero stores — once synchronously from the cached/`CHECKING` status so the
  frame navigates immediately, then again once `ctx.detectCustomerStatus`
  resolves (avoiding a double frame reload for non-Upzero stores, which
  already resolve synchronously to `not_applicable`).
- **NubeSDK frame mode**: instead of building an iframe overlay itself, it
  `postMessage`s `LUPP_NUBESDK_OPEN_FEED` up to `window.parent` — the
  NubeSDK worker app (`nubesdk-src/main.ts`) owns opening the actual feed
  iframe in that mode (see §2.6/§6).
- **`postFrameResponse`/`isTrustedLuppFrameOrigin`**: the shared
  request/response envelope and origin allowlist (own origin, script's own
  origin, `luup.dzns.com.br`, `playluup.com.br`, `www.playluup.com.br`, any
  `*.vercel.app`) every adapter's `postMessage` handler checks before acting
  on a message from the feed iframe.

### 2.8 Video playback (`hls.ts`)

Videos render with `data-lupp-video-src` and are only ever given a real `src`
once they're about to be visible: `prepareLazyVideos` wires an
`IntersectionObserver` (260px root margin) that calls `attachVideoSource` on
intersection and pauses on exit; browsers without `IntersectionObserver`
attach eagerly. `attachVideoSource` sets `.src` directly for non-HLS URLs or
where `canPlayType('application/vnd.apple.mpegurl')` succeeds (Safari); for
everyone else needing `.m3u8`, it lazily injects
`https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js` (the **only** runtime
dependency the widget ever loads, and only when needed) and attaches an
`Hls` instance, with a `preview` quality mode (`data-lupp-video-quality`)
that pins `startLevel`/`currentLevel`/`nextLevel` to `0` for smaller carousel
thumbnails. `primeInlineVideos` additionally forces `muted`/`autoplay`/
`playsInline` attributes (required for autoplay across browsers) on launcher
and card preview videos immediately.

## 3. Server integration

### 3.1 `GET /api/widget/bootstrap` (`server/src/http/widget/bootstrap.ts`)

Public, unauthenticated, rate-limited to 120/min/IP. Query params mirror
`SCRIPT_VALUE_SPECS`'s bootstrap-relevant subset
(`store_id`/`store_slug`/`external_store_id`+`provider`/`store_domain`,
`url`, `product_url`, `external_product_id`, `widget`, `mode`).

1. **Store resolution** (`resolve-store.ts`, `findStore`) — a fallback chain,
   *not* first-match-wins in priority order only: a stronger identifier that
   misses still falls through to a weaker one.
   `store_id` → `integrations` row by `(provider, external_store_id)` →
   `store_slug` → `store_domain` (indexed `store_domains` table first, then a
   legacy scan of `stores.url` and every active integration's known
   storefront domains, self-healing the index via `persistDomainMapping` on a
   scan hit). Every attempted strategy is returned in `tried` for the 404
   body (`{active:false, error:"store_not_found", tried}`).
2. **Billing gate** (`storeHasBillingAccess`) — if the store's trial has
   lapsed and there's no live subscription, the response is `200
   {active:false, error:"trial_expired", videos:[]}` (200, not 404 — the
   embed switches on `active`, not status code). In context mode this also
   sets `display.show:false, reason:"trial_expired"`.
3. **Concurrent lookups** (`Promise.all`): the widget row
   (`store_id`+`type`+`status:"active"`), the video list (`loadVideos` — the
   bounded `preview`-shaped query, 24 rows with slim `select`, whenever
   context mode is active, since a page can only ever show a handful), and —
   only for `platform:"upzero"` stores — `buildUpzeroConfig` (the active
   `upzero` integration's `storefront_url`/`storefront_store_id`/
   `cart_action_ids` from `integrations.settings`).
4. **Plan gate** (`enforceWidgetPlanLimits`) — the horizontal/home carousel
   is a paid-tier feature (`CAROUSEL_PLAN_IDS = growth|pro|scale` from
   `@workspace/widget-config`); stores outside that plan get
   `carousel.enabled:false, disabled_reason:"plan_widget_limit"` forced onto
   the widget's settings before config resolution.
5. **Context mode** (`url` param present) — `context.ts` (server) is invoked:
   - `resolveWidgetConfig` merges `widget.settings` over
     `WIDGET_SETTINGS_DEFAULTS` (from `@workspace/widget-config`, the same
     module the dashboard form and `PATCH /api/widgets/:id` use).
   - `applyHomeOrdering` re-sorts by `is_featured` then `created_at` when
     `display.home_ordering === "automatic"` (the query itself always fetches
     in "manual" order since the setting isn't known until this same
     `Promise.all` resolves).
   - `filterVideosForContext` — product-page videos (matching by
     `external_product_id`, normalized URL, path, or "reference slug" — the
     exact matching semantics `core/upzero-product-url.ts`'s
     `repairUpzeroProductUrl` also implements client-side for Upzero) are
     prepended to (not replacing) the
     general feed-enabled set when the page looks like a product page.
   - `resolveDisplay` evaluates `show`/`reason`/`show_home_carousel` —
     excluded paths, home-carousel-outside-home, home-experience-disabled,
     carousel-disabled, hide-without-videos-and-none-matched — verbatim,
     mirroring `main.ts`'s legacy `shouldDisplayOnCurrentUrl` semantics.
   - `slimVideos` resolves every display field the client used to compute
     itself (`productDisplayName`, `productImageUrl`, `formatProductPrice` in
     pt-BR currency, media URL fallback) into the final render-ready
     `SlimVideo`/`SlimProduct` shape (`types.ts` mirrors this exactly).
   - Response gets `Cache-Control: public, max-age=60` + an MD5 `ETag` of the
     JSON body; a matching `If-None-Match` gets a bare `304`.
6. **Non-context (legacy `feed`/`preview`/`meta`) mode** returns the full
   serialized video rows (`serializeVideo`, PostgREST-shaped nesting:
   `video_products[].products.product_variants[]`) with no filtering — kept
   for other API consumers, not exercised by the current `widget.js` (which
   always sends `url=` and thus always gets context mode).

**Keep `server/src/http/widget/context.ts` and the equivalent client-side
logic in lockstep** (the "client" side of the equivalent logic is spread
across `core/embed-config.ts`'s `applyContextConfig`,
`core/bootstrap-client.ts`'s `contextUrl`, and `core/upzero-product-url.ts`'s
`repairUpzeroProductUrl` — despite the name, the client's own `context.ts`
never held this logic; it's purely the `ctx` shared-state object described in
§2.2, a naming coincidence with the server file, not a mirrored pair). Every
function in the server file is named to mirror its client counterpart
specifically so a future edit to one is easy to find the matching edit for in
the other; drift here means the widget renders one thing for a
freshly-fetched page and a legacy cached embed (which still filters
client-side) renders another.

### 3.2 `POST /api/widget/events` (`server/src/http/widget/track-event.ts`)

Public, rate-limited 60/min/IP, fire-and-forget from `core/analytics.ts`'s
`track()` (uses `fetch(..., {keepalive:true})` so a `feed_close` beacon fired during
page-unload still lands). Requires `store_id` + a valid `AnalyticsEventType`
enum value; any other field is optional and stored as-is. Failure paths are
best-effort from the widget's side — `track()` swallows the rejection.

Events emitted by this bundle: `widget_view` (bootstrap success, plus
`feedback_submit`/`feedback_skip` variants), `launcher_impression`
(debounced, visibility-checked), `feed_open`/`feed_close` (with dwell time),
`home_carousel_click`.

### 3.3 `POST /api/widget/upzero-proxy` (`server/src/http/upzero/storefront-proxy.ts`)

Public but gated: requires an active store, an active `upzero` integration,
and the request's `Origin`/`Referer` hostname to match the store's known
storefront domains (or be an internal Lupp host / localhost / `*.vercel.app`
— see `hostAllowed`). Three actions, all called from
`platforms/upzero.ts`'s `upzeroProxyRequest`:

- `customer_status` → proxies `GET /v1/clients/me` with the integration's
  stored `access_token`.
- `cart_batch` → proxies `POST /v1/cart/batch`, trying each payload in
  `payloads` in order until one succeeds (the client only ever sends one).
  **Body shape is pinned**: `{items: [{product_variant_id, quantity,
  asset_id?}], type}` only — see root `CLAUDE.md`'s note on the historical
  "missing field `items`" bug from guessed payload shapes.
- `discover_cart_context` → SSRF-safe server-side scrape (the fetched URL is
  always built from the integration's own recorded `storefront_url`/`store.url`,
  never a client-supplied host) of the storefront's Next.js chunks for
  `cart_action_ids` + `storefront_store_id`, cached into
  `integrations.settings` and returned to the widget so it doesn't have to
  scrape the visitor's own browser DOM for action IDs.

## 4. Platform adapters in depth

Every adapter file is a self-invoking IIFE with the same shape: bail out if
`window.__LUPP_WIDGET_BRIDGE__` isn't there yet or the adapter already
registered itself (idempotent against duplicate injection), pull whatever it
needs off `bridge.config`/`bridge.state`/`bridge.utils`, define its logic,
attach a `window.addEventListener("message", ...)` handler for its
`LUPP_{PLATFORM}_..._REQUEST` message types (checked against
`isTrustedLuppFrameOrigin`), and finally register itself:
`bridge.adapters.{platform} = {...}`.

### 4.1 Upzero (`platforms/upzero.ts`) — the deepest adapter

- **Customer-status detection** (`detectUpzeroCustomerStatus`) tries, in
  order: text inferred from the rendered page (`inferUpzeroCustomerStatusFromPage`
  — looks for Portuguese "minha conta"/"sair" vs "cadastre-se para ver"
  copy, carefully excluding the widget's *own* injected copy so it can't
  feed back into itself), a short-lived cache (skipped on `forceRefresh`), a
  known `window.UPZERO_CLIENT`/`UPZERO_CUSTOMER` global, then a JWT read from
  storage/cookies (`readUpzeroAuthToken`, tries several known key name
  patterns and falls back to scanning every storage key for
  auth/token/client/customer/upzero substrings) decoded locally for a
  `status` claim, and finally the `customer_status` proxy action. Every path
  converges on the same `{approved, loggedIn, source, status}` shape.
- **Cart writes** (`addUpzeroItemsToCart`) try the *storefront's own* Next.js
  Server Action first (`sendWithAction`, a `fetch` with a `Next-Action`
  header carrying a discovered action id) — this hits the exact endpoint the
  real storefront UI uses, so cart state stays consistent with anything else
  on the page — and only fall back to `addUpzeroItemsToCartApi` (the
  `cart_batch` proxy action) when every known action id fails with a
  *recoverable* error (`isRecoverableUpzeroCartError`: action-not-found,
  network error, CORS). Action ids come from `state.upzeroConfig.cart_action_ids`
  (populated by bootstrap's `buildUpzeroConfig`) with two hardcoded legacy
  ids as a last-resort fallback, refreshed via `discover_cart_context` if all
  known ones fail.
- **Cart session continuity**: `sessionID` is persisted to both
  `localStorage` (keyed `storefront_cart_session_{storeId}`) and a
  `sessionID` cookie, and a synthetic `StorageEvent` is dispatched so any
  storefront code listening for cross-tab cart storage changes picks it up.
- **`notifyUpzeroCartUpdated`** fires ~10 differently-named cart-update
  custom events (covering every naming convention a storefront theme might
  listen for) plus `bridge.updateUpzeroCartCounters` (a DOM-scan that
  rewrites any element matching cart-count-ish selectors, and also walks
  text nodes for a `"N PC(S)."` pattern via `TreeWalker`) and sets
  `state.pendingStorefrontCartRefresh` — consumed by
  `flushPendingStorefrontCartRefresh` in `core/cart-sync.ts`, which re-fires
  all those events and then, for Upzero/Nuvemshop/Shopify stores, reloads the page
  after 180ms (or calls `next.router.reload()` if present) so the visible
  cart badge actually reflects the new state.

### 4.2 Nuvemshop (`platforms/nuvemshop.ts`)

Cart writes prefer the **native cart bridge**
(`window.__LUUP_NUVEMSHOP_ADD_TO_CART__`, installed by
`nuvemshop-nubesdk.js`'s classic `App(nube)` entry or by the NubeSDK app —
`waitForNuvemshopCartBridge` polls for it up to 6s), falling back to a raw
`POST /comprar/` form submission (`postNativeNuvemshopCartItem`, sequential
per item) when the bridge never appears. Much simpler than Upzero because
Nuvemshop's own cart endpoint doesn't need session/action-id discovery.

### 4.3 Shopify (`platforms/shopify.ts`)

- **Product JSON lookup** (`fetchShopifyProductJson`) tries the current
  product URL's `.js` endpoint, then the page's canonical link, then
  `window.location.href` — Shopify's standard public product-JSON
  convention (`/products/{handle}.js`).
- **`normalizeShopifyProductForLupp`** reshapes Shopify's variant/option JSON
  into the same `SlimProduct`-adjacent shape the rest of the widget expects
  (color/size option detection by name pattern-matching `cor|color|colour`
  / `tam|tamanho|size`, money normalization for the legacy cents-as-integer
  convention via `normalizeShopifyMoney`).
- **Cart writes** post straight to Shopify's standard `POST
  {routes.root}cart/add.js` — no session/discovery dance needed, Shopify's
  own cart cookie already handles continuity.
- This is the only adapter that also answers a **product** request message
  (`LUPP_SHOPIFY_PRODUCT_REQUEST`) — used by the feed SPA when it needs
  live variant/price/stock data beyond what the slim bootstrap card already
  carries.

## 5. Browser-integration details worth knowing

- **Focus/accessibility**: the feed overlay is a proper `role="dialog"
  aria-modal="true"` with a Tab focus trap and focus restoration to whatever
  was focused before it opened; the launcher and carousel cards carry
  `aria-label`s; `@media (prefers-reduced-motion: reduce)` is honored in the
  overlay, the launcher's entrance animation, and the carousel's card
  stagger-in.
- **Launcher drag-to-reposition**: `render/launcher.ts` installs pointer/touch
  drag handlers (rAF-batched position writes to avoid layout thrash) and
  persists the dropped position per `(hostname, store)` in `localStorage`
  (`lupp_launcher_position_v1:{hostname}:{storeKey}`), read back on next
  render via `readLauncherDragPosition`.
- **Impression tracking is visibility-gated**: `trackLauncherImpression`
  waits 250ms then checks `getComputedStyle`/`getBoundingClientRect` before
  firing — a launcher that renders but is immediately hidden by
  storefront CSS never counts as an impression.
- **Entrance animations play once per session**, guarded by DOM attributes
  (`data-lupp-launcher-mounted`, `data-lupp-carousel-entrance-triggered`) so
  re-renders (URL change, breakpoint crossing, Upzero status refresh) never
  replay a pop-in/fade that already played.
- **Duplicate-embed safety**: a second `<script>` tag on the same page runs
  an entirely independent module instance (its own closures, its own
  module-scoped `homeCarouselRoot` variable) — `ensureHomeCarouselRoot`
  guards against a second instance injecting a second carousel by checking
  the *live DOM* (`[data-lupp-widget-root="home_carousel"]`), not its own
  module state, since the other instance's state is invisible to it.
- **No ES2015+ polyfills, ever**: the widget gates on `window.Promise` and
  `window.fetch` existing and otherwise refuses to load — this implicitly
  excludes any browser old enough to also lack `Array.find`,
  `Number.isFinite`, `Math.trunc`, or `Element.closest`, all used
  unconditionally elsewhere in the bundle.
- **postMessage trust boundary**: every inbound message handler (customer
  status requests, open-product-page requests, all three platforms' cart/
  product requests) checks `isTrustedLuppFrameOrigin(event.origin)` before
  doing anything — origins are the configured Lupp base URL, the script's
  own origin, or the hardcoded `luup.dzns.com.br`/`playluup.com.br`/
  `*.vercel.app` allowlist.

## 6. NubeSDK vs classic Nuvemshop mode

Two independent delivery mechanisms exist for Nuvemshop, selected by a
per-store portal toggle (NubeSDK becomes mandatory for *new* installs from
2026-08-30 per root `CLAUDE.md`):

- **NubeSDK mode** (worker sandbox, no DOM access): the Partners portal
  script is `public/nuvemshop-nubesdk-app.js`
  (built from `client/nubesdk-src/main.ts`). It runs in Nuvemshop's web
  worker and never touches `widget-src/` directly — it renders
  `nuvemshop-widget-frame.html` through NubeSDK's own `Iframe` component
  into the `corner_bottom_left` (launcher) and
  `before_section_products_sale` (home carousel, home page only) slots, using
  `autoresize` so the frame's own `{type:"resize"}` messages drive the slot
  size. It fetches its own bootstrap independently
  (`fetchBootstrap`/`BOOTSTRAP_URL` hardcoded to the prod API — this file
  never reads `apiUrl` from anywhere, unlike `widget-src/main.ts`) purely to
  decide whether to open the feed at all. Cart adds relay through NubeSDK's
  native `nube.send("cart:add", ...)` / `cart:add:success`/`cart:add:fail`
  events rather than any HTTP call. The feed overlay itself is a full SPA
  iframe (`/s/{slug}/feed?embed=1`) rendered into `modal_content` on
  `LUPP_NUBESDK_OPEN_FEED` — the *same* message type `feed.ts` posts in
  `nubesdkFrameMode`, closing the loop between this file and `widget-src/`.
  **Caveat**: NubeSDK storefront UI slots only render on the Patagonia theme.
- **Classic mode** (any theme): the portal script is
  `public/nuvemshop-nubesdk.js`. Its `App(nube)` export installs
  `window.__LUUP_NUVEMSHOP_ADD_TO_CART__` (a `nube.send`-based cart bridge —
  this is what `platforms/nuvemshop.ts`'s `waitForNuvemshopCartBridge` looks
  for) and then calls `loadLuupLoader`, which infers the store id/domain and
  injects `nuvemshop-script.js` — a small standalone loader (its own
  `readConfig`/store-id inference, entirely independent of `widget-src/`)
  that in turn injects the real `widget.js` bundle with Nuvemshop-appropriate
  `data-*` attributes. `nuvemshopWidgetFrameActive()` checks for a live
  NubeSDK iframe before injecting, so a store that has *both* scripts
  installed (a transitional/misconfigured state) doesn't double-render.

Either way, the actual product-video rendering, cart-add plumbing beyond the
platform-native call, and feed-overlay HTML all still ultimately come from
this `widget-src/` bundle (classic mode) or share its message-protocol
vocabulary (NubeSDK mode) — there is one video-commerce experience, two
delivery shells.

## 7. Onboarding / installation paths

1. **Manual embed** (any platform, incl. custom-built storefronts):
   `client/src/lib/widget-embed.ts`'s `buildWidgetEmbedCode` generates the
   `<script>` snippet shown in the dashboard, carrying only store identity
   (`data-store-id`, `data-store`, optionally `data-store-domain` derived
   from `store.url`) plus `data-widget`, `data-require-active="true"`,
   `data-lupp-url`, `data-api-url` — appearance/display/carousel settings are
   deliberately *not* baked in, since context-mode bootstrap resolves them
   fresh from the dashboard on every page load (see §2.5's precedence rule:
   any extra `data-*` the merchant adds here permanently pins that value).
   This function's output **must stay in lockstep with
   `SCRIPT_VALUE_SPECS`** (`core/embed-config.ts`) — an attribute name here
   that doesn't match one there silently does nothing.
2. **Nuvemshop app install** — OAuth connects the integration
   (`server/src/lib/nuvemshop/`), then `install-script` in that same module
   auto-installs the Nuvemshop portal script (either
   `nuvemshop-nubesdk.js` or the app registers for NubeSDK mode depending on
   the portal's toggle) — see root `CLAUDE.md`'s note on the
   `AUTO_INSTALL_VERIFIED` terminal-success case for pre-existing
   auto-installed scripts.
3. **Shopify** — store/product globals (`window.Shopify`,
   `window.ShopifyAnalytics`) are enough for `core/store-identity.ts`'s
   `inferShopifyStoreId` to self-identify the platform even before bootstrap
   resolves it; the merchant still installs
   the manual embed snippet (Shopify has no first-party script-injection
   channel comparable to Nuvemshop's portal scripts in this codebase).
4. **Upzero** — connected via `server/src/http/upzero/connect.ts`; product
   sync (`sync-products.ts`) and cart-context discovery
   (`server/src/lib/upzero-discovery.ts`'s `discoverUpzeroCartContext`,
   invoked from `storefront-proxy.ts`'s `discover_cart_context` action)
   populate the `integrations.settings` fields `buildUpzeroConfig` reads at
   bootstrap time.
5. **Live preview without a real storefront** —
   `client/src/pages/test-store.tsx` (route `/test-store/:storeSlug`) injects
   a real `widget.js` `<script>` against a fake product page, forwarding any
   `lupp_*` query params on *its own* page URL through to the widget script's
   `src` query string with the same precedence as a `data-*` attribute —
   this is how the dashboard's widget editors preview live appearance
   changes without needing them hardcoded into the test page (see §2.5;
   `data-store`/`data-widget`/`data-api-url`/`data-lupp-url`/
   `data-product-url` are the only attributes this page sets directly).

## 8. Build, verification, and change-safety notes

- **Build**: `client/build-widget.mjs` runs esbuild directly (resolved
  through Vite's pinned copy, not a direct devDependency) over each of the
  four entry points, IIFE format, `target: es2017`, minified, linked
  sourcemaps. **Must be deterministic** — running it twice must produce
  byte-identical output; anything nondeterministic in the source (e.g. an
  unstable object key iteration order feeding into codegen) would break
  that and silently churn every deploy's diff.
- **Typecheck**: `widget-src/tsconfig.json` is standalone from the rest of
  the client (`npx tsc -p widget-src/tsconfig.json --noEmit` conceptually,
  though the top-level `npm run typecheck` covers it) — strict TS, but the
  emitted JS still has to run in pre-ES2020 browsers per the "no polyfills"
  gate above, hence `target: es2017` at the bundler level regardless of what
  TS syntax the source uses.
- **Unit tests**: `render/carousel.spec.ts` covers the pure, DOM-independent
  helpers extracted specifically to be testable without a live document —
  `resolveCarouselCardEntranceClass`, `resolveCarouselItemLimit`,
  `scoreBenefitsSectionText`. When adding a new heuristic here, prefer
  extracting the decision into a pure function the same way rather than
  burying it in DOM-walking code.
- **Live-DOM behavior harness**: a happy-dom harness exercises the built
  bundle end-to-end (bootstrap URL construction, launcher render, adapter
  injection, overlay iframe URL, SPA refetch, trial-expired abort) — see
  root `CLAUDE.md`'s "Verification rigs" section. It is not committed to
  this directory (assembled per-session against the rebuilt bundle); when
  changing observable widget behavior, rebuild first and diff the harness
  output against the pre-change bundle.
- **Keep client/server context logic in lockstep** (§3.1's closing note) —
  this is the single most common way to introduce a Lupp-widget bug: editing
  `server/src/http/widget/context.ts`'s filtering/display logic without the
  matching edit in this directory's `core/embed-config.ts`
  (`applyContextConfig`) or `core/bootstrap-client.ts` (or vice versa, for
  the legacy no-`url` code path old cached embeds still exercise).
