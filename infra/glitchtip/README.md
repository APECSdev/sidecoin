<!-- infra/glitchtip/README.md -->

# GlitchTip — self-hosted error tracking (SHARED APECS Dev resource)

Self-hosted, Sentry-SDK-compatible error tracking, **shared across APECS Dev
products**. Namespacing: one GlitchTip **organization per product** — the
Sidecoin monorepo uses org `sidecoin` with projects `web` / `api` / `wallet` /
`mobile`; other products get their own orgs. The service lives on the
product-neutral `glitchtip.apecs.dev` so no product's domain appears in
another's crash payloads. Hosted on the dedicated `glitchtip` LunaNode VPS
(m.4, Toronto, `172.81.177.158`). Error data stays on
infrastructure we control — critical for a crypto wallet, where a crash payload
can accidentally contain a mnemonic, xprv, or address. The SDKs are pointed at
this server; the privacy scrubber (`@sidecoin/observability`) is the first line
of defense and this server is the second (a scrubber miss lands on our box, not
a third-party SaaS).

## Architecture

```
app SDKs ──https──▶ Cloudflare edge (orange-cloud DNS, TLS, DDoS)
                          │
                   cloudflared tunnel  (outbound only — NO inbound ports)
                          │
              127.0.0.1:8000  web (GlitchTip, Django)
                          │
                        postgres  (named volume `pgdata`)
```

- **Why a VPS, not Cloudflare Workers:** GlitchTip is a Django app needing a
  long-running server + persistent PostgreSQL. Workers has neither.
- **Postgres-only:** `VALKEY_URL: ""` disables Valkey/Redis. Confirmed against
  the 6.2.x install docs ("Valkey (or redis) 7+ is optional") and the upstream
  `compose.e2e.no-valkey.yml`. This keeps RAM low.
- **No public port:** `web` binds `127.0.0.1:8000` only; `cloudflared` is the
  sole ingress.

## Version pinning

| Component  | Pinned                  | Verified |
|------------|-------------------------|----------|
| GlitchTip  | `glitchtip/glitchtip:6.2.6` | latest stable tag on Docker Hub (2026-08) |
| Postgres   | `postgres:16`           | GlitchTip requires PostgreSQL 14+ |
| cloudflared| `cloudflare/cloudflared:latest` | infra tool, not data plane |

**No `:latest` on the data plane.** To upgrade GlitchTip, bump the tag, then
`docker compose pull && docker compose up -d` (migrations run automatically on
boot). Re-verify the required env vars against the docs for the new tag before
upgrading.

## Licensing

GlitchTip source is **MIT** (verified in `glitchtip/glitchtip` `LICENSE`).
However, the **hosted** offering is tiered, and the self-hosted listing on
glitchtip.com/pricing shows **"Free — For Personal Projects"** with paid
self-hosted tiers (Small/Medium/Large) above it. **For for-profit production
monitoring, confirm with GlitchTip whether a paid self-hosted license is
expected before going live.** This is an open commercial question, not a code
issue.

## Provisioning (first boot)

Prereq: a small VPS with Docker + the Compose plugin, and a Cloudflare account
with the `sidecoin.app` zone.

```bash
# 1. Copy this directory to the VPS and cd into it.
# 2. Create secrets.
cp .env.example .env
#    Edit .env: POSTGRES_PASSWORD, SECRET_KEY, GLITCHTIP_DOMAIN, EMAIL_URL,
#    DEFAULT_FROM_EMAIL, TUNNEL_TOKEN (see step 4).

# 3. Create the tunnel (one time, from any machine with cloudflared).
cloudflared tunnel login
cloudflared tunnel create glitchtip
cloudflared tunnel route dns glitchtip glitchtip.apecs.dev
cloudflared tunnel token glitchtip   # → put this in .env as TUNNEL_TOKEN

# 4. Start.
docker compose up -d

# 5. Create the admin user.
docker compose exec web python manage.py createsuperuser
```

Then browse to `https://glitchtip.apecs.dev`, create an organization, and
create one project per app (`web`, `api`, `wallet`, `mobile`). Copy each
project's DSN into the corresponding env var (see "App wiring" below).

### Provisioned 2026-10-23 — live instance

