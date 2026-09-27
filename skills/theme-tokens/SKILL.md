# Skill: Theme Tokens & DB Themes (no-git reskin)

> Trigger: user wants a new look without a deploy — colours, fonts, radii, or a
> per-slot component override.

## Mental model

A DB theme = **token CSS block** + optional **per-slot component code**, layered on a
base Git pack (`abstract` default). Resolution order per slot:
`DB override → base pack → abstract`. Compile happens **in the browser**
(`svelte/compiler`, lazy chunk); artifacts cache in IndexedDB keyed by content hash,
so edits re-compile once and revisits are instant. SSR inlines tokens (first paint
correct) and paints the base surfaces, then swap-fades after hydration compiles.

## Token block

Write a plain `:root { … }` block. The ones that matter (grep `var(--color-` in any
pack for the full set):

```css
:root {
	--color-bg: #0a0a0b;
	--color-bg-elevated: #131316;
	--color-ink: #f2f0ea; /* TEXT colour — never a fill! */
	--color-ink-muted: #8a8880;
	--color-line: #26262a;
	--color-accent: #d4ff3f;
	--color-accent-ink: #141414;
	--font-display: 'Space Grotesk', system-ui, sans-serif;
	--font-mono: 'Fira Mono', ui-monospace, monospace;
}
```

Missing-token rule of thumb: a pack that _defines_ a token in themes.css and one that
_consumes_ it — copy the consumption list from `packs/<base>/` greps.

## Behaviour knobs (per theme, enums/numbers only)

`transition` (fade|curtain…), `preloader` (bool), `staggerScale` (0–1.5).
Preloader=false now correctly opens the ready gate (fixed in 79a era — older DB themes
with animations invisible on direct load were this bug).

## Where

`/admin/themes` (workbench) or agent tools `save_db_theme` / `apply_db_theme`
(risk high, approval card shows exact diff). Every write bumps `version`; enabled
flag gates the swap.

## Verify

```bash
# apply, hard-reload /, confirm: swap-fade not blank, dark ink never used as bg,
# and /api/themes stays <no-store> on the client (staleness bug was fixed there)
node .e2e-archive/p78c.mjs
```
