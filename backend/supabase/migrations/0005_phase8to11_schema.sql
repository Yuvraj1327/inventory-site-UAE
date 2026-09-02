-- =====================================================================
-- Phase 8-11 schema additions
-- =====================================================================

-- ---------------------------------------------------------------------
-- PHASE 8 — Supplier AI Agent opportunities/alerts
-- An "opportunity" is generated when a price check (manual, or from a
-- future real monitoring provider) reveals availability worth surfacing
-- to admin — e.g. matches an open lost-sale/demand record. Approval
-- workflow only: the agent can never write to `purchases` itself.
-- ---------------------------------------------------------------------
create type opportunity_status as enum ('new', 'approved', 'contacted', 'ignored');

create table public.supplier_opportunities (
    id uuid primary key default gen_random_uuid(),
    supplier_id uuid not null references public.suppliers(id),
    product_id uuid references public.products(id),
    part_number text not null,
    price_check_id uuid references public.supplier_price_checks(id),
    lost_sale_id uuid references public.lost_sales(id),
    requested_qty numeric(14,2),
    available_qty numeric(14,2),
    supplier_price numeric(14,2),
    eta text,
    estimated_selling_price numeric(14,2),
    estimated_margin_percent numeric(6,2),
    estimated_gross_profit numeric(14,2),
    status opportunity_status not null default 'new',
    decided_by uuid references public.profiles(id),
    decided_at timestamptz,
    resulting_purchase_id uuid references public.purchases(id),
    source text not null default 'manual' check (source in ('manual', 'mock_test', 'api')),
    created_at timestamptz not null default now()
);
create index on public.supplier_opportunities (status, created_at desc);

alter table public.supplier_opportunities enable row level security;
create policy staff_admin_all on public.supplier_opportunities
  for all using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

-- ---------------------------------------------------------------------
-- PHASE 10 — Accounting: allow recording capital contributions so the
-- Balance Sheet's Equity side has something other than retained
-- earnings to work with. Kept optional/manual — no fake numbers.
-- ---------------------------------------------------------------------
alter table public.accounting_transactions drop constraint if exists accounting_transactions_type_check;
alter table public.accounting_transactions add constraint accounting_transactions_type_check
    check (type in ('income','expense','payment_in','payment_out','invoice','adjustment','capital'));

-- ---------------------------------------------------------------------
-- PHASE 11 — WhatsApp receipt delivery detail
-- ---------------------------------------------------------------------
alter table public.receipts
    add column if not exists whatsapp_message_id text,
    add column if not exists whatsapp_error text;
