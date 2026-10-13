-- Barrio schema. Run once in the Supabase SQL editor (or `supabase db push`).
-- The app talks to the database only from the server, with the service-role key.
-- Row Level Security is enabled with NO policies, so the public anon key can read nothing.

create extension if not exists pgcrypto;

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$'),
  name text not null check (char_length(name) between 1 and 120),
  kind text not null check (kind in ('salon', 'restaurant')),
  description text not null default '',
  address text not null default '',
  phone text not null default '',
  timezone text not null default 'Europe/Madrid',
  currency text not null default 'EUR',
  capacity int not null default 1 check (capacity between 1 and 200),
  slot_step_minutes int not null default 15 check (slot_step_minutes between 5 and 240),
  table_duration_minutes int not null default 90 check (table_duration_minutes between 0 and 600),
  max_party_size int not null default 1 check (max_party_size between 1 and 100),
  hours jsonb not null default '[]'::jsonb check (jsonb_typeof(hours) = 'array'),
  notify_email text not null default '' check (char_length(notify_email) <= 120),
  trusted boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '',
  duration_minutes int not null check (duration_minutes between 5 and 600),
  price numeric(10, 2) not null default 0 check (price >= 0),
  price_from boolean not null default false,
  active boolean not null default true,
  aliases text[] not null default '{}'
);
create index if not exists services_business_idx on public.services (business_id);

create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  -- Insertion order = the order the owner entered the menu in (keeps categories in menu order).
  seq bigint generated always as identity,
  business_id uuid not null references public.businesses(id) on delete cascade,
  category text not null default '',
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '',
  price numeric(10, 2) not null default 0 check (price >= 0),
  gluten_free boolean,
  allergens text[] not null default '{}',
  allergens_declared boolean not null default false,
  available boolean not null default true
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  reference text not null check (reference ~ '^[A-Z0-9]{4,8}$'),
  date date not null,
  start_time text not null check (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  duration_minutes int not null check (duration_minutes between 5 and 600),
  service_id uuid references public.services(id) on delete set null,
  service_name text not null default '',
  party_size int not null default 1 check (party_size between 1 and 100),
  customer_name text not null check (char_length(customer_name) between 1 and 80),
  -- Empty is allowed for walk-ins entered by the owner; assistant bookings always carry a phone.
  customer_phone text not null default '' check (char_length(customer_phone) <= 30),
  notes text not null default '' check (char_length(notes) <= 500),
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  source text not null default 'mcp' check (source in ('mcp', 'dashboard')),
  created_at timestamptz not null default now(),
  unique (business_id, reference)
);
create index if not exists bookings_business_date_idx on public.bookings (business_id, date);

-- Upgrades for databases created from earlier drafts of this file.
alter table public.businesses add column if not exists notify_email text not null default '';
alter table public.businesses add column if not exists trusted boolean not null default false;
alter table public.services add column if not exists aliases text[] not null default '{}';
alter table public.menu_items add column if not exists seq bigint generated always as identity;
alter table public.bookings alter column customer_phone set default '';
alter table public.bookings drop constraint if exists bookings_customer_phone_check;
alter table public.bookings add constraint bookings_customer_phone_check check (char_length(customer_phone) <= 30);

-- Recreated (not "if not exists"): an old draft had an index with this name on business_id only.
drop index if exists public.menu_items_business_idx;
create index menu_items_business_idx on public.menu_items (business_id, seq);
-- Old drafts added notify_email without its length limit.
alter table public.businesses drop constraint if exists businesses_notify_email_check;
alter table public.businesses add constraint businesses_notify_email_check check (char_length(notify_email) <= 120);
-- The hourly assistant-booking ceiling counts recent bookings under the lock: keep that an index scan.
create index if not exists bookings_mcp_recent_idx on public.bookings (business_id, created_at) where source = 'mcp';

alter table public.businesses enable row level security;
alter table public.services enable row level security;
alter table public.menu_items enable row level security;
alter table public.bookings enable row level security;

-- Atomic booking: serialises bookings per business with a transaction-scoped advisory lock,
-- re-counts overlapping confirmed bookings against the business's capacity, then inserts.
-- Two customers asking for the last slot at the same instant cannot both get it.
-- Earlier draft signatures (safe no-ops on a fresh project).
drop function if exists public.create_booking_atomic(uuid, date, text, int, uuid, text, int, text, text, text, text);
drop function if exists public.create_booking_atomic(uuid, date, text, int, uuid, text, int, text, text, text, text, int, date);

