# Runbook — Sharing the local stack (Caddy + Tailscale Funnel)

*Set up 2026-08-25. The laptop-hosted stack is reachable by the client team at a public
HTTPS URL — no server, nothing to install on their side.*

## Quick reference

| | |
|---|---|
| **Public URL (share this)** | `https://ayshwarya.tail6aca2f.ts.net` |
| What's on it | Web app at `/`, API at `/api/v1`, Mailpit at `/mailpit/` — one origin via Caddy |
| Logins | The demo accounts in the root README (`Parinaam@123`) — retained by decision |
| **Turn OFF** | `tailscale funnel --https=443 off` — the URL dies instantly |
| **Turn ON again** | `tailscale funnel --bg 8080` — the *same* URL comes back |
| Is it on? | `tailscale funnel status` |
| Uptime | Only while this laptop is awake with Tailscale running — disable sleep-on-lid-close during client sessions |
| Tailscale binary | `C:\Program Files\Tailscale\tailscale.exe` (account `ayshwaryashok@gmail.com`) |

**When sharing stops for good:** funnel off, then in `.env` set
`PUBLIC_WEB_URL=http://localhost:5174` and `docker compose --profile app up -d --force-recreate api worker`
(so links inside emails point locally again). That one env line is the entire revert.

## Every service URL, by access layer

**Public — anyone with the link, no Tailscale needed** (only the Caddy front door rides the
funnel; Funnel can publish 443/8443/10000 only, which is why the single origin pays off):

| Service | URL |
|---|---|
| Web app | `https://ayshwarya.tail6aca2f.ts.net` |
| API (same origin) | `https://ayshwarya.tail6aca2f.ts.net/api/v1` |
| Mailpit UI | `https://ayshwarya.tail6aca2f.ts.net/mailpit/` |

**Tailnet-only — this machine, and any device the node is shared with** (the sensitive
surfaces stay off the public internet by construction):

| Service | URL | Notes |
|---|---|---|
| Caddy front door | `http://ayshwarya.tail6aca2f.ts.net:8080` | Same three routes as the funnel |
| Web app (direct, Vite) | `http://ayshwarya.tail6aca2f.ts.net:5174` | `/api` proxied by the dev server |
| API + Swagger | `http://ayshwarya.tail6aca2f.ts.net:3001` | Swagger at `/api/docs` |
| n8n editor | `http://ayshwarya.tail6aca2f.ts.net:5679` | Owner login required |
| Adminer | `http://ayshwarya.tail6aca2f.ts.net:8082` | Server **db**, creds in root README §1.9 |
| Mailpit UI (direct) | `http://ayshwarya.tail6aca2f.ts.net:8026/mailpit/` | Note the `/mailpit/` path |
| PostgreSQL | `ayshwarya.tail6aca2f.ts.net:5432` | psql/DBeaver — not a browser URL |
| Redis | `ayshwarya.tail6aca2f.ts.net:6379` | redis-cli |
| Mailpit SMTP | `ayshwarya.tail6aca2f.ts.net:1026` | Point an external app's mail here |

The worker container has no port — it only consumes the queue. To give a teammate the
tailnet-only URLs, use node sharing (admin console → Machines → this machine → Share);
funnel visitors never see them.

## How requests flow

```
client browser ──HTTPS──▶ Tailscale Funnel edge ──▶ tailscaled on the laptop
                                                        │  plain HTTP
                                                        ▼
                                              Caddy  :8080  (caddy/Caddyfile)
                                              ├─ /api/*      → api:3000
                                              ├─ /mailpit/*  → mailpit:8025
                                              └─ /*          → web:5173
```

One origin is the load-bearing idea: the browser talks to both the web app and the API, so a
single hostname means **no CORS, no cross-site cookies, no per-environment web rebuilds** —
the same shape a future VM deployment will use (same Caddyfile, domain instead of `:80`).

## How it was onboarded (the one-time steps, in order)

1. **Caddy front door added to the repo** (commit `b20a7a0`) — see "configuration changes"
   below. This made the whole stack shareable through one port and is permanent.
