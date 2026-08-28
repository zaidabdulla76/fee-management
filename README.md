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

## Cloud (Netlify UI + Render API)

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
