// End-to-end billing flow against a real Postgres (migrations applied) and a
// fake OMPAY. Run with tests/run_flow_tests.sh.
import postgres from 'npm:postgres@3';
import { OmpayError, type InquiryResult, type StartResult } from '../supabase/functions/_shared/ompay.ts';
import {
  chargeInvoiceWithSavedCard, runBilling, settlePayment, startHostedPayment, type Rpc,
} from '../supabase/functions/_shared/billing.ts';

const sql = postgres({
  host: Deno.env.get('PGTCPHOST') ?? '127.0.0.1', port: Number(Deno.env.get('PGPORT') ?? 5433),
  user: Deno.env.get('PGUSER') ?? 'postgres', database: 'vyro_test', onnotice: () => {},
});

/** Calls public.<fn>(named args) exactly like PostgREST's rpc does. */
const db: Rpc = {
  async rpc<T>(fn: string, args: Record<string, unknown> = {}) {
    const keys = Object.keys(args);
    const argList = keys.map((k, i) => `${k} => $${i + 1}`).join(', ');
    const vals = keys.map((k) => args[k]);
    const setReturning = ['billing_prepare_renewals', 'billing_due_retries', 'billing_payments_to_reconcile'];
    if (setReturning.includes(fn)) {
      // deno-lint-ignore no-explicit-any
      return (await sql.unsafe(`select * from public.${fn}(${argList})`, vals as any)) as T;
    }
    // deno-lint-ignore no-explicit-any
    const rows = await sql.unsafe(`select public.${fn}(${argList}) as r`, vals as any);
    return rows[0]?.r as T;
  },
};

class FakeOmpay {
  tx = new Map<string, InquiryResult & { reference: string }>();
  tokenCharges: { amount: number; reference: string }[] = [];
  reversed: string[] = [];
  mode: 'ok' | 'decline' | 'timeout' | 'otp' = 'ok';
  private n = 0;

  bankHosted(p: { amount: number; reference: string }): Promise<StartResult> {
    const id = `tx${++this.n}`;
    this.tx.set(id, { transaction_id: id, reference: p.reference, status: 'PROCESSING', amount: p.amount });
    return Promise.resolve({ transaction_id: id, status: 'PROCESSING', redirect_url: `https://ompay.test/pay/${id}` });
  }
  /** The customer finished (or failed) on OMPAY's page. */
  completeHosted(id: string, ok: boolean, token?: string) {
    const t = this.tx.get(id)!;
    t.status = ok ? 'SUCCESSFUL' : 'FAILED';
    if (!ok) t.error_message = 'Declined';
    if (ok && token) t.saved_card = { token, brand: 'VISA', masked_pan: '464156******3343' };
  }
  payWithToken(p: { amount: number; reference: string }): Promise<StartResult> {
    this.tokenCharges.push({ amount: p.amount, reference: p.reference });
    const id = `tx${++this.n}`;
    if (this.mode === 'timeout') {
      // The charge reached OMPAY and succeeded, but we never got the answer.
      this.tx.set(id, { transaction_id: id, reference: p.reference, status: 'SUCCESSFUL' });
      return Promise.reject(new OmpayError('HTTP_504', 'timeout', 504));
    }
    if (this.mode === 'otp') {
      this.tx.set(id, { transaction_id: id, reference: p.reference, status: 'PROCESSING' });
      return Promise.resolve({ transaction_id: id, status: 'PROCESSING', otp_required: true, redirect_url: 'x' });
    }
    const status = this.mode === 'ok' ? 'SUCCESSFUL' : 'FAILED';
    this.tx.set(id, { transaction_id: id, reference: p.reference, status });
    return Promise.resolve({ transaction_id: id, status, error_message: status === 'FAILED' ? 'Insufficient funds' : null });
  }
  inquiry(p: { transactionId?: string; reference?: string }): Promise<InquiryResult> {
    const t = p.transactionId
      ? this.tx.get(p.transactionId)
      : [...this.tx.values()].find((x) => x.reference === p.reference);
    return t ? Promise.resolve(t) : Promise.reject(new OmpayError('TRANSACTION_NOT_FOUND', 'nf', 404));
  }
  reverse(id: string) {
    this.reversed.push(id);
    return Promise.resolve({});
  }
  refund() {
    return Promise.resolve({ refund_status: 'SUCCESSFUL' });
  }
}

