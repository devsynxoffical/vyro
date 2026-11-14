<?php
declare(strict_types=1);

/**
 * Billing engine. Every change to invoices, payments and subscriptions goes
 * through these functions, each inside one database transaction, so it is
 * atomic and can be tested without the payment gateway.
 */

function settings(): array
{
    return row('SELECT * FROM app_settings WHERE id = 1') ?? [];
}

/**
 * Adds one billing interval, keeping the billing day (clamped to the month's
 * length): 31 Jan -> 28/29 Feb -> 31 Mar.
 */
function add_billing_interval(string $from, string $interval, int $anchorDay): string
{
    $months = $interval === 'annual' ? 12 : 1;
    $first = (new DateTimeImmutable(substr($from, 0, 7) . '-01'))->modify("+$months month");
    $day = min($anchorDay, (int) $first->format('t'));
    return $first->format('Y-m-') . str_pad((string) $day, 2, '0', STR_PAD_LEFT);
}

/** Whether VYRO should run for this subscription right now. */
function subscription_is_live(?array $s): bool
{
    if (!$s) {
        return false;
    }
    if ($s['widget_override'] === 'force_on') {
        return true;
    }
    if ($s['widget_override'] === 'force_off') {
        return false;
    }
    $today = today();
    switch ($s['status']) {
        case 'active':
            // One day of slack on the renewal date, so the service never blinks
            // off between midnight and the billing run that charges the card.
            return $s['current_period_end'] !== null
                && $s['current_period_end'] >= date('Y-m-d', strtotime("$today -1 day"));
        case 'cancel_scheduled':
            return $s['current_period_end'] !== null && $s['current_period_end'] > $today;
        case 'past_due':
            return $s['grace_until'] !== null && $s['grace_until'] > now();
        default:
            return false;
    }
}

function next_invoice_number(): string
{
    q("UPDATE counters SET value = LAST_INSERT_ID(value + 1) WHERE name = 'invoice'");
    return 'VY-' . gmdate('Y') . '-' . db()->lastInsertId();
}

function recalc_invoice(string $invoiceId): void
{
    q(
        'UPDATE invoices SET total = (SELECT COALESCE(SUM(amount), 0) FROM invoice_items WHERE invoice_id = ?) WHERE id = ?',
        [$invoiceId, $invoiceId],
    );
}

function add_invoice_item(string $invoiceId, string $description, mixed $amount): void
{
    q(
        'INSERT INTO invoice_items (id, invoice_id, description, amount, created_at) VALUES (?,?,?,?,?)',
        [uuid(), $invoiceId, mb_substr($description, 0, 255), $amount, now()],
    );
}

/** Admin creates a client: company, plan, subscription, setup invoice, widget key. */
function billing_create_client(array $company, array $plan, array $domains): string
{
    return tx(function () use ($company, $plan, $domains) {
        $cid = uuid();
        q(
            'INSERT INTO companies (id, name, store_name, website, contact_name, contact_email, contact_phone, notes, created_at)
             VALUES (?,?,?,?,?,?,?,?,?)',
            [
                $cid, $company['name'], $company['store_name'] ?: null, $company['website'] ?: null,
                $company['contact_name'] ?: null, $company['contact_email'] ?: null,
                $company['contact_phone'] ?: null, $company['notes'] ?: null, now(),
            ],
        );
        q(
            'INSERT INTO plans (id, company_id, name, currency, setup_fee, recurring_fee, billing_interval, product_limit,
                                billing_start_date, contract_months, cancellation_terms, created_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
            [
                uuid(), $cid, $plan['name'], $plan['currency'], $plan['setup_fee'], $plan['recurring_fee'],
                $plan['billing_interval'], $plan['product_limit'], $plan['billing_start_date'],
                $plan['contract_months'], $plan['cancellation_terms'], now(),
            ],
        );
        q('INSERT INTO subscriptions (id, company_id, updated_at) VALUES (?,?,?)', [uuid(), $cid, now()]);
        q(
            'INSERT INTO widget_keys (company_id, public_key, allowed_domains, created_at) VALUES (?,?,?,?)',
            [$cid, 'vyro_pk_' . bin2hex(random_bytes(16)), json_encode(array_values($domains)), now()],
        );
        if ((float) $plan['setup_fee'] > 0) {
            $inv = uuid();
            q(
                'INSERT INTO invoices (id, number, company_id, kind, currency, due_date, created_at) VALUES (?,?,?,?,?,?,?)',
                [$inv, next_invoice_number(), $cid, 'setup', $plan['currency'], today(), now()],
            );
            add_invoice_item($inv, 'One-time setup fee', $plan['setup_fee']);
            recalc_invoice($inv);
        }
        return $cid;
    });
}

