-- =====================================================================
-- Phase 3-7 schema additions
-- =====================================================================

-- Order lifecycle: spec calls for Open/Confirmed/Partial/Shipped/Closed/Cancelled.
-- order_status enum from 0001 only has open/partial/closed; extend it.
-- (ALTER TYPE ... ADD VALUE must run as its own statement, not inside a
-- larger transaction block with dependent DML — fine as a standalone file.)
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

-- order_lines: display fields populated automatically from products
-- (brand/OEM/availability) at entry time, per Phase 3 spec.
alter table public.order_lines
    add column if not exists brand text default '',
    add column if not exists oem_reference text default '',
    add column if not exists availability text default '';

-- purchases: local/secure file storage path (used until a Supabase
-- Storage bucket is wired up — see Phase 4 report) and AI-extraction
-- review state.
alter table public.purchases
    add column if not exists invoice_file_path text,
    add column if not exists extraction_status text default 'not_attempted'
        check (extraction_status in ('not_attempted', 'needs_review', 'reviewed', 'not_configured'));

-- inventory: reserved for the No/Full/Partial receiving workflow — track
-- how much of a purchase line is still awaiting a disposition decision.
alter table public.purchase_lines
    add column if not exists disposition_decided_at timestamptz;