function eq<T>(a: T, b: T, msg: string) {
  if (a !== b) throw new Error(`${msg}: expected ${b}, got ${a}`);
}
const sub = async (c: string) => (await sql`select * from public.subscriptions where company_id = ${c}`)[0];
const iso = (d: Date) => d.toISOString().slice(0, 10);

Deno.test({
  name: 'setup payment saves the card, renewals charge it, failures recover',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const gw = new FakeOmpay();
    const company = await db.rpc<string>('billing_create_client', {
      p_company: { name: 'Flow Jewels', contact_email: 'owner@flow.om' },
      p_plan: { setup_fee: 150, recurring_fee: 20, product_limit: 40 },
      p_allowed_domains: ['flow.om'],
    });
    const [setup] = await sql`select id, total from public.invoices where company_id = ${company}`;

    // --- client pays the setup fee on OMPAY's hosted page
    const pay1 = await db.rpc<string>('billing_claim_invoice', { p_invoice: setup.id, p_flow: 'hosted' });
    const url = await startHostedPayment(db, gw, pay1, 150, 'OMR', 'https://app.test');
    eq(url.startsWith('https://ompay.test/pay/'), true, 'redirect to OMPAY');
    eq(await settlePayment(db, gw, pay1), 'processing', 'not paid until OMPAY says so');
    eq((await sub(company)).status, 'pending_setup', 'still pending');
    gw.completeHosted('tx1', true, 'tok_flow');
    eq(await settlePayment(db, gw, pay1), 'successful', 'paid');
    eq(await settlePayment(db, gw, pay1), 'successful', 'settling twice is harmless');
    eq((await sub(company)).status, 'active', 'activated');
    eq((await sql`select count(*)::int n from public.payment_methods where company_id = ${company}`)[0].n, 1, 'one saved card');

    // --- month 1: 20 + 8 extra, charged automatically to the saved card
    await sql`insert into public.extra_charges (company_id, description, amount) values (${company}, '10 extra products', 8)`;
    let run = await runBilling(db, gw, 'https://app.test');
    eq(run.errors.length, 0, `no errors ${run.errors}`);
    eq(run.renewals.successful, 1, 'renewal charged');
    eq(gw.tokenCharges.at(-1)!.amount, 28, 'charged 28');
    run = await runBilling(db, gw, 'https://app.test');
    eq(run.renewals.successful + run.renewals.failed, 0, 'second run the same day charges nothing');
    eq(gw.tokenCharges.length, 1, 'exactly one charge');

    // --- month 2: back to 20, but the card is declined
    const next = iso((await sub(company)).next_billing_date);
    gw.mode = 'decline';
    run = await runBilling(db, gw, 'https://app.test', next);
    eq(run.renewals.failed, 1, 'declined');
    eq(gw.tokenCharges.at(-1)!.amount, 20, 'charged 20');
    eq((await sub(company)).status, 'past_due', 'grace period');
    eq((await sql`select public.widget_status(k.public_key, 'flow.om')->>'active' a from public.widget_keys k where company_id = ${company}`)[0].a, 'true', 'widget stays on in grace');
    run = await runBilling(db, gw, 'https://app.test', next);
    eq(gw.tokenCharges.length, 2, 'no second attempt on the same day');

    // --- next day: retry succeeds
    await sql`update public.invoices set last_attempt_at = now() - interval '1 day' where company_id = ${company} and status = 'failed'`;
    gw.mode = 'ok';
    run = await runBilling(db, gw, 'https://app.test', next);
    eq(run.retries.successful, 1, 'retry paid');
    eq((await sub(company)).status, 'active', 'active again');

    // --- month 3: OMPAY times out but actually charged -> no double charge
    const m3 = iso((await sub(company)).next_billing_date);
    gw.mode = 'timeout';
    run = await runBilling(db, gw, 'https://app.test', m3);
    eq(run.renewals.processing, 1, 'outcome unknown');
    const before = gw.tokenCharges.length;
    await sql`update public.payments set created_at = now() - interval '5 minutes' where status = 'processing'`;
    gw.mode = 'ok';
    run = await runBilling(db, gw, 'https://app.test', m3);
    eq(run.reconciled >= 1, true, 'reconciled by reference');
    eq(gw.tokenCharges.length, before, 'not charged a second time');
    eq((await sql`select status from public.invoices where company_id = ${company} order by created_at desc limit 1`)[0].status, 'paid', 'invoice paid');

    // --- month 4: bank demands OTP -> failed, client pays from the portal
    const m4 = iso((await sub(company)).next_billing_date);
    gw.mode = 'otp';
    run = await runBilling(db, gw, 'https://app.test', m4);
    eq(run.renewals.failed, 1, 'otp cannot be done unattended');
    const [open] = await sql`select id, total from public.invoices where company_id = ${company} and status = 'failed'`;
    const pay2 = await db.rpc<string>('billing_claim_invoice', { p_invoice: open.id, p_flow: 'hosted' });
    await startHostedPayment(db, gw, pay2, Number(open.total), 'OMR', 'https://app.test');
    const hostedId = [...gw.tx.values()].find((t) => t.reference === pay2)!.transaction_id;
    gw.completeHosted(hostedId, true, 'tok_flow_new');
    eq(await settlePayment(db, gw, pay2), 'successful', 'paid from portal');
    eq((await sub(company)).status, 'active', 'active');
    eq((await sql`select ompay_token t from public.payment_methods where company_id = ${company} and is_default`)[0].t, 'tok_flow_new', 'new card saved as default');

    // --- update card: small check charge is reversed
    const cc = await db.rpc<string>('billing_start_card_check', { p_company: company });
    await startHostedPayment(db, gw, cc, 0.1, 'OMR', 'https://app.test');
    const ccTx = [...gw.tx.values()].find((t) => t.reference === cc)!.transaction_id;
    gw.completeHosted(ccTx, true, 'tok_flow_3');
    await settlePayment(db, gw, cc);
    eq(gw.reversed.includes(ccTx), true, 'card check reversed');
    await settlePayment(db, gw, cc);
    eq(gw.reversed.length, 1, 'reversed once only');

    // --- never paid: suspended, widget off
    const m5 = iso((await sub(company)).next_billing_date);
    gw.mode = 'decline';
    await runBilling(db, gw, 'https://app.test', m5);
    await sql`update public.subscriptions set grace_until = now() - interval '1 minute' where company_id = ${company}`;
    run = await runBilling(db, gw, 'https://app.test', m5);
    eq(run.suspended, 1, 'suspended');
    eq((await sql`select public.widget_status(k.public_key, 'flow.om')->>'active' a from public.widget_keys k where company_id = ${company}`)[0].a, 'false', 'widget off');

    // --- two overlapping runs cannot charge the same invoice twice
    const c2 = await db.rpc<string>('billing_create_client', { p_company: { name: 'Race' }, p_plan: { recurring_fee: 10 } });
    await db.rpc('billing_activate', { p_company: c2 });
    await sql`insert into public.payment_methods (company_id, ompay_token) values (${c2}, 'tok_race')`;
    const due = await db.rpc<{ invoice_id: string }[]>('billing_prepare_renewals', {});
    const inv = due.find(() => true)!.invoice_id;
    gw.mode = 'ok';
    const n0 = gw.tokenCharges.length;
    const results = await Promise.all([1, 2, 3].map(() => chargeInvoiceWithSavedCard(db, gw, inv, 'https://app.test')));
    eq(results.filter((r) => r === 'successful').length, 1, 'one winner');
    eq(gw.tokenCharges.length - n0, 1, 'one charge');

    await sql.end();
  },
});
