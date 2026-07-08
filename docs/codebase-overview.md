# Lupp — Codebase Overview

> Full repository scan summary (generated 2026-07-08). Covers every package, how the systems interact, the dominant code patterns, and where each feature lives.

**Lupp (Luup / playluup.com.br)** is a shoppable-video SaaS for Brazilian e-commerce stores. Merchants upload short videos, link them to products, and embed video widgets (floating launcher, stories bar, carousels) on their storefronts. The platform tracks engagement analytics and bills merchants monthly via Asaas.

---

## 1. High-level architecture

```
                         ┌────────────────────────────────────────────┐
                         │                 Supabase                    │
 Merchant dashboard      │  ┌──────────┐  ┌─────────┐  ┌───────────┐  │
 (React SPA, Vercel) ───►│  │ Postgres │  │ Storage │  │ Edge Fns  │  │
 artifacts/lupp          │  │ + RLS    │  │ (videos,│  │ (Deno,    │  │
                         │  │          │  │ thumbs, │  │ service-  │  │
 Storefront widget  ────►│  │          │  │ assets) │  │ role key) │  │
 public/widget.js        │  └──────────┘  └─────────┘  └─────┬─────┘  │
 (PostgREST + bootstrap) └───────────────────────────────────┼────────┘
                                                             │
                              ┌──────────────┬───────────────┼──────────────┬─────────────┐
                              ▼              ▼               ▼              ▼             ▼
                         Nuvemshop API   Shopify API    UP Zero API   Bunny Stream    Asaas
                         (OAuth, sync,   (OAuth, GraphQL (key connect, (video host/   (billing,
                         script install) sync, embedded) sync)         encode)        webhooks)
```

It is a **thin-client-over-Supabase** architecture:

- The React SPA talks to Supabase **directly** (PostgREST + Auth + Storage), protected by Row Level Security.
- Anything privileged or cross-cutting (OAuth token exchange, product sync, video encoding, billing, admin console) is a **Supabase Edge Function** invoked with the user's bearer token; functions use the service-role key internally and enforce access in code via `store_members` lookups.
- The storefront **widget.js** is a self-contained vanilla-JS embed that reads public data through anon-key PostgREST or the keyless `lupp-widget-bootstrap` function.
- There is **no custom backend server in production** — the Express `api-server` package is unused scaffolding (see §9).

---

## 2. Monorepo layout (pnpm workspaces)

| Path | Package | Status | Purpose |
|---|---|---|---|
| `artifacts/lupp` | `@workspace/lupp` | **The real app** | React + Vite SPA (dashboard, landing, public feed) + `public/widget.js` + Nuvemshop loader scripts. Deployed to Vercel. |
| `supabase/` | — | **The real backend** | 21 SQL migrations (schema, RLS, seeds) + 24 Deno Edge Functions + `config.toml`. |
| `artifacts/api-server` | `@workspace/api-server` | Scaffold (unused) | Express 5 template with a single `/api/healthz` endpoint. Not deployed to Vercel. |
| `artifacts/mockup-sandbox` | `@workspace/mockup-sandbox` | Scaffold (empty) | Standalone Vite design sandbox that auto-discovers mockup components; no mockups authored yet. Shares no code with the app. |
| `lib/db` | `@workspace/db` | Scaffold (empty) | Drizzle ORM setup pointing at `DATABASE_URL`; schema file is an empty template. The authoritative schema is the Supabase migrations. |
| `lib/api-spec` | `@workspace/api-spec` | Scaffold | OpenAPI 3.1 spec with only `/healthz`; Orval codegen config. |
| `lib/api-zod` | `@workspace/api-zod` | Generated (1 schema) | Orval-generated Zod schemas; consumed only by api-server's health route. |
| `lib/api-client-react` | `@workspace/api-client-react` | Generated (unused) | Orval-generated React Query client + hand-written fetch wrapper. Imported by nobody. |
| `scripts/` | `@workspace/scripts` | Scaffold | `src/hello.ts` placeholder + `post-merge.sh` git hook. |
| `docs/` | — | — | `architecture.md` (pt-BR MVP plan), `bunny-stream.md`, `setup.md`, this file. |
| `output/` | — | Build artifacts | `luup-nuvemshop-script-v2.js` (published storefront script) + a unit-economics PDF. |
| `attached_assets/` | — | Spec | The original pt-BR product brief. |