/** Setup fee paid (or waived): start the service and the billing schedule. */
function billing_activate(string $companyId): void
{
    tx(function () use ($companyId) {
        $p = row('SELECT * FROM plans WHERE company_id = ?', [$companyId]);
        $s = row('SELECT * FROM subscriptions WHERE company_id = ? FOR UPDATE', [$companyId]);
        if (!$p || !$s || $s['status'] !== 'pending_setup') {
            return;
        }
        $today = today();
        $start = max($p['billing_start_date'] ?? $today, $today);
        $tomorrow = date('Y-m-d', strtotime("$today +1 day"));
        q(
            "UPDATE subscriptions SET status = 'active', setup_paid_at = COALESCE(setup_paid_at, ?),
                    current_period_start = ?, current_period_end = ?, next_billing_date = ?,
                    contract_end = ?, grace_until = NULL, updated_at = ?
              WHERE id = ?",
            [
                now(), $today, max($start, $tomorrow), $start,
                $p['contract_months'] ? date('Y-m-d', strtotime("$start +{$p['contract_months']} month")) : null,
                now(), $s['id'],
            ],
        );
    });
}

/**
 * Creates renewal invoices that are due, ends cancelled subscriptions, and
 * returns the ids of invoices that should now be charged.
 */
function billing_prepare_renewals(?string $today = null): array
{
    $today ??= today();
    $due = [];
    $subs = rows(
        "SELECT id FROM subscriptions
          WHERE status IN ('active', 'cancel_scheduled') AND next_billing_date IS NOT NULL AND next_billing_date <= ?",
        [$today],
    );
    foreach ($subs as $ref) {
        $invoiceId = tx(function () use ($ref, $today) {
            $s = row('SELECT * FROM subscriptions WHERE id = ? FOR UPDATE', [$ref['id']]);
            if (!$s || !in_array($s['status'], ['active', 'cancel_scheduled'], true)
                || $s['next_billing_date'] === null || $s['next_billing_date'] > $today) {
                return null; // another run got here first
            }
            if ($s['cancel_at_period_end'] || $s['status'] === 'cancel_scheduled') {
                q(
                    "UPDATE subscriptions SET status = 'cancelled', cancelled_at = COALESCE(cancelled_at, ?),
                            next_billing_date = NULL, updated_at = ? WHERE id = ?",
                    [now(), now(), $s['id']],
                );
                notify('admin', $s['company_id'], 'cancelled', 'Subscription ended',
                    'The cancelled subscription reached the end of its paid period. VYRO is now off.');
                notify('client', $s['company_id'], 'cancelled', 'Your VYRO subscription has ended');
                return null;
            }
            $p = row('SELECT * FROM plans WHERE company_id = ?', [$s['company_id']]);
            if (!$p) {
                return null;
            }
            $anchor = (int) substr($p['billing_start_date'] ?? $s['next_billing_date'], 8, 2);
            $periodEnd = add_billing_interval($s['next_billing_date'], $p['billing_interval'], $anchor);

            $inv = uuid();
            try {
                q(
                    'INSERT INTO invoices (id, number, company_id, kind, currency, period_start, period_end, period_key, due_date, created_at)
                     VALUES (?,?,?,?,?,?,?,?,?,?)',
                    [
                        $inv, next_invoice_number(), $s['company_id'], 'subscription', $p['currency'],
                        $s['next_billing_date'], $periodEnd, $s['next_billing_date'], $s['next_billing_date'], now(),
                    ],
                );
            } catch (PDOException $e) {
                if ($e->getCode() === '23000') {
                    return null; // this period is already invoiced; the retry step handles it
                }
                throw $e;
            }
            add_invoice_item(
                $inv,
                sprintf('%s subscription %s – %s', $p['name'], nice_date($s['next_billing_date']),
                    nice_date(date('Y-m-d', strtotime("$periodEnd -1 day")))),
                $p['recurring_fee'],
            );
            // One-off extras for this period.
            $extras = rows(
                'SELECT id, description, amount FROM extra_charges
                  WHERE company_id = ? AND invoice_id IS NULL AND bill_on <= ? FOR UPDATE',
                [$s['company_id'], $s['next_billing_date']],
            );
            foreach ($extras as $e) {
                add_invoice_item($inv, $e['description'], $e['amount']);
                q('UPDATE extra_charges SET invoice_id = ? WHERE id = ?', [$inv, $e['id']]);
            }
            recalc_invoice($inv);
            if ((float) val('SELECT total FROM invoices WHERE id = ?', [$inv]) <= 0) {
                billing_mark_invoice_paid($inv);
                return null;
            }
            return $inv;
        });
        if ($invoiceId) {
            $due[] = $invoiceId;
        }
    }
    return $due;
}

