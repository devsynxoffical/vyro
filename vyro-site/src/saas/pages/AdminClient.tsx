import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import {
  callFn, CARD_COLUMNS, COMPANY_COLUMNS, day, isLive, logoUrl, money, supabase,
  type Company, type ExtraCharge, type Invoice, type PaymentMethod, type Plan, type Subscription,
} from '../api';
import { Card, CopyBox, ErrorNote, Field, InvoiceBadge, Shell, StatusBadge, useAction } from '../ui';
import { adminNav } from './AdminHome';

interface Data {
  company: Company;
  notes: string;
  plan: Plan | null;
  sub: Subscription | null;
  invoices: Invoice[];
  extras: ExtraCharge[];
  card: PaymentMethod | null;
  key: { public_key: string; allowed_domains: string[] } | null;
  registered: boolean;
}

async function load(id: string): Promise<Data> {
  const [company, notes, plan, sub, invoices, extras, card, key, users] = await Promise.all([
    supabase.from('companies').select(COMPANY_COLUMNS).eq('id', id).single(),
    supabase.rpc('company_notes', { p_company: id }),
    supabase.from('plans').select('*').eq('company_id', id).eq('active', true).maybeSingle(),
    supabase.from('subscriptions').select('*').eq('company_id', id).maybeSingle(),
    supabase.from('invoices').select('*, invoice_items(id, description, amount)').eq('company_id', id).order('created_at', { ascending: false }),
    supabase.from('extra_charges').select('*').eq('company_id', id).order('created_at', { ascending: false }),
    supabase.from('payment_methods').select(CARD_COLUMNS).eq('company_id', id).eq('is_default', true).is('revoked_at', null).maybeSingle(),
    supabase.from('widget_keys').select('public_key, allowed_domains').eq('company_id', id).maybeSingle(),
    supabase.from('profiles').select('id').eq('company_id', id).limit(1),
  ]);
  if (company.error) throw new Error('Client not found.');
  return {
    company: company.data as Company,
    notes: (notes.data as string | null) ?? '',
    plan: plan.data as Plan | null,
    sub: sub.data as Subscription | null,
    invoices: (invoices.data ?? []) as Invoice[],
    extras: (extras.data ?? []) as ExtraCharge[],
    card: card.data as PaymentMethod | null,
    key: key.data as Data['key'],
    registered: (users.data ?? []).length > 0,
  };
}

