-- Small read/write helpers for the Edge Functions (service role only), so the
-- functions never build SQL themselves.

create or replace function public.billing_charge_context(p_invoice uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'invoice_id', i.id, 'company_id', i.company_id, 'number', i.number,
    'total', i.total, 'currency', i.currency, 'status', i.status, 'kind', i.kind,
    'token', (select ompay_token from public.payment_methods m
               where m.company_id = i.company_id and m.is_default and m.revoked_at is null))
    from public.invoices i where i.id = p_invoice;
$$;

create or replace function public.billing_payment_context(p_payment uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(p) from public.payments p where p.id = p_payment;
$$;

-- Admin records a payment received outside the gateway (bank transfer, cash).
create or replace function public.billing_offline_paid(p_invoice uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare inv public.invoices; pay uuid;
begin
  update public.invoices set status = 'processing'
   where id = p_invoice and status in ('open', 'failed') returning * into inv;
  if not found then
    raise exception 'invoice is not payable';
  end if;
  insert into public.payments (company_id, invoice_id, flow, amount, currency, status, error_message)
  values (inv.company_id, inv.id, 'offline', inv.total, inv.currency, 'successful', p_note)
  returning id into pay;
  perform public.billing_mark_invoice_paid(inv.id, pay);
end;
$$;

-- ---------------------------------------------------------------- invites

create or replace function public.invite_create(
  p_company uuid, p_email text, p_token_hash text, p_days integer default 7, p_by uuid default null)
returns uuid language sql security definer set search_path = public as $$
  insert into public.invites (company_id, email, token_hash, expires_at, created_by)
  values (p_company, lower(trim(p_email)), p_token_hash, now() + make_interval(days => p_days), p_by)
  returning id;
$$;

create or replace function public.invite_lookup(p_token_hash text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'invite_id', i.id, 'email', i.email, 'company_id', c.id, 'company_name', c.name,
    'store_name', c.store_name, 'website', c.website, 'contact_name', c.contact_name,
    'contact_phone', c.contact_phone, 'address', c.address)
    from public.invites i join public.companies c on c.id = i.company_id
   where i.token_hash = p_token_hash and i.used_at is null and i.expires_at > now();
$$;

-- Marks the invite used and links the new login to the company, atomically.
create or replace function public.invite_complete(
  p_token_hash text, p_user uuid, p_full_name text, p_company jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv public.invites;
begin
  update public.invites set used_at = now()
   where token_hash = p_token_hash and used_at is null and expires_at > now()
  returning * into inv;
  if not found then
    raise exception 'invite is invalid or expired';
  end if;
  insert into public.profiles (id, role, company_id, full_name)
  values (p_user, 'client', inv.company_id, p_full_name);
  update public.companies
     set name = coalesce(nullif(p_company->>'name', ''), name),
         store_name = coalesce(nullif(p_company->>'store_name', ''), store_name),
         website = coalesce(nullif(p_company->>'website', ''), website),
         contact_name = coalesce(nullif(p_company->>'contact_name', ''), contact_name, p_full_name),
         contact_email = coalesce(contact_email, inv.email),
         contact_phone = coalesce(nullif(p_company->>'contact_phone', ''), contact_phone),
         address = coalesce(nullif(p_company->>'address', ''), address)
   where id = inv.company_id;
  perform public.notify('admin', inv.company_id, 'registered', 'Client completed registration', inv.email);
  return inv.company_id;
end;
$$;

-- ---------------------------------------------------------------- email outbox

create or replace function public.outbox_pending(p_limit integer default 50)
returns table (id uuid, audience public.app_role, title text, body text, emails text[])
language sql stable security definer set search_path = public as $$
  select n.id, n.audience, n.title, n.body,
         case when n.audience = 'client' then array(
           select distinct e from (
             select c.contact_email as e from public.companies c where c.id = n.company_id
             union
             select u.email from public.profiles p join auth.users u on u.id = p.id
              where p.company_id = n.company_id and p.role = 'client') x
            where e is not null)
         else '{}'::text[] end
    from public.notifications n
   where n.emailed_at is null and n.created_at > now() - interval '3 days'
   order by n.created_at
   limit p_limit;
$$;

create or replace function public.outbox_mark_sent(p_ids uuid[])
returns void language sql security definer set search_path = public as $$
  update public.notifications set emailed_at = now() where id = any(p_ids);
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'billing_charge_context(uuid)', 'billing_payment_context(uuid)', 'billing_offline_paid(uuid, text)',
    'invite_create(uuid, text, text, integer, uuid)', 'invite_lookup(text)',
    'invite_complete(text, uuid, text, jsonb)', 'outbox_pending(integer)', 'outbox_mark_sent(uuid[])'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
