-- 0010_customer_currency.sql
-- Adds a display-currency preference to customers (AED or USD). This is
-- purely a *display* setting — every stored price, order, invoice, and
-- accounting figure stays in AED exactly as before. Conversion happens
-- only when rendering a price to that customer, never on write.
alter table public.customers
    add column if not exists currency text not null default 'AED'
    check (currency in ('AED', 'USD'));