create or replace function public.create_booking_atomic(
  p_business_id uuid,
  p_date date,
  p_start_time text,
  p_duration_minutes int,
  p_service_id uuid,
  p_service_name text,
  p_party_size int,
  p_customer_name text,
  p_customer_phone text,
  p_notes text,
  p_source text,
  p_max_per_phone int,
  p_today date,
  p_max_mcp_per_hour int
) returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capacity int;
  v_start int := split_part(p_start_time, ':', 1)::int * 60 + split_part(p_start_time, ':', 2)::int;
  v_end int := v_start + p_duration_minutes;
  v_taken int;
  v_alphabet text := 'ACDEFGHJKMNPQRTUVWXY34679';
  v_reference text;
  v_row public.bookings;
  v_attempt int := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text, 0));

  select capacity into v_capacity from public.businesses where id = p_business_id;
  if v_capacity is null then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- A retried request (same phone, same date and time) gets the booking it already made, under
  -- the lock, so two copies of one request can't take two tables.
  if length(regexp_replace(p_customer_phone, '\D', '', 'g')) >= 6 then
    select * into v_row from public.bookings b
    where b.business_id = p_business_id
      and b.date = p_date
      and b.start_time = p_start_time
      and b.status = 'confirmed'
      and right(regexp_replace(b.customer_phone, '\D', '', 'g'), 9)
        = right(regexp_replace(p_customer_phone, '\D', '', 'g'), 9)
    limit 1;
    if found then
      raise exception 'DUPLICATE_BOOKING:%', v_row.reference using errcode = 'P0001';
    end if;
  end if;

  -- The service may have been deleted or hidden since the availability check.
  if p_service_id is not null and not exists (
    select 1 from public.services s where s.id = p_service_id and s.business_id = p_business_id and s.active
  ) then
    raise exception 'SERVICE_UNAVAILABLE' using errcode = 'P0001';
  end if;

  if p_source = 'mcp' and p_max_mcp_per_hour > 0 and (
    select count(*) from public.bookings b
    where b.business_id = p_business_id
      and b.source = 'mcp'
      and b.created_at > now() - interval '1 hour'
  ) >= p_max_mcp_per_hour then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;

  if p_max_per_phone > 0 and (
    select count(*) from public.bookings b
    where b.business_id = p_business_id
      and b.status = 'confirmed'
      and b.date >= p_today
      and right(regexp_replace(b.customer_phone, '\D', '', 'g'), 9)
        = right(regexp_replace(p_customer_phone, '\D', '', 'g'), 9)
  ) >= p_max_per_phone then
    raise exception 'TOO_MANY_BOOKINGS' using errcode = 'P0001';
  end if;

  -- Peak number of bookings in use at once during [v_start, v_end) — not just how many overlap the
  -- window: four tables at 20:00 and four at 21:30 never use more than four. Occupancy only rises
  -- when a booking starts, so the window start plus each start inside it are the points to check.
  with overlapping as (
    select s, s + b.duration_minutes as e
    from public.bookings b,
      lateral (select split_part(b.start_time, ':', 1)::int * 60 + split_part(b.start_time, ':', 2)::int as s) t
    where b.business_id = p_business_id
      and b.date = p_date
      and b.status = 'confirmed'
      and v_start < s + b.duration_minutes
      and s < v_end
  ), points as (
    select v_start as pt
    union
    select s from overlapping where s > v_start
  )
  select coalesce(max((select count(*) from overlapping o where o.s <= p.pt and p.pt < o.e)), 0)
  into v_taken
  from points p;

  if v_taken >= v_capacity then
    raise exception 'SLOT_TAKEN' using errcode = 'P0001';
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_reference := '';
    for i in 1..4 loop
      v_reference := v_reference || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (
      select 1 from public.bookings where business_id = p_business_id and reference = v_reference
    );
    if v_attempt > 50 then
      raise exception 'REFERENCE_EXHAUSTED';
    end if;
  end loop;

  insert into public.bookings (
    business_id, reference, date, start_time, duration_minutes, service_id, service_name,
    party_size, customer_name, customer_phone, notes, source
  ) values (
    p_business_id, v_reference, p_date, p_start_time, p_duration_minutes, p_service_id, p_service_name,
    p_party_size, p_customer_name, p_customer_phone, coalesce(p_notes, ''), p_source
  ) returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.create_booking_atomic from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.create_booking_atomic from anon, authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.create_booking_atomic to service_role';
  end if;
end $$;
