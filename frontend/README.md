# Frontend (`frontend`)

React + TypeScript + Tailwind SPA for the Hijri Fee Ledger admin UI.

Aligned with [`docs/fee-system-architecture.html`](../docs/fee-system-architecture.html).

## Stack

| Piece | Choice |
|-------|--------|
| UI | React 19 + TypeScript |
| Build | Vite |
| Styling | Tailwind CSS v4 |
| Routing | React Router |
| Data | TanStack Query + Axios |
| Auth | JWT in `localStorage` |

## Layout

```
frontend/
  src/
    api/           # Axios client + resource helpers
    components/    # Shared UI (StatusBadge, Modal, …)
    context/       # Auth + academic year
    layouts/       # App shell (sidebar, year switcher)
    pages/         # Dashboard, Students, Collect, Reports, Settings, …
    utils/format.ts
  Dockerfile       # Multi-stage: Vite build → static Nginx image
  nginx.static.conf
  vite.config.ts   # Dev proxy /api → localhost:8000
```

## Screens

| Route | Purpose |
|-------|---------|
| `/login` | Admin sign-in |
| `/` | Dashboard (FR-1) |
| `/students` | Search / CRUD |
| `/students/:id` | Tuition grid, ledger, mark paid |
| `/academic-years` | Create / list years |
| `/collect` | Non-Tuition collection (FR-12) |
| `/reports` | Reports + PDF/Excel download |
| `/settings` | Fee types, prices, late fee, classes |

## Local development

Requires the API on port **8000** (see [`../backend/README.md`](../backend/README.md)).

```bash
cd frontend
npm install
npm run dev
```

App: http://localhost:5173  

Vite proxies `/api` → `http://localhost:8000`.

Default login: `admin` / `admin123`

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Preview production build |
| `npm run lint` | Oxlint |

## Docker / production

From the repo root, `docker compose up --build` builds this image as the internal `web` service (static files only). Public traffic goes through the edge Nginx (`https://localhost`).

The frontend container does **not** proxy `/api` itself — the edge Nginx routes `/api/` to the API service.

## Netlify (static UI only)

Production UI is a Vite build on Netlify. `/api/*` is proxied to the Render API (see [`../netlify.toml`](../netlify.toml) and [`../render.yaml`](../render.yaml)). Local `npm run dev` still uses the Vite proxy to `localhost:8000`.

## Design

Light institutional theme (navy / teal):

- Page `#F5F7FA`, primary `#1E3A5F`, accent `#0F766E`
- Status badges: Paid / Pending / Overdue
- Amounts in INR (`en-IN`), dates `DD MMM YYYY`

## Related

- Root overview: [`../README.md`](../README.md)
- Backend API: [`../backend/README.md`](../backend/README.md)
