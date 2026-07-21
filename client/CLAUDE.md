# CLAUDE.md — client workspace guide

Vite React SPA (dashboard `/app`, admin console `/admin`, auth, landing) plus
the embeddable widget sources. Read the repo-root `CLAUDE.md` first; this file
covers only client-specific rules.

## Commands

```bash
npm run dev            # SPA dev server
npm run build          # production SPA build (dist/public)
npm run build:widget   # esbuild widget-src/*.ts -> public/widget*.js (committed)
npm run build:nubesdk  # esbuild nubesdk-src -> public/nuvemshop-nubesdk-app.js
npx tsc -p tsconfig.json --noEmit   # typecheck (widget has its own tsconfig)
```

## Hard rules

- **Never edit `public/widget*.js`** — they are build outputs of
  `widget-src/` (strict TS, dependency-free at runtime). The `nuvemshop-*`
  files in `public/` ARE hand-maintained sources. Widget builds must stay
  deterministic (build twice → byte-identical).
- **Design tokens only** (`src/index.css` `@theme`): no raw palette classes
  (`bg-white`, `text-slate-*`) or arbitrary sizes (`text-[11px]`,
  `max-h-[28rem]`) on app/admin surfaces. Use `bg-card`/`text-foreground`/
  `text-muted-foreground`/`border-border`, status `*-surface` scales
  (success/warning/info/destructive), typography presets (`text-page-title`,
  `text-overline`, `text-2xs`…), named sizes (`max-h-scroll-panel`…). Every
  token has light AND dark values — check both themes (`ThemeToggle`).
  Exceptions: deliberately theme-independent visuals (landing/marketing,
  phone bezels, external-logo chips on fixed `bg-white`).
- **Card/Button base classes stay unprefixed** (`p-6 pt-0`): breakpoint-scoped
  defaults survive plain `p-*` overrides in tailwind-merge and break spacing.
- **Layout**: `AppLayout` and `AdminShell` are full-width and pages use the
  full available width (grids add `2xl:` column steps to fill it). Never rely
  on the shell to constrain content.
- The auth refresh call in `src/services/auth.service.ts` deliberately uses
  raw `fetch` — do not route it through the shared API client (recursion).
- `src/lib/widget-embed.ts` generates the manual install snippet and must stay
  in lockstep with `SCRIPT_VALUE_SPECS` in `widget-src/main.ts` (public
  contract — attribute names are frozen).

## Reuse before writing new code

- Formatters: `src/lib/format.ts` (pt-BR number/date/initials), `formatBRL`
  in `src/lib/utils.ts`.
- Primitives: `components/shared/` — `SectionCard`, `ListItem`, `EmptyState`,
  `StatCard`, `SkeletonList`, `ColorPickerField`, `ThemeToggle`,
  `BrandIcons` (provider marks + `BrandIcon` name resolver).
- Hooks: `useDebouncedValue`, `useInfiniteScrollSentinel`, `useTheme`.
- Admin lists: `pages/admin/store/shared.tsx` — `CursorListPanel`
  (cursor-paginated + searchable + infinite scroll), `ExpandableListRow`,
  `DetailField`/`DetailGrid`, `JsonDetails`.

## Structure

- `src/pages/` — route chunks (all lazy in `src/routes/AppRoutes.tsx`).
  `admin/` is the role-gated console (`/admin`, `/admin/:storeId` with tab
  modules under `admin/store/`).
- `src/components/ui/` — shadcn-style primitives (token-based, don't fork).
- `src/services/` — REST wrappers over `src/lib/api.ts`.
- `widget-src/`, `nubesdk-src/` — compiled embeds; see root CLAUDE.md for the
  bootstrap/adapter architecture.
