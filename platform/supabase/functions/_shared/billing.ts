/**
 * Billing orchestration: the only place that combines OMPAY calls with the
 * database billing engine. It depends on two small interfaces so it can be
 * tested end-to-end against a real Postgres and a fake gateway.
 */
import { Ompay, OmpayError, type InquiryResult } from './ompay.ts';

export interface Rpc {
  rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T>;
}

type Gateway = Pick<Ompay, 'bankHosted' | 'payWithToken' | 'inquiry' | 'reverse' | 'refund'>;

interface ChargeContext {
  invoice_id: string;
  company_id: string;
  number: string;
  total: number;
  currency: string;
  status: string;
  token: string | null;
}

interface PaymentContext {
  id: string;
  company_id: string;
  invoice_id: string | null;
  flow: string;
  amount: number;
  currency: string;
  status: string;
  ompay_transaction_id: string | null;
}

export type Outcome = 'successful' | 'failed' | 'processing' | 'skipped';

function record(
  db: Rpc,
  payment: string,
  status: string,
  extra: {
    transactionId?: string | null;
    token?: string | null;
    brand?: string | null;
    masked?: string | null;
    error?: string | null;
    unconfirmed?: boolean;
  } = {},
) {
  return db.rpc<{ changed: boolean; status?: string; refund_card_check?: boolean }>('billing_record_result', {
    p_payment: payment,
    p_status: status,
    p_transaction_id: extra.transactionId ?? null,
    p_token: extra.token ?? null,
    p_brand: extra.brand ?? null,
    p_masked: extra.masked ?? null,
    p_error: extra.error ?? null,
    p_outcome_unconfirmed: extra.unconfirmed ?? false,
  });
}

/** Charge an invoice to the client's saved card (renewals and retries). */
export async function chargeInvoiceWithSavedCard(
  db: Rpc,
  gw: Gateway,
  invoiceId: string,
  appUrl: string,
): Promise<Outcome> {
  const ctx = await db.rpc<ChargeContext | null>('billing_charge_context', { p_invoice: invoiceId });
  if (!ctx) return 'skipped';
  // The claim is atomic: a second, overlapping run gets null and charges nothing.
  const payment = await db.rpc<string | null>('billing_claim_invoice', { p_invoice: invoiceId, p_flow: 'token' });
  if (!payment) return 'skipped';

  if (!ctx.token) {
    await record(db, payment, 'FAILED', { error: 'No saved card on file.' });
    return 'failed';
  }

  let res;
  try {
    res = await gw.payWithToken({
      amount: Number(ctx.total),
      currency: ctx.currency,
      token: ctx.token,
      returnUrl: `${appUrl}/portal/billing`,
      reference: payment,
    });
  } catch (err) {
    if (err instanceof OmpayError && err.httpStatus >= 400 && err.httpStatus < 500) {
      // OMPAY rejected the request outright; nothing was charged.
      await record(db, payment, 'FAILED', { error: `${err.code}: ${err.message}` });
      return 'failed';
    }
    // Timeout / 5xx: the charge may or may not have gone through. Leave it
    // "processing"; reconciliation resolves it by reference. Never re-charge here.
    return 'processing';
  }

  if (res.otp_required) {
    // The bank wants the cardholder present. An unattended charge cannot do
    // that, so the client has to pay this invoice from their portal.
    await record(db, payment, 'FAILED', {
      transactionId: res.transaction_id,
      error: 'Your bank asked for verification. Please pay this invoice from your dashboard.',
    });
    return 'failed';
  }

  await record(db, payment, res.status, { transactionId: res.transaction_id, error: res.error_message });
  return res.status === 'SUCCESSFUL' ? 'successful' : res.status === 'FAILED' ? 'failed' : 'processing';
}

/** Start a payment on OMPAY's hosted page; returns where to send the client. */
export async function startHostedPayment(
  db: Rpc,
  gw: Gateway,
  payment: string,
  amount: number,
  currency: string,
  appUrl: string,
): Promise<string> {
  let res;
  try {
    res = await gw.bankHosted({
      amount,
      currency,
      returnUrl: `${appUrl}/portal/billing/return?payment=${payment}`,
      reference: payment,
    });
  } catch (err) {
    const msg = err instanceof OmpayError ? `${err.code}: ${err.message}` : 'Payment gateway unavailable.';
    await record(db, payment, 'FAILED', { error: msg });
    throw err;
  }
  await record(db, payment, 'PROCESSING', { transactionId: res.transaction_id });
  if (!res.redirect_url) throw new Error('OMPAY returned no redirect_url');
  return res.redirect_url;
}