/**
 * Atomically claims an invoice for one charge attempt, so two overlapping
 * requests or billing runs can never charge it twice. Returns the payment id
 * (used as the OMPAY reference), or null if the invoice is not chargeable.
 */
function billing_claim_invoice(string $invoiceId, string $flow): ?string
{
    return tx(function () use ($invoiceId, $flow) {
        $claimed = q(
            "UPDATE invoices SET status = 'processing', attempts = attempts + 1, last_attempt_at = ?
              WHERE id = ? AND status IN ('open', 'failed')",
            [now(), $invoiceId],
        )->rowCount();
        if ($claimed !== 1) {
            return null;
        }
        $inv = row('SELECT company_id, total, currency FROM invoices WHERE id = ?', [$invoiceId]);
        $pay = uuid();
        q(
            'INSERT INTO payments (id, company_id, invoice_id, flow, amount, currency, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)',
            [$pay, $inv['company_id'], $invoiceId, $flow, $inv['total'], $inv['currency'], now(), now()],
        );
        return $pay;
    });
}

/** A payment without an invoice: the small charge that verifies a new card. */
function billing_start_card_check(string $companyId): string
{
    $pay = uuid();
    q(
        "INSERT INTO payments (id, company_id, flow, amount, created_at, updated_at) VALUES (?,?,'card_check',?,?,?)",
        [$pay, $companyId, settings()['card_check_amount'], now(), now()],
    );
    return $pay;
}

function billing_mark_invoice_paid(string $invoiceId): void
{
    tx(function () use ($invoiceId) {
        $inv = row('SELECT * FROM invoices WHERE id = ? FOR UPDATE', [$invoiceId]);
        if (!$inv || $inv['status'] === 'paid') {
            return;
        }
        q("UPDATE invoices SET status = 'paid', paid_at = ? WHERE id = ?", [now(), $invoiceId]);

        if ($inv['kind'] === 'setup') {
            billing_activate($inv['company_id']);
        } elseif ($inv['kind'] === 'subscription') {
            $s = row('SELECT * FROM subscriptions WHERE company_id = ? FOR UPDATE', [$inv['company_id']]);
            $wasOverdue = in_array($s['status'], ['past_due', 'suspended'], true);
            q(
                'UPDATE subscriptions SET status = ?, grace_until = NULL, current_period_start = ?,
                        current_period_end = ?, next_billing_date = ?, updated_at = ? WHERE id = ?',
                [
                    $wasOverdue ? 'active' : $s['status'],
                    max($s['current_period_start'] ?? $inv['period_start'], $inv['period_start']),
                    max($s['current_period_end'] ?? $inv['period_end'], $inv['period_end']),
                    $s['cancel_at_period_end']
                        ? $s['next_billing_date']
                        : max($s['next_billing_date'] ?? $inv['period_end'], $inv['period_end']),
                    now(), $s['id'],
                ],
            );
            if ($wasOverdue) {
                notify('admin', $inv['company_id'], 'reactivated', 'Overdue invoice paid',
                    "Invoice {$inv['number']} was paid; VYRO is active again.");
            }
        }
        notify('client', $inv['company_id'], 'payment_succeeded',
            "Payment received – invoice {$inv['number']}", money_str($inv['total'], $inv['currency']));
    });
}

