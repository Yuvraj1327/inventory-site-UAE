-- =====================================================================
-- Ledgerly ERP — Phase 2 Supabase schema (DRAFT — NOT YET APPLIED)
-- Design only. Review with the team before running against a real
-- Supabase project. Written to run via `supabase db push` or the SQL
-- editor once approved.
-- =====================================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()

-- ---------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------
create type user_role as enum ('admin', 'staff', 'customer');
create type order_status as enum ('open', 'partial', 'closed');
create type purchase_status as enum ('pending', 'received', 'partial');
create type disposition as enum ('none', 'full', 'partial');
create type invoice_status as enum ('unpaid', 'partial', 'paid', 'void');
create type payment_method as enum ('cash', 'bank_transfer', 'cheque', 'card', 'other');
create type party_type as enum ('customer', 'supplier');
create type movement_type as enum ('purchase_in', 'allocation', 'sale', 'return', 'lost', 'adjustment');
create type monitor_interval as enum ('15m', '30m', '1h', '4h', 'daily');
create type actor_type as enum ('user', 'ai_agent', 'system');

-- ---------------------------------------------------------------------
-- PROFILES (extends auth.users — one row per Supabase Auth user)
-- ---------------------------------------------------------------------
create table public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    email text not null,
    full_name text default '',
    role user_role not null default 'customer',
    customer_id uuid,              -- FK added after customers table exists
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
comment on table public.profiles is 'One row per Supabase Auth user; source of truth for role + customer linkage.';

