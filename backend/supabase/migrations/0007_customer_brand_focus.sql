-- =====================================================================
-- LEDGERLY ERP — Migration 0007: customers.brand_focus
--
-- ROOT CAUSE: Parties.jsx has always collected and displayed a "Brand
-- Focus" field on the CUSTOMER form/list (data-testid
-- "customer-brand-select", shown in the customer table). The original
-- 0001 schema only put `brand_focus` on `suppliers` (a supplier's own
-- brand specialty) and never added the equivalent column to
-- `customers` — so every customer-create request has been sending a
-- column Postgres genuinely doesn't have (PGRST204), not a stray
-- unused field. The fix is to add the column, not strip it.
--
-- Purely additive: adds one nullable-with-default column. No existing
-- data, types, or other tables are touched.
-- =====================================================================

alter table public.customers
    add column if not exists brand_focus text default '';

NOTIFY pgrst, 'reload schema';
