// VYRO admin actions that need more than a plain table edit.
import { Ompay } from '../_shared/ompay.ts';
import { chargeInvoiceWithSavedCard } from '../_shared/billing.ts';
import {
  APP_URL, handle, HttpError, randomToken, requireAdmin, requireCaller, rpcOf, serviceClient, sha256Hex, str,
} from '../_shared/http.ts';

const num = (v: unknown, name: string, min = 0) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min) throw new HttpError(400, `${name} must be a number of at least ${min}`);
  return n;
};

Deno.serve(
  handle(async (req, body) => {
    const client = serviceClient();
    const db = rpcOf(client);
    const caller = await requireCaller(req, client);
    requireAdmin(caller);

    /** One-time registration link. Only its hash is stored, so the link works once and cannot be recovered. */
    const invite = async (companyId: string, email: string) => {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'A valid client email is required');
      const token = randomToken();
      await db.rpc('invite_create', {
        p_company: companyId, p_email: email, p_token_hash: await sha256Hex(token), p_days: 7, p_by: caller.userId,
      });
      return `${APP_URL}/register?invite=${token}`;
    };

    switch (str(body.action, 40)) {
      case 'create_client': {
        const c = (body.company ?? {}) as Record<string, unknown>;
        const p = (body.plan ?? {}) as Record<string, unknown>;
        const name = str(c.name, 150);
        const email = str(c.contact_email, 200).toLowerCase();
        if (!name) throw new HttpError(400, 'Company name is required');
        const interval = str(p.billing_interval, 10) === 'annual' ? 'annual' : 'monthly';
        const domains = (Array.isArray(body.allowed_domains) ? body.allowed_domains : [])
          .map((d) => str(d, 200).toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
          .filter(Boolean);
        const companyId = await db.rpc<string>('billing_create_client', {
          p_company: {
            name, store_name: str(c.store_name, 150), website: str(c.website, 200),
            contact_name: str(c.contact_name, 150), contact_email: email,
            contact_phone: str(c.contact_phone, 40), notes: str(c.notes, 2000),
          },
          p_plan: {
            name: str(p.name, 80) || 'VYRO',
            setup_fee: num(p.setup_fee ?? 0, 'Setup fee'),
            recurring_fee: num(p.recurring_fee, 'Subscription fee'),
            billing_interval: interval,
            product_limit: Math.floor(num(p.product_limit ?? 0, 'Product limit')),
            billing_start_date: str(p.billing_start_date, 10) || null,
            contract_months: p.contract_months ? Math.floor(num(p.contract_months, 'Contract months', 1)) : null,
            cancellation_terms: str(p.cancellation_terms, 2000) || null,
          },
          p_allowed_domains: domains,
        });
        return { company_id: companyId, invite_url: email ? await invite(companyId, email) : null };
      }

      case 'create_invite':
        return { invite_url: await invite(str(body.company_id, 40), str(body.email, 200).toLowerCase()) };

      // No setup fee, or it was settled another way: start the service now.
      case 'activate':
        await db.rpc('billing_activate', { p_company: str(body.company_id, 40) });
        return { ok: true };

      case 'mark_paid_offline':
        await db.rpc('billing_offline_paid', { p_invoice: str(body.invoice_id, 40), p_note: str(body.note, 300) || null })
          .catch(() => {
            throw new HttpError(409, 'This invoice cannot be marked as paid');
          });
        return { ok: true };

      case 'charge_now':
        return {
          outcome: await chargeInvoiceWithSavedCard(db, Ompay.fromEnv(), str(body.invoice_id, 40), APP_URL),
        };

      default:
        throw new HttpError(400, 'Unknown action');
    }
  }),
);
