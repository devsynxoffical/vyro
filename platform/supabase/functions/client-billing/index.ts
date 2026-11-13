// Client portal actions that move money or change the subscription.
// Every action is checked against the caller's own company.
import { Ompay } from '../_shared/ompay.ts';
import { settlePayment, startHostedPayment } from '../_shared/billing.ts';
import { APP_URL, handle, HttpError, requireCaller, rpcOf, serviceClient, str } from '../_shared/http.ts';

Deno.serve(
  handle(async (req, body) => {
    const client = serviceClient();
    const db = rpcOf(client);
    const caller = await requireCaller(req, client);
    const action = str(body.action, 40);

    // Admins may act for a client (e.g. while on the phone with them).
    const companyId = caller.role === 'admin' ? str(body.company_id, 40) || null : caller.companyId;
    if (!companyId) throw new HttpError(400, 'No company');

    switch (action) {
      case 'pay_invoice': {
        const invoiceId = str(body.invoice_id, 40);
        const { data: inv } = await client
          .from('invoices')
          .select('id, company_id, total, currency, status')
          .eq('id', invoiceId)
          .maybeSingle();
        if (!inv || inv.company_id !== companyId) throw new HttpError(404, 'Invoice not found');
        if (inv.status === 'paid') throw new HttpError(409, 'This invoice is already paid');
        if (inv.status === 'processing') {
          // A checkout was started earlier (maybe abandoned). Ask OMPAY what
          // became of it before allowing another one, so nobody pays twice.
          const { data: open } = await client
            .from('payments').select('id').eq('invoice_id', invoiceId).eq('status', 'processing')
            .order('created_at', { ascending: false }).limit(1).maybeSingle();
          const outcome = open ? await settlePayment(db, Ompay.fromEnv(), open.id) : 'processing';
          if (outcome === 'successful') throw new HttpError(409, 'This invoice is already paid');
          if (outcome !== 'failed') {
            throw new HttpError(409, 'A payment for this invoice is still in progress. Please try again in a few minutes.');
          }
        }
        const payment = await db.rpc<string | null>('billing_claim_invoice', { p_invoice: invoiceId, p_flow: 'hosted' });
        if (!payment) throw new HttpError(409, 'This invoice cannot be paid right now');
        const url = await startHostedPayment(db, Ompay.fromEnv(), payment, Number(inv.total), inv.currency, APP_URL)
          .catch(() => {
            throw new HttpError(502, 'The payment page could not be opened. Please try again.');
          });
        return { redirect_url: url, payment_id: payment };
      }

      case 'update_card': {
        const { data: settings } = await client.from('app_settings').select('card_check_amount').single();
        const payment = await db.rpc<string>('billing_start_card_check', { p_company: companyId });
        const url = await startHostedPayment(
          db, Ompay.fromEnv(), payment, Number(settings?.card_check_amount ?? 0.1), 'OMR', APP_URL,
        ).catch(() => {
          throw new HttpError(502, 'The card page could not be opened. Please try again.');
        });
        return { redirect_url: url, payment_id: payment };
      }

      case 'confirm': {
        const paymentId = str(body.payment_id, 40);
        const { data: pay } = await client.from('payments').select('company_id').eq('id', paymentId).maybeSingle();
        if (!pay || pay.company_id !== companyId) throw new HttpError(404, 'Payment not found');
        return { status: await settlePayment(db, Ompay.fromEnv(), paymentId) };
      }

      case 'cancel':
      case 'resume':
        return {
          status: await db.rpc<string>('billing_set_cancellation', {
            p_company: companyId,
            p_cancel: action === 'cancel',
          }),
        };

      default:
        throw new HttpError(400, 'Unknown action');
    }
  }),
);