Root configs: `pnpm-workspace.yaml` (catalog deps, 1-day `minimumReleaseAge` supply-chain guard), `tsconfig.base.json` + `tsconfig.json` (project references to `lib/*` only), `vercel.json` (builds only `@workspace/lupp`, SPA rewrite to `/index.html`), `shopify.app.toml` (embedded Shopify app "Luup", scopes `read_products,read_inventory,read_locations`).

---

## 3. Frontend app — `artifacts/lupp`

**Stack:** Vite, React, TypeScript, wouter (routing), TanStack Query, shadcn/ui ("new-york") over Radix, Tailwind v4 (CSS-config, no tailwind.config.js), react-hook-form + zod, recharts, embla, framer-motion, hls.js, tus-js-client. Runtime deps are only `@supabase/supabase-js`, `tus-js-client`, `hls.js` — everything else is dev/build. All UI strings are pt-BR. Light mode only.

### 3.1 Directory map (`artifacts/lupp/src/`)

| Directory | Purpose |
|---|---|
| `pages/` | Route screens (one file per page; `videos/` and `preview/` subdirs). |
| `routes/` | `AppRoutes.tsx` (wouter Switch) + `ProtectedRoute.tsx` / `AuthRoute` guards. |
| `components/ui/` | ~70 shadcn/Radix primitives. |
| `components/shared/` | App composites (VideoCard, WidgetCard, PhonePreview, PricingCard, ShopifyEmbeddedRecovery…). |
| `components/layout/` | `AppLayout.tsx`, `Header.tsx`, `Sidebar.tsx`. |
| `services/` | Data-access layer — one plain-object service per domain, wrapping Supabase. |
| `services/integrations/` | E-commerce adapter classes (Strategy pattern, mostly placeholders). |
| `services/storage/` | Video upload provider strategy (`video-storage.provider.ts`). |
| `hooks/` | React Query hooks + `useAuth.tsx` (AuthProvider context) + UI utils. |
| `lib/` | `supabase.ts` (client), `env.ts`, `constants.ts`, `shopify-embedded.ts`, `utils.ts`. |
| `types/` | Domain contracts + hand-written Supabase `Database` type (18 tables). |
| `data/` | `mock.ts` demo data. |

### 3.2 Routing (wouter)

Defined in `src/routes/AppRoutes.tsx`; guards in `src/routes/ProtectedRoute.tsx`.

**Public:** `/` (landing, or dashboard if Shopify-embedded), `/login`, `/signup`, `/configuracoes`, `/privacidade`, `/suporte`, `/master` (admin console — gated inside via edge-function email allowlist, not at route level), `/preview/feed`, `/preview/product`, `/s/:storeSlug/feed`, `/test-store/:storeSlug`, `*` → not-found.

**Protected (`ProtectedRoute`):** `/onboarding` (`requireStore={false}`) and everything under `/app`: dashboard, `videos` (+ `videos/new` upload wizard), `feed`, `widgets`, `pages` (custom pages), `products`, `comments`, `feedbacks`, `ordering`, `integrations`, `billing`, `settings`.

Guard logic: no user → redirect `/login` (or show `ShopifyEmbeddedRecovery` when embedded); user but no store → redirect `/onboarding`. `AuthRoute` inverts it (authenticated users pushed to `/app`).

### 3.3 Services layer (`src/services/`) — the core pattern

Each service is a stateless plain-object module: `export const xService = { async method() {...} }`. Every call goes through `requireSupabase()` (`src/lib/supabase.ts`), which throws if Supabase isn't configured. The uniform idiom:

