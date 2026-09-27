# Contributing

Thanks for helping grow Kikigaki Blog!

## Ground rules

- **Branch off `main`**, one feature per branch; open a PR against `main`.
- Run the gates before pushing: `pnpm lint && pnpm check && pnpm test`
  (Prettier + ESLint, `svelte-check` must be at **0 errors**, Vitest).
- E2E: Playwright suites live in `.e2e-archive/pNN.mjs` and are self-seeding
  (dev server on :5199; trigger manually via **Actions → Run workflow → e2e smoke**,
  or run `node .e2e-archive/p79.mjs` locally after `pnpm dev`). Keep them free of
  `/tmp` dependencies so CI can execute them. UI-facing changes should at minimum
  be smoke-tested with `pnpm dev` + a logged-in browser session; note your checks
  in the PR description.
- Read [ARCHITECTURE.md](ARCHITECTURE.md) first — the "non-negotiable invariants"
  section is how this codebase avoids its past bugs.
- Migrations: hand-written SQL in `migrations/` (numbered), applied to local and
  remote D1 via `wrangler d1 migrations apply`. Never edit an applied migration.

## Architecture notes worth reading first

- Architecture layering (short version):
  everything is a component — posts, pages, email templates, theme surfaces,
  agent tools all share the registry/workshop conventions.
- Site identity lives in `site_settings` (runtime), **not** in code —
  `src/lib/site.ts` STATIC values are intentionally neutral factory defaults.
- Styling: design tokens from `src/routes/layout.css` (`--color-*`),
  admin pages follow the rem/type-ladder conventions documented in
  the issue tracker.

## What we won't merge

- Changes that embed personal/production data into code defaults.
- New runtime dependencies without a free-plan-compatible Cloudflare story
  (see README limits table).
