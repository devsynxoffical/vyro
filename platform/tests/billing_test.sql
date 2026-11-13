-- Billing engine scenarios, run as the service role on a fresh database.
\set ON_ERROR_STOP 1
set client_min_messages = warning;
set role service_role;

do $$ begin
  assert public.add_billing_interval('2026-01-31', 'monthly', 31) = '2026-02-28', 'clamp to Feb';
  assert public.add_billing_interval('2026-02-28', 'monthly', 31) = '2026-03-31', 'back to 31st';
  assert public.add_billing_interval('2028-01-31', 'monthly', 31) = '2028-02-29', 'leap year';
  assert public.add_billing_interval('2026-11-15', 'annual', 15) = '2027-11-15', 'annual';
  assert public.add_billing_interval('2026-12-05', 'monthly', 5) = '2027-01-05', 'year rollover';
end $$;

-- ---------- Scenario: the user's example. 150 setup, 20 OMR/month, +8 extra once.
do $$
declare
  cid uuid; inv uuid; pay uuid; r jsonb; s public.subscriptions; n int; t numeric;
begin
  cid := public.billing_create_client(
    '{"name":"Alpha Jewels","contact_email":"a@alpha.om"}',
    '{"setup_fee":150,"recurring_fee":20,"product_limit":50}', '{alpha.om}');
  select * into s from public.subscriptions where company_id = cid;
  assert s.status = 'pending_setup';
  select id into inv from public.invoices where company_id = cid and kind = 'setup';
  assert (select total from public.invoices where id = inv) = 150, 'setup invoice 150';

  -- client pays the setup fee on OMPAY's page; the card gets saved
  pay := public.billing_claim_invoice(inv, 'hosted');
  assert pay is not null;
  assert public.billing_claim_invoice(inv, 'hosted') is null, 'cannot claim twice while processing';
  r := public.billing_record_result(pay, 'SUCCESSFUL', 'tx-setup', 'tok_alpha', 'VISA', '411111******1111');
  assert (r->>'status') = 'successful';
  select * into s from public.subscriptions where company_id = cid;
  assert s.status = 'active', 'active after setup';
  assert s.next_billing_date = current_date, 'billing starts today when no date agreed';
  assert (select count(*) from public.payment_methods where company_id = cid and is_default) = 1, 'card saved';
  -- a repeated report changes nothing
  r := public.billing_record_result(pay, 'SUCCESSFUL', 'tx-setup');
  assert (r->>'changed')::boolean = false, 'idempotent';

  -- admin adds an extra 8 OMR for this month
  insert into public.extra_charges (company_id, description, amount) values (cid, '10 extra products', 8);

  -- first renewal: 20 + 8 = 28
  select p.invoice_id, p.amount into inv, t from public.billing_prepare_renewals(current_date) p where p.company_id = cid;
  assert t = 28, format('first month 28, got %s', t);
  assert (select count(*) from public.billing_prepare_renewals(current_date) p where p.company_id = cid) = 0, 'no double invoice';
  pay := public.billing_claim_invoice(inv, 'token');
  perform public.billing_record_result(pay, 'SUCCESSFUL', 'tx-m1');
  select * into s from public.subscriptions where company_id = cid;
  assert s.current_period_end = public.add_billing_interval(current_date, 'monthly', extract(day from current_date)::int), 'paid a month';
  assert s.next_billing_date = s.current_period_end;

  -- second renewal: back to 20
  select p.invoice_id, p.amount into inv, t from public.billing_prepare_renewals(s.next_billing_date) p where p.company_id = cid;
  assert t = 20, format('next month 20, got %s', t);

  -- ...and it fails: grace period, then suspension
  pay := public.billing_claim_invoice(inv, 'token');
  r := public.billing_record_result(pay, 'FAILED', 'tx-m2', null, null, null, 'Insufficient funds');
  select * into s from public.subscriptions where company_id = cid;
  assert s.status = 'past_due' and s.grace_until > now(), 'grace period';
  assert public.subscription_is_live(s), 'still live in grace';
  assert (select count(*) from public.notifications where company_id = cid and kind = 'payment_failed') = 2, 'admin + client told';
  assert exists (select 1 from public.billing_due_retries() d where d.invoice_id = inv) is false, 'no retry within 23h';
  update public.invoices set last_attempt_at = now() - interval '1 day' where id = inv;
  assert exists (select 1 from public.billing_due_retries() d where d.invoice_id = inv), 'retry next day';

  update public.subscriptions set grace_until = now() - interval '1 minute' where company_id = cid;
  n := public.billing_suspend_overdue();
  select * into s from public.subscriptions where company_id = cid;
  assert s.status = 'suspended' and not public.subscription_is_live(s), 'suspended -> widget off';

  -- client pays the overdue invoice from the portal: back on
  pay := public.billing_claim_invoice(inv, 'hosted');
  perform public.billing_record_result(pay, 'SUCCESSFUL', 'tx-m2b', 'tok_alpha2', 'MASTERCARD', '512345******0008');
  select * into s from public.subscriptions where company_id = cid;
  assert s.status = 'active' and public.subscription_is_live(s), 'reactivated';
  assert (select ompay_token from public.payment_methods where company_id = cid and is_default and revoked_at is null) = 'tok_alpha2', 'new card is default';
