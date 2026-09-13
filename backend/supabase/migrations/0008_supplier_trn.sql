-- 0008_supplier_trn.sql
-- Adds a TRN (Tax Registration Number) field to suppliers, mirroring the
-- one customers already have. Purely additive: existing rows get an
-- empty default, no existing column/behavior is touched.
alter table public.suppliers
    add column if not exists tax_registration_number text default '';