/**
 * Records what OMPAY reported for a payment and applies every consequence.
 * $status: SUCCESSFUL | FAILED | PROCESSING / PENDING (nothing changes yet).
 *
 * @return array{changed:bool,status?:string,refund_card_check?:bool}
 */
function billing_record_result(
    string $paymentId,
    string $status,
    ?string $transactionId = null,
    ?string $token = null,
    ?string $brand = null,
    ?string $masked = null,
    ?string $error = null,
    bool $unconfirmed = false,
): array {
    return tx(function () use ($paymentId, $status, $transactionId, $token, $brand, $masked, $error, $unconfirmed) {
        $pay = row('SELECT * FROM payments WHERE id = ? FOR UPDATE', [$paymentId]);
        if (!$pay) {
            throw new RuntimeException("Unknown payment $paymentId");
        }
        if ($transactionId !== null && $pay['ompay_transaction_id'] === null) {
            q('UPDATE payments SET ompay_transaction_id = ?, updated_at = ? WHERE id = ?', [$transactionId, now(), $paymentId]);
        }
        $status = strtoupper($status);
        if ($status === 'PROCESSING' || $status === 'PENDING') {
            return ['changed' => false];
        }
        // A final answer is already recorded. The only change allowed afterwards
        // is OMPAY confirming a payment it had closed as "outcome unconfirmed".
        if ($pay['status'] !== 'processing' && !($pay['outcome_unconfirmed'] && $status === 'SUCCESSFUL')) {
            return ['changed' => false];
        }

        if ($status === 'SUCCESSFUL') {
            q(
                "UPDATE payments SET status = 'successful', error_message = NULL, outcome_unconfirmed = 0,
                        card_brand = COALESCE(?, card_brand), card_masked = COALESCE(?, card_masked), updated_at = ?
                  WHERE id = ?",
                [$brand, $masked, now(), $paymentId],
            );
            if ($token !== null && $token !== '') {
                q('UPDATE payment_methods SET is_default = 0 WHERE company_id = ? AND ompay_token <> ?', [$pay['company_id'], $token]);
                $existing = val(
                    'SELECT id FROM payment_methods WHERE company_id = ? AND ompay_token = ? AND revoked_at IS NULL',
                    [$pay['company_id'], $token],
                );
                if ($existing) {
                    q('UPDATE payment_methods SET is_default = 1 WHERE id = ?', [$existing]);
                } else {
                    q(
                        'INSERT INTO payment_methods (id, company_id, ompay_token, brand, masked_pan, is_default, created_at) VALUES (?,?,?,?,?,1,?)',
                        [uuid(), $pay['company_id'], $token, $brand, $masked, now()],
                    );
                }
            }
            if ($pay['invoice_id'] !== null) {
                billing_mark_invoice_paid($pay['invoice_id']);
            }
            return ['changed' => true, 'status' => 'successful', 'refund_card_check' => $pay['flow'] === 'card_check'];
        }

        // FAILED
        q(
            "UPDATE payments SET status = 'failed', error_message = ?, outcome_unconfirmed = ?, updated_at = ? WHERE id = ?",
            [$error === null ? null : mb_substr($error, 0, 500), $unconfirmed ? 1 : 0, now(), $paymentId],
        );
        if ($pay['invoice_id'] === null) {
            return ['changed' => true, 'status' => 'failed'];
        }
        $released = q("UPDATE invoices SET status = 'failed' WHERE id = ? AND status = 'processing'", [$pay['invoice_id']])->rowCount();
        if ($released !== 1) {
            return ['changed' => true, 'status' => 'failed'];
        }
        $inv = row('SELECT * FROM invoices WHERE id = ?', [$pay['invoice_id']]);

        if ($inv['kind'] === 'subscription') {
            $s = row('SELECT * FROM subscriptions WHERE company_id = ? FOR UPDATE', [$inv['company_id']]);
            $grace = $s['grace_until'];
            if ($s['status'] === 'active') {
                $grace = now((int) settings()['grace_days'] * 86400);
                q("UPDATE subscriptions SET status = 'past_due', grace_until = ?, updated_at = ? WHERE id = ?", [$grace, now(), $s['id']]);
            }
            notify('admin', $inv['company_id'], 'payment_failed', "Payment failed – invoice {$inv['number']}",
                ($error ?: 'The card was declined.')
                . ($unconfirmed ? ' The bank did not confirm the result; OMPAY is reviewing it, so it will not be retried automatically.' : ''));
            notify('client', $inv['company_id'], 'payment_failed', "Payment failed – invoice {$inv['number']}",
                $grace ? 'Please pay or update your card before ' . nice_date($grace) . ' to keep VYRO running.' : 'Please pay this invoice from your dashboard.');
        } else {
            notify('client', $inv['company_id'], 'payment_failed', "Payment failed – invoice {$inv['number']}", $error);
        }
        return ['changed' => true, 'status' => 'failed'];
    });
}

