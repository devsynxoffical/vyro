-- Billing engine. All state changes for invoices, payments and subscriptions
-- happen in these functions, inside one transaction each, so they are atomic
-- and can be tested without the payment gateway. Edge Functions only talk to
-- OMPAY and report results back here. Only the service role may call them.

create table public.app_settings (
  id                 boolean primary key default true check (id),
  grace_days         integer not null default 5 check (grace_days between 0 and 60),
  max_auto_attempts  integer not null default 3 check (max_auto_attempts between 1 and 10),
  card_check_amount  numeric(12, 3) not null default 0.100,
  reminder_days      integer not null default 3
);
insert into public.app_settings default values;
alter table public.app_settings enable row level security;
grant select, update on public.app_settings to authenticated;
create policy app_settings_admin on public.app_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- date helpers

-- Add whole months, keeping the billing day (clamped to the month's length):
-- 31 Jan -> 28/29 Feb -> 31 Mar.
create or replace function public.add_billing_interval(
  p_from date, p_interval public.billing_interval, p_anchor_day integer)
returns date language plpgsql immutable as $$
declare
  months integer := case p_interval when 'annual' then 12 else 1 end;
  first_of date := (date_trunc('month', p_from) + make_interval(months => months))::date;
  last_day integer := extract(day from (first_of + interval '1 month - 1 day'))::integer;
begin
  return first_of + (least(p_anchor_day, last_day) - 1);
end;
$$;

-- ---------------------------------------------------------------- notifications

create or replace function public.notify(
  p_audience public.app_role, p_company uuid, p_kind text, p_title text, p_body text default null)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (audience, company_id, kind, title, body)
  values (p_audience, p_company, p_kind, p_title, p_body);
$$;

-- ---------------------------------------------------------------- onboarding

-- Admin creates a client: company, plan, subscription, setup invoice, widget key.
create or replace function public.billing_create_client(
  p_company jsonb, p_plan jsonb, p_allowed_domains text[] default '{}')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
  inv uuid;
  setup numeric := coalesce((p_plan->>'setup_fee')::numeric, 0);
begin
  insert into public.companies (name, store_name, website, contact_name, contact_email, contact_phone, notes)
  values (p_company->>'name', p_company->>'store_name', p_company->>'website',
          p_company->>'contact_name', p_company->>'contact_email', p_company->>'contact_phone',
          p_company->>'notes')
  returning id into cid;

  insert into public.plans (company_id, name, currency, setup_fee, recurring_fee, billing_interval,
                            product_limit, billing_start_date, contract_months, cancellation_terms)
  values (cid, coalesce(p_plan->>'name', 'VYRO'), coalesce(p_plan->>'currency', 'OMR'), setup,
          (p_plan->>'recurring_fee')::numeric,
          coalesce((p_plan->>'billing_interval')::public.billing_interval, 'monthly'),
          coalesce((p_plan->>'product_limit')::integer, 0),
          (p_plan->>'billing_start_date')::date,
          (p_plan->>'contract_months')::integer,
          p_plan->>'cancellation_terms');

  insert into public.subscriptions (company_id) values (cid);
  insert into public.widget_keys (company_id, allowed_domains) values (cid, coalesce(p_allowed_domains, '{}'));

  if setup > 0 then
    insert into public.invoices (company_id, kind, currency)
    values (cid, 'setup', coalesce(p_plan->>'currency', 'OMR')) returning id into inv;
    insert into public.invoice_items (invoice_id, description, amount)
    values (inv, 'One-time setup fee', setup);
  end if;
  return cid;
end;
$$;

-- Setup fee paid (or waived): start the service and the billing schedule.
create or replace function public.billing_activate(p_company uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  p public.plans;
  start_on date;
begin
  select * into p from public.plans where company_id = p_company and active;
  start_on := greatest(coalesce(p.billing_start_date, current_date), current_date);
  update public.subscriptions
     set status = 'active',
         setup_paid_at = coalesce(setup_paid_at, now()),
         current_period_start = current_date,
         -- Service runs from now; the first recurring charge is due on start_on.
         current_period_end = greatest(start_on, current_date + 1),
         next_billing_date = start_on,
         contract_end = case when p.contract_months is not null
                             then (start_on + make_interval(months => p.contract_months))::date end,
         grace_until = null
   where company_id = p_company and status = 'pending_setup';
end;
$$;

-- ---------------------------------------------------------------- renewal cycle

-- Creates renewal invoices that are due, ends cancelled subscriptions and
-- returns the invoices that should now be charged.
create or replace function public.billing_prepare_renewals(p_today date default current_date)
returns table (invoice_id uuid, company_id uuid, amount numeric)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  s public.subscriptions;
  p public.plans;
  inv uuid;
  period_end date;
  anchor integer;
begin
  for s in
    select * from public.subscriptions
     where status in ('active', 'cancel_scheduled')
       and next_billing_date is not null and next_billing_date <= p_today
     for update skip locked
  loop
    if s.cancel_at_period_end or s.status = 'cancel_scheduled' then
      update public.subscriptions
         set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()), next_billing_date = null
       where id = s.id;
      perform public.notify('admin', s.company_id, 'cancelled', 'Subscription ended',
        'The cancelled subscription reached the end of its paid period. VYRO is now off.');
      perform public.notify('client', s.company_id, 'cancelled', 'Your VYRO subscription has ended', null);
      continue;
    end if;

    select * into p from public.plans where plans.company_id = s.company_id and active;
    anchor := extract(day from coalesce(p.billing_start_date, s.next_billing_date))::integer;
    period_end := public.add_billing_interval(s.next_billing_date, p.billing_interval, anchor);

    insert into public.invoices (company_id, kind, currency, period_start, period_end, due_date)
    values (s.company_id, 'subscription', p.currency, s.next_billing_date, period_end, s.next_billing_date)
    on conflict (company_id, period_start) where kind = 'subscription' and status <> 'void' do nothing
    returning id into inv;

    if inv is null then
      continue; -- already invoiced; the retry step handles it
    end if;

    insert into public.invoice_items (invoice_id, description, amount)
    values (inv,
            format('%s subscription %s – %s', p.name,
                   to_char(s.next_billing_date, 'DD Mon YYYY'), to_char(period_end - 1, 'DD Mon YYYY')),
            p.recurring_fee);

    -- One-off extras for this period.
    insert into public.invoice_items (invoice_id, description, amount)
    select inv, e.description, e.amount
      from public.extra_charges e
     where e.company_id = s.company_id and e.invoice_id is null and e.bill_on <= s.next_billing_date;
    update public.extra_charges e set invoice_id = inv
     where e.company_id = s.company_id and e.invoice_id is null and e.bill_on <= s.next_billing_date;

    if (select total from public.invoices where id = inv) = 0 then
      perform public.billing_mark_invoice_paid(inv, null);
    else
      invoice_id := inv;
      company_id := s.company_id;
      amount := (select total from public.invoices where id = inv);
      return next;
    end if;
  end loop;
end;
$$;

-- Atomically claims an invoice for one charge attempt, so two overlapping
-- billing runs can never charge the same invoice twice. Returns the payment id
-- to use as the OMPAY reference, or null if the invoice is not chargeable.
create or replace function public.billing_claim_invoice(
  p_invoice uuid, p_flow public.payment_flow)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  inv public.invoices;
  pay uuid;
begin
  update public.invoices
     set status = 'processing', attempts = attempts + 1, last_attempt_at = now()
   where id = p_invoice and status in ('open', 'failed')
  returning * into inv;
  if not found then
    return null;
  end if;
  insert into public.payments (company_id, invoice_id, flow, amount, currency)
  values (inv.company_id, inv.id, p_flow, inv.total, inv.currency)
  returning id into pay;
  return pay;
end;
$$;

-- A payment without an invoice (card check when the client updates their card).
create or replace function public.billing_start_card_check(p_company uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare pay uuid;
begin
  insert into public.payments (company_id, flow, amount)
  values (p_company, 'card_check', (select card_check_amount from public.app_settings))
  returning id into pay;
  return pay;
end;
$$;

create or replace function public.billing_mark_invoice_paid(p_invoice uuid, p_payment uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  inv public.invoices;
  sub public.subscriptions;
begin
  update public.invoices set status = 'paid', paid_at = now(), payment_link_url = null
   where id = p_invoice and status <> 'paid'
  returning * into inv;
  if not found then
    return;
  end if;

  if inv.kind = 'setup' then
    perform public.billing_activate(inv.company_id);
  elsif inv.kind = 'subscription' then
    select * into sub from public.subscriptions where company_id = inv.company_id for update;
    update public.subscriptions
       set status = case when status in ('past_due', 'suspended') then 'active' else status end,
           grace_until = null,
           current_period_start = greatest(current_period_start, inv.period_start),
           current_period_end = greatest(coalesce(current_period_end, inv.period_end), inv.period_end),
           next_billing_date = case when cancel_at_period_end then next_billing_date
                                    else greatest(coalesce(next_billing_date, inv.period_end), inv.period_end) end
     where company_id = inv.company_id;
    if sub.status in ('past_due', 'suspended') then
      perform public.notify('admin', inv.company_id, 'reactivated', 'Overdue invoice paid',
        format('Invoice %s was paid; VYRO is active again.', inv.number));
    end if;
  end if;

  perform public.notify('client', inv.company_id, 'payment_succeeded',
    format('Payment received – invoice %s', inv.number),
    format('%s %s', to_char(inv.total, 'FM999999990.000'), inv.currency));
end;
$$;

-- Records what OMPAY reported for a payment and applies every consequence.
-- p_status: SUCCESSFUL | FAILED | PROCESSING (still pending, nothing changes).
create or replace function public.billing_record_result(
  p_payment uuid,
  p_status text,
  p_transaction_id text default null,
  p_token text default null,
  p_brand text default null,
  p_masked text default null,
  p_error text default null,
  p_outcome_unconfirmed boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  pay public.payments;
  inv public.invoices;
  settings public.app_settings;
  sub public.subscriptions;
begin
  select * into settings from public.app_settings;
  select * into pay from public.payments where id = p_payment for update;
  if not found then
    raise exception 'unknown payment %', p_payment;
  end if;

  if p_transaction_id is not null and pay.ompay_transaction_id is null then
    update public.payments set ompay_transaction_id = p_transaction_id where id = pay.id;
  end if;

  if upper(p_status) = 'PROCESSING' or upper(p_status) = 'PENDING' then
    return jsonb_build_object('changed', false);
  end if;

  -- A final answer was already recorded. The only change allowed afterwards is
  -- OMPAY confirming a payment it had closed as "outcome unconfirmed".
  if pay.status <> 'processing' and not (pay.outcome_unconfirmed and upper(p_status) = 'SUCCESSFUL') then
    return jsonb_build_object('changed', false);
  end if;

  if upper(p_status) = 'SUCCESSFUL' then
    update public.payments
       set status = 'successful', error_message = null, outcome_unconfirmed = false,
           card_brand = coalesce(p_brand, card_brand), card_masked = coalesce(p_masked, card_masked)
     where id = pay.id;

    if p_token is not null then
      update public.payment_methods set is_default = false
       where company_id = pay.company_id and is_default and ompay_token <> p_token;
      insert into public.payment_methods (company_id, ompay_token, brand, masked_pan, is_default)
      select pay.company_id, p_token, p_brand, p_masked, true
       where not exists (select 1 from public.payment_methods
                          where company_id = pay.company_id and ompay_token = p_token and revoked_at is null);
      update public.payment_methods set is_default = true
       where company_id = pay.company_id and ompay_token = p_token and revoked_at is null;
    end if;

    if pay.invoice_id is not null then
      perform public.billing_mark_invoice_paid(pay.invoice_id, pay.id);
    end if;
    return jsonb_build_object('changed', true, 'status', 'successful',
                              'refund_card_check', pay.flow = 'card_check');
  end if;

  -- FAILED
  update public.payments
     set status = 'failed', error_message = p_error, outcome_unconfirmed = coalesce(p_outcome_unconfirmed, false)
   where id = pay.id;

  if pay.invoice_id is null then
    return jsonb_build_object('changed', true, 'status', 'failed');
  end if;

  update public.invoices set status = 'failed'
   where id = pay.invoice_id and status = 'processing'
  returning * into inv;
  if not found then
    return jsonb_build_object('changed', true, 'status', 'failed');
  end if;

  if inv.kind = 'subscription' then
    select * into sub from public.subscriptions where company_id = inv.company_id for update;
    if sub.status = 'active' then
      update public.subscriptions
         set status = 'past_due', grace_until = now() + make_interval(days => settings.grace_days)
       where id = sub.id;
      sub.grace_until := now() + make_interval(days => settings.grace_days);
    end if;
    perform public.notify('admin', inv.company_id, 'payment_failed',
      format('Payment failed – invoice %s', inv.number),
      coalesce(p_error, 'The card was declined.') ||
      case when p_outcome_unconfirmed then ' The bank did not confirm the result; OMPAY is reviewing it, so it will not be retried automatically.' else '' end);
    perform public.notify('client', inv.company_id, 'payment_failed',
      format('Payment failed – invoice %s', inv.number),
      format('Please pay or update your card before %s to keep VYRO running.',
             to_char(sub.grace_until, 'DD Mon YYYY')));
  else
    perform public.notify('client', inv.company_id, 'payment_failed',
      format('Payment failed – invoice %s', inv.number), p_error);
  end if;
  return jsonb_build_object('changed', true, 'status', 'failed', 'invoice_id', inv.id);
end;
$$;

-- Invoices to retry automatically during the grace period (one try a day).
create or replace function public.billing_due_retries()
returns table (invoice_id uuid, company_id uuid, amount numeric)
language sql security definer set search_path = public as $$
  select i.id, i.company_id, i.total
    from public.invoices i
    join public.subscriptions s on s.company_id = i.company_id
   where i.kind = 'subscription' and i.status in ('open', 'failed') and i.attempts > 0
     and s.status = 'past_due' and s.grace_until > now()
     and i.attempts < (select max_auto_attempts from public.app_settings)
     and (i.last_attempt_at is null or i.last_attempt_at < now() - interval '23 hours')
     -- never retry an invoice whose last result the bank did not confirm
     and not exists (select 1 from public.payments p
                      where p.invoice_id = i.id and p.outcome_unconfirmed);
$$;

-- Turns VYRO off for clients whose grace period ran out.
create or replace function public.billing_suspend_overdue()
returns integer language plpgsql security definer set search_path = public as $$
declare
  s public.subscriptions;
  n integer := 0;
begin
  for s in select * from public.subscriptions
            where status = 'past_due' and grace_until <= now() for update skip locked loop
    update public.subscriptions set status = 'suspended' where id = s.id;
    perform public.notify('admin', s.company_id, 'suspended', 'Client suspended for non-payment',
      'The grace period ended without payment. VYRO is now off on their website.');
    perform public.notify('client', s.company_id, 'suspended', 'VYRO has been paused',
      'Your payment is overdue. Pay the open invoice to switch VYRO back on.');
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- "Your subscription renews in N days" reminders, once per renewal date.
create or replace function public.billing_send_reminders(p_today date default current_date)
returns integer language plpgsql security definer set search_path = public as $$
declare
  days integer := (select reminder_days from public.app_settings);
  s record;
  n integer := 0;
begin
  for s in
    select sub.company_id, sub.next_billing_date, p.recurring_fee, p.currency
      from public.subscriptions sub
      join public.plans p on p.company_id = sub.company_id and p.active
     where sub.status = 'active' and not sub.cancel_at_period_end
       and sub.next_billing_date = p_today + days
  loop
    if not exists (select 1 from public.notifications
                    where company_id = s.company_id and kind = 'renewal_reminder'
                      and body like '%' || to_char(s.next_billing_date, 'DD Mon YYYY') || '%') then
      perform public.notify('client', s.company_id, 'renewal_reminder', 'Upcoming renewal',
        format('Your subscription renews on %s. Expected charge: %s %s plus any extras.',
               to_char(s.next_billing_date, 'DD Mon YYYY'),
               to_char(s.recurring_fee, 'FM999999990.000'), s.currency));
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

-- Client cancels / resumes. Called by an Edge Function on behalf of the client.
create or replace function public.billing_set_cancellation(p_company uuid, p_cancel boolean)
returns text language plpgsql security definer set search_path = public as $$
declare s public.subscriptions;
begin
  select * into s from public.subscriptions where company_id = p_company for update;
  if p_cancel then
    if s.status = 'pending_setup' then
      update public.subscriptions set status = 'cancelled', cancelled_at = now() where id = s.id;
    elsif s.status in ('active', 'past_due') then
      update public.subscriptions
         set status = (case when s.status = 'active' then 'cancel_scheduled' else 'cancelled' end)::public.subscription_status,
             cancel_at_period_end = true, cancelled_at = now()
       where id = s.id;
    else
      return s.status::text;
    end if;
    perform public.notify('admin', p_company, 'cancel_requested', 'Client cancelled their subscription',
      case when s.current_period_end is not null
           then format('VYRO will stop after %s.', to_char(s.current_period_end - 1, 'DD Mon YYYY'))
           else 'VYRO is off.' end);
  else
    if s.status <> 'cancel_scheduled' then
      return s.status::text;
    end if;
    update public.subscriptions
       set status = 'active', cancel_at_period_end = false, cancelled_at = null
     where id = s.id;
    perform public.notify('admin', p_company, 'cancel_reverted', 'Client resumed their subscription', null);
  end if;
  return (select status::text from public.subscriptions where id = s.id);
end;
$$;

-- Payments to re-check with OMPAY: still processing, or closed as
-- "outcome unconfirmed" in the last two weeks.
create or replace function public.billing_payments_to_reconcile()
returns table (payment_id uuid, ompay_transaction_id text, flow public.payment_flow)
language sql security definer set search_path = public as $$
  select id, ompay_transaction_id, flow from public.payments
   where (status = 'processing' and created_at < now() - interval '2 minutes')
      or (status = 'failed' and outcome_unconfirmed and created_at > now() - interval '14 days');
$$;

-- Payments that never reached OMPAY (no transaction id after 30 minutes).
-- An abandoned checkout just frees its invoice to be paid again; an automatic
-- card charge that never arrived counts as a failed attempt (grace period,
-- notifications, retry).
create or replace function public.billing_expire_stale()
returns integer language plpgsql security definer set search_path = public as $$
declare
  p public.payments;
  n integer := 0;
begin
  for p in select * from public.payments
            where status = 'processing' and ompay_transaction_id is null
              and created_at < now() - interval '30 minutes' for update skip locked loop
    if p.flow = 'token' then
      perform public.billing_record_result(p.id, 'FAILED', null, null, null, null,
                                           'The payment could not be sent to the bank.');
    else
      update public.payments set status = 'failed', error_message = 'Payment was not completed.'
       where id = p.id;
      update public.invoices set status = 'open' where id = p.invoice_id and status = 'processing';
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Lock all of these to the service role.
do $$
declare f text;
begin
  foreach f in array array[
    'add_billing_interval(date, public.billing_interval, integer)',
    'notify(public.app_role, uuid, text, text, text)',
    'billing_create_client(jsonb, jsonb, text[])',
    'billing_activate(uuid)',
    'billing_prepare_renewals(date)',
    'billing_claim_invoice(uuid, public.payment_flow)',
    'billing_start_card_check(uuid)',
    'billing_mark_invoice_paid(uuid, uuid)',
    'billing_record_result(uuid, text, text, text, text, text, text, boolean)',
    'billing_due_retries()',
    'billing_suspend_overdue()',
    'billing_send_reminders(date)',
    'billing_set_cancellation(uuid, boolean)',
    'billing_payments_to_reconcile()',
    'billing_expire_stale()'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
