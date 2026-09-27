# Skill: Add a Theme Pack (Git layer)

> Trigger: user asks to create/clone a built-in theme, or a DB theme outgrew its
> sandbox and needs to become code. Read `ARCHITECTURE.md` first — its invariants
> are pass/fail criteria here.

## Quick path

```bash
pnpm theme:create mytheme --clone abstract   # or --clone terminal|corporate|news|magazine
```

The scaffold injects into all anchors automatically (`theme-scaffold:*` markers in
`src/lib/themes/index.ts`, `registry.ts`, `src/lib/styles/themes.css`). Never hand-edit
those anchor lines' markers themselves — the injector greps them.

## What a pack is

`src/lib/themes/packs/<id>/index.ts` exports a `ThemePack`: the **11 required slots**
(Header, Footer, Home, Blog, Search, Post, Archive, Page, About, SeriesIndex, Series —
`contracts.ts`). Missing slot = white screen, so `packs.test.ts` fails fast on shape.

Optional, in order of power:

1. `routes?: ThemeRouteDef[]` — claim context routes (corporate's `/services`,
   `/contact` pattern). Content arrives from `theme_content.pages.<slug>`; the
   `[slug]` loader resolves theme routes **before** custom pages. If you add a route
   slug, `THEME_ROUTE_SLUGS` in `src/lib/server/pages.ts` must gain it too (drift test exists).
2. `extra?: Record<string, Component<ThemeRouteProps>>` — components for those routes.
3. `ItemList` / `ItemDetail` (79d) — restyle dynamic content-type pages without touching routes.

## Pitfalls (all real bugs this repo has had)

- **Never import `registry`/`routes` from `src/lib/server/pages.ts`** — pulls the
  component graph into server/tests and hangs the runner. Use the static slug list.
- New surface files: restart the dev server (`pnpm dev`) — vite dev caches the route
  manifest; a fresh `+page` under a new directory needs `rm -rf .svelte-kit` + restart.
- `--color-ink` is a TEXT colour in dark palettes. Section backgrounds use
  `--color-bg-elevated`; "white-blast" bugs came from treating ink as a fill.
- Copy stays in `$lib/paraglide/messages` (`m.*`) for chrome; owner-authored copy comes
  from `theme_content` (single-language by design — the site-level decision is documented).

## Verify

```bash
pnpm test            # packs.test.ts shape assertions include your id
pnpm check && pnpm lint
pnpm exec vite dev --port 5199 &
# switch: /admin/themes (ui_theme=mytheme) — or DB-theme swap-fade must not jump
```