/** Invoices to retry automatically during the grace period (one try a day). */
function billing_due_retries(): array
{
    return array_column(rows(
        "SELECT i.id FROM invoices i JOIN subscriptions s ON s.company_id = i.company_id
          WHERE i.kind = 'subscription' AND i.status IN ('open', 'failed') AND i.attempts > 0
            AND s.status = 'past_due' AND s.grace_until > ?
            AND i.attempts < (SELECT max_auto_attempts FROM app_settings WHERE id = 1)
            AND (i.last_attempt_at IS NULL OR i.last_attempt_at < ?)
            AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.invoice_id = i.id AND p.outcome_unconfirmed = 1)",
        [now(), now(-23 * 3600)],
    ), 'id');
}

/** Turns VYRO off for clients whose grace period ran out. */
function billing_suspend_overdue(): int
{
    $n = 0;
    foreach (rows("SELECT id, company_id FROM subscriptions WHERE status = 'past_due' AND grace_until <= ?", [now()]) as $s) {
        $done = q("UPDATE subscriptions SET status = 'suspended', updated_at = ? WHERE id = ? AND status = 'past_due'", [now(), $s['id']])->rowCount();
        if ($done === 1) {
            notify('admin', $s['company_id'], 'suspended', 'Client suspended for non-payment',
                'The grace period ended without payment. VYRO is now off on their website.');
            notify('client', $s['company_id'], 'suspended', 'VYRO has been paused',
                'Your payment is overdue. Pay the open invoice to switch VYRO back on.');
            $n++;
        }
    }
    return $n;
}

/** "Your subscription renews in N days" reminders, once per renewal date. */
function billing_send_reminders(?string $today = null): int
{
    $today ??= today();
    $days = (int) settings()['reminder_days'];
    $target = date('Y-m-d', strtotime("$today +$days day"));
    $n = 0;
    $subs = rows(
        "SELECT s.company_id, s.next_billing_date, p.recurring_fee, p.currency
           FROM subscriptions s JOIN plans p ON p.company_id = s.company_id
          WHERE s.status = 'active' AND s.cancel_at_period_end = 0 AND s.next_billing_date = ?",
        [$target],
    );
    foreach ($subs as $s) {
        $when = nice_date($s['next_billing_date']);
        $already = val(
            "SELECT 1 FROM notifications WHERE company_id = ? AND kind = 'renewal_reminder' AND body LIKE ? LIMIT 1",
            [$s['company_id'], "%$when%"],
        );
        if (!$already) {
            notify('client', $s['company_id'], 'renewal_reminder', 'Upcoming renewal',
                "Your subscription renews on $when. Expected charge: " . money_str($s['recurring_fee'], $s['currency']) . ' plus any extras.');
            $n++;
        }
    }
    return $n;
}

