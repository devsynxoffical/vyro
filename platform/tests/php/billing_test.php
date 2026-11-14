<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
reset_db();

// ---- date arithmetic
eq(add_billing_interval('2026-01-31', 'monthly', 31), '2026-02-28', 'clamp to Feb');
eq(add_billing_interval('2026-02-28', 'monthly', 31), '2026-03-31', 'back to the 31st');
eq(add_billing_interval('2028-01-31', 'monthly', 31), '2028-02-29', 'leap year');
eq(add_billing_interval('2026-11-15', 'annual', 15), '2027-11-15', 'annual');
eq(add_billing_interval('2026-12-05', 'monthly', 5), '2027-01-05', 'year rollover');

$gw = new FakeOmpay();
$today = today();

// ---- the owner's example: 150 setup, 20 OMR/month, +8 extra once
$c = new_client('Flow Jewels', ['setup_fee' => 150, 'recurring_fee' => 20, 'product_limit' => 2], ['flow.om']);
eq(sub($c)['status'], 'pending_setup', 'starts pending');
$setup = row('SELECT * FROM invoices WHERE company_id = ?', [$c]);
eq((float) $setup['total'], 150.0, 'setup invoice is 150');

$pay1 = billing_claim_invoice($setup['id'], 'hosted');
ok($pay1 !== null, 'claimed');
eq(billing_claim_invoice($setup['id'], 'hosted'), null, 'cannot claim twice while processing');
$url = start_hosted_payment($gw, $pay1, 150, 'OMR');
ok(str_starts_with($url, 'https://ompay.test/pay/'), 'redirects to OMPAY');
eq(settle_payment($gw, $pay1), 'processing', 'not paid until OMPAY says so');
eq(sub($c)['status'], 'pending_setup', 'still pending');
$gw->completeHosted('tx1', true, 'tok_flow');
eq(settle_payment($gw, $pay1), 'successful', 'paid');
eq(settle_payment($gw, $pay1), 'successful', 'settling twice is harmless');
eq(sub($c)['status'], 'active', 'activated by the setup payment');
eq(sub($c)['next_billing_date'], $today, 'billing starts today when no date agreed');
eq((int) val('SELECT COUNT(*) FROM payment_methods WHERE company_id = ?', [$c]), 1, 'one saved card');
eq((int) val("SELECT COUNT(*) FROM notifications WHERE company_id = ? AND kind = 'payment_succeeded'", [$c]), 1, 'paid notice once');

// month 1: 20 + 8
q('INSERT INTO extra_charges (id, company_id, description, amount, bill_on, created_at) VALUES (?,?,?,?,?,?)',
    [uuid(), $c, '10 extra products', 8, $today, now()]);
$run = run_billing($gw);
eq($run['errors'], [], 'no errors');
eq($run['renewals']['successful'], 1, 'renewal charged');
eq(end($gw->tokenCharges)['amount'], 28.0, 'charged 28');
$run = run_billing($gw);
eq($run['renewals']['successful'] + $run['renewals']['failed'], 0, 'second run the same day charges nothing');
eq(count($gw->tokenCharges), 1, 'exactly one charge');
$s = sub($c);
eq($s['current_period_end'], add_billing_interval($today, 'monthly', (int) substr($today, 8, 2)), 'a month is paid');

// month 2: back to 20, declined -> grace -> retry next day
$m2 = $s['next_billing_date'];
$gw->mode = 'decline';
$run = run_billing($gw, $m2);
eq($run['renewals']['failed'], 1, 'declined');
eq(end($gw->tokenCharges)['amount'], 20.0, 'charged 20, the extra was one-off');
eq(sub($c)['status'], 'past_due', 'grace period');
ok(subscription_is_live(sub($c)), 'still live during grace');
eq((int) val("SELECT COUNT(*) FROM notifications WHERE company_id = ? AND kind = 'payment_failed'", [$c]), 2, 'admin and client told');
run_billing($gw, $m2);
eq(count($gw->tokenCharges), 2, 'no second attempt on the same day');
q("UPDATE invoices SET last_attempt_at = ? WHERE company_id = ? AND status = 'failed'", [now(-86400), $c]);
$gw->mode = 'ok';
$run = run_billing($gw, $m2);
eq($run['retries']['successful'], 1, 'retry paid');
eq(sub($c)['status'], 'active', 'active again');

