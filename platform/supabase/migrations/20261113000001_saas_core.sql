-- VYRO SaaS core schema: clients, plans, subscriptions, invoices, payments,
-- widget licensing and notifications.
--
-- Security model
--   * Every table has row-level security. Clients only ever see rows of their
--     own company; VYRO admins see everything.
--   * Money-moving writes (payments, invoice status, subscription status) are
--     done only by Edge Functions with the service role, never from a browser.
--   * Saved-card tokens are not readable by clients at all (column grants).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- types

create type public.app_role as enum ('admin', 'client');

create type public.subscription_status as enum (
  'pending_setup',     -- plan created, setup fee not paid yet
  'active',            -- paid up
  'past_due',          -- renewal failed, inside the grace period
  'cancel_scheduled',  -- client cancelled, runs until the paid period ends
  'cancelled',         -- ended after cancellation
  'suspended'          -- grace period ran out without payment
);

create type public.billing_interval as enum ('monthly', 'annual');
create type public.invoice_kind as enum ('setup', 'subscription', 'manual');
create type public.invoice_status as enum ('open', 'processing', 'paid', 'failed', 'void');
create type public.payment_status as enum ('processing', 'successful', 'failed');
create type public.payment_flow as enum ('hosted', 'token', 'payment_link', 'card_check', 'offline');

-- ---------------------------------------------------------------- tables

create table public.companies (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  store_name    text,
  website       text,
  logo_path     text,
  contact_name  text,
  contact_email text,
  contact_phone text,
  address       text,
  notes         text,               -- internal, admin only (see column grants)
  created_at    timestamptz not null default now()
);

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        public.app_role not null default 'client',
  company_id  uuid references public.companies (id) on delete set null,
  full_name   text,
  created_at  timestamptz not null default now(),
  constraint client_has_company check (role = 'admin' or company_id is not null)
);

-- One current plan per company; older versions are kept with active = false.
create table public.plans (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies (id) on delete cascade,
  name                text not null default 'VYRO',
  currency            text not null default 'OMR',
  setup_fee           numeric(12, 3) not null default 0 check (setup_fee >= 0),
  recurring_fee       numeric(12, 3) not null check (recurring_fee >= 0),
  billing_interval    public.billing_interval not null default 'monthly',
  product_limit       integer not null default 0 check (product_limit >= 0),
  -- First automatic charge; null = on the day the setup fee is paid.
  billing_start_date  date,
  contract_months     integer check (contract_months is null or contract_months > 0),
  cancellation_terms  text,
  active              boolean not null default true,
  created_at          timestamptz not null default now()
);
create unique index plans_one_active on public.plans (company_id) where active;

create table public.subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null unique references public.companies (id) on delete cascade,
  status                public.subscription_status not null default 'pending_setup',
  setup_paid_at         timestamptz,
  current_period_start  date,
  current_period_end    date,          -- service is paid up to (excluding) this date
  next_billing_date     date,
  cancel_at_period_end  boolean not null default false,
  cancelled_at          timestamptz,
  grace_until           timestamptz,
  contract_end          date,
  -- Manual switch from the admin dashboard: null = follow the subscription.
  widget_override       text check (widget_override in ('force_on', 'force_off')),
  updated_at            timestamptz not null default now()
);

create table public.payment_methods (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies (id) on delete cascade,
  ompay_token  text not null,
  brand        text,
  masked_pan   text,
  is_default   boolean not null default true,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);
create unique index payment_methods_one_default
  on public.payment_methods (company_id) where is_default and revoked_at is null;

create sequence public.invoice_number_seq start 1001;

create table public.invoices (
  id              uuid primary key default gen_random_uuid(),
  number          text not null unique
                  default 'VY-' || to_char(now(), 'YYYY') || '-' || nextval('public.invoice_number_seq'),
  company_id      uuid not null references public.companies (id) on delete cascade,
  kind            public.invoice_kind not null,
  status          public.invoice_status not null default 'open',
  currency        text not null default 'OMR',
  total           numeric(12, 3) not null default 0 check (total >= 0),
  period_start    date,
  period_end      date,
  due_date        date not null default current_date,
  paid_at         timestamptz,
  attempts        integer not null default 0,
  last_attempt_at timestamptz,
  payment_link_id text,
  payment_link_url text,
  created_at      timestamptz not null default now()
);
-- Never bill the same subscription period twice.
create unique index invoices_one_per_period
  on public.invoices (company_id, period_start) where kind = 'subscription' and status <> 'void';

