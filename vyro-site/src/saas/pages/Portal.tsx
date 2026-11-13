import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  callFn, CARD_COLUMNS, COMPANY_COLUMNS, day, isLive, logoUrl, money, supabase,
  type Company, type Invoice, type Notice, type PaymentMethod, type Plan, type Subscription,
} from '../api';
import { useAuth } from '../auth';
import { Card, CopyBox, ErrorNote, Field, InvoiceBadge, Shell, StatusBadge, useAction } from '../ui';

interface PortalData {
  company: Company;
  plan: Plan | null;
  sub: Subscription | null;
  invoices: Invoice[];
  card: PaymentMethod | null;
  notices: Notice[];
  widgetKey: string | null;
}

async function loadPortal(companyId: string): Promise<PortalData> {
  const [company, plan, sub, invoices, card, notices, key] = await Promise.all([
    supabase.from('companies').select(COMPANY_COLUMNS).eq('id', companyId).single(),
    supabase.from('plans').select('*').eq('company_id', companyId).eq('active', true).maybeSingle(),
    supabase.from('subscriptions').select('*').eq('company_id', companyId).maybeSingle(),
    supabase
      .from('invoices')
      .select('*, invoice_items(id, description, amount)')
      .eq('company_id', companyId)
      .neq('status', 'void')
      .order('created_at', { ascending: false }),
    supabase.from('payment_methods').select(CARD_COLUMNS).eq('company_id', companyId).eq('is_default', true).is('revoked_at', null).maybeSingle(),
    supabase.from('notifications').select('*').eq('audience', 'client').order('created_at', { ascending: false }).limit(8),
    supabase.from('widget_keys').select('public_key').eq('company_id', companyId).maybeSingle(),
  ]);
  if (company.error) throw new Error('Could not load your account.');
  return {
    company: company.data as Company,
    plan: plan.data as Plan | null,
    sub: sub.data as Subscription | null,
    invoices: (invoices.data ?? []) as Invoice[],
    card: card.data as PaymentMethod | null,
    notices: (notices.data ?? []) as Notice[],
    widgetKey: (key.data as { public_key: string } | null)?.public_key ?? null,
  };
}