2. **Tailscale installed** on the laptop: `winget install --id Tailscale.Tailscale`.
3. **Logged in**: `tailscale login` → browser auth → machine joined the tailnet as
   `ayshwarya.tail6aca2f.ts.net` (100.86.122.51).
4. **HTTPS certificates enabled** for the tailnet (one-time toggle):
   admin console → **DNS → HTTPS Certificates → Enable HTTPS**.
5. **Funnel approved** for this node (one-time policy grant): the first
   `tailscale funnel --bg 8080` printed an approval link
   (`login.tailscale.com/f/funnel?node=…`) which was accepted in the admin console.
6. **Funnel started**: `tailscale funnel --bg 8080` — persists across reboots while
   Tailscale runs.
7. **Email links pointed at the public URL** (`.env`, local only) and api+worker restarted.
8. **Verified through the public URL**: web 200, `GET /api/v1/health/ready` 200, Mailpit
   200, and a full admin login (cookie set, `auth/me` answered).

Note the funnel URL was chosen over Tailscale **node sharing** deliberately: sharing would
require every client member to install Tailscale and hold an account; Funnel needs only a
browser. The trade-off is that the URL is on the public internet (see security posture).

## Configuration changes, exactly

**Committed to the repo** (permanent, benefit every environment):

| Change | Where | Why |
|---|---|---|
| Caddy service on `${CADDY_PORT:-8080}` | `docker-compose.yml` | The single front door |
| Route table (`/api/*`, `/mailpit/*`, `/*`) | `caddy/Caddyfile` | Reused verbatim on a VM later |
| `MP_WEBROOT: /mailpit/` on Mailpit | `docker-compose.yml` | Lets Caddy mount the UI on the shared origin. Side-effect: Mailpit's direct port is now `localhost:8026/mailpit/` |
| `VITE_API_BASE_URL=/api/v1` (**relative**) | `.env.example` | The web app works behind any host — localhost, funnel, tunnel, VM domain |
| Dev proxy `/api → api:3000` | `apps/web/vite.config.ts` | Direct `:5174` access keeps working with the relative base URL |
| `allowedHosts: ['.ts.net', '.trycloudflare.com']` | `apps/web/vite.config.ts` | Vite's DNS-rebinding guard 403s unknown Host headers; these are the hostname families the dev server legitimately serves (commit `971772b`) |
| `:8080` origins in default `CORS_ORIGINS` | `.env.example` | Belt-and-braces; same-origin traffic doesn't strictly need it |

**Local-only** (this laptop's gitignored `.env` — a fresh clone is unaffected):

| Variable | Sharing value | Local-only value |
|---|---|---|
| `PUBLIC_WEB_URL` | `https://ayshwarya.tail6aca2f.ts.net` | `http://localhost:5174` |
| `CORS_ORIGINS` | defaults + the funnel origin | defaults |

Nothing else differs. `VITE_API_BASE_URL` stays `/api/v1` everywhere, which is why switching
between local and shared needs no web rebuild.

## Security posture (decisions of record)

- The funnel URL is **public internet** — unguessable, but not secret once shared.
- **Demo credentials retained** and **Mailpit left publicly viewable** at `/mailpit/` —
  explicit user decision (2026-08-25) for demo value. Revisit both before sharing beyond the
  client team: rotate `admin@parinaam.org` and/or delete the `/mailpit/*` block from the
  Caddyfile (`docker compose restart caddy` applies it).
- Only Caddy's port rides the funnel. Postgres, Redis, Adminer and n8n are **not** exposed.
- Funnel traffic transits Tailscale's relays — fine for demos, not a production CDN.

## Alternatives kept in the back pocket

- **Private team access** (installs required, nothing public): Tailscale node sharing —
  admin console → Machines → this machine → Share; recipients reach
  `http://ayshwarya.tail6aca2f.ts.net:8080` over the tailnet.
- **Ad-hoc public link without Tailscale**: `cloudflared tunnel --url http://localhost:8080`
  (URL rotates per run; `allowedHosts` already covers `.trycloudflare.com`).
- **The real fix long-term**: a VM running this same compose file, with this same Caddyfile
  serving the domain — see `deploy.md`.
