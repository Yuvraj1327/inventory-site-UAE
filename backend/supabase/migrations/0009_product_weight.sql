-- 0009_product_weight.sql
-- Adds a weight field to products, needed to store the "Weight" column
-- from supplier stock XLSX files. Purely additive: existing rows get a
-- null/zero default, no existing column or data is touched.
alter table public.products
    add column if not exists weight numeric(10,3);
