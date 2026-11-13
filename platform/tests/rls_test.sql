-- Row-level security and licensing tests. Run after supabase_shim.sql and the
-- migrations; every check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@vyro.test'),
  ('00000000-0000-0000-0000-0000000000c1', 'a@client.test'),
  ('00000000-0000-0000-0000-0000000000c2', 'b@client.test');
insert into public.companies (id, name, notes) values
  ('10000000-0000-0000-0000-000000000001', 'Alpha Jewels', 'secret note A'),
  ('10000000-0000-0000-0000-000000000002', 'Beta Optics', 'secret note B');
insert into public.profiles (id, role, company_id) values
  ('00000000-0000-0000-0000-00000000000a', 'admin', null),
  ('00000000-0000-0000-0000-0000000000c1', 'client', '10000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000000c2', 'client', '10000000-0000-0000-0000-000000000002');
insert into public.plans (company_id, setup_fee, recurring_fee, product_limit) values
  ('10000000-0000-0000-0000-000000000001', 150, 20, 50),
  ('10000000-0000-0000-0000-000000000002', 100, 30, 80);
insert into public.subscriptions (company_id, status, current_period_end) values
  ('10000000-0000-0000-0000-000000000001', 'active', current_date + 10),
  ('10000000-0000-0000-0000-000000000002', 'pending_setup', null);
insert into public.payment_methods (company_id, ompay_token, brand, masked_pan) values
  ('10000000-0000-0000-0000-000000000001', 'tok_secret_alpha', 'VISA', '411111******1111');
insert into public.widget_keys (company_id, public_key, allowed_domains) values
  ('10000000-0000-0000-0000-000000000001', 'vyro_pk_alpha', '{alphajewels.om}'),
  ('10000000-0000-0000-0000-000000000002', 'vyro_pk_beta', '{}');
insert into public.invoices (id, company_id, kind) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'setup'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'setup');
insert into public.invoice_items (invoice_id, description, amount) values
  ('20000000-0000-0000-0000-000000000001', 'Setup', 150),
  ('20000000-0000-0000-0000-000000000001', 'Extra', 8.5);
insert into public.notifications (audience, company_id, kind, title) values
  ('admin', '10000000-0000-0000-0000-000000000001', 'cancel', 'Alpha cancelled'),
  ('client', '10000000-0000-0000-0000-000000000001', 'paid', 'Payment received'),
  ('client', '10000000-0000-0000-0000-000000000002', 'paid', 'Payment received B');

do $$ begin
  assert (select total from public.invoices where id = '20000000-0000-0000-0000-000000000001') = 158.5,
    'invoice total follows its lines';
end $$;

-- ---------------- client A
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
do $$ begin
  assert (select count(*) from public.companies) = 1, 'client sees only own company';
  assert (select count(*) from public.invoices) = 1, 'client sees only own invoices';
  assert (select count(*) from public.invoice_items) = 2, 'client sees own invoice lines';
  assert (select count(*) from public.plans) = 1, 'client sees only own plan';
  assert (select count(*) from public.notifications) = 1, 'client sees only own client notifications';
  assert (select count(*) from public.payment_methods) = 1, 'client sees own card';
  assert not public.is_admin(), 'client is not admin';
end $$;

-- forbidden reads/writes must error
do $$ begin
  begin perform ompay_token from public.payment_methods; raise exception 'FAIL token readable';
  exception when insufficient_privilege then null; end;
  begin perform notes from public.companies; raise exception 'FAIL notes readable';
  exception when insufficient_privilege then null; end;
  begin update public.profiles set company_id = '10000000-0000-0000-0000-000000000002'; raise exception 'FAIL company hop';
  exception when insufficient_privilege then null; end;
  begin update public.profiles set role = 'admin'; raise exception 'FAIL self-promote';
  exception when insufficient_privilege then null; end;
  assert public.company_notes('10000000-0000-0000-0000-000000000001') is null, 'notes fn hidden from client';
end $$;