end $$;

-- ---------- Scenario: cancellation runs to the end of the paid period
do $$
declare cid uuid; inv uuid; pay uuid; s public.subscriptions; st text;
begin
  cid := public.billing_create_client('{"name":"Beta"}', '{"setup_fee":0,"recurring_fee":30}');
  perform public.billing_activate(cid);   -- no setup fee: admin activates
  select p.invoice_id into inv from public.billing_prepare_renewals(current_date) p where p.company_id = cid;
  pay := public.billing_claim_invoice(inv, 'token');
  perform public.billing_record_result(pay, 'SUCCESSFUL', 'tx-b1');
  st := public.billing_set_cancellation(cid, true);
  assert st = 'cancel_scheduled', st;
  select * into s from public.subscriptions where company_id = cid;
  assert public.subscription_is_live(s), 'runs until paid period ends';
  assert exists (select 1 from public.notifications where company_id = cid and kind = 'cancel_requested' and audience = 'admin');
  -- resume and cancel again
  assert public.billing_set_cancellation(cid, false) = 'active';
  assert public.billing_set_cancellation(cid, true) = 'cancel_scheduled';
  -- period end: no new invoice, subscription ends, widget off
  assert (select count(*) from public.billing_prepare_renewals(s.next_billing_date) p where p.company_id = cid) = 0, 'no invoice after cancel';
  select * into s from public.subscriptions where company_id = cid;
  assert s.status = 'cancelled' and not public.subscription_is_live(s), 'ended';
end $$;

-- ---------- Scenario: agreed start date, annual plan, OMPAY "outcome unconfirmed"
do $$
declare cid uuid; inv uuid; pay uuid; s public.subscriptions;
begin
  cid := public.billing_create_client('{"name":"Gamma"}',
    format('{"setup_fee":50,"recurring_fee":200,"billing_interval":"annual","contract_months":12,"billing_start_date":"%s"}',
           current_date + 14)::jsonb);
  select id into inv from public.invoices where company_id = cid and kind = 'setup';
  pay := public.billing_claim_invoice(inv, 'hosted');
  perform public.billing_record_result(pay, 'SUCCESSFUL', 'tx-g0', 'tok_g');
  select * into s from public.subscriptions where company_id = cid;
  assert s.next_billing_date = current_date + 14, 'first charge on the agreed date';
  assert public.subscription_is_live(s), 'live while being set up';
  assert s.contract_end = (current_date + 14 + interval '12 months')::date, 'contract end';
  assert (select count(*) from public.billing_prepare_renewals(current_date) p where p.company_id = cid) = 0, 'not yet due';

  select p.invoice_id into inv from public.billing_prepare_renewals(current_date + 14) p where p.company_id = cid;
  pay := public.billing_claim_invoice(inv, 'token');
  perform public.billing_record_result(pay, 'FAILED', 'tx-g1', null, null, null, 'closed unconfirmed', true);
  assert not exists (select 1 from public.billing_due_retries() d where d.invoice_id = inv), 'never auto-retry unconfirmed';
  assert exists (select 1 from public.billing_payments_to_reconcile() r where r.payment_id = pay), 'keeps checking it';
  -- OMPAY later confirms the capture
  perform public.billing_record_result(pay, 'SUCCESSFUL', 'tx-g1');
  select * into s from public.subscriptions where company_id = cid;
  assert s.status = 'active', 'confirmed later';
  assert s.current_period_end = (current_date + 14 + interval '12 months')::date, 'a year paid';
end $$;

-- ---------- card check, stale payments, reminders, permissions
do $$
declare cid uuid; pay uuid; r jsonb; inv uuid;
begin
  select id into cid from public.companies where name = 'Alpha Jewels';
  pay := public.billing_start_card_check(cid);
  r := public.billing_record_result(pay, 'SUCCESSFUL', 'tx-cc', 'tok_new', 'VISA', '400000******0002');
  assert (r->>'refund_card_check')::boolean, 'card check must be refunded';

  cid := public.billing_create_client('{"name":"Delta"}', '{"setup_fee":10,"recurring_fee":5}');
  select id into inv from public.invoices where company_id = cid;
  pay := public.billing_claim_invoice(inv, 'hosted');
  update public.payments set created_at = now() - interval '1 hour' where id = pay;
  assert public.billing_expire_stale() = 1, 'stale released';
  assert (select status from public.invoices where id = inv) = 'open', 'invoice payable again';

  update public.subscriptions set status = 'active', cancel_at_period_end = false, next_billing_date = current_date + 3
   where company_id = (select id from public.companies where name = 'Beta');
  assert public.billing_send_reminders() >= 1, 'reminder sent';
  assert public.billing_send_reminders() = 0, 'only once';
end $$;

reset role;
set role authenticated;
do $$ begin
  begin perform public.billing_create_client('{"name":"x"}', '{"recurring_fee":1}');
        raise exception 'FAIL client can call engine';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'ALL BILLING TESTS PASSED';
