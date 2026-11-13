-- Client product catalogues: the products each client's widget offers for
-- try-on. The number of live products is capped by the plan's product_limit.

create type public.product_type as enum ('ring', 'watch', 'glasses', 'necklace');

create table public.products (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  type        public.product_type not null,
  name        text not null check (char_length(name) between 1 and 120),
  -- The client's own product code; lets a "Try on" button on a product page
  -- open exactly that product: <button data-vyro-open="SKU-123">.
  sku         text check (sku is null or char_length(sku) between 1 and 80),
  price       text check (price is null or char_length(price) <= 40),
  description text check (description is null or char_length(description) <= 500),
  image_path  text not null,          -- transparent cut-out in the "products" bucket
  -- Necklaces are drawn as a 3D chain/strand; these describe it.
  options     jsonb not null default '{}'::jsonb,
  active      boolean not null default true,
  sort        integer not null default 0,
  created_at  timestamptz not null default now()
);
create index products_company on public.products (company_id, sort, created_at);
create unique index products_sku on public.products (company_id, sku) where sku is not null;

-- Enforce "products included" when a product is added or switched on.
create or replace function public.enforce_product_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  lim integer;
  used integer;
begin
  if not new.active then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.active and old.company_id = new.company_id then
    return new;
  end if;
  -- Lock the plan row so two simultaneous inserts cannot both slip under the cap.
  select product_limit into lim from public.plans
   where company_id = new.company_id and active for update;
  select count(*) into used from public.products
   where company_id = new.company_id and active and id <> new.id;
  if used >= coalesce(lim, 0) then
    raise exception 'PRODUCT_LIMIT: your plan includes % products', coalesce(lim, 0)
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger products_limit before insert or update of active, company_id on public.products
  for each row execute function public.enforce_product_limit();

alter table public.products enable row level security;
grant select, insert, update, delete on public.products to authenticated;
create policy products_read on public.products for select to authenticated
  using (public.is_admin() or company_id = public.my_company_id());
create policy products_insert on public.products for insert to authenticated
  with check (public.is_admin() or company_id = public.my_company_id());
create policy products_update on public.products for update to authenticated
  using (public.is_admin() or company_id = public.my_company_id())
  with check (public.is_admin() or company_id = public.my_company_id());
create policy products_delete on public.products for delete to authenticated
  using (public.is_admin() or company_id = public.my_company_id());

-- The licence check now also returns the catalogue (only while live, only on
-- an allowed website, and never more products than the plan includes).
create or replace function public.widget_status(p_key text, p_host text default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  k public.widget_keys;
  s public.subscriptions;
  host text := lower(coalesce(p_host, ''));
  domain_ok boolean;
  lim integer;
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

  select product_limit into lim from public.plans where company_id = k.company_id and active;

  return jsonb_build_object(
    'active', true,
    'product_limit', lim,
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'type', p.type, 'name', p.name, 'sku', p.sku, 'price', p.price,
               'description', p.description, 'image_path', p.image_path, 'options', p.options)
             order by p.sort, p.created_at)
        from (select * from public.products
               where company_id = k.company_id and active
               order by sort, created_at
               limit coalesce(lim, 0)) p), '[]'::jsonb)
  );
end;
$$;