export function Portal() {
  const { profile } = useAuth();
  const [data, setData] = useState<PortalData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openInvoice, setOpenInvoice] = useState<string | null>(null);
  const { busy, error, run } = useAction();

  const reload = useCallback(() => {
    if (!profile?.company_id) return;
    loadPortal(profile.company_id).then(setData).catch((e: Error) => setLoadError(e.message));
  }, [profile?.company_id]);
  useEffect(reload, [reload]);

  if (loadError) return <div className="sa sa-center">{loadError}</div>;
  if (!data) return <div className="sa sa-center">Loading…</div>;
  const { company, plan, sub, invoices, card, notices, widgetKey } = data;
  const live = isLive(sub);
  const due = invoices.filter((i) => i.status === 'open' || i.status === 'failed');
  const cur = plan?.currency ?? 'OMR';

  const redirect = (action: string, extra: Record<string, unknown> = {}) =>
    run(async () => {
      const res = await callFn<{ redirect_url: string }>('client-billing', { action, ...extra });
      window.location.assign(res.redirect_url); // OMPAY's secure payment page
    });

  const cancel = () => {
    const until = sub?.current_period_end ? ` VYRO keeps working until ${day(sub.current_period_end)}.` : '';
    if (!window.confirm(`Cancel your subscription?${until}`)) return;
    void run(async () => {
      await callFn('client-billing', { action: 'cancel' });
      reload();
    });
  };
  const resume = () =>
    void run(async () => {
      await callFn('client-billing', { action: 'resume' });
      reload();
    });

  return (
    <Shell title="Client dashboard">
      <div className="sa-hero">
        {logoUrl(company.logo_path) ? (
          <img className="sa-logo" src={logoUrl(company.logo_path)!} alt="" />
        ) : (
          <div className="sa-logo sa-logo--empty">{company.name.slice(0, 1)}</div>
        )}
        <div>
          <h1>{company.store_name || company.name}</h1>
          {sub && <StatusBadge status={sub.status} />}{' '}
          <span className={`sa-badge sa-badge--${live ? 'good' : 'off'}`}>
            VYRO is {live ? 'ON' : 'OFF'} on your website
          </span>
        </div>
      </div>

      <ErrorNote message={error} />

      {due.length > 0 && (
        <div className="sa-alert">
          <div>
            <strong>
              {due.length === 1 ? `Invoice ${due[0].number} is due` : `${due.length} invoices are due`}:{' '}
              {money(due.reduce((s, i) => s + Number(i.total), 0), cur)}
            </strong>
            {sub?.status === 'past_due' && sub.grace_until && (
              <p>Pay before {day(sub.grace_until)} to keep VYRO running on your website.</p>
            )}
            {sub?.status === 'pending_setup' && <p>Pay the setup fee to get started. Your card is saved for the monthly payments.</p>}
          </div>
          <button className="sa-btn" disabled={busy} onClick={() => void redirect('pay_invoice', { invoice_id: due[due.length - 1].id })}>
            Pay now
          </button>
        </div>
      )}

      <div className="sa-cols">
        <Card title="Your plan">
          {plan ? (
            <dl className="sa-dl">
              <dt>Plan</dt>
              <dd>{plan.name}</dd>
              <dt>{plan.billing_interval === 'annual' ? 'Yearly fee' : 'Monthly fee'}</dt>
              <dd>{money(plan.recurring_fee, cur)}</dd>
              <dt>One-time setup fee</dt>
              <dd>
                {money(plan.setup_fee, cur)} {sub?.setup_paid_at ? <em>(paid {day(sub.setup_paid_at)})</em> : null}
              </dd>
              <dt>Products included</dt>
              <dd>{plan.product_limit}</dd>
              <dt>{sub?.cancel_at_period_end ? 'Service ends' : 'Next payment'}</dt>
              <dd>{day(sub?.cancel_at_period_end ? sub.current_period_end : sub?.next_billing_date)}</dd>
              {plan.contract_months && (
                <>
                  <dt>Contract</dt>
                  <dd>
                    {plan.contract_months} months{sub?.contract_end ? `, until ${day(sub.contract_end)}` : ''}
                  </dd>
                </>
              )}
              {plan.cancellation_terms && (
                <>
                  <dt>Cancellation</dt>
                  <dd>{plan.cancellation_terms}</dd>
                </>
              )}
            </dl>
          ) : (
            <p className="sa-muted">Your plan is being prepared.</p>
          )}
          <div className="sa-actions">
            {sub?.status === 'cancel_scheduled' && (
              <button className="sa-btn sa-btn--ghost" disabled={busy} onClick={resume}>
                Keep my subscription
              </button>
            )}
            {(sub?.status === 'active' || sub?.status === 'past_due') && (
              <button className="sa-btn sa-btn--danger" disabled={busy} onClick={cancel}>
                Cancel subscription
              </button>
            )}
          </div>
        </Card>

        <Card title="Payment method">
          {card ? (
            <p className="sa-cardline">
              <strong>{card.brand ?? 'Card'}</strong> {card.masked_pan}
            </p>
          ) : (
            <p className="sa-muted">No card saved yet. It is saved when you make your first payment.</p>
          )}
          <p className="sa-muted">
            Cards are entered on OMPAY's secure page. VYRO never sees or stores your card number.
            {card && ' Updating your card makes a small check charge that is refunded straight away.'}
          </p>
          {card && (
            <div className="sa-actions">
              <button className="sa-btn sa-btn--ghost" disabled={busy} onClick={() => void redirect('update_card')}>
                Update card
              </button>
            </div>
          )}
        </Card>
      </div>

      <Card title="Invoices and payments">
        {invoices.length === 0 ? (
          <p className="sa-muted">No invoices yet.</p>
        ) : (
          <table className="sa-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>For</th>
                <th>Amount</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <InvoiceRow
                  key={inv.id}
                  inv={inv}
                  open={openInvoice === inv.id}
                  onToggle={() => setOpenInvoice(openInvoice === inv.id ? null : inv.id)}
                  onPay={() => void redirect('pay_invoice', { invoice_id: inv.id })}
                  busy={busy}
                />
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div className="sa-cols">
        <CompanyForm company={company} onSaved={reload} />
        <div>
          {widgetKey && (
            <Card title="Install VYRO on your website">
              <p className="sa-muted">Add this line once, just before &lt;/body&gt;. It switches on and off with your subscription.</p>
              <CopyBox value={`<script src="${window.location.origin}/vyro.js" data-key="${widgetKey}" async></script>`} />
            </Card>
          )}
          <Card title="Notifications">
            {notices.length === 0 ? (
              <p className="sa-muted">Nothing yet.</p>
            ) : (
              <ul className="sa-feed">
                {notices.map((n) => (
                  <li key={n.id}>
                    <strong>{n.title}</strong>
                    {n.body && <span>{n.body}</span>}
                    <time>{day(n.created_at)}</time>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </Shell>
  );
}

function InvoiceRow({
  inv, open, onToggle, onPay, busy,
}: {
  inv: Invoice;
  open: boolean;
  onToggle: () => void;
  onPay: () => void;
  busy: boolean;
}) {
  const label =
    inv.kind === 'setup'
      ? 'Setup fee'
      : inv.period_start
        ? `${day(inv.period_start)} – ${day(inv.period_end)}`
        : 'Charge';
  return (
    <>
      <tr>
        <td>
          <button className="sa-link" onClick={onToggle}>
            {inv.number}
          </button>
          <div className="sa-sub">{day(inv.created_at)}</div>
        </td>
        <td>{label}</td>
        <td>{money(inv.total, inv.currency)}</td>
        <td>
          <InvoiceBadge status={inv.status} />
          {inv.paid_at && <div className="sa-sub">{day(inv.paid_at)}</div>}
        </td>
        <td className="sa-right">
          {(inv.status === 'open' || inv.status === 'failed') && (
            <button className="sa-btn sa-btn--small" disabled={busy} onClick={onPay}>
              Pay
            </button>
          )}
        </td>
      </tr>
      {open && (
        <tr className="sa-detail">
          <td colSpan={5}>
            {(inv.invoice_items ?? []).map((it) => (
              <div key={it.id} className="sa-line">
                <span>{it.description}</span>
                <span>{money(it.amount, inv.currency)}</span>
              </div>
            ))}
            <div className="sa-line sa-line--total">
              <span>Total</span>
              <span>{money(inv.total, inv.currency)}</span>
            </div>
            <button className="sa-link" onClick={() => window.print()}>
              Print
            </button>
          </td>
        </tr>
      )}
    </>
  );
}

function CompanyForm({ company, onSaved }: { company: Company; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: company.name,
    store_name: company.store_name ?? '',
    website: company.website ?? '',
    contact_name: company.contact_name ?? '',
    contact_email: company.contact_email ?? '',
    contact_phone: company.contact_phone ?? '',
    address: company.address ?? '',
  });
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAction();
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => {
    setSaved(false);
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { error: err } = await supabase.from('companies').update(form).eq('id', company.id);
      if (err) throw new Error('Could not save. Please try again.');
      setSaved(true);
      onSaved();
    });
  };

  const upload = (file: File | undefined) => {
    if (!file) return;
    void run(async () => {
      if (file.size > 1024 * 1024) throw new Error('The logo must be smaller than 1 MB.');
      const ext = (file.name.split('.').pop() ?? 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
      const path = `${company.id}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('logos').upload(path, file, { upsert: true });
      if (upErr) throw new Error('Could not upload the logo. Use a PNG, JPG or WebP file.');
      await supabase.from('companies').update({ logo_path: path }).eq('id', company.id);
      onSaved();
    });
  };

  return (
    <Card title="Company details">
      <form onSubmit={save}>
        <div className="sa-grid2">
          <Field label="Company name">
            <input value={form.name} onChange={set('name')} required />
          </Field>
          <Field label="Store name">
            <input value={form.store_name} onChange={set('store_name')} />
          </Field>
          <Field label="Website">
            <input value={form.website} onChange={set('website')} />
          </Field>
          <Field label="Contact name">
            <input value={form.contact_name} onChange={set('contact_name')} />
          </Field>
          <Field label="Contact email">
            <input type="email" value={form.contact_email} onChange={set('contact_email')} />
          </Field>
          <Field label="Phone">
            <input value={form.contact_phone} onChange={set('contact_phone')} />
          </Field>
        </div>
        <Field label="Address">
          <input value={form.address} onChange={set('address')} />
        </Field>
        <Field label="Logo" hint="PNG, JPG or WebP, up to 1 MB">
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => upload(e.target.files?.[0])} />
        </Field>
        <ErrorNote message={error} />
        <div className="sa-actions">
          <button className="sa-btn" disabled={busy}>
            Save
          </button>
          {saved && <span className="sa-ok">Saved</span>}
        </div>
      </form>
    </Card>
  );
}

/** Where OMPAY sends the client back. The result is confirmed server-side, never read from the URL. */
export function BillingReturn() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const payment = params.get('payment') ?? '';
  const [state, setState] = useState<'checking' | 'successful' | 'failed' | 'processing'>('checking');

  useEffect(() => {
    let stop = false;
    let tries = 0;
    const check = async () => {
      try {
        const { status } = await callFn<{ status: 'successful' | 'failed' | 'processing' | 'skipped' }>(
          'client-billing', { action: 'confirm', payment_id: payment },
        );
        if (stop) return;
        if (status === 'successful' || status === 'failed') return setState(status);
      } catch {
        // keep trying; the billing run also reconciles in the background
      }
      if (stop) return;
      if (++tries < 10) setTimeout(() => void check(), 3000);
      else setState('processing');
    };
    void check();
    return () => {
      stop = true;
    };
  }, [payment]);

  const text = {
    checking: 'Confirming your payment with the bank…',
    successful: 'Payment received. Thank you!',
    failed: 'The payment did not go through. No money was taken. You can try again from your dashboard.',
    processing: 'The bank is still processing this payment. Your dashboard will update as soon as it is confirmed.',
  }[state];

  return (
    <div className="sa sa-auth">
      <div className="sa-card sa-auth__card">
        <h1>VYRO</h1>
        <p className={state === 'failed' ? 'sa-error' : state === 'successful' ? 'sa-ok' : 'sa-muted'}>{text}</p>
        {state !== 'checking' && (
          <button className="sa-btn" onClick={() => navigate('/portal')}>
            Back to dashboard
          </button>
        )}
        {state === 'checking' && <Link className="sa-link" to="/portal">Back to dashboard</Link>}
      </div>
    </div>
  );
}