export function AdminClient() {
  const { id = '' } = useParams();
  const [d, setD] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [invite, setInvite] = useState<string | null>(null);
  const { busy, error, run } = useAction();

  const reload = useCallback(() => {
    load(id).then(setD).catch((e: Error) => setLoadError(e.message));
  }, [id]);
  useEffect(reload, [reload]);

  if (loadError) return <div className="sa sa-center">{loadError}</div>;
  if (!d) return <div className="sa sa-center">Loading…</div>;
  const { company, plan, sub, invoices, extras, card, key } = d;
  const cur = plan?.currency ?? 'OMR';
  const live = isLive(sub);

  const act = (fn: () => PromiseLike<unknown>) =>
    void run(async () => {
      const res = (await fn()) as { error?: { message: string } | null } | undefined;
      if (res && typeof res === 'object' && 'error' in res && res.error) throw new Error(res.error.message);
      reload();
    });

  const setOverride = (v: 'force_on' | 'force_off' | null) =>
    act(() => supabase.from('subscriptions').update({ widget_override: v }).eq('company_id', id));

  return (
    <Shell title="Admin" nav={adminNav}>
      <div className="sa-hero">
        {logoUrl(company.logo_path) ? <img className="sa-logo" src={logoUrl(company.logo_path)!} alt="" /> : <div className="sa-logo sa-logo--empty">{company.name.slice(0, 1)}</div>}
        <div>
          <h1>{company.name}</h1>
          {sub && <StatusBadge status={sub.status} />}{' '}
          <span className={`sa-badge sa-badge--${live ? 'good' : 'off'}`}>VYRO is {live ? 'ON' : 'OFF'}</span>
          <div className="sa-sub">
            {[company.contact_name, company.contact_email, company.contact_phone, company.website].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>
      <ErrorNote message={error} />

      <div className="sa-cols">
        <div>
          <Card title="VYRO on their website">
            <p className="sa-muted">
              {sub?.widget_override === 'force_on' && 'Forced ON by you, whatever the payment status.'}
              {sub?.widget_override === 'force_off' && 'Forced OFF by you, whatever the payment status.'}
              {!sub?.widget_override && 'Automatic: follows the subscription and payments.'}
            </p>
            <div className="sa-actions">
              <button className="sa-btn sa-btn--small" disabled={busy || !sub?.widget_override} onClick={() => setOverride(null)}>Automatic</button>
              <button className="sa-btn sa-btn--small sa-btn--ghost" disabled={busy || sub?.widget_override === 'force_on'} onClick={() => setOverride('force_on')}>Force on</button>
              <button className="sa-btn sa-btn--small sa-btn--danger" disabled={busy || sub?.widget_override === 'force_off'} onClick={() => setOverride('force_off')}>Force off</button>
            </div>
            {sub?.status === 'pending_setup' && (
              <div className="sa-actions">
                <button
                  className="sa-btn sa-btn--ghost"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm('Start the subscription now without an online setup payment?')) {
                      act(() => callFn('admin-clients', { action: 'activate', company_id: id }));
                    }
                  }}
                >
                  Activate without setup payment
                </button>
              </div>
            )}
            <dl className="sa-dl">
              <dt>Paid until</dt><dd>{day(sub?.current_period_end)}</dd>
              <dt>Next payment</dt><dd>{day(sub?.next_billing_date)}</dd>
              {sub?.grace_until && sub.status === 'past_due' && (<><dt>Grace period ends</dt><dd>{day(sub.grace_until)}</dd></>)}
              {sub?.contract_end && (<><dt>Contract ends</dt><dd>{day(sub.contract_end)}</dd></>)}
              <dt>Saved card</dt><dd>{card ? `${card.brand ?? 'Card'} ${card.masked_pan ?? ''}` : 'None'}</dd>
            </dl>
          </Card>

          {key && <WidgetCard companyId={id} publicKey={key.public_key} domains={key.allowed_domains} onSaved={reload} />}

          <Card title="Client login">
            <p className="sa-muted">{d.registered ? 'The client has registered.' : 'The client has not registered yet.'}</p>
            <div className="sa-actions">
              <button
                className="sa-btn sa-btn--ghost"
                disabled={busy || !company.contact_email}
                onClick={() =>
                  void run(async () => {
                    const r = await callFn<{ invite_url: string }>('admin-clients', { action: 'create_invite', company_id: id, email: company.contact_email });
                    setInvite(r.invite_url);
                  })
                }
              >
                Create registration link
              </button>
            </div>
            {invite && (<><p className="sa-muted">One-time link for {company.contact_email}, valid 7 days:</p><CopyBox value={invite} /></>)}
          </Card>
        </div>

        <div>
          {plan && <PlanCard plan={plan} onSaved={reload} />}
          <ExtrasCard companyId={id} extras={extras} currency={cur} onSaved={reload} />
          <NotesCard companyId={id} notes={d.notes} />
        </div>
      </div>

      <Card title="Invoices">
        {invoices.length === 0 ? (
          <p className="sa-muted">No invoices yet.</p>
        ) : (
          <table className="sa-table">
            <thead><tr><th>Invoice</th><th>Lines</th><th>Amount</th><th>Status</th><th /></tr></thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td>{inv.number}<div className="sa-sub">{day(inv.created_at)}</div></td>
                  <td>{(inv.invoice_items ?? []).map((it) => (<div key={it.id} className="sa-sub">{it.description}: {money(it.amount, inv.currency)}</div>))}</td>
                  <td>{money(inv.total, inv.currency)}</td>
                  <td><InvoiceBadge status={inv.status} />{inv.attempts > 0 && inv.status !== 'paid' && <div className="sa-sub">{inv.attempts} attempt{inv.attempts === 1 ? '' : 's'}</div>}</td>
                  <td className="sa-right">
                    {(inv.status === 'open' || inv.status === 'failed') && (
                      <>
                        {card && (
                          <button className="sa-btn sa-btn--small" disabled={busy} onClick={() => { if (window.confirm(`Charge ${money(inv.total, inv.currency)} to the saved card now?`)) act(() => callFn('admin-clients', { action: 'charge_now', invoice_id: inv.id })); }}>
                            Charge card
                          </button>
                        )}{' '}
                        <button className="sa-btn sa-btn--small sa-btn--ghost" disabled={busy} onClick={() => { const note = window.prompt('Mark as paid outside the gateway. Note (e.g. bank transfer ref):'); if (note !== null) act(() => callFn('admin-clients', { action: 'mark_paid_offline', invoice_id: inv.id, note })); }}>
                          Mark paid
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </Shell>
  );
}

function PlanCard({ plan, onSaved }: { plan: Plan; onSaved: () => void }) {
  const [f, setF] = useState({
    recurring_fee: String(plan.recurring_fee),
    product_limit: String(plan.product_limit),
    billing_interval: plan.billing_interval,
    contract_months: plan.contract_months ? String(plan.contract_months) : '',
    cancellation_terms: plan.cancellation_terms ?? '',
  });
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAction();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setSaved(false); setF((x) => ({ ...x, [k]: e.target.value })); };
  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { error: err } = await supabase.from('plans').update({
        recurring_fee: Number(f.recurring_fee), product_limit: Math.floor(Number(f.product_limit)),
        billing_interval: f.billing_interval, contract_months: f.contract_months ? Number(f.contract_months) : null,
        cancellation_terms: f.cancellation_terms || null,
      }).eq('id', plan.id);
      if (err) throw new Error('Could not save the plan. Check the numbers.');
      setSaved(true);
      onSaved();
    });
  };
  return (
    <Card title="Plan">
      <form onSubmit={save}>
        <p className="sa-muted">Setup fee: {money(plan.setup_fee, plan.currency)}. A new price applies from the next invoice.</p>
        <div className="sa-grid2">
          <Field label={`Subscription fee (${plan.currency})`}><input type="number" min="0" step="0.001" value={f.recurring_fee} onChange={set('recurring_fee')} required /></Field>
          <Field label="Products included"><input type="number" min="0" step="1" value={f.product_limit} onChange={set('product_limit')} required /></Field>
          <Field label="Billed">
            <select value={f.billing_interval} onChange={set('billing_interval')}><option value="monthly">Monthly</option><option value="annual">Yearly</option></select>
          </Field>
          <Field label="Contract (months)"><input type="number" min="1" step="1" value={f.contract_months} onChange={set('contract_months')} /></Field>
        </div>
        <Field label="Cancellation conditions"><input value={f.cancellation_terms} onChange={set('cancellation_terms')} /></Field>
        <ErrorNote message={error} />
        <div className="sa-actions"><button className="sa-btn" disabled={busy}>Save plan</button>{saved && <span className="sa-ok">Saved</span>}</div>
      </form>
    </Card>
  );
}

