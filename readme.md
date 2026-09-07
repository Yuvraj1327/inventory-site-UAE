# Al Rigga Auto — Automotive ERP

A full-stack ERP for an automotive spare-parts business: inventory, purchasing, sales, accounting, customer/supplier intelligence, and AI-assisted receipt scanning and Q&A.

```
React (CRA)  →  FastAPI  →  Supabase (PostgreSQL + Auth + RLS)
```

No MongoDB, no custom JWT implementation, no second database. Supabase Auth issues sessions; every FastAPI endpoint re-validates the caller's role server-side against `profiles` (never trusts a JWT claim alone); Postgres Row-Level Security stays on as defense-in-depth even where FastAPI already filters by role.

---

## Features

| Module | What it does |
|---|---|
| **Dashboard** | Income/expense/profit KPIs, receivables/payables, monthly trend and category charts, operational signals (demand, supplier price changes, AI alerts) |
| **Transactions** | General income/expense ledger |
| **Orders Follow-Up** | Sales order lifecycle: draft → confirmed → shipped, with line items |
| **Inventory** | Stock levels, low-stock alerts, unit cost/pricing |
| **Purchases** | Supplier purchase orders, confirm → receive workflow, receipt-image upload |
| **Invoices** | Customer invoicing, status tracking, Excel export |
| **Accounting** | P&L, balance sheet, payment recording, WhatsApp receipt resend |
| **Customers / Suppliers** | Party management with country/city lookup, Statement of Account (PDF) |
| **Customer Intelligence** | Demand patterns and activity by customer |
| **Lost Sales** | Log unfulfilled demand, part-level demand summary for restocking decisions |
| **Supplier Monitoring** | Price-check history, supplier comparison, monitoring task configuration |
| **AI Control Center** | Review/approve/ignore AI-surfaced supplier opportunities, with audit log |
| **Payment Reminders** | Overdue/upcoming payment tracking |
| **Customer Portal** | Self-service view scoped to a customer's own data via RLS |
| **Receipt Scanner** | Upload a receipt image → Gemini extracts structured line items |
| **AI Assistant** | Chat interface for ERP questions, backed by Gemini |

### AI features (Google Gemini)

Both the Receipt Scanner and AI Assistant are powered by Gemini, called **only from the backend** — the API key never reaches the browser. If `GEMINI_API_KEY` isn't set, both features safely report "not configured" (503) rather than failing unpredictably or fabricating data; when it is set, real extraction/chat happens, no mocked responses.

Safety boundaries baked into the assistant's system prompt:
- No claimed access to live database figures — it won't invent numbers.
- It will not claim to perform, or offer to skip confirmation on, any purchasing/financial/destructive action. It directs the user to the relevant authorized page instead.

The receipt extractor is instructed to return `null` for anything unclear rather than guess, and the UI flags low-confidence fields for manual review.

---

## Architecture

```
backend/
  server.py                    # entrypoint → app.main:app
  app/
    main.py                    # FastAPI app, CORS, rate limiting, /api/health/supabase
    core/
      config.py                # Settings — reads backend/.env
      security.py              # Supabase-JWT auth (validated remotely, not decoded locally)
      supabase_client.py       # service-role client (admin) / per-request client (RLS)
      rate_limit.py
    routers/                   # one file per resource (orders.py, purchases.py, accounting.py, …)
    services/
      ai_provider.py           # Gemini receipt-extraction provider (+ NotConfigured fallback)
      chat_provider.py         # Gemini chat provider (+ NotConfigured fallback)
      gemini_client.py         # single shared Gemini SDK client
      supplier_provider.py     # supplier price-check provider abstraction
      whatsapp_provider.py     # WhatsApp receipt-sending provider abstraction
      audit.py, compat.py, file_storage.py
  supabase/migrations/         # SQL migrations, applied in order

frontend/
  src/
    App.js                     # routes — most pages lazy-loaded, Accounting loaded eagerly
    components/
      Layout.jsx                # top navbar + grouped/collapsible sidebar
      ProtectedRoute.jsx         # role-gated routing
      ErrorBoundary.jsx          # per-route crash recovery, shows the real error inline
    context/AuthContext.jsx     # Supabase session → /api/auth/me profile, single source of truth
    lib/
      api.js                    # axios client, attaches Supabase access token
      supabaseClient.js         # Supabase Auth client (anon key only)
    pages/                      # one file per route
    components/ui/              # shadcn/ui primitives
```

Provider abstractions (`ai_provider.py`, `chat_provider.py`, `supplier_provider.py`, `whatsapp_provider.py`) all follow the same pattern: a real implementation plus a `NotConfigured*` fallback selected automatically based on whether the relevant env var is set. This keeps the app honest — an unconfigured integration says so, it never silently mocks data.

---

## Getting started

### Prerequisites
- Python 3.11+, Node 18+, Yarn
- A Supabase project (PostgreSQL + Auth)
- (Optional) A Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey) for the AI features

### 1. Database
Run the migrations in `backend/supabase/migrations/` against your Supabase project, in order, via the Supabase SQL editor or `psql`.

### 2. Backend
```bash
cd backend
cp .env.example .env    # fill in your Supabase project's values
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

Required in `backend/.env`: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`. Everything else (`GEMINI_API_KEY`, `WHATSAPP_PROVIDER_*`, `SUPPLIER_MOCK_PROVIDER`) is optional — leave blank to keep the corresponding feature in its "not configured" state. See `.env.example` for the full list with explanations.

> **Note:** `.env` is loaded with `override=True` so it's always authoritative over any pre-existing process environment variable of the same name — if you edit `.env` while the server is already running, restart the process fully; `--reload` only watches `.py` file changes, not `.env`.

### 3. Frontend
```bash
cd frontend
yarn install
yarn start       # dev server
yarn build       # production build → build/
```

Required in `frontend/.env`: `REACT_APP_BACKEND_URL`, `REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_ANON_KEY` (anon key only — the service-role key and Gemini key must never appear here).

### 4. Verify
- `GET /api/health/supabase` — unauthenticated diagnostic: confirms Supabase config, admin profile, and whether Gemini is detected (`gemini_configured: true/false`) — booleans only, never secrets.
- Log in as an admin/staff account, confirm the Dashboard loads.
- If `GEMINI_API_KEY` is set, test `/scanner` with a receipt image and ask `/assistant` a few ERP questions.

---

## Security notes

- `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `DATABASE_URL`, and `GEMINI_API_KEY` are backend-only. None of them are referenced anywhere in `frontend/src`.
- The frontend only ever holds the Supabase **anon** key, used solely for Auth (sign-in, session refresh) — all data reads/writes go through FastAPI.
- Auth tokens are validated remotely against Supabase on every request (`app/core/security.py`), not decoded locally, so it works regardless of the project's signing algorithm.
- RLS is enabled on every table as a second line of defense even where FastAPI already filters by role.

---

## Tech stack

**Backend:** FastAPI, Supabase (PostgreSQL + Auth + RLS), `google-genai`, Pillow, openpyxl
**Frontend:** React (Create React App + CRACO), Tailwind CSS, shadcn/ui, React Router, Recharts, Framer Motion, `@phosphor-icons/react`
