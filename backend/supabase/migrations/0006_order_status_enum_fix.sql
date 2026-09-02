-- =====================================================================
-- LEDGERLY ERP — Migration 0006: order_status enum fix
--
-- ROOT CAUSE: `orders.py` (Phase 3) queries orders whose status is
-- 'open' | 'confirmed' | 'partial' | 'shipped', but the live
-- `order_status` enum only ever had 'open' | 'partial' | 'closed'
-- (from migration 0001). Migration 0004 was written to add
-- 'confirmed' | 'shipped' | 'cancelled', but evidently never actually
-- ran against this database (most likely because an earlier attempt to
-- paste ALL migrations as one big script stopped at the very first
-- statement — "type user_role already exists" — before it ever
-- reached 0004's statements later in the same batch). This migration
-- re-applies exactly those additions on their own, standalone, so a
-- partial/blocked earlier run can't leave them missing again.
--
-- Every statement here is guarded and safe to run more than once, and
-- does not touch any existing type/table/row.
-- =====================================================================

do $$
begin
  if not exists (select 1 from pg_enum where enumlabel = 'confirmed' and enumtypid = 'order_status'::regtype) then
    alter type order_status add value 'confirmed' after 'open';
  end if;
  if not exists (select 1 from pg_enum where enumlabel = 'shipped' and enumtypid = 'order_status'::regtype) then
    alter type order_status add value 'shipped' after 'partial';
  end if;
  if not exists (select 1 from pg_enum where enumlabel = 'cancelled' and enumtypid = 'order_status'::regtype) then
    alter type order_status add value 'cancelled';
  end if;
end $$;

-- These were also part of 0004 — re-applied here in case that
-- migration was similarly blocked. All IF NOT EXISTS, so a no-op if
-- already present.
alter table public.order_lines
    add column if not exists brand text default '',
    add column if not exists oem_reference text default '',
    add column if not exists availability text default '';

alter table public.purchases
    add column if not exists invoice_file_path text,
    add column if not exists extraction_status text default 'not_attempted'
        check (extraction_status in ('not_attempted', 'needs_review', 'reviewed', 'not_configured'));

alter table public.purchase_lines
    add column if not exists disposition_decided_at timestamptz;

-- Refresh PostgREST's schema cache so the new enum values / columns
-- are immediately usable over the REST API.
NOTIFY pgrst, 'reload schema';
