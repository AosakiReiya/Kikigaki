# Architecture

One page to orient contributors. Deep history lives in the internal repo's `docs/` (journey
log); this file documents the _current_ shape.

## Stack

SvelteKit 2 + Svelte 5 runes · Tailwind v4 · GSAP · Paraglide i18n (build-time messages) ·
Cloudflare Pages + D1 (SQLite) + R2 · dual adapter (`pnpm dev`/Pages, or Node/Docker self-host).

## Layers

```
browser  ┌ components ─┬ content-components (registry: Chart/Gallery/… hydrate from markdown)
         │ themes/:    │  11 surface slots per pack, resolved per active theme
         └ stores      │  db-registry: DB themes (token CSS + per-slot compiled components)
                        │
server   ┌ routes/+layout.server ─ settings, nav, per-request site runtime
         ├ $lib/server/content.ts ─ posts/series/tags/categories (batched reads, anti-N+1)
         ├ $lib/server/search.ts  ─ FTS5 (trigram) + bm25; LIKE fallback for ≤2-char words
         ├ $lib/server/settings.ts ─ site_settings KV (identity, theme_content, ui_theme)
         ├ $lib/server/content-types/ ─ 79 registry: manifest drives sitemap index sections
         └ $lib/plugins/ ─ event/filter hooks (e.g. search:index feeds the editor pickers)
```

## Non-negotiable invariants

- **`posts.id === 'post:' + slug`.** Search, SEO and governance tables all derive the id from
  the slug (`post_seo.post_id`, `filterIndexed`, admin routes). uuid-id rows silently vanish
  from search results — `seed-demo.mjs` and any importer must honour the convention. Queries
  that need stable handles should project `p.slug`, never `t.post_id` (p79 hardening).
- **`pages.ts` never imports `themes/registry`.** Component graph would leak into server/tests
  and hang the runner. Reserved-slug checks use the static `THEME_ROUTE_SLUGS`.
- **Every new `SiteRuntime` field lands in exactly one place**: `siteRuntimeOf()` in
  `$lib/site`; endpoint routes re-apply via `applySiteRuntime(siteRuntimeOf(settings))`.
  The render layer re-applies with `getLocale()` — vite dev runs server-load and component
  render in separate module graphs, so per-locale values must be applied on both sides.
- **Content translations fall back to `BASE_LOCALE` ('zh-tw')**, never to the requested
  locale silently: rows carry a `translated` flag and `availableLocales` (drives hreflang and
  the sitemap — a post is only advertised in locales it actually exists in).
- **theme_content is site-level, single-language** (documented decision): owners rewrite the
  JSON when switching archetype; per-locale site identity fields are the localized channel.
- **Writes through the AI agent require approval** (diff cards; destructive verbs need two
  yeses). Reads are free.
- **Migrations are hand-written SQL**: copy `migrations/meta/NNNN_snapshot.json`, append the
  `_journal.json` entry, apply `--local` and `--remote` explicitly.

## Theming

`$lib/themes/contracts.ts` fixes the 11 slots (Header…SeriesIndex) plus `extra`/`routes`.
Git packs live in `packs/<id>/`; `registry.ts` lazy-loads every pack except `abstract`
(ensureThemePack gates in `+layout.server`/`+layout.ts`). DB themes (`db-*`) are token CSS +
compiled per-slot components (client-side `svelte/compiler`, IndexedDB cache, SSR token
inlining); they never carry routes.

## Content types (79, in progress)

`content-types/index.ts` registers manifests (key, `pathFor`, `listPath`, field schema,
`refs`, `filterIndexed`); the sitemap index section is assembled from the registry in
registration order. 79b will render admin forms from `fields`; 79c exposes `create_content_type`
to the agent; 79d lands the first custom type (portfolio). Detail loaders stay hand-written
until a type proves the abstraction.

## Testing

- `pnpm test` — vitest units + component tests (400+); pure functions get hand-built fixtures.
- `.e2e-archive/pNN.mjs` — Playwright scripts against `vite dev` (self-seeding, keep `/tmp`
  dependencies out so CI can run them; `workflow_dispatch → e2e job` in `ci.yml`).
- Release gate: `scripts/make-release-repo.mjs` identity scan (0 hits or abort).
