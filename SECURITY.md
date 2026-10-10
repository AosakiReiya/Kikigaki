# Security update — 2026-10-10

Install this patch and deploy it promptly. Earlier releases contain an authentication bypass affecting management routes, along with private-file, SVG, setup, comment, payment, and dependency weaknesses. Authentication existed, but it checked the raw URL instead of the route selected by SvelteKit. Alternate locale and encoded paths could therefore skip the shared authentication gate. This finding does not establish that any installation was exploited.

The patch authorizes the matched route, requires administrator privileges, rejects cross-origin management writes, preserves uploaded SVG sandbox policies, blocks public access to paid deliveries and database backups, prevents concurrent first-run account creation, limits comments to published articles, waits for confirmed Stripe payment before delivery, and atomically reserves checkout, settles orders, issues deliveries, and revokes refunds. Login attempts are reserved atomically using the adapter-provided client address. Credential-bearing AI, MCP, and Airwallex requests reject redirects so custom API-key headers cannot be forwarded to another destination. Patched dependency versions replace the vulnerable YAML/frontmatter dependency chain.

## Existing installations

1. Save a private database backup and verify restoration. Use Node 22.13 or later and `pnpm backup:d1`. The logical backup restores locally, checks row counts and foreign keys, and rebuilds FTS without changing production. Database backups contain private records: keep them outside public repositories, public Actions artifacts, and public buckets. The backup workflow rejects those destinations and remains disabled until explicitly configured and enabled.
2. Deploy the patched application. Confirm anonymous management page requests redirect to login and management APIs reject access. Check both your custom domain and Pages domain, including language-prefixed URLs.
3. Check production `AI_SECRET` and `CRON_SECRET` bindings. Public development defaults must be replaced with independent random secrets. **Do not replace `AI_SECRET` directly when encrypted credentials already exist:** old credentials will become unreadable. Use the preserved-data procedure below. Fresh-install bootstrap stops when it detects this situation. Fresh random secrets are saved privately in `.wrangler/security-setup/secrets.json` with file permissions `0600`; values are never printed.
4. Review available access records and provider usage for unexpected activity. If external provider credentials may have been disclosed, revoke and replace them with the provider, then save the replacements in the administration UI. Rotating the database master key does not invalidate an external provider's API key.
5. Update any scheduled caller's private `CRON_SECRET` to match the newly configured Pages secret before enabling it. No key value belongs in source, terminal output, shell arguments, or Actions artifacts.

## Preserved-data master-key rotation

This maintenance script uses the D1 database and Pages project configured in `wrangler.toml`; authenticate with Wrangler first. It performs production writes only in the explicit `apply` step. Use a quiet maintenance window, and deploy immediately afterward because the old deployment still uses the previous key.

Create `.wrangler/security-release/` with directory permissions `0700`. Store the current master key locally in `old-ai-secret.json` as a JSON object with a `secret` property, with file permissions `0600`. Enter its value using a local editor or another protected input method; do not put it in a command. This directory is Git-ignored. The previous plaintext binding can be read by its Cloudflare account owner; encrypted Pages secret values cannot be retrieved afterward.

```bash
node scripts/rotate-production-secrets.mjs prepare
```

Preparation reads existing encrypted AI, MCP, email, and GSC credentials, decrypts each with the previous key, reseals and verifies each under a random new key, and saves a private verified SQL backup. It makes no production changes. Keep the backup, original key, plan, and recovery SQL restricted to the current user; verify their presence before proceeding. Do not share the generated JSON or SQL files.

```bash
pnpm build
node scripts/rotate-production-secrets.mjs apply --confirm-production
pnpm exec wrangler pages deploy .svelte/cloudflare --project-name YOUR_PROJECT --branch main
node scripts/rotate-production-secrets.mjs verify
pnpm exec wrangler pages secret list --project-name YOUR_PROJECT
```

Application guards reject credentials changed after preparation. The update is resumable with the same plan if secret upload or deployment fails; do not generate a new plan midway through recovery. Afterward, both `AI_SECRET` and `CRON_SECRET` must appear as `Value Encrypted`, and preserved credentials must verify with the new key. Existing external provider credentials remain unchanged.

For self-hosted installations, these Cloudflare maintenance commands do not apply. Back up the local SQLite database and preserve the existing master key. Re-encrypt stored credentials and update the process environment together; replacing only the environment key loses access to stored secrets.

## Reporting and scope

Report sensitive findings privately through the repository owner's supported contact channel. Avoid public issue details containing credentials or installation-specific private data.

This patch is not a guarantee that all weaknesses have been found or that older deployments were never accessed. Admin-authored components and themes are trusted executable code; the existing component runtime still requires inline scripts and evaluation, which limits CSP containment.