/** Client cancels or resumes. Returns the resulting status. */
function billing_set_cancellation(string $companyId, bool $cancel): string
{
    return tx(function () use ($companyId, $cancel) {
        $s = row('SELECT * FROM subscriptions WHERE company_id = ? FOR UPDATE', [$companyId]);
        if (!$s) {
            fail(404, 'No subscription');
        }
        if ($cancel) {
            if ($s['status'] === 'pending_setup') {
                q("UPDATE subscriptions SET status = 'cancelled', cancelled_at = ?, updated_at = ? WHERE id = ?", [now(), now(), $s['id']]);
            } elseif ($s['status'] === 'active' || $s['status'] === 'past_due') {
                q(
                    'UPDATE subscriptions SET status = ?, cancel_at_period_end = 1, cancelled_at = ?, updated_at = ? WHERE id = ?',
                    [$s['status'] === 'active' ? 'cancel_scheduled' : 'cancelled', now(), now(), $s['id']],
                );
            } else {
                return $s['status'];
            }
            notify('admin', $companyId, 'cancel_requested', 'Client cancelled their subscription',
                $s['current_period_end']
                    ? 'VYRO will stop after ' . nice_date(date('Y-m-d', strtotime($s['current_period_end'] . ' -1 day'))) . '.'
                    : 'VYRO is off.');
        } else {
            if ($s['status'] !== 'cancel_scheduled') {
                return $s['status'];
            }
            q("UPDATE subscriptions SET status = 'active', cancel_at_period_end = 0, cancelled_at = NULL, updated_at = ? WHERE id = ?", [now(), $s['id']]);
            notify('admin', $companyId, 'cancel_reverted', 'Client resumed their subscription');
        }
        return (string) val('SELECT status FROM subscriptions WHERE id = ?', [$s['id']]);
    });
}

/** Payments to re-check with OMPAY: still processing, or closed as "unconfirmed" in the last two weeks. */
function billing_payments_to_reconcile(): array
{
    return array_column(rows(
        "SELECT id FROM payments
          WHERE (status = 'processing' AND created_at < ?)
             OR (status = 'failed' AND outcome_unconfirmed = 1 AND created_at > ?)",
        [now(-120), now(-14 * 86400)],
    ), 'id');
}

/**
 * Payments that never reached OMPAY (no transaction id after 30 minutes). An
 * abandoned checkout frees its invoice to be paid again; an automatic charge
 * that never arrived counts as a failed attempt.
 */
function billing_expire_stale(): int
{
    $n = 0;
    $stale = rows(
        "SELECT id, flow, invoice_id FROM payments
          WHERE status = 'processing' AND ompay_transaction_id IS NULL AND created_at < ?",
        [now(-1800)],
    );
    foreach ($stale as $p) {
        if ($p['flow'] === 'token') {
            billing_record_result($p['id'], 'FAILED', null, null, null, null, 'The payment could not be sent to the bank.');
        } else {
            tx(function () use ($p) {
                q("UPDATE payments SET status = 'failed', error_message = 'Payment was not completed.', updated_at = ? WHERE id = ? AND status = 'processing'", [now(), $p['id']]);
                if ($p['invoice_id']) {
                    q("UPDATE invoices SET status = 'open' WHERE id = ? AND status = 'processing'", [$p['invoice_id']]);
                }
            });
        }
        $n++;
    }
    return $n;
}

/** Admin records a payment received outside the gateway (bank transfer, cash). */
function billing_offline_paid(string $invoiceId, ?string $note): void
{
    tx(function () use ($invoiceId, $note) {
        $claimed = q("UPDATE invoices SET status = 'processing' WHERE id = ? AND status IN ('open', 'failed')", [$invoiceId])->rowCount();
        if ($claimed !== 1) {
            fail(409, 'This invoice cannot be marked as paid');
        }
        $inv = row('SELECT company_id, total, currency FROM invoices WHERE id = ?', [$invoiceId]);
        q(
            "INSERT INTO payments (id, company_id, invoice_id, flow, amount, currency, status, error_message, created_at, updated_at)
             VALUES (?,?,?,'offline',?,?,'successful',?,?,?)",
            [uuid(), $inv['company_id'], $invoiceId, $inv['total'], $inv['currency'], $note ?: null, now(), now()],
        );
        billing_mark_invoice_paid($invoiceId);
    });
}

/* ---------------------------------------------------- gateway orchestration */