create table public.invoice_items (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices (id) on delete cascade,
  description text not null,
  amount      numeric(12, 3) not null,
  created_at  timestamptz not null default now()
);

-- One-off extras ("10 extra products this month: +8 OMR"). They are added to
-- the first subscription invoice whose period starts on or after bill_on.
create table public.extra_charges (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies (id) on delete cascade,
  description  text not null,
  amount       numeric(12, 3) not null check (amount > 0),
  bill_on      date not null default current_date,
  invoice_id   uuid references public.invoices (id) on delete set null,
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now()
);

create table public.payments (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references public.companies (id) on delete cascade,
  invoice_id           uuid references public.invoices (id) on delete set null,
  flow                 public.payment_flow not null,
  amount               numeric(12, 3) not null,
  currency             text not null default 'OMR',
  status               public.payment_status not null default 'processing',
  ompay_transaction_id text unique,
  error_message        text,
  outcome_unconfirmed  boolean not null default false,
  card_brand           text,
  card_masked          text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index payments_processing on public.payments (created_at) where status = 'processing';

create table public.widget_keys (
  company_id       uuid primary key references public.companies (id) on delete cascade,
  public_key       text not null unique
                   default 'vyro_pk_' || encode(gen_random_bytes(16), 'hex'),
  allowed_domains  text[] not null default '{}',
  created_at       timestamptz not null default now()
);

create table public.invites (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  email       text not null,
  token_hash  text not null unique,     -- sha256 of the link token; the token itself is never stored
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_by  uuid references auth.users (id),
  created_at  timestamptz not null default now()
);

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  audience    public.app_role not null,
  company_id  uuid references public.companies (id) on delete cascade,
  kind        text not null,
  title       text not null,
  body        text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_feed on public.notifications (audience, created_at desc);

-- ---------------------------------------------------------------- helpers

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.my_company_id() returns uuid
language sql stable security definer set search_path = public as $$
  select company_id from public.profiles where id = auth.uid();
$$;

-- Whether VYRO should run for this subscription right now.
create or replace function public.subscription_is_live(s public.subscriptions) returns boolean
language sql stable as $$
  select case
    when s.widget_override = 'force_on' then true
    when s.widget_override = 'force_off' then false
    -- One day of slack on the renewal date, so the service never blinks off
    -- between midnight and the billing run that charges the card.
    when s.status = 'active'
      then s.current_period_end is not null and s.current_period_end >= current_date - 1
    when s.status = 'cancel_scheduled'
      then s.current_period_end is not null and s.current_period_end > current_date
    when s.status = 'past_due'
      then s.grace_until is not null and s.grace_until > now()
    else false
  end;
$$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function public.touch_updated_at();
create trigger payments_touch before update on public.payments
  for each row execute function public.touch_updated_at();

-- Keep invoice totals equal to the sum of their lines.
create or replace function public.recalc_invoice_total() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  target uuid := coalesce(new.invoice_id, old.invoice_id);
begin
  update public.invoices
     set total = coalesce((select sum(amount) from public.invoice_items where invoice_id = target), 0)
   where id = target;
  return null;
end;
$$;
create trigger invoice_items_total after insert or update or delete on public.invoice_items
  for each row execute function public.recalc_invoice_total();

-- ---------------------------------------------------------------- widget licence check

-- Called by the widget loader on client websites (anonymous). Answers only
-- "may VYRO run here?" and reveals nothing else about the client.
create or replace function public.widget_status(p_key text, p_host text default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  k public.widget_keys;
  s public.subscriptions;
  host text := lower(coalesce(p_host, ''));
  domain_ok boolean;
begin
  select * into k from public.widget_keys where public_key = p_key;
  if not found then
    return jsonb_build_object('active', false, 'reason', 'unknown_key');
  end if;

  host := regexp_replace(host, '^https?://', '');
  host := regexp_replace(host, '[:/].*$', '');
  host := regexp_replace(host, '^www\.', '');

  domain_ok := cardinality(k.allowed_domains) = 0
    or exists (
      select 1 from unnest(k.allowed_domains) d
      where host = regexp_replace(lower(d), '^www\.', '')
         or host like '%.' || regexp_replace(lower(d), '^www\.', '')
    );
  if not domain_ok then
    return jsonb_build_object('active', false, 'reason', 'domain_not_allowed');
  end if;

  select * into s from public.subscriptions where company_id = k.company_id;
  if not found or not public.subscription_is_live(s) then
    return jsonb_build_object('active', false, 'reason', 'inactive');
  end if;

  return jsonb_build_object(
    'active', true,
    'product_limit', (select product_limit from public.plans where company_id = k.company_id and active)
  );
end;
$$;

-- Revenue overview for the admin dashboard.
create or replace function public.admin_revenue_by_month(p_months integer default 12)
returns table (month date, collected numeric, payments bigint)
language sql stable security definer set search_path = public as $$
  select date_trunc('month', p.updated_at)::date as month,
         sum(p.amount) as collected,
         count(*) as payments
    from public.payments p
   where public.is_admin()
     and p.status = 'successful'
     and p.flow <> 'card_check'
     and p.updated_at >= date_trunc('month', now()) - make_interval(months => p_months - 1)
   group by 1
   order by 1;
$$;

-- ---------------------------------------------------------------- row-level security

alter table public.companies       enable row level security;
alter table public.profiles        enable row level security;
alter table public.plans           enable row level security;
alter table public.subscriptions   enable row level security;
alter table public.payment_methods enable row level security;
alter table public.invoices        enable row level security;
alter table public.invoice_items   enable row level security;
alter table public.extra_charges   enable row level security;
alter table public.payments        enable row level security;
alter table public.widget_keys     enable row level security;
alter table public.invites         enable row level security;
alter table public.notifications   enable row level security;

-- Start from nothing, then grant precisely.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant usage on schema public to anon, authenticated;
grant execute on function public.widget_status(text, text) to anon, authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.my_company_id() to authenticated;
grant execute on function public.subscription_is_live(public.subscriptions) to authenticated;
grant execute on function public.admin_revenue_by_month(integer) to authenticated;

-- companies: clients read their own and may edit their profile fields.
grant select (id, name, store_name, website, logo_path, contact_name, contact_email,
              contact_phone, address, created_at) on public.companies to authenticated;
-- No table-wide SELECT: that would include the internal notes column.
grant insert, update, delete on public.companies to authenticated;  -- narrowed by policies + trigger below
create policy companies_read on public.companies for select to authenticated
  using (public.is_admin() or id = public.my_company_id());
create policy companies_admin_write on public.companies for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy companies_client_update on public.companies for update to authenticated
  using (id = public.my_company_id()) with check (id = public.my_company_id());

-- Clients may only change their own profile fields, never internal notes.
create or replace function public.guard_company_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.notes is distinct from old.notes or new.id <> old.id then
      raise exception 'not allowed';
    end if;
  end if;
  return new;
end;
$$;
create trigger companies_guard before update on public.companies
  for each row execute function public.guard_company_update();

-- Internal notes are not in the column grant above; admins read them here.
create or replace function public.company_notes(p_company uuid) returns text
language sql stable security definer set search_path = public as $$
  select notes from public.companies where id = p_company and public.is_admin();
$$;
grant execute on function public.company_notes(uuid) to authenticated;

-- profiles
-- profiles: role and company are only ever set by Edge Functions (service role).
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Billing tables: clients read their own, admins read and edit everything.
do $$
declare t text;
begin
  foreach t in array array['plans', 'subscriptions', 'invoices', 'extra_charges', 'payments', 'widget_keys'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_admin() or company_id = public.my_company_id())',
      t || '_read', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      t || '_admin', t);
  end loop;
end $$;

grant select, insert, update, delete on public.invoice_items to authenticated;
create policy invoice_items_read on public.invoice_items for select to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id
                 and (public.is_admin() or i.company_id = public.my_company_id())));
create policy invoice_items_admin on public.invoice_items for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Saved cards: clients see brand and last digits, never the token.
grant select (id, company_id, brand, masked_pan, is_default, revoked_at, created_at)
  on public.payment_methods to authenticated;
create policy payment_methods_read on public.payment_methods for select to authenticated
  using (public.is_admin() or company_id = public.my_company_id());

-- Invites: admins only (registration goes through an Edge Function).
grant select, insert, update, delete on public.invites to authenticated;
create policy invites_admin on public.invites for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Notifications: admins see the admin feed, clients their own company's feed.
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy notifications_read on public.notifications for select to authenticated
  using ((audience = 'admin' and public.is_admin())
      or (audience = 'client' and company_id = public.my_company_id()));
create policy notifications_mark_read on public.notifications for update to authenticated
  using ((audience = 'admin' and public.is_admin())
      or (audience = 'client' and company_id = public.my_company_id()));