-- ---------------------------------------------------------------------
-- CUSTOMERS
-- ---------------------------------------------------------------------
create table public.customers (
    id uuid primary key default gen_random_uuid(),
    account_no text unique,
    name text not null,
    company text default '',
    is_walkin boolean not null default false,
    tax_registration_number text,
    country text default '',
    city text default '',
    office_address text default '',
    phone text default '',
    mobile text default '',
    whatsapp text default '',
    email text default '',
    payment_terms_days integer default 0,
    credit_limit numeric(14,2) default 0,
    margin_percent numeric(6,3) default 0,      -- default customer pricing rule
    pricing_rule_type text default 'margin_percent',
    special_note text default '',
    status text not null default 'active',
    created_by uuid references public.profiles(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint customers_trn_or_walkin check (
        is_walkin = true or (tax_registration_number is not null and tax_registration_number <> '')
    )
);

alter table public.profiles
    add constraint profiles_customer_fk foreign key (customer_id) references public.customers(id);

-- Future-proofing for brand/part-specific pricing overrides (Phase 11)
create table public.customer_pricing_rules (
    id uuid primary key default gen_random_uuid(),
    customer_id uuid not null references public.customers(id) on delete cascade,
    scope text not null default 'global' check (scope in ('global','brand','part')),
    brand text,
    product_id uuid,                            -- FK added after products table exists
    margin_percent numeric(6,3) not null,
    priority integer not null default 0,
    active boolean not null default true,
    created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- SUPPLIERS
-- ---------------------------------------------------------------------
create table public.suppliers (
    id uuid primary key default gen_random_uuid(),
    account_no text unique,
    name text not null,
    country text default '',
    city text default '',
    office_address text default '',
    phone text default '',
    mobile text default '',
    whatsapp text default '',
    email text default '',
    brand_focus text default '',
    payment_terms_days integer default 0,
    portal_url text default '',
    portal_username text default '',            -- credential SECRET stored via Supabase Vault, never plaintext here
    special_note text default '',
    status text not null default 'active',
    created_by uuid references public.profiles(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- PRODUCTS / PARTS
-- ---------------------------------------------------------------------
create table public.products (
    id uuid primary key default gen_random_uuid(),
    part_number text not null,
    brand text default '',
    description text default '',
    oem_reference text default '',
    alternate_reference text default '',
    superseded_reference text default '',
    superseded_from text default '',
    model text default '',
    unit_cost numeric(14,2) default 0,           -- always = latest purchase cost (Phase 6)
    default_selling_price numeric(14,2) default 0,
    low_stock_threshold numeric(12,2) default 5,
    availability text default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (part_number, brand)
);

alter table public.customer_pricing_rules
    add constraint pricing_rules_product_fk foreign key (product_id) references public.products(id);

-- ---------------------------------------------------------------------
-- INVENTORY (current-state snapshot, one row per product)
-- ---------------------------------------------------------------------
create table public.inventory (
    product_id uuid primary key references public.products(id) on delete cascade,
    available_qty numeric(14,2) not null default 0,
    allocated_qty numeric(14,2) not null default 0,
    incoming_qty numeric(14,2) not null default 0,
    sold_qty numeric(14,2) not null default 0,
    lost_qty numeric(14,2) not null default 0,
    updated_at timestamptz not null default now()
);

create table public.inventory_movements (
    id uuid primary key default gen_random_uuid(),
    product_id uuid not null references public.products(id),
    movement_type movement_type not null,
    quantity numeric(14,2) not null,             -- signed
    unit_cost numeric(14,2),
    reference_type text,                         -- 'purchase' | 'order' | 'invoice' | 'lost_sale' | 'adjustment'
    reference_id uuid,
    notes text default '',
    created_by uuid references public.profiles(id),
    created_at timestamptz not null default now()
);
create index on public.inventory_movements (product_id, created_at desc);

-- ---------------------------------------------------------------------
-- ORDERS FOLLOW-UP  (header) + ORDER LINES
-- ---------------------------------------------------------------------
create table public.orders (
    id uuid primary key default gen_random_uuid(),
    order_number text not null,
    customer_id uuid references public.customers(id),
    supplier_id uuid references public.suppliers(id),
    lpo_ref text default '',
    order_month date not null default date_trunc('month', now())::date,
    carried_forward_from uuid references public.orders(id),
    pricing_status text default '',
    pi_status text default '',
    delivery_status text default '',
    delivery_note text default '',
    status order_status not null default 'open',
    closed_at timestamptz,
    closed_by uuid references public.profiles(id),
    -- header-level financial roll-up (kept for the existing Orders UI; should
    -- be recalculated from order_lines/payments by the service layer)
    purchasing_value numeric(14,2) default 0,
    vat_amount numeric(14,2) default 0,
    selling_value numeric(14,2) default 0,
    selling_vat numeric(14,2) default 0,
    discount_additional_cost numeric(14,2) default 0,
    supplier_pkl text default '',
    customer_pkl text default '',
    payment_received_status text default 'No',
    payment_paid_status text default 'No',
    sale_amount numeric(14,2) default 0,
    received_amount numeric(14,2) default 0,
    supplier_cost numeric(14,2) default 0,
    paid_to_supplier numeric(14,2) default 0,
    order_date date not null default current_date,
    notes text default '',
    created_by uuid references public.profiles(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (order_number, order_month)             -- same order # can carry into a new month
);
create index on public.orders (customer_id);
create index on public.orders (status);

create table public.order_lines (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references public.orders(id) on delete cascade,
    line_no integer not null,
    product_id uuid references public.products(id),
    part_number text not null,                    -- snapshot at time of order
    description text default '',
    order_qty numeric(14,2) not null default 0,
    confirm_qty numeric(14,2) not null default 0,
    cancelled_qty numeric(14,2) not null default 0,
    shipped_qty numeric(14,2) not null default 0,
    unit_selling_price numeric(14,2) not null default 0,
    status text default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (order_id, line_no)
);

-- ---------------------------------------------------------------------
-- PURCHASES (header) + PURCHASE LINES
-- ---------------------------------------------------------------------
create table public.purchases (
    id uuid primary key default gen_random_uuid(),
    purchase_ref text,
    supplier_id uuid not null references public.suppliers(id),
    supplier_invoice_number text not null,
    invoice_file_url text,                         -- Supabase Storage object path
    purchase_date date not null default current_date,
    status purchase_status not null default 'pending',
    total numeric(14,2) default 0,
    notes text default '',
    created_by uuid references public.profiles(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (supplier_id, supplier_invoice_number)
);

create table public.purchase_lines (
    id uuid primary key default gen_random_uuid(),
    purchase_id uuid not null references public.purchases(id) on delete cascade,
    product_id uuid references public.products(id),
    part_number text not null,
    description text default '',
    qty numeric(14,2) not null default 0,
    unit_cost numeric(14,2) not null default 0,
    sold_disposition disposition not null default 'none',   -- Phase 7: No / Full / Partial
    allocated_order_line_id uuid references public.order_lines(id),
    allocated_qty numeric(14,2) not null default 0,
    created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- LOST SALES / DEMAND (kept independent from completed sales — Phase 9)
-- ---------------------------------------------------------------------
create table public.lost_sales (
    id uuid primary key default gen_random_uuid(),
    customer_id uuid references public.customers(id),
    product_id uuid references public.products(id),
    part_number text not null,
    requested_qty numeric(14,2) not null,
    supplied_qty numeric(14,2) not null default 0,
    lost_qty numeric(14,2) not null,
    supplier_id uuid references public.suppliers(id),
    supplier_response text default '',
    reason text default '',
    occurred_on date not null default current_date,
    created_by uuid references public.profiles(id),
    created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- INVOICES + LINES
-- ---------------------------------------------------------------------
create table public.invoices (
    id uuid primary key default gen_random_uuid(),
    invoice_number text not null unique,
    customer_id uuid not null references public.customers(id),
    order_id uuid references public.orders(id),
    invoice_date date not null default current_date,
    due_date date,
    subtotal numeric(14,2) default 0,
    tax_percent numeric(6,3) default 0,
    tax_amount numeric(14,2) default 0,
    total numeric(14,2) default 0,
    status invoice_status not null default 'unpaid',
    ship_type text default 'EX-STOCK',
    currency text default 'AED',
    notes text default '',
    created_by uuid references public.profiles(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index on public.invoices (customer_id);

create table public.invoice_lines (
    id uuid primary key default gen_random_uuid(),
    invoice_id uuid not null references public.invoices(id) on delete cascade,
    product_id uuid references public.products(id),
    part_number text default '',
    description text default '',
    qty numeric(14,2) not null default 0,
    unit_price numeric(14,2) not null default 0,
    line_total numeric(14,2) generated always as (qty * unit_price) stored
);

-- ---------------------------------------------------------------------
-- PAYMENTS + RECEIPTS
-- ---------------------------------------------------------------------
create table public.payments (
    id uuid primary key default gen_random_uuid(),
    party_type party_type not null,
    customer_id uuid references public.customers(id),
    supplier_id uuid references public.suppliers(id),
    invoice_id uuid references public.invoices(id),
    purchase_id uuid references public.purchases(id),
    amount numeric(14,2) not null,
    method payment_method not null default 'bank_transfer',
    reference text default '',
    payment_date date not null default current_date,
    notes text default '',
    created_by uuid references public.profiles(id),
    created_at timestamptz not null default now(),
    constraint payments_party_check check (
        (party_type = 'customer' and customer_id is not null) or
        (party_type = 'supplier' and supplier_id is not null)
    )
);
create index on public.payments (customer_id);

create table public.receipts (
    id uuid primary key default gen_random_uuid(),
    payment_id uuid not null unique references public.payments(id) on delete cascade,
    receipt_number text not null unique,
    pdf_url text,
    whatsapp_status text not null default 'not_applicable'
        check (whatsapp_status in ('pending','sent','failed','not_applicable')),
    whatsapp_sent_at timestamptz,
    created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- ACCOUNTING LEDGER (feeds P&L / Balance Sheet; generalizes old `transactions`)
-- ---------------------------------------------------------------------
create table public.accounting_transactions (
    id uuid primary key default gen_random_uuid(),
    type text not null check (type in ('income','expense','payment_in','payment_out','invoice','adjustment')),
    category text default 'Uncategorized',
    amount numeric(14,2) not null,
    customer_id uuid references public.customers(id),
    supplier_id uuid references public.suppliers(id),
    reference_type text,                          -- 'invoice' | 'payment' | 'purchase' | 'manual'
    reference_id uuid,
    description text default '',
    txn_date date not null default current_date,
    created_by uuid references public.profiles(id),
    created_at timestamptz not null default now()
);
create index on public.accounting_transactions (txn_date);
create index on public.accounting_transactions (customer_id);

-- ---------------------------------------------------------------------
-- CUSTOMER TRAFFIC / DEMAND INTELLIGENCE (Phase 18)
-- ---------------------------------------------------------------------
create table public.customer_activity_log (
    id uuid primary key default gen_random_uuid(),
    customer_id uuid references public.customers(id),
    profile_id uuid references public.profiles(id),          -- portal user who acted
    activity_type text not null check (
        activity_type in ('login','part_search','part_view','brand_view','stock_check','price_check','order_placed')
    ),
    product_id uuid references public.products(id),
    brand text,
    quantity_requested numeric(14,2),
    metadata jsonb default '{}'::jsonb,
    created_at timestamptz not null default now()
);
create index on public.customer_activity_log (customer_id, created_at desc);

-- ---------------------------------------------------------------------
-- SUPPLIER PRICE MONITORING (Phase 12/13)
-- ---------------------------------------------------------------------
create table public.supplier_price_checks (
    id uuid primary key default gen_random_uuid(),
    supplier_id uuid not null references public.suppliers(id),
    product_id uuid references public.products(id),
    part_number text not null,
    available_qty numeric(14,2),
    price numeric(14,2),
    eta text,
    source text not null default 'manual' check (source in ('manual','api','ai_agent')),
    checked_by uuid references public.profiles(id),
    checked_at timestamptz not null default now()
);
create index on public.supplier_price_checks (part_number, checked_at desc);

create table public.supplier_monitoring_tasks (
    id uuid primary key default gen_random_uuid(),
    supplier_id uuid not null references public.suppliers(id),
    product_id uuid references public.products(id),
    part_number text not null,
    interval monitor_interval not null default '1h',
    active boolean not null default true,
    last_run_at timestamptz,
    next_run_at timestamptz,
    created_by uuid references public.profiles(id),
    created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- AUDIT LOGS (all sensitive user + AI-agent actions — Phase 13/19)
-- ---------------------------------------------------------------------
create table public.audit_logs (
    id uuid primary key default gen_random_uuid(),
    actor_type actor_type not null default 'user',
    actor_id uuid references public.profiles(id),
    action text not null,
    entity_type text,
    entity_id uuid,
    metadata jsonb default '{}'::jsonb,
    created_at timestamptz not null default now()
);
create index on public.audit_logs (entity_type, entity_id);
create index on public.audit_logs (created_at desc);

-- =====================================================================
-- TRIGGERS: updated_at maintenance
-- =====================================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','customers','suppliers','products','orders','order_lines',
    'purchases','invoices'
  ]
  loop
    execute format(
      'create trigger trg_%I_updated_at before update on public.%I
       for each row execute function public.set_updated_at();', t, t
    );
  end loop;
end $$;

-- Auto-create a profile row whenever a new Supabase Auth user is created.
-- Role/customer_id default to 'customer'/null; the admin-creation endpoint
-- (service-role, via FastAPI) overwrites these immediately after signup.
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- =====================================================================
-- HELPER FUNCTIONS for RLS (SECURITY DEFINER to avoid recursive RLS)
-- =====================================================================
create or replace function public.current_role()
returns user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_customer_id()
returns uuid language sql stable security definer set search_path = public as $$
  select customer_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_staff_or_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('admin','staff') from public.profiles where id = auth.uid()), false);
$$;

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.customer_pricing_rules enable row level security;
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.inventory enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.orders enable row level security;
alter table public.order_lines enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_lines enable row level security;
alter table public.lost_sales enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.payments enable row level security;
alter table public.receipts enable row level security;
alter table public.accounting_transactions enable row level security;
alter table public.customer_activity_log enable row level security;
alter table public.supplier_price_checks enable row level security;
alter table public.supplier_monitoring_tasks enable row level security;
alter table public.audit_logs enable row level security;

-- Staff/admin: full access everywhere (also true via service_role which
-- bypasses RLS entirely — these policies matter if staff ever connects
-- with their own JWT instead of the service key).
do $$
declare tbl text;
begin
  foreach tbl in array array[
    'profiles','customers','customer_pricing_rules','suppliers','products',
    'inventory','inventory_movements','orders','order_lines','purchases',
    'purchase_lines','lost_sales','invoices','invoice_lines','payments',
    'receipts','accounting_transactions','customer_activity_log',
    'supplier_price_checks','supplier_monitoring_tasks','audit_logs'
  ]
  loop
    execute format(
      'create policy staff_admin_all on public.%I for all
       using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());', tbl
    );
  end loop;
end $$;

-- Customers: read-only, isolated to their own record via profiles.customer_id
create policy customer_self_profile on public.profiles
  for select using (id = auth.uid());

create policy customer_own_record on public.customers
  for select using (id = public.current_customer_id());

create policy customer_own_orders on public.orders
  for select using (customer_id = public.current_customer_id());

create policy customer_own_order_lines on public.order_lines
  for select using (
    order_id in (select id from public.orders where customer_id = public.current_customer_id())
  );

create policy customer_own_invoices on public.invoices
  for select using (customer_id = public.current_customer_id());

create policy customer_own_invoice_lines on public.invoice_lines
  for select using (
    invoice_id in (select id from public.invoices where customer_id = public.current_customer_id())
  );

create policy customer_own_payments on public.payments
  for select using (customer_id = public.current_customer_id());

create policy customer_own_lost_sales on public.lost_sales
  for select using (customer_id = public.current_customer_id());

create policy customer_own_activity_select on public.customer_activity_log
  for select using (customer_id = public.current_customer_id());
create policy customer_own_activity_insert on public.customer_activity_log
  for insert with check (customer_id = public.current_customer_id());

-- Products/inventory: no direct customer table access. Expose a curated
-- view instead (excludes unit_cost / margin data) — see below.
create view public.portal_catalog_view
  with (security_invoker = true) as
select
  p.id as product_id, p.part_number, p.brand, p.description,
  p.oem_reference, p.alternate_reference, p.model,
  i.available_qty
from public.products p
left join public.inventory i on i.product_id = p.id;

-- No RLS needed on the view beyond the security_invoker semantics above
-- (it runs with the querying user's privileges; grant SELECT explicitly):
grant select on public.portal_catalog_view to authenticated;

-- Customer-priced catalog: selling price computed from unit_cost + the
-- caller's own margin_percent — never exposes another customer's pricing.
create view public.portal_priced_catalog_view
  with (security_invoker = true) as
select
  v.product_id, v.part_number, v.brand, v.description, v.available_qty,
  round(p.unit_cost * (1 + c.margin_percent / 100.0), 2) as customer_price
from public.portal_catalog_view v
join public.products p on p.id = v.product_id
join public.customers c on c.id = public.current_customer_id();

grant select on public.portal_priced_catalog_view to authenticated;

-- Statement of Account: derived view, not a stored table.
create view public.customer_soa_view
  with (security_invoker = true) as
select
  customer_id,
  txn_date,
  category,
  type,
  amount,
  reference_type,
  reference_id
from public.accounting_transactions
where customer_id is not null
order by txn_date;

grant select on public.customer_soa_view to authenticated;
create policy customer_own_soa_txns on public.accounting_transactions
  for select using (customer_id = public.current_customer_id());
