# Skill: Authoring an e2e Suite (`.e2e-archive/pNN.mjs`)

> Trigger: you shipped a user-visible flow and the regression net must survive the
> session that built it. Unit tests can't see theme swaps, forms, or sitemaps —
> these can.

## House rules (learned the hard way)

1. **No `/tmp` fixtures.** Self-seed from in-repo state: `node scripts/seed-demo.mjs
--posts` / `--theme <name>`, or `d1()` inline. CI must be able to run it cold.
2. `const ROOT = process.cwd()` — run from repo root; never hardcode a machine path.
3. Playwright via repo copy: `await import(ROOT + '/node_modules/playwright/index.mjs')`.
4. `DELETE FROM login_attempts` before any login (rate limiter is 5/15min shared IP).
5. New route directories need **dev server restart** (+ `rm -rf .svelte-kit` when the
   route tree changed) before the first goto — vite dev caches the manifest.
6. Wait on assertions (`locator.waitFor`), not fixed sleeps, where the step depends on
   a D1 round-trip (local wrangler CLI is slow: 1–2 s).
7. Clean up after yourself (delete probe types/rows) so reruns are green.
8. `pageerror` collector + fail on non-empty → catches hydration regressions.

## Skeleton

```js
const ROOT = process.cwd();
const { execSync } = await import('node:child_process');
const { chromium } = await import(ROOT + '/node_modules/playwright/index.mjs');
const BASE = 'http://localhost:5199';
const d1 = (sql) =>
	execSync(
		`pnpm exec wrangler d1 execute kikigaki --local --yes --command "${sql.replaceAll('"', '\\"')}"`,
		{ cwd: ROOT, stdio: 'ignore' }
	);
let pass = 0,
	fail = 0;
const ok = (n, c, e = '') =>
	c
		? (pass++, console.log('  ✓ ' + n))
		: (fail++, console.log('  ✗ ' + n + ' ' + String(e).slice(0, 160)));
const b = await chromium.launch();
const p = await (await b.newContext()).newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
/* …steps… */
await b.close();
console.log(`pNN: ${pass} passed, ${fail + (errs.length ? 1 : 0)} failed`);
process.exit(fail + (errs.length ? 1 : 0) ? 1 : 0);
```

## Run & wire into CI

```bash
pnpm exec vite dev --port 5199 &          # then:
node .e2e-archive/p79d.mjs                # newest exemplar (9 assertions)
```

Add a step in `.github/workflows/ci.yml` → `e2e` job (manual
workflow_dispatch; cold DB: `d1 migrations --local`, `seed:demo`,
`bootstrap-admin.mjs`). Keep every suite self-seeding/self-cleaning — the job runs
them sequentially against one fresh D1.