```ts
const { data, error } = await requireSupabase().from("table").select(...);
if (error) throw error;
return data ?? [];
```

Edge functions are invoked as `client.functions.invoke<T>(name, { body, headers: { Authorization: Bearer <session token> } })`, with a shared `humanizeFunctionError` pattern that unwraps the `error.context` Response to surface pt-BR messages.

| Service | Responsibility |
|---|---|
| `auth.service.ts` | Supabase Auth: sign in/up (+ profile upsert), password reset, sign out. |
| `stores.service.ts` | Store CRUD, slug inference with duplicate-retry, **`createStoreWithDefaults`** (store + membership + trial subscription + default widgets + default page + feed_settings), logo upload to `store-assets`. |
| `videos.service.ts` | Largest service. Video list with joined `video_products → products → product_variants`; metrics computed from `analytics_events`/`video_likes`/`comments`; public-feed queries by slug; create/update/archive/delete (Bunny deletion via `bunny-delete-video` fn); duplicate; product links; ordering. |
| `products.service.ts` | Product CRUD; delegates syncs to `integrationsService`. |
| `comments.service.ts` | Admin moderation + public pending-comment creation. |
| `feedbacks.service.ts` | Derives feedback list from `analytics_events` (`widget_view` + `metadata.action='feedback_submit'`). |
| `widgets.service.ts` | Widget list/update; `installNuvemshopScript` (edge fn); `getEmbedCode` (generates `<script>` snippet with data-attributes). |
| `analytics.service.ts` | `trackEvent`, `likeVideo`, `getDashboardMetrics` (charts/rankings); visitor/session ids in localStorage/sessionStorage (`lupp_visitor_id` / `lupp_session_id`). |
| `billing.service.ts` | Usage snapshot via `get_store_monthly_usage` RPC; subscription lifecycle via `asaas-*` and `lupp-change-trial-plan` edge fns; coupon lookups. |
| `integrations.service.ts` | OAuth starts, product syncs, custom-app connect, UP Zero connect, tracking-settings upsert. Exports `PlaceholderEcommerceIntegration` base class. |
| `master-console.service.ts` | Admin snapshot/actions via `master-console` edge fn. |
| `storage/video-storage.provider.ts` | Upload provider strategy (see §3.6). |

### 3.4 Hooks & state

- **React Query** configured in `App.tsx` (`staleTime: 30s`, `retry: 1`, no refetch-on-focus). Query-key convention: `[domain, storeId, ...filters]`, always gated with `enabled: isSupabaseConfigured && Boolean(storeId/user)`.
- Thin hooks: `useStores`/`useCurrentStore` (`hooks/useStore.ts`), `useVideos`, `useProducts`, `useDashboardMetrics`. Many pages also call services directly with their own `useQuery`/mutations.
- **`AuthProvider`** (`src/hooks/useAuth.tsx`) is the only React context: user, session, profile, embedded-store state, `isShopifyEmbedded`. Subscribes to `supabase.auth.onAuthStateChange`; branches to `fetchShopifyEmbeddedSession()` when running inside Shopify admin.
- Current store is not a context — derived by `useCurrentStore()` (first store, or the embedded store).

### 3.5 lib/

- `lib/supabase.ts` — typed `SupabaseClient<Database>` or `null`; `requireSupabase()` throws when unconfigured.
- `lib/env.ts` — resolves all `VITE_*` vars with **hardcoded production fallbacks** (Supabase URL/anon key, Bunny library, `widgetCdnUrl` defaulting to `https://www.playluup.com.br/widget.js`). Exports `env`, `isSupabaseConfigured`. `videoProvider: "supabase" | "bunny" | "cloudflare"`.
- `lib/constants.ts` — brand tokens (`LUPP_BRAND`), `PLAN_LIMITS`, status enums (`VIDEO_STATUS`, `COMMENT_STATUS`, `ANALYTICS_EVENT_TYPES` — 12 event types), `DEFAULT_WIDGETS`, `ECOMMERCE_PROVIDERS`, `TRACKING_PROVIDERS`, upload limits, `countBillableWidgets`.
- `lib/shopify-embedded.ts` — App Bridge session-token handling for the embedded Shopify app.