// month 3: OMPAY times out but actually charged -> never charged twice
$m3 = sub($c)['next_billing_date'];
$gw->mode = 'timeout';
$run = run_billing($gw, $m3);
eq($run['renewals']['processing'], 1, 'outcome unknown');
$before = count($gw->tokenCharges);
q("UPDATE payments SET created_at = ? WHERE status = 'processing'", [now(-300)]);
$gw->mode = 'ok';
$run = run_billing($gw, $m3);
ok($run['reconciled'] >= 1, 'reconciled by reference');
eq(count($gw->tokenCharges), $before, 'not charged a second time');
eq(val('SELECT status FROM invoices WHERE company_id = ? ORDER BY created_at DESC, number DESC LIMIT 1', [$c]), 'paid', 'invoice paid');

// month 4: bank demands OTP -> failed; client pays from the portal with a new card
$m4 = sub($c)['next_billing_date'];
$gw->mode = 'otp';
$run = run_billing($gw, $m4);
eq($run['renewals']['failed'], 1, 'OTP cannot be done unattended');
$open = row("SELECT * FROM invoices WHERE company_id = ? AND status = 'failed'", [$c]);
$pay2 = billing_claim_invoice($open['id'], 'hosted');
start_hosted_payment($gw, $pay2, (float) $open['total'], 'OMR');
$gw->completeHosted($gw->byReference($pay2), true, 'tok_flow_new');
eq(settle_payment($gw, $pay2), 'successful', 'paid from portal');
eq(sub($c)['status'], 'active', 'active');
eq(val('SELECT ompay_token FROM payment_methods WHERE company_id = ? AND is_default = 1', [$c]), 'tok_flow_new', 'new card is the default');
eq((int) val('SELECT COUNT(*) FROM payment_methods WHERE company_id = ? AND is_default = 1', [$c]), 1, 'only one default card');

// update card: the small check charge is reversed, once
$cc = billing_start_card_check($c);
start_hosted_payment($gw, $cc, 0.1, 'OMR');
$ccTx = $gw->byReference($cc);
$gw->completeHosted($ccTx, true, 'tok_flow_3');
settle_payment($gw, $cc);
ok(in_array($ccTx, $gw->reversed, true), 'card check reversed');
settle_payment($gw, $cc);
eq(count($gw->reversed), 1, 'reversed once only');

// unpaid past the grace period: suspended, widget off; paying switches it back on
$m5 = sub($c)['next_billing_date'];
$gw->mode = 'decline';
run_billing($gw, $m5);
q('UPDATE subscriptions SET grace_until = ? WHERE company_id = ?', [now(-60), $c]);
$run = run_billing($gw, $m5);
eq($run['suspended'], 1, 'suspended');
$key = val('SELECT public_key FROM widget_keys WHERE company_id = ?', [$c]);
eq(widget_status($key, 'https://flow.om')['active'], false, 'widget off when suspended');
$open = row("SELECT * FROM invoices WHERE company_id = ? AND status = 'failed'", [$c]);
billing_offline_paid($open['id'], 'bank transfer');
eq(sub($c)['status'], 'active', 'reactivated by an offline payment');
ok(widget_status($key, 'https://www.flow.om/ring')['active'], 'widget on again on own domain');
ok(widget_status($key, 'shop.flow.om')['active'], 'subdomain allowed');
eq(widget_status($key, 'https://notflow.om')['reason'], 'domain_not_allowed', 'lookalike domain rejected');
eq(widget_status('vyro_pk_nope', 'flow.om')['reason'], 'unknown_key', 'unknown key');

// product catalogue is capped by the plan
foreach (['R1', 'R2', 'R3'] as $i => $sku) {
    q('INSERT INTO products (id, company_id, type, name, sku, image_path, options, active, sort, created_at) VALUES (?,?,?,?,?,?,?,1,?,?)',
        [uuid(), $c, 'ring', "Ring $sku", $sku, "products/$c/$sku.png", '{}', $i, now()]);
}
$w = widget_status($key, 'flow.om');
eq(count($w['products']), 2, 'served catalogue capped at the plan limit');
eq($w['products'][0]['sku'], 'R1', 'in order');
ok(str_starts_with($w['products'][0]['image'], 'https://app.test/uploads/products/'), 'absolute image address');

// manual override wins
q("UPDATE subscriptions SET widget_override = 'force_off' WHERE company_id = ?", [$c]);
eq(widget_status($key, 'flow.om')['active'], false, 'force off wins');
q('UPDATE subscriptions SET widget_override = NULL WHERE company_id = ?', [$c]);

