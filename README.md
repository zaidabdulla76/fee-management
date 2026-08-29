# Fee Management System — Hijri Fee Ledger

Aligned with [`docs/fee-system-architecture.html`](docs/fee-system-architecture.html).

| Component | Technology |
|-----------|------------|
| Web App | React + TypeScript + Tailwind (static build) |
| API | FastAPI + SQLAlchemy + **gunicorn + uvicorn workers** |
| Database | PostgreSQL (`fee_app` role: **Payment INSERT-only**) |
| Scheduler | Nightly **00:15 UTC** → `POST /api/internal/late-fee-sweep` |
| Exports | WeasyPrint (PDF) + openpyxl (Excel) |
| Auth | JWT, single admin role |
| Edge | **Nginx TLS :443** (HTTP :80 redirects to HTTPS) |

## Repository layout

```
fee/
  backend/          # FastAPI API
  frontend/         # React + TypeScript SPA
  docs/             # Requirements + architecture
  infra/
    nginx/          # TLS edge proxy
    scheduler/      # Nightly late-fee sweep
    postgres/init/  # DB role grants on first boot
  docker-compose.yml
  render.yaml       # Render: API + Postgres + nightly sweep
  netlify.toml      # Netlify: SPA + /api proxy to Render
  README.md
```

## Package READMEs

- Backend API → [`backend/README.md`](backend/README.md)
- Frontend SPA → [`frontend/README.md`](frontend/README.md)

## Quick start (Docker)

```bash
docker compose up --build
```

Open **https://localhost** (self-signed cert — accept the browser warning).

Default login: `admin` / `admin123`

Only Nginx is published (`80` / `443`). API, web, Postgres, and scheduler stay on the internal Docker network.

## Local development

See package READMEs for full detail:

```bash
# API
cd backend && python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt
# (publish Postgres 5432 in compose for host access)
set DATABASE_URL=postgresql+psycopg://fee:fee@localhost:5432/fee
uvicorn app.main:app --reload --port 8000

# UI (other terminal)
cd frontend && npm install && npm run dev
```

Vite proxies `/api` → `http://localhost:8000`.

**Important:** If you run the Vite UI (`npm run dev`), the API must use Docker Postgres on port **5433** (see `.env`). A separate Windows PostgreSQL on 5432 will break login.

Or skip Vite and use the full Docker UI at **https://localhost**.

## Cloud without a credit card

Render, Railway, Fly, and AWS all require a Visa/Mastercard. If you have **no card**, use this split instead:

| Piece | Host | Card? |
|-------|------|--------|
| Admin UI | [Netlify](https://app.netlify.com) | No |
| PostgreSQL | [Neon](https://console.neon.tech) (GitHub login) | No |
| API | [Koyeb](https://app.koyeb.com) Hobby, or [Hugging Face Spaces](https://huggingface.co/new-space) (Docker) | Usually no |
| Nightly sweep | GitHub Action (`.github/workflows/late-fee-sweep.yml`) | No |

### 1. Neon (database)

1. Sign up at [console.neon.tech](https://console.neon.tech) with GitHub.
2. New project, region **Singapore** if available.
3. Copy the connection URI (Dashboard → Connection details). It looks like `postgresql://…@….neon.tech/neondb?sslmode=require`.

### 2. API (try Koyeb first)

1. [Koyeb](https://app.koyeb.com) → GitHub → this repo.
2. Dockerfile path: `backend/Dockerfile` (or the root `Dockerfile` for Hugging Face).
3. Instance type: **Free**. Port **8000** for `backend/Dockerfile`, or **7860** for the root `Dockerfile`.
4. Environment variables:

| Key | Value |
|-----|--------|
| `DATABASE_URL_ADMIN` | Neon URI |
| `FEE_APP_PASSWORD` | any long random string |
| `JWT_SECRET` | long random string |
| `INTERNAL_SWEEP_TOKEN` | long random string |
| `CORS_ORIGINS` | `*` (or your Netlify URL later) |
| `WEB_CONCURRENCY` | `1` |
| `PGSSLMODE` | `require` |

If Koyeb asks for a card, create a **Docker** Space on Hugging Face instead, set the same env vars as **Secrets**, and use the **root** `Dockerfile` (`app_port` 7860). Change `admin` / `admin123` immediately — free Spaces are public URLs.

### 3. GitHub Action (sweep)

Repo → **Settings → Secrets and variables → Actions**:

- `API_URL` — Koyeb or Space URL (no trailing slash)
- `INTERNAL_SWEEP_TOKEN` — same as on the API

The workflow runs daily at 00:15 UTC. You can also run it with **Actions → Late-fee sweep → Run workflow**.

### 4. Netlify (UI)

Deploy this repo on Netlify, then set `/api/*` in `netlify.toml` to your Koyeb/Space URL:

`to = "https://YOUR-API-HOST/api/:splat"`

Student fee data on a free public host is weakly isolated. For a madrasa ledger, **Docker on this PC** (`docker compose up --build` → https://localhost) is the safest no-card option.

## Cloud (Netlify UI + Render API)

Use this path only when you have a Visa/Mastercard for Render billing.

| Piece | Host |
|-------|------|
| Admin UI | Netlify (`netlify.toml`) |
| API | Render web service (`hijri-fee-api`) |
| PostgreSQL | Render Postgres (private network only) |
| Late-fee sweep | Render Cron `15 0 * * *` UTC |

1. Push the repo to GitHub.
2. In [Render](https://dashboard.render.com): **New → Blueprint**, select this repo. Wait until `hijri-fee-api` is live.
3. If the API URL is not exactly `https://hijri-fee-api.onrender.com`, update the `/api/*` redirect in `netlify.toml`.
4. Deploy the frontend on Netlify (same repo; build settings are already in `netlify.toml`).
5. Optionally set `CORS_ORIGINS` on Render to your Netlify origin (the proxy is same-origin, so this is a backup).

Change `JWT_SECRET` is automatic on Render (generated). Default login after seed is still `admin` / `admin123` — change that password after first login.

## Architecture endpoints

- `POST /api/academic-years/{id}/enroll?student_id=`
- `GET /api/fee-types/{id}/items`
- `POST /api/collections` (single DB transaction)
- `POST /api/internal/late-fee-sweep` (scheduler token only)
- `GET /api/reports/export?kind=&format=pdf|xlsx`
- Payment audit: `created_by`, `created_at`

## Security

Change `JWT_SECRET` and `INTERNAL_SWEEP_TOKEN` before a **Docker/VPS** production deploy (Render generates them). Replace the self-signed Nginx cert with a real certificate when you terminate TLS yourself.
