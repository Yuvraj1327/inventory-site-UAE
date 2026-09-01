-- =====================================================================
-- Phase 2 compatibility patch
-- The existing frontend (Orders/Purchases/Invoices pages) stores
-- customer/supplier as free-text names, not FK selections — that UI
-- doesn't change until the Phase 3/4 upgrades. These columns let the
-- new Postgres tables accept that shape today while keeping the FK
-- columns from 0001 available for when the UI is upgraded to real
-- customer/supplier pickers.
-- =====================================================================

alter table public.orders
    add column if not exists customer text default '',
    add column if not exists supplier text default '',
    alter column customer_id drop not null;

alter table public.purchases
    add column if not exists supplier text default '',
    alter column supplier_id drop not null,
    alter column supplier_invoice_number drop not null;

-- supplier_invoice_number is only required/unique once actually supplied
-- (Phase 4 will start requiring it at the API layer)
alter table public.purchases drop constraint if exists purchases_supplier_id_supplier_invoice_number_key;
create unique index if not exists purchases_supplier_invoice_unique
    on public.purchases (supplier_id, supplier_invoice_number)
    where supplier_invoice_number is not null and supplier_invoice_number <> '';

alter table public.invoices
    add column if not exists customer text default '',
    alter column customer_id drop not null;

alter table public.products
    add column if not exists pc text default '';

-- The existing Transactions page posts kind/party/account_no/receipt_no
-- directly (payment_in | payment_out | cash_expense) rather than the
-- income/expense split alone; keep those fields so the page needs no
-- changes yet.
alter table public.accounting_transactions
    add column if not exists kind text default '',
    add column if not exists party text default '',
    add column if not exists account_no text default '',
    add column if not exists receipt_no text default '';