// ---- cancellation runs to the end of the paid period
$b = new_client('Beta', ['recurring_fee' => 30]);
billing_activate($b);
$gw->mode = 'ok';
q('INSERT INTO payment_methods (id, company_id, ompay_token, created_at) VALUES (?,?,?,?)', [uuid(), $b, 'tok_b', now()]);
run_billing($gw);
eq(billing_set_cancellation($b, true), 'cancel_scheduled', 'cancel scheduled');
ok(subscription_is_live(sub($b)), 'runs until the paid period ends');
eq(billing_set_cancellation($b, false), 'active', 'resumed');
eq(billing_set_cancellation($b, true), 'cancel_scheduled', 'cancelled again');
$charges = count($gw->tokenCharges);
run_billing($gw, sub($b)['next_billing_date']);
eq(count($gw->tokenCharges), $charges, 'no charge after cancelling');
eq(sub($b)['status'], 'cancelled', 'ended');
ok(!subscription_is_live(sub($b)), 'widget off after the period ends');

// ---- agreed start date, annual plan, OMPAY "outcome unconfirmed"
$start = date('Y-m-d', strtotime("$today +14 day"));
$g = new_client('Gamma', ['setup_fee' => 50, 'recurring_fee' => 200, 'billing_interval' => 'annual', 'contract_months' => 12, 'billing_start_date' => $start]);
$inv = row('SELECT * FROM invoices WHERE company_id = ?', [$g]);
$p = billing_claim_invoice($inv['id'], 'hosted');
billing_record_result($p, 'SUCCESSFUL', 'tx-g0', 'tok_g');
eq(sub($g)['next_billing_date'], $start, 'first charge on the agreed date');
ok(subscription_is_live(sub($g)), 'live while being set up');
eq(sub($g)['contract_end'], date('Y-m-d', strtotime("$start +12 month")), 'contract end');
eq(billing_prepare_renewals($today), [], 'not yet due');
[$inv] = billing_prepare_renewals($start);
$p = billing_claim_invoice($inv, 'token');
billing_record_result($p, 'FAILED', 'tx-g1', null, null, null, 'closed unconfirmed', true);
ok(!in_array($inv, billing_due_retries(), true), 'never auto-retry an unconfirmed charge');
q('UPDATE invoices SET last_attempt_at = ? WHERE id = ?', [now(-86400), $inv]);
ok(!in_array($inv, billing_due_retries(), true), 'still not retried a day later');
ok(in_array($p, billing_payments_to_reconcile(), true), 'keeps checking it');
billing_record_result($p, 'SUCCESSFUL', 'tx-g1');
eq(sub($g)['status'], 'active', 'confirmed later');
eq(sub($g)['current_period_end'], date('Y-m-d', strtotime("$start +12 month")), 'a year is paid');

// ---- stale payments and reminders
$d = new_client('Delta', ['setup_fee' => 10, 'recurring_fee' => 5]);
$inv = row('SELECT * FROM invoices WHERE company_id = ?', [$d]);
$p = billing_claim_invoice($inv['id'], 'hosted');
q('UPDATE payments SET created_at = ? WHERE id = ?', [now(-3600), $p]);
eq(billing_expire_stale(), 1, 'stale checkout released');
eq(val('SELECT status FROM invoices WHERE id = ?', [$inv['id']]), 'open', 'invoice payable again');

q("UPDATE subscriptions SET status = 'active', cancel_at_period_end = 0, next_billing_date = ? WHERE company_id = ?",
    [date('Y-m-d', strtotime("$today +3 day")), $b]);
ok(billing_send_reminders() >= 1, 'reminder sent');
eq(billing_send_reminders(), 0, 'only once');

// ---- two overlapping claims: exactly one wins (same connection, sequential, as a regression guard)
$r = new_client('Race', ['recurring_fee' => 10]);
billing_activate($r);
q('INSERT INTO payment_methods (id, company_id, ompay_token, created_at) VALUES (?,?,?,?)', [uuid(), $r, 'tok_r', now()]);
[$inv] = billing_prepare_renewals();
$n0 = count($gw->tokenCharges);
$results = [charge_invoice_with_saved_card($gw, $inv), charge_invoice_with_saved_card($gw, $inv), charge_invoice_with_saved_card($gw, $inv)];
eq(count(array_keys($results, 'successful')), 1, 'one winner');
eq(count($gw->tokenCharges) - $n0, 1, 'one charge');

echo "ALL BILLING TESTS PASSED ({$GLOBALS['checks']} checks)\n";
