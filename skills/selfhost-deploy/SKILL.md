# Skill: Self-host Deploy (Docker · Fly.io · China VPS)

> Trigger: user is not on Cloudflare. Same repo, second adapter (`ADAPTER=node`).

## Fastest: docker compose (any Linux box)

```bash
git clone <repo> && cd kikigaki
docker compose up -d --build     # port 3000, volume kikigaki-data
```

Required env (see `compose.yaml` comments — all first-run safe, all changeable later):

| var                                        | meaning                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| `ORIGIN`                                   | final https origin behind your reverse proxy (canonical/SEO)              |
| `AI_SECRET`                                | AES-GCM master key for stored provider credentials — **change it**        |
| `SELF_HOST_DB` / `SELF_HOST_MEDIA`         | SQLite path + media dir (both under `/app/data`)                          |
| `CRON_SECRET`                              | optional; then cron `GET /api/cron/publish-due?key=…` for scheduled posts |
| `TURNSTILE_SECRET` / `TURNSTILE_HOSTNAMES` | optional comment bot gate                                                 |
| `SELF_HOST_STEPS`                          | agent steps per advance (10 default; lower behind tight proxy timeouts)   |

Migrations apply idempotently on boot (`node-shim/migrate.mjs`) — never run drizzle
manually in production. First admin: visit `/admin` → setup wizard.

## Fly.io

`fly.toml` at repo root: `fly launch --copy` (or `fly deploy`) — the Dockerfile builds,
`internal_port=3000`, SQLite lives on the mounted volume (`/app/data`). Set secrets:
`fly secrets set AI_SECRET=… ORIGIN=https://your.app.fly.dev`.

## China VPS

See root `DEPLOY-CHINA.md` (mirror registry for pnpm/base image, ICP reality check,
systemd example). Rules of thumb: docker-compose path works everywhere; if you can't
run Docker, `pnpm build && node build` under systemd works too (Node ≥ 22).

## Verify (all paths)

```bash
curl -sI https://your.host/robots.txt      # 200
curl -s  https://your.host/healthz         # if you wired it; else /api/search?q=x
# login → create a post → confirm /blog pagination + media upload land in the volume
```