### 3.6 Video upload — Strategy pattern

Interface `VideoStorageProvider` (`src/types/video.ts`); implementations in `src/services/storage/video-storage.provider.ts`; provider selected at module load from `env.videoProvider` (default/fallback: **bunny**):

- **`BunnyStreamProvider`** (active) — 3-step flow via the `bunny-upload-video` edge fn (create session → tus upload to Bunny's endpoint → fetch metadata), with an XHR edge-proxy fallback.
- **`SupabaseVideoProvider`** — resumable tus upload straight to Supabase Storage `videos` bucket; thumbnails to `thumbnails`.
- **`CloudflareStreamProvider`** — placeholder (throws).

### 3.7 UI conventions

shadcn/ui components in `components/ui/` composed with `cva` variants and `cn()` (clsx + tailwind-merge). Tailwind v4 configured in `src/index.css` via `@theme inline` mapping HSL CSS variables → tokens. Brand: primary blue `#006BFF`, cyan accent `#00D4FF`, radius 0.75rem, Inter font.

---

## 4. Database — `supabase/migrations/`

21 migrations; the base schema is `20260615131513_init_lupp_mvp_schema.sql`. **21 tables**, all with RLS:

| Table | Purpose |
|---|---|
| `profiles` | 1:1 mirror of `auth.users`, auto-created by trigger `on_auth_user_created_create_profile`. |
| `stores` | Tenant root: slug, url, platform, branding, status, `plan_id`, trial window. |
| `store_members` | Membership/RBAC (owner/admin/marketing/editor/analyst). **The gate for all authenticated RLS.** |
| `products` / `product_variants` | Synced catalog; unique `(store_id, platform, external_id)` for upsert-on-sync. Variants carry color/size/SKU/stock/price. |
| `videos` | Shoppable videos: provider (supabase/bunny), `provider_video_id`, `processing_status` (uploading/processing/ready/failed/archived), feed/product-page toggles, visibility scope, CTA. |
| `video_products` | Video↔product M:N with `is_primary` (multiple products per video since `20260618124301`). |
| `widgets` | Widget instances per store: type, status, `settings` jsonb (appearance/display/carousel). |
| `custom_pages` / `custom_page_videos` | Standalone video landing pages + ordering. |
| `comments` | Visitor comments, moderated (public inserts forced to `pending`). |
| `video_likes` | Anonymous likes, unique per `(video_id, visitor_id)`. |
| `analytics_events` | First-party event stream (12 event types); indexed for the monthly-usage RPC. |
| `integrations` | Platform connection per store (`provider`, `external_store_id`, settings jsonb, `last_sync_at`). |
| `integration_secrets` | **OAuth tokens — service-role only** (RLS on, all grants revoked from anon/authenticated). |
| `integration_webhook_events` | LGPD/GDPR webhook audit log (service-role only). |
| `plans` | Seeded catalog: start R$149, growth R$199, pro R$299, scale R$499 (video/view/widget limits). Public read. |
| `subscriptions` | Billing per store: status (trialing/pending/active/past_due/canceling/canceled/blocked), Asaas ids, discount fields. |
| `discount_coupons` | Promo coupons (TESTE98 seeded active). |
| `feed_settings` | Public feed config per store. |
| `master_console_audit_logs` | Super-admin action log (service-role only). |

**Key SQL functions:**
- `private.is_store_member(uuid)` — SECURITY DEFINER; central authenticated-RLS helper.
- `public.store_has_billing_access(uuid)` — SECURITY DEFINER; true when store is active AND (trial valid OR active/trialing/canceling subscription in period). **Central public-visibility gate** — all anon policies and the widget bootstrap use it, so widgets stop rendering when billing lapses.
- `public.get_store_monthly_usage(uuid)` — usage RPC for the billing page.
- `public.set_updated_at()` — generic updated_at trigger on ~12 tables.

**RLS strategy:**
- Authenticated dashboard access: `is_store_member(store_id)` on everything (stores also allow `owner_id`).
- Anonymous storefront: read-only SELECT gated by `store_has_billing_access` + content flags (video active + feed/product-page enabled; products only via such videos; comments only `approved`).
- Anonymous writes narrowly allowed: pending `comments`, `video_likes`, `analytics_events`.
- Secret/audit tables reachable only through edge functions.

**Storage buckets:** `videos` (200MB, public read), `thumbnails`, `store-assets` — writes require store membership and files must be foldered by `store_id`.

---

## 5. Edge Functions — `supabase/functions/` (24 functions, Deno)

Every function creates a **service-role** Supabase client and enforces access in code. Two auth styles (per `supabase/config.toml`): JWT-verified (validate bearer → check `store_members`) and public (`verify_jwt = false`) for OAuth callbacks/webhooks, validated instead by HMAC-signed state, platform HMAC, or shared tokens. Shared module: `_shared/shopify-app-config.ts` (default + per-shop custom Shopify credentials).

| Group | Functions | Notes |
|---|---|---|
| **Storefront runtime** | `lupp-widget-bootstrap` (public) | GET: widget config + videos (+products/variants) resolved by store id/slug/domain/external id, gated by `store_has_billing_access` and plan widget limits; refreshes processing Bunny videos; UP Zero storefront discovery. POST: ingests `analytics_events`. |
| **Nuvemshop** | `nuvemshop-oauth-start`, `nuvemshop-oauth-callback` (public), `nuvemshop-sync-products`, `nuvemshop-install-script`, `nuvemshop-lgpd-webhooks` (public) | OAuth with HMAC-signed state; token → `integration_secrets`; paginated product+variant sync (`api.nuvemshop.com.br/2025-03`); script-tag install with auto-install and manual-fallback modes. |
| **Shopify** | `shopify-oauth-start`, `shopify-oauth-callback` (public), `shopify-sync-products` (GraphQL), `shopify-connect-custom-app`, `shopify-embedded-session` (public), `shopify-session-token-ping` (public), `shopify-app-config` (public), `shopify-compliance-webhooks` (public) | Signed state + Shopify HMAC verification; expiring online tokens with refresh; embedded-app session minting; the callback can fully provision a store (store + membership + subscription + widgets + pages). |
| **UP Zero** | `upzero-connect`, `upzero-sync-products` | API-key connect (no OAuth); the sync (2,395 lines) does heavy product/variant normalization. |
| **Bunny Stream** | `bunny-upload-video`, `bunny-video-status`, `bunny-delete-video` | Create video + TUS endpoint, poll encoding status, delete. |
| **Billing (Asaas)** | `asaas-create-checkout`, `asaas-create-subscription`, `asaas-change-plan`, `asaas-cancel-subscription`, `asaas-webhook` (public, token-validated), `lupp-change-trial-plan` | Customer/subscription creation, plan changes, cancellation, webhook-driven status/period sync. |
| **Admin** | `master-console` | Email-allowlist gated (`MASTER_ADMIN_EMAILS`); platform snapshot (MRR/ARR, usage) + actions (pause/activate store, extend trial, set plan); all actions audited. |

---

## 6. Embeddable widget — `artifacts/lupp/public/widget.js`

~4,800-line vanilla ES5 IIFE, served from `https://www.playluup.com.br/widget.js`. Reads config from `data-*` attributes, script query params, or `window.LUPP_*` globals.

- **Two data paths:** with an anon key it queries PostgREST directly (`/rest/v1/widgets`, `/rest/v1/videos` with embedded `video_products(products(product_variants))` selects); without a key (the Nuvemshop auto-install path) it uses the keyless `lupp-widget-bootstrap` function.
- **Widget types:** `floating_launcher`/`floating_video` (bubble + full-screen feed), `stories_bar`, and the carousel family (`home_carousel`, `horizontal_feed`, etc.) → Home Showcase; product-page mode gated by URL/product matching.
- **Display rules** (`shouldDisplayOnCurrentUrl` / `applyWidgetSettings`): `display.mode`, `include_paths`/`exclude_paths` with `*` wildcards, `product_mode`, `hide_without_videos`, home-only carousels.
- **Analytics:** `track()` posts to `/rest/v1/analytics_events` (or the bootstrap POST) with visitor/session ids, url, referrer, UA and `metadata.widget_type`. Events: video_view/progress/complete, product_click, add_to_cart_click, share_click, like_click, widget_view, feed_open/close, launcher_impression, plus feedback_submit.
- **Cart bridges:** postMessage bridges into native carts for Nuvemshop (`public/nuvemshop-cart-bridge.js` → `window.LuupNuvemshopCart`), Shopify (`cart/add.js`), and UP Zero (`api.upzero.com.br` + client-side customer JWT detection). HLS playback via lazy-loaded hls.js; IntersectionObserver lazy video loading.

**Nuvemshop loaders** (`public/nuvemshop-script.js`, `nuvemshop-loader.js`, `nuvemshop-nubesdk.js`): injected by the Nuvemshop app, they infer the store id from `window.LS`/hostname and inject `widget.js` with config.

---

## 7. Integration flow end-to-end (Nuvemshop example)

1. Merchant clicks connect on `/app/integrations` → `integrationsService.createNuvemshopAuthorizeUrl` → `nuvemshop-oauth-start` returns an authorize URL carrying an HMAC-signed state (store/user identity, 30-min TTL — no server-side state store).
2. Nuvemshop redirects to `nuvemshop-oauth-callback` → code exchanged at Tiendanube → **token stored in `integration_secrets`**, `integrations` upserted (with cross-store collision guard), `stores.platform` set → redirect back with `?connected=nuvemshop`.
3. Product sync: `nuvemshop-sync-products` pages through the Nuvemshop API, normalizes (localized fields, HTML stripping, promo pricing, color-name→hex, installments/Pix text) and upserts `products`/`product_variants` on `(store_id, platform, external_id)`.
4. Script install: `widgetsService.installNuvemshopScript` → `nuvemshop-install-script` registers the storefront script (auto-install or API script-tag with manual fallback), embedding store id + bootstrap config as query params.
5. Runtime: the loader injects `widget.js` → bootstrap fetch → widgets render per display rules → events flow into `analytics_events` → dashboard metrics.

Shopify follows the same shape (plus embedded-app session tokens and a manual custom-app path for one merchant); UP Zero connects via API key. **WooCommerce, Tray, Yampi, Loja Integrada, VTEX are placeholder classes** (`services/integrations/*.integration.ts`) that throw "em desenvolvimento". **GA4 / Meta Pixel / TikTok Pixel / webhook tracking** is declared (`TRACKING_PROVIDERS`, `upsertTrackingSettings`) but has no runtime dispatch code — planned surface only.

---

## 8. Feature → location quick reference

| Feature | Frontend | Backend |
|---|---|---|
| Auth & onboarding | `src/hooks/useAuth.tsx`, `src/services/auth.service.ts`, `pages/login.tsx`, `signup.tsx`, `onboarding.tsx` | `auth.users` trigger → `profiles`; `stores.service.ts#createStoreWithDefaults` |
| Video upload | `pages/videos/new.tsx`, `services/storage/video-storage.provider.ts` | `bunny-upload-video`, `bunny-video-status`, `bunny-delete-video`; `videos` table |
| Video management | `pages/videos/index.tsx`, `services/videos.service.ts`, `pages/ordering.tsx` | `videos`, `video_products` |
| Products & sync | `pages/products.tsx`, `services/products.service.ts`, `services/integrations.service.ts` | `nuvemshop/shopify/upzero-sync-products`; `products`, `product_variants` |
| Widgets | `pages/widgets.tsx`, `services/widgets.service.ts` | `widgets` table; `nuvemshop-install-script`; `lupp-widget-bootstrap` |
| Storefront embed | `public/widget.js`, `public/nuvemshop-*.js` | `lupp-widget-bootstrap`, PostgREST anon policies |
| Public feed | `pages/preview/feed.tsx`, `/s/:slug/feed`, `pages/feed.tsx` | `feed_settings`, anon RLS on `videos` |
| Custom pages | `pages/custom-pages.tsx` | `custom_pages`, `custom_page_videos` |
| Comments & likes | `pages/comments.tsx`, `services/comments.service.ts` | `comments` (pending-only anon insert), `video_likes` |
| Analytics dashboard | `pages/dashboard.tsx`, `services/analytics.service.ts` | `analytics_events`, `get_store_monthly_usage` RPC |
| Feedback (widget survey) | `pages/feedbacks.tsx`, `services/feedbacks.service.ts` | `analytics_events` (widget_view + feedback_submit) |
| Billing & plans | `pages/billing.tsx`, `services/billing.service.ts`, `lib/constants.ts` (PLAN_LIMITS) | `asaas-*` functions, `asaas-webhook`, `subscriptions`, `plans`, `discount_coupons`, `store_has_billing_access()` |
| Integrations UI | `pages/integrations.tsx`, `services/integrations.service.ts`, `services/integrations/*.integration.ts` | OAuth/sync functions, `integrations`, `integration_secrets` |
| Shopify embedded app | `lib/shopify-embedded.ts`, `ShopifyEmbeddedRecovery.tsx`, `shopify.app.toml` | `shopify-embedded-session`, `shopify-session-token-ping`, `shopify-app-config` |
| Master/admin console | `pages/master-console.tsx`, `services/master-console.service.ts` | `master-console` fn, `master_console_audit_logs` |

---

## 9. Code patterns & conventions

1. **Thin client over Supabase.** No app server. Pages/hooks → domain service objects → one guarded Supabase client (`requireSupabase()`); privileged work in edge functions.
2. **Uniform service idiom.** Plain-object services, `const { data, error } = ...; if (error) throw error; return data ?? []`; mutations end with `.select("*").single()`; edge-fn errors humanized via `error.context` unwrapping.
3. **Strategy pattern for polymorphism** — video storage providers and e-commerce integration classes, each a module-level singleton picked from env; unimplemented strategies are safe placeholders that throw.
4. **React Query with `[domain, storeId, ...filters]` keys**, gated on `isSupabaseConfigured`; a single `AuthProvider` context; current store derived, not stored.
5. **Defense in depth:** RLS (`is_store_member` for dashboards, `store_has_billing_access` for public) is the safety net for direct PostgREST; edge functions re-check membership in code; secrets segregated in service-role-only tables (`integration_secrets`).
6. **HMAC-signed OAuth state** (stateless) shared by Nuvemshop and Shopify flows.
7. **Upsert-on-natural-key syncing:** `(store_id, platform, external_id)` unique indexes drive idempotent product/variant syncs.
8. **Billing enforcement at the read path:** `store_has_billing_access()` embedded in anon RLS policies and the widget bootstrap, so expired stores' widgets disappear without any job/cron.
9. **pt-BR everywhere** in user-facing strings; hardcoded production fallbacks in `lib/env.ts` so builds work without env vars.

## 10. Known dead/scaffold code

- `artifacts/api-server` + `lib/api-spec` + `lib/api-zod` + `lib/api-client-react`: a Replit/Orval template chain wired only to `/healthz`; the app never imports any `@workspace/*` package.
- `lib/db`: Drizzle configured but schema empty — the real schema is the Supabase migrations (same Postgres).
- `artifacts/mockup-sandbox`: standalone design sandbox with zero mockups authored.
- `scripts/src/hello.ts`: placeholder.
- Tracking providers (GA4/Meta/TikTok/webhook) and 5 of 7 e-commerce adapters: declared placeholders.