/**
 * Ask OMPAY for the authoritative result of a payment and apply it. Safe to
 * call any number of times (from the return page and from the billing run).
 */
export async function settlePayment(db: Rpc, gw: Gateway, paymentId: string): Promise<Outcome> {
  const pay = await db.rpc<PaymentContext | null>('billing_payment_context', { p_payment: paymentId });
  if (!pay) return 'skipped';

  let inq: InquiryResult;
  try {
    inq = await gw.inquiry(
      pay.ompay_transaction_id ? { transactionId: pay.ompay_transaction_id } : { reference: paymentId },
    );
  } catch (err) {
    if (err instanceof OmpayError && err.httpStatus === 404) return 'processing'; // not at OMPAY (yet)
    throw err;
  }

  const result = await record(db, paymentId, inq.status, {
    transactionId: inq.transaction_id,
    token: inq.saved_card?.token ?? inq.token ?? null,
    brand: inq.saved_card?.brand ?? null,
    masked: inq.saved_card?.masked_pan ?? null,
    error: inq.error_message,
    unconfirmed: inq.outcome_unconfirmed === true,
  });

  // The small charge used to verify a new card is given straight back.
  if (result.changed && result.refund_card_check) {
    try {
      await gw.reverse(inq.transaction_id);
    } catch {
      try {
        await gw.refund(inq.transaction_id);
      } catch {
        await db.rpc('notify', {
          p_audience: 'admin',
          p_company: pay.company_id,
          p_kind: 'refund_needed',
          p_title: 'Card-check charge could not be refunded automatically',
          p_body: `Refund transaction ${inq.transaction_id} (${pay.amount} ${pay.currency}) in the OMPAY portal.`,
        });
      }
    }
  }

  return inq.status === 'SUCCESSFUL' ? 'successful' : inq.status === 'FAILED' ? 'failed' : 'processing';
}

export interface RunSummary {
  reconciled: number;
  expired: number;
  renewals: Record<Outcome, number>;
  retries: Record<Outcome, number>;
  suspended: number;
  reminders: number;
  errors: string[];
}

/** The scheduled billing run. Each step is independent; one failure never blocks the rest. */
export async function runBilling(db: Rpc, gw: Gateway, appUrl: string, today?: string): Promise<RunSummary> {
  const tally = (): Record<Outcome, number> => ({ successful: 0, failed: 0, processing: 0, skipped: 0 });
  const out: RunSummary = {
    reconciled: 0, expired: 0, renewals: tally(), retries: tally(), suspended: 0, reminders: 0, errors: [],
  };
  const step = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      out.errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  const dateArg = today ? { p_today: today } : {};

  await step('reconcile', async () => {
    const rows = await db.rpc<{ payment_id: string }[]>('billing_payments_to_reconcile');
    for (const r of rows ?? []) {
      await step(`reconcile ${r.payment_id}`, async () => {
        await settlePayment(db, gw, r.payment_id);
        out.reconciled++;
      });
    }
  });
  await step('expire', async () => {
    out.expired = (await db.rpc<number>('billing_expire_stale')) ?? 0;
  });
  await step('renewals', async () => {
    const rows = await db.rpc<{ invoice_id: string }[]>('billing_prepare_renewals', dateArg);
    for (const r of rows ?? []) {
      await step(`charge ${r.invoice_id}`, async () => {
        out.renewals[await chargeInvoiceWithSavedCard(db, gw, r.invoice_id, appUrl)]++;
      });
    }
  });
  await step('retries', async () => {
    const rows = await db.rpc<{ invoice_id: string }[]>('billing_due_retries');
    for (const r of rows ?? []) {
      await step(`retry ${r.invoice_id}`, async () => {
        out.retries[await chargeInvoiceWithSavedCard(db, gw, r.invoice_id, appUrl)]++;
      });
    }
  });
  await step('suspend', async () => {
    out.suspended = (await db.rpc<number>('billing_suspend_overdue')) ?? 0;
  });
  await step('reminders', async () => {
    out.reminders = (await db.rpc<number>('billing_send_reminders', dateArg)) ?? 0;
  });
  return out;
}