function ExtrasCard({ companyId, extras, currency, onSaved }: { companyId: string; extras: ExtraCharge[]; currency: string; onSaved: () => void }) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const { busy, error, run } = useAction();
  const pending = extras.filter((e) => !e.invoice_id);
  const add = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { error: err } = await supabase.from('extra_charges').insert({ company_id: companyId, description, amount: Number(amount) });
      if (err) throw new Error('Could not add the charge. The amount must be above zero.');
      setDescription('');
      setAmount('');
      onSaved();
    });
  };
  return (
    <Card title="Extra charges">
      <p className="sa-muted">One-off amounts added to the next subscription invoice only. The regular price stays the same.</p>
      {pending.length > 0 && (
        <ul className="sa-feed">
          {pending.map((x) => (
            <li key={x.id}>
              <strong>{x.description}: {money(x.amount, currency)}</strong>
              <span>On the next invoice</span>
              <button className="sa-link" onClick={() => void run(async () => { await supabase.from('extra_charges').delete().eq('id', x.id); onSaved(); })}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="sa-inline">
        <input placeholder="e.g. 10 extra products" value={description} onChange={(e) => setDescription(e.target.value)} required aria-label="Description" />
        <input type="number" min="0.001" step="0.001" placeholder={currency} value={amount} onChange={(e) => setAmount(e.target.value)} required aria-label="Amount" />
        <button className="sa-btn sa-btn--small" disabled={busy}>Add</button>
      </form>
      <ErrorNote message={error} />
    </Card>
  );
}

function WidgetCard({ companyId, publicKey, domains, onSaved }: { companyId: string; publicKey: string; domains: string[]; onSaved: () => void }) {
  const [value, setValue] = useState(domains.join(', '));
  const { busy, error, run } = useAction();
  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const list = value.split(/[\s,]+/).map((x) => x.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')).filter(Boolean);
      const { error: err } = await supabase.from('widget_keys').update({ allowed_domains: list }).eq('company_id', companyId);
      if (err) throw new Error('Could not save the websites.');
      onSaved();
    });
  };
  return (
    <Card title="Install code">
      <CopyBox value={`<script src="${window.location.origin}/vyro.js" data-key="${publicKey}" async></script>`} />
      <form onSubmit={save}>
        <Field label="Websites allowed to run VYRO" hint={domains.length === 0 ? 'Empty: the code works on any website. Add the client’s domain to lock it.' : 'Subdomains are included.'}>
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="clientstore.com" />
        </Field>
        <ErrorNote message={error} />
        <div className="sa-actions"><button className="sa-btn sa-btn--small" disabled={busy}>Save websites</button></div>
      </form>
    </Card>
  );
}

function NotesCard({ companyId, notes }: { companyId: string; notes: string }) {
  const [value, setValue] = useState(notes);
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAction();
  return (
    <Card title="Internal notes">
      <textarea rows={3} value={value} onChange={(e) => { setSaved(false); setValue(e.target.value); }} aria-label="Internal notes" />
      <p className="sa-muted">Only VYRO admins can see these.</p>
      <ErrorNote message={error} />
      <div className="sa-actions">
        <button className="sa-btn sa-btn--small" disabled={busy} onClick={() => void run(async () => { const { error: err } = await supabase.from('companies').update({ notes: value }).eq('id', companyId); if (err) throw new Error('Could not save.'); setSaved(true); })}>Save notes</button>
        {saved && <span className="sa-ok">Saved</span>}
      </div>
    </Card>
  );
}
