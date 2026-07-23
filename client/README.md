# Luup — client

React SPA for the Luup shoppable-video platform, plus the embeddable widget
sources. Three surfaces ship from this workspace:

- **Dashboard** (`/app/*`) — merchants manage videos, widgets, feed,
  products, integrations and billing.
- **Admin console** (`/admin`) — internal operations (role `admin` required):
  stores, subscriptions, integrations/secrets, users, paginated
  products/videos/events/comments, audit log; platform-wide user management
  at `/admin/users` and live Asaas financials at `/admin/asaas`.
- **Widget** (`widget-src/` → `public/widget*.js`) — the script merchants
  embed; also the Nuvemshop NubeSDK app (`nubesdk-src/`).

## Stack

Vite · React 18 · TypeScript · Tailwind v4 (CSS-first tokens in
`src/index.css`) · TanStack Query · wouter · shadcn-style UI primitives.

## Getting started

```bash
npm install
npm run dev          # SPA at the printed port; API expected on :3333
npm run build        # production build
npm run build:widget # rebuild the embeddable widget (outputs are committed)
```

The API base URLs fall back to production hosts; see `src/lib/env.ts`.

## Conventions (short version)

- Design tokens only — colors/typography/sizes come from `src/index.css`
  `@theme`, with light **and** dark values (theme toggle in the app sidebar
  and admin header). No hardcoded palette classes or px/rem literals.
- Compose from `src/components/shared/` and `src/lib/format.ts` before
  writing new primitives.
- Never hand-edit `public/widget*.js` (compiled). The `public/nuvemshop-*`
  loaders are hand-maintained sources.

Full contributor/agent rules: [`CLAUDE.md`](./CLAUDE.md) here and the
repository root `CLAUDE.md`.