/** Charge an invoice to the client's saved card (renewals and retries). */
function charge_invoice_with_saved_card(Gateway $gw, string $invoiceId): string
{
    $inv = row('SELECT id, company_id, total, currency FROM invoices WHERE id = ?', [$invoiceId]);
    if (!$inv) {
        return 'skipped';
    }
    // The claim is atomic: a second, overlapping run gets null and charges nothing.
    $payment = billing_claim_invoice($invoiceId, 'token');
    if (!$payment) {
        return 'skipped';
    }
    $token = val(
        'SELECT ompay_token FROM payment_methods WHERE company_id = ? AND is_default = 1 AND revoked_at IS NULL',
        [$inv['company_id']],
    );
    if (!$token) {
        billing_record_result($payment, 'FAILED', null, null, null, null, 'No saved card on file.');
        return 'failed';
    }
    try {
        $res = $gw->payWithToken((float) $inv['total'], $inv['currency'], (string) $token, app_url() . '/portal/billing', $payment);
    } catch (OmpayError $e) {
        if ($e->httpStatus >= 400 && $e->httpStatus < 500) {
            // OMPAY rejected the request outright; nothing was charged.
            billing_record_result($payment, 'FAILED', null, null, null, null, $e->errorCode . ': ' . $e->getMessage());
            return 'failed';
        }
        // Timeout / 5xx: the charge may or may not have gone through. Leave it
        // "processing"; reconciliation resolves it by reference. Never re-charge here.
        return 'processing';
    }
    if (!empty($res['otp_required'])) {
        // The bank wants the cardholder present, which an unattended charge
        // cannot do: the client pays this invoice from their portal instead.
        billing_record_result($payment, 'FAILED', $res['transaction_id'] ?? null, null, null, null,
            'Your bank asked for verification. Please pay this invoice from your dashboard.');
        return 'failed';
    }
    $status = strtoupper((string) ($res['status'] ?? 'PROCESSING'));
    billing_record_result($payment, $status, $res['transaction_id'] ?? null, null, null, null, $res['error_message'] ?? null);
    return $status === 'SUCCESSFUL' ? 'successful' : ($status === 'FAILED' ? 'failed' : 'processing');
}

/** Start a payment on OMPAY's hosted page; returns where to send the client. */
function start_hosted_payment(Gateway $gw, string $paymentId, float $amount, string $currency): string
{
    try {
        $res = $gw->bankHosted($amount, $currency, app_url() . '/portal/billing/return?payment=' . $paymentId, $paymentId);
    } catch (OmpayError $e) {
        billing_record_result($paymentId, 'FAILED', null, null, null, null, $e->errorCode . ': ' . $e->getMessage());
        throw $e;
    }
    billing_record_result($paymentId, 'PROCESSING', $res['transaction_id'] ?? null);
    if (empty($res['redirect_url'])) {
        throw new OmpayError('NO_REDIRECT', 'OMPAY returned no payment page', 502);
    }
    return (string) $res['redirect_url'];
}

/**
 * Ask OMPAY for the authoritative result of a payment and apply it. Safe to
 * call any number of times (from the return page and from the billing run).
 */
function settle_payment(Gateway $gw, string $paymentId): string
{
    $pay = row('SELECT * FROM payments WHERE id = ?', [$paymentId]);
    if (!$pay) {
        return 'skipped';
    }
    try {
        $inq = $gw->inquiry($pay['ompay_transaction_id'], $pay['ompay_transaction_id'] ? null : $paymentId);
    } catch (OmpayError $e) {
        if ($e->httpStatus === 404) {
            return 'processing'; // not at OMPAY (yet)
        }
        throw $e;
    }
    $status = strtoupper((string) ($inq['status'] ?? 'PROCESSING'));
    $card = is_array($inq['saved_card'] ?? null) ? $inq['saved_card'] : [];
    $result = billing_record_result(
        $paymentId,
        $status,
        $inq['transaction_id'] ?? null,
        $card['token'] ?? ($inq['token'] ?? null),
        $card['brand'] ?? null,
        $card['masked_pan'] ?? null,
        $inq['error_message'] ?? null,
        ($inq['outcome_unconfirmed'] ?? false) === true,
    );
    // The small charge used to verify a new card is given straight back.
    if ($result['changed'] && !empty($result['refund_card_check']) && !empty($inq['transaction_id'])) {
        try {
            $gw->reverse((string) $inq['transaction_id']);
        } catch (OmpayError) {
            try {
                $gw->refund((string) $inq['transaction_id']);
            } catch (OmpayError) {
                notify('admin', $pay['company_id'], 'refund_needed', 'Card-check charge could not be refunded automatically',
                    "Refund transaction {$inq['transaction_id']} (" . money_str($pay['amount'], $pay['currency']) . ') in the OMPAY portal.');
            }
        }
    }
    return $status === 'SUCCESSFUL' ? 'successful' : ($status === 'FAILED' ? 'failed' : 'processing');
}