do $$ declare n int; begin
  update public.subscriptions set widget_override = 'force_on';
  get diagnostics n = row_count; assert n = 0, 'client cannot change subscription';
  update public.invoices set status = 'paid';
  get diagnostics n = row_count; assert n = 0, 'client cannot mark invoice paid';
  update public.plans set recurring_fee = 0;
  get diagnostics n = row_count; assert n = 0, 'client cannot change price';
  update public.companies set store_name = 'Alpha Store' where id = '10000000-0000-0000-0000-000000000002';
  get diagnostics n = row_count; assert n = 0, 'client cannot edit another company';
  update public.companies set store_name = 'Alpha Store';
  get diagnostics n = row_count; assert n = 1, 'client can edit own company profile';
  begin insert into public.extra_charges (company_id, description, amount)
        values ('10000000-0000-0000-0000-000000000001', 'x', 1);
        raise exception 'FAIL client added extra';
  exception when insufficient_privilege then null; end;
end $$;

-- ---------------- admin
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  assert public.is_admin(), 'admin is admin';
  assert (select count(*) from public.companies) = 2, 'admin sees all companies';
  assert (select count(*) from public.notifications) = 1, 'admin sees admin feed';
  assert public.company_notes('10000000-0000-0000-0000-000000000001') = 'secret note A', 'admin reads notes';
  update public.plans set recurring_fee = 25 where company_id = '10000000-0000-0000-0000-000000000002';
  insert into public.extra_charges (company_id, description, amount)
    values ('10000000-0000-0000-0000-000000000001', '10 extra products', 8);
  update public.subscriptions set widget_override = 'force_off'
   where company_id = '10000000-0000-0000-0000-000000000001';
end $$;

-- ---------------- anonymous widget check
set role anon;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  begin perform * from public.subscriptions; raise exception 'FAIL anon reads subscriptions';
  exception when insufficient_privilege then null; end;
  assert (public.widget_status('vyro_pk_alpha', 'alphajewels.om')->>'reason') = 'inactive', 'force_off wins';
  assert (public.widget_status('nope', 'x.com')->>'reason') = 'unknown_key', 'unknown key';
  assert (public.widget_status('vyro_pk_alpha', 'evil.com')->>'reason') = 'domain_not_allowed', 'domain lock';
  assert (public.widget_status('vyro_pk_beta', 'beta.om')->>'reason') = 'inactive', 'unpaid setup is off';
end $$;

reset role;
update public.subscriptions set widget_override = null where company_id = '10000000-0000-0000-0000-000000000001';
set role anon;
do $$ begin
  assert (public.widget_status('vyro_pk_alpha', 'https://www.alphajewels.om/product/1')->>'active')::boolean, 'live on own domain';
  assert (public.widget_status('vyro_pk_alpha', 'shop.alphajewels.om')->>'active')::boolean, 'live on subdomain';
  assert (public.widget_status('vyro_pk_alpha', 'notalphajewels.om')->>'active')::boolean is false, 'lookalike domain rejected';
  assert (public.widget_status('vyro_pk_alpha', 'alphajewels.om')->>'product_limit')::int = 50, 'product limit exposed';
end $$;
reset role;

-- liveness rules
do $$ declare s public.subscriptions; begin
  select * into s from public.subscriptions limit 1;
  s.widget_override := null;
  s.status := 'cancel_scheduled'; s.current_period_end := current_date + 1;
  assert public.subscription_is_live(s), 'cancelled runs to period end';
  s.current_period_end := current_date;
  assert not public.subscription_is_live(s), 'stops when period ends';
  s.status := 'past_due'; s.grace_until := now() + interval '1 day';
  assert public.subscription_is_live(s), 'live during grace';
  s.grace_until := now() - interval '1 minute';
  assert not public.subscription_is_live(s), 'off after grace';
  s.status := 'suspended'; s.widget_override := 'force_on';
  assert public.subscription_is_live(s), 'manual force_on';
end $$;

select 'ALL RLS TESTS PASSED';