- VPS: LunaNode `glitchtip` (m.4 / plan 88, Toronto, `172.81.177.158`,
  vm_id `c70c547d-f55b-4716-b915-1e03dc18548a`), deploy root `/opt/glitchtip`.
- Cloudflare tunnel `glitchtip` (id `8112ecfe-134d-4ac9-aaee-2b42fe8d2bf2`),
  remotely-managed; ingress `glitchtip.apecs.dev → http://web:8000`.
- Admin UI login: `admin@apecs.dev` (password issued to the operator).
- Org `sidecoin`, team `sidecoin`, projects (DSN public keys are **not**
  secrets — they only permit event submission and are embedded in clients):

| Project | DSN |
| --- | --- |
| `web` (id 1) | `https://d82d1c9b-05ec-49a1-b8e5-341416cdce24@glitchtip.apecs.dev/1` |
| `api` (id 2) | `https://f2ee588c-43c3-4b76-a44e-053ad1e3cb57@glitchtip.apecs.dev/2` |
| `wallet` (id 3) | `https://06817167-1ddf-4b30-9f29-196b51e51f5b@glitchtip.apecs.dev/3` |
| `mobile` (id 4) | `https://c9192428-dec7-4da9-8422-10cdaa506b73@glitchtip.apecs.dev/4` |

- New product = new org (one per product); add projects under it the same way
  (`docker compose exec web python manage.py shell`, see git history for the
  bootstrap script). Ingest verified 2026-10-23 via a live store-endpoint
  event against project 1.

### Optional: gate the login UI with Cloudflare Access

Zero Trust → Access → Applications → add `glitchtip.apecs.dev`. **Scope the
policy to the UI only.** The SDK ingest endpoints must stay open so apps can
report errors — do not put `/api/*/store/` or `/api/*/envelope/` behind Access.

## Secrets

- All secrets live in `.env` (gitignored; never committed). `.env.example` is
  the template.
- `SECRET_KEY` — Django secret. **Rotate** by generating a new value and
  `docker compose up -d`. Rotating invalidates all sessions (users re-login)
  but does not lose event data.
- `POSTGRES_PASSWORD` — rotating requires updating both the `postgres` and
  `web` services consistently; prefer a strong initial value and rotate by
  recreating the DB only if you have a backup to restore.
- `TUNNEL_TOKEN` — rotate in the Zero Trust dashboard, update `.env`, restart.

## Backups

The only stateful data is the Postgres named volume `pgdata`.

```bash
# Logical backup (recommended — consistent, restorable).
docker compose exec -T postgres \
  pg_dump -U glitchtip -d glitchtip -Fc > backup-$(date +%F).dump

# Optionally also snapshot the raw volume (cold):
docker compose run --rm -v glitchtip_pgdata:/data -v "$PWD":/b alpine \
  tar czf /b/pgdata-$(date +%F).tgz -C /data .
```

Automate the `pg_dump` line in cron; store dumps off-box.

## Restore

```bash
# Into a fresh stack (or after dropping the DB):
docker compose up -d postgres
cat backup-YYYY-MM-DD.dump | docker compose exec -T postgres \
  pg_restore -U glitchtip -d glitchtip --clean --if-exists
docker compose up -d
```

## App wiring (DSN injection)

Each app reads its DSN from a build-time env var. **Empty DSN ⇒ the SDK is a
no-op and makes zero network calls.** See `packages/observability` for the
shared scrubber every app uses.

| App    | Env var                    | Mechanism          | Rollout |
|--------|----------------------------|--------------------|---------|
| web    | `PUBLIC_GLITCHTIP_DSN`     | Astro `PUBLIC_*`   | first   |
| api    | Worker secret/DSN          | `wrangler secret`  | see `HANDOFF-sidecoin-api.md` |
| wallet | `VITE_GLITCHTIP_DSN`       | Vite `VITE_*`      | after scrubber review |
| mobile | build-time string          | `src/lib/sentry.ts`| last (fdroid stays no-op) |

The **wallet** DSN may be intentionally left unset until the scrubber is signed
off. **Mobile** must keep the F-Droid flavor no-op (policy); only the appstore
flavor reports.

## Verify acceptance

```bash
# Reachable only via the tunnel; no public app port on the VPS.
ss -tlnp | grep 8000        # → should show 127.0.0.1:8000 only
curl -s https://glitchtip.apecs.dev/_health/   # → 200 through the tunnel
```