/** The scheduled billing run. Each step is independent; one failure never blocks the rest. */
function run_billing(Gateway $gw, ?string $today = null): array
{
    $tally = ['successful' => 0, 'failed' => 0, 'processing' => 0, 'skipped' => 0];
    $out = ['reconciled' => 0, 'expired' => 0, 'renewals' => $tally, 'retries' => $tally, 'suspended' => 0, 'reminders' => 0, 'errors' => []];
    $step = function (string $name, callable $fn) use (&$out) {
        try {
            $fn();
        } catch (Throwable $e) {
            $out['errors'][] = "$name: " . $e->getMessage();
        }
    };
    $step('reconcile', function () use ($gw, &$out, $step) {
        foreach (billing_payments_to_reconcile() as $id) {
            $step("reconcile $id", function () use ($gw, $id, &$out) {
                settle_payment($gw, $id);
                $out['reconciled']++;
            });
        }
    });
    $step('expire', function () use (&$out) {
        $out['expired'] = billing_expire_stale();
    });
    $step('renewals', function () use ($gw, $today, &$out, $step) {
        foreach (billing_prepare_renewals($today) as $id) {
            $step("charge $id", function () use ($gw, $id, &$out) {
                $out['renewals'][charge_invoice_with_saved_card($gw, $id)]++;
            });
        }
    });
    $step('retries', function () use ($gw, &$out, $step) {
        foreach (billing_due_retries() as $id) {
            $step("retry $id", function () use ($gw, $id, &$out) {
                $out['retries'][charge_invoice_with_saved_card($gw, $id)]++;
            });
        }
    });
    $step('suspend', function () use (&$out) {
        $out['suspended'] = billing_suspend_overdue();
    });
    $step('reminders', function () use ($today, &$out) {
        $out['reminders'] = billing_send_reminders($today);
    });
    return $out;
}

/* ------------------------------------------------------------ widget licence */

/**
 * Answers "may VYRO run on this website, and with which products?" for the
 * loader. Reveals nothing else about the client.
 */
function widget_status(string $key, string $site): array
{
    $k = row('SELECT * FROM widget_keys WHERE public_key = ?', [$key]);
    if (!$k) {
        return ['active' => false, 'reason' => 'unknown_key'];
    }
    $host = strtolower($site);
    $host = preg_replace('#^https?://#', '', $host) ?? '';
    $host = preg_replace('#[:/].*$#', '', $host) ?? '';
    $host = preg_replace('#^www\.#', '', $host) ?? '';

    $domains = json_decode($k['allowed_domains'], true) ?: [];
    if ($domains) {
        $ok = false;
        foreach ($domains as $d) {
            $d = preg_replace('#^www\.#', '', strtolower((string) $d)) ?? '';
            if ($d !== '' && ($host === $d || str_ends_with($host, '.' . $d))) {
                $ok = true;
                break;
            }
        }
        if (!$ok) {
            return ['active' => false, 'reason' => 'domain_not_allowed'];
        }
    }
    $s = row('SELECT * FROM subscriptions WHERE company_id = ?', [$k['company_id']]);
    if (!subscription_is_live($s)) {
        return ['active' => false, 'reason' => 'inactive'];
    }
    $limit = (int) (val('SELECT product_limit FROM plans WHERE company_id = ?', [$k['company_id']]) ?? 0);
    $products = [];
    if ($limit > 0) {
        // Never more products than the plan includes, even if more are switched on.
        $list = rows(
            "SELECT id, type, name, sku, price, description, image_path, options FROM products
              WHERE company_id = ? AND active = 1 ORDER BY sort, created_at LIMIT $limit",
            [$k['company_id']],
        );
        foreach ($list as $p) {
            $products[] = [
                'id' => $p['id'], 'type' => $p['type'], 'name' => $p['name'], 'sku' => $p['sku'],
                'price' => $p['price'], 'description' => $p['description'],
                'image' => app_url() . '/uploads/' . $p['image_path'],
                'options' => json_decode($p['options'], true) ?: new stdClass(),
            ];
        }
    }
    return ['active' => true, 'product_limit' => $limit, 'products' => $products];
}
