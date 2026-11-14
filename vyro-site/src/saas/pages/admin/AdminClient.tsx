import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { CircleAlert, ReceiptText, Trash2 } from 'lucide-react';
import {
  amount, callFn, CARD_COLUMNS, COMPANY_COLUMNS, day, isLive, logoUrl, money, supabase,
  type Company, type ExtraCharge, type Invoice, type PaymentMethod, type Plan, type Subscription,
} from '../../api';
import { ProductsPanel } from '../../Products';
import { useCrumbs } from '../../shell';
import {
  Affix, Avatar, Button, CodeBox, Empty, ErrorNote, Facts, Field, InvoiceStatus, Ledger, LiveStatus, Notice, Panel,
  Segmented, SkeletonRows, SubStatus, Tabs, useAction, useAsk,
} from '../../ui';

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
  if (company.error || !company.data) throw new Error('Client not found.');
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

type Tab = 'overview' | 'billing' | 'products' | 'access';
type Override = 'auto' | 'force_on' | 'force_off';

export function AdminClient() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'overview';
  const [d, setD] = useState<Data | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const { busy, error, run } = useAction();
  const ask = useAsk();
  useCrumbs([{ label: 'Clients', to: '/admin/clients' }, { label: d?.company.name ?? 'Client' }]);

  const reload = useCallback(() => {
    load(id).then(setD).catch((e: Error) => setFailed(e.message));
  }, [id]);
  useEffect(reload, [reload]);

  if (failed) {
    return (
      <Empty icon={<CircleAlert />} title={failed} action={<Link className="vy-btn vy-btn--secondary" to="/admin/clients">Back to clients</Link>} />
    );
  }
  if (!d) return <SkeletonRows rows={8} />;
  const { company, plan, sub, invoices, extras, card, key } = d;
  const cur = plan?.currency ?? 'OMR';
  const live = isLive(sub);
  const unpaid = invoices.filter((i) => i.status === 'open' || i.status === 'failed');

  /** Runs a change, surfaces database errors, then reloads the record. */
  const act = (fn: () => PromiseLike<unknown>, success: string) =>
    void run(async () => {
      const res = (await fn()) as { error?: { message: string } | null } | undefined;
      if (res && typeof res === 'object' && 'error' in res && res.error) throw new Error('That change could not be saved.');
      reload();
    }, success);

  const setOverride = async (v: Override) => {
    if (v === 'force_off') {
      const ok = await ask({
        title: `Switch VYRO off for ${company.name}?`,
        body: 'The try-on disappears from their website within a few minutes, whatever their payment status. You can switch it back at any time.',
        confirmLabel: 'Force off',
        danger: true,
      });
      if (!ok) return;
    }
    act(
      () => supabase.from('subscriptions').update({ widget_override: v === 'auto' ? null : v }).eq('company_id', id),
      v === 'auto' ? 'Widget follows the subscription' : v === 'force_on' ? 'Widget forced on' : 'Widget forced off',
    );
  };

  const charge = async (inv: Invoice) => {
    const ok = await ask({
      title: `Charge ${money(inv.total, inv.currency)} now?`,
      body: `Invoice ${inv.number} will be charged to ${card?.brand ?? 'the saved card'} ${card?.masked_pan ?? ''}.`,
      confirmLabel: 'Charge card',
    });
    if (ok) act(() => callFn('admin-clients', { action: 'charge_now', invoice_id: inv.id }), 'Charge submitted');
  };
  const markPaid = async (inv: Invoice) => {
    const note = await ask({
      title: `Mark ${inv.number} as paid?`,
      body: 'Use this when the client paid outside the gateway, for example by bank transfer.',
      input: { label: 'Reference or note', placeholder: 'Bank transfer ref' },
      confirmLabel: 'Mark as paid',
    });
    if (typeof note === 'string') act(() => callFn('admin-clients', { action: 'mark_paid_offline', invoice_id: inv.id, note }), 'Invoice marked as paid');
  };
  const activate = async () => {
    const ok = await ask({
      title: 'Start the subscription now?',
      body: 'This activates VYRO without an online setup payment. Billing starts on the agreed date.',
      confirmLabel: 'Activate',
    });
    if (ok) act(() => callFn('admin-clients', { action: 'activate', company_id: id }), 'Subscription activated');
  };

  return (
    <div>
      <header className="vy-head vy-head--entity">
        <div className="vy-entity">
          <Avatar name={company.name} src={logoUrl(company.logo_path)} size="lg" />
          <div style={{ minWidth: 0 }}>
            <h1>{company.name}</h1>
            <div className="vy-entity__meta">
              {sub && <SubStatus status={sub.status} long />}
              <LiveStatus live={live} />
              {[company.contact_name, company.contact_email, company.contact_phone].filter(Boolean).map((x) => (
                <span key={x}>{x}</span>
              ))}
            </div>
          </div>
        </div>
      </header>

      <Tabs
        label="Client sections"
        value={tab}
        onChange={(t) => setParams(t === 'overview' ? {} : { tab: t }, { replace: true })}
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'billing', label: 'Billing', count: unpaid.length, countTone: unpaid.some((i) => i.status === 'failed') ? 'bad' : undefined },
          { id: 'products', label: 'Products' },
          { id: 'access', label: 'Install & access' },
        ]}
      />

      <div className="vy-stack">
        <ErrorNote message={error} />

        {tab === 'overview' && (
          <>
            {sub?.status === 'pending_setup' && (
              <Notice
                tone="warn"
                icon={<CircleAlert />}
                title="Waiting for the setup payment"
                action={
                  <Button busy={busy} onClick={() => void activate()}>
                    Activate without payment
                  </Button>
                }
              >
                VYRO switches on automatically once the client pays the setup fee.
              </Notice>
            )}
            <Ledger
              metrics={[
                {
                  label: plan?.billing_interval === 'annual' ? 'Yearly fee' : 'Monthly fee',
                  value: plan ? amount(plan.recurring_fee) : '—',
                  unit: plan ? cur : undefined,
                  wide: true,
                },
                { label: 'Next payment', value: day(sub?.next_billing_date) },
                { label: 'Paid until', value: day(sub?.current_period_end) },
                { label: 'Unpaid invoices', value: unpaid.length, tone: unpaid.length ? 'bad' : undefined },
              ]}
            />
            <div className="vy-split vy-split--even">
              <Panel title="Widget control" description="Whether VYRO runs on their website">
                <div className="vy-form">
                  <Segmented<Override>
                    label="Widget control"
                    value={sub?.widget_override ?? 'auto'}
                    disabled={busy}
                    onChange={(v) => void setOverride(v)}
                    options={[
                      { id: 'auto', label: 'Automatic' },
                      { id: 'force_on', label: 'Force on' },
                      { id: 'force_off', label: 'Force off', danger: true },
                    ]}
                  />
                  <p className="vy-small vy-muted">
                    {sub?.widget_override === 'force_on' && 'Forced on by you, whatever the payment status.'}
                    {sub?.widget_override === 'force_off' && 'Forced off by you, whatever the payment status.'}
                    {!sub?.widget_override && 'Follows the subscription: on while paid, off after cancellation or an unpaid grace period.'}
                  </p>
                  <Facts
                    rows={[
                      ['Right now', <LiveStatus live={live} />],
                      ...(sub?.grace_until && sub.status === 'past_due' ? ([['Grace period ends', day(sub.grace_until)]] as [string, string][]) : []),
                      ...(sub?.contract_end ? ([['Contract ends', day(sub.contract_end)]] as [string, string][]) : []),
                      ['Saved card', card ? <span className="vy-mono">{`${card.brand ?? 'Card'} ${card.masked_pan ?? ''}`}</span> : 'None'],
                    ]}
                  />
                </div>
              </Panel>
              <NotesPanel companyId={id} notes={d.notes} />
            </div>
          </>
        )}

        {tab === 'billing' && (
          <>
            <div className="vy-split vy-split--even">
              {plan ? <PlanPanel plan={plan} onSaved={reload} /> : <Panel title="Plan"><p className="vy-muted">No plan.</p></Panel>}
              <ExtrasPanel companyId={id} extras={extras} currency={cur} onSaved={reload} />
            </div>
            <Panel title="Invoices" flush>
              {invoices.length === 0 ? (
                <Empty icon={<ReceiptText />} title="No invoices yet" />
              ) : (
                <div className="vy-table-wrap">
                  <table className="vy-table vy-table--stack vy-table--hover">
                    <thead>
                      <tr>
                        <th>Invoice</th>
                        <th>Lines</th>
                        <th>Status</th>
                        <th className="is-num">Amount</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((inv) => (
                        <tr key={inv.id}>
                          <td className="is-primary">
                            <Link className="vy-rowlink vy-mono" to={`/admin/invoices/${inv.id}`}>
                              {inv.number}
                            </Link>
                            <small className="vy-muted vy-small" style={{ display: 'block' }}>
                              {day(inv.created_at)}
                            </small>
                          </td>
                          <td className="is-full vy-small">
                            {(inv.invoice_items ?? []).map((it) => (
                              <div key={it.id}>
                                {it.description} <span className="vy-muted vy-mono">{amount(it.amount)}</span>
                              </div>
                            ))}
                          </td>
                          <td className="is-aside">
                            <InvoiceStatus status={inv.status} />
                            {inv.attempts > 0 && inv.status !== 'paid' && (
                              <small className="vy-muted vy-small" style={{ display: 'block' }}>
                                {inv.attempts} attempt{inv.attempts === 1 ? '' : 's'}
                              </small>
                            )}
                          </td>
                          <td className="is-num" data-label="Amount">
                            {money(inv.total, inv.currency)}
                          </td>
                          <td className="is-actions">
                            {(inv.status === 'open' || inv.status === 'failed') && (
                              <>
                                {card && (
                                  <Button size="sm" variant="primary" disabled={busy} onClick={() => void charge(inv)}>
                                    Charge card
                                  </Button>
                                )}
                                <Button size="sm" disabled={busy} onClick={() => void markPaid(inv)}>
                                  Mark paid
                                </Button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </>
        )}

        {tab === 'products' &&
          (plan ? <ProductsPanel companyId={id} limit={plan.product_limit} /> : <p className="vy-muted">No plan.</p>)}

        {tab === 'access' && (
          <div className="vy-split vy-split--even">
            {key && <WidgetPanel companyId={id} publicKey={key.public_key} domains={key.allowed_domains} onSaved={reload} />}
            <InvitePanel companyId={id} email={company.contact_email} registered={d.registered} />
          </div>
        )}
      </div>
    </div>
  );
}

function PlanPanel({ plan, onSaved }: { plan: Plan; onSaved: () => void }) {
  const [f, setF] = useState({
    recurring_fee: String(plan.recurring_fee),
    product_limit: String(plan.product_limit),
    billing_interval: plan.billing_interval,
    contract_months: plan.contract_months ? String(plan.contract_months) : '',
    cancellation_terms: plan.cancellation_terms ?? '',
  });
  const { busy, error, run } = useAction();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { error: err } = await supabase.from('plans').update({
        recurring_fee: Number(f.recurring_fee), product_limit: Math.floor(Number(f.product_limit)),
        billing_interval: f.billing_interval, contract_months: f.contract_months ? Number(f.contract_months) : null,
        cancellation_terms: f.cancellation_terms || null,
      }).eq('id', plan.id);
      if (err) throw new Error('Could not save the plan. Check the numbers.');
      onSaved();
    }, 'Plan saved');
  };
  return (
    <Panel title="Plan" description={`Setup fee ${money(plan.setup_fee, plan.currency)}. A new price applies from the next invoice.`}>
      <form onSubmit={save} className="vy-form">
        <div className="vy-grid2">
          <Field label="Subscription fee">
            <Affix unit={plan.currency}>
              <input type="number" min="0" step="0.001" inputMode="decimal" value={f.recurring_fee} onChange={set('recurring_fee')} required />
            </Affix>
          </Field>
          <Field label="Products included">
            <input type="number" min="0" step="1" inputMode="numeric" value={f.product_limit} onChange={set('product_limit')} required />
          </Field>
          <Field label="Billed">
            <select value={f.billing_interval} onChange={set('billing_interval')}>
              <option value="monthly">Monthly</option>
              <option value="annual">Yearly</option>
            </select>
          </Field>
          <Field label="Contract length">
            <Affix unit="months">
              <input type="number" min="1" step="1" inputMode="numeric" value={f.contract_months} onChange={set('contract_months')} />
            </Affix>
          </Field>
        </div>
        <Field label="Cancellation conditions">
          <input value={f.cancellation_terms} onChange={set('cancellation_terms')} />
        </Field>
        <ErrorNote message={error} />
        <div className="vy-actions">
          <Button type="submit" variant="primary" busy={busy}>
            Save plan
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function ExtrasPanel({ companyId, extras, currency, onSaved }: { companyId: string; extras: ExtraCharge[]; currency: string; onSaved: () => void }) {
  const [description, setDescription] = useState('');
  const [value, setValue] = useState('');
  const { busy, error, run } = useAction();
  const pending = extras.filter((e) => !e.invoice_id);
  const add = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { error: err } = await supabase.from('extra_charges').insert({ company_id: companyId, description, amount: Number(value) });
      if (err) throw new Error('Could not add the charge. The amount must be above zero.');
      setDescription('');
      setValue('');
      onSaved();
    }, 'Extra charge added to the next invoice');
  };
  return (
    <Panel title="One-off extra charges" description="Added to the next subscription invoice only. The regular price stays the same.">
      <div className="vy-form">
        {pending.length > 0 && (
          <Facts
            rows={pending.map((x) => [
              x.description,
              <span className="vy-actions vy-actions--end">
                <span className="vy-mono">{money(x.amount, currency)}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove ${x.description}`}
                  icon={<Trash2 />}
                  onClick={() => void run(async () => { await supabase.from('extra_charges').delete().eq('id', x.id); onSaved(); }, 'Extra charge removed')}
                />
              </span>,
            ])}
          />
        )}
        <form onSubmit={add} className="vy-form">
          <div className="vy-grid2">
            <Field label="Description">
              <input placeholder="10 extra products" value={description} onChange={(e) => setDescription(e.target.value)} required />
            </Field>
            <Field label="Amount">
              <Affix unit={currency}>
                <input type="number" min="0.001" step="0.001" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} required />
              </Affix>
            </Field>
          </div>
          <ErrorNote message={error} />
          <div className="vy-actions">
            <Button type="submit" busy={busy}>
              Add to next invoice
            </Button>
          </div>
        </form>
      </div>
    </Panel>
  );
}

function WidgetPanel({ companyId, publicKey, domains, onSaved }: { companyId: string; publicKey: string; domains: string[]; onSaved: () => void }) {
  const [value, setValue] = useState(domains.join(', '));
  const { busy, error, run } = useAction();
  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const list = value.split(/[\s,]+/).map((x) => x.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')).filter(Boolean);
      const { error: err } = await supabase.from('widget_keys').update({ allowed_domains: list }).eq('company_id', companyId);
      if (err) throw new Error('Could not save the websites.');
      onSaved();
    }, 'Allowed websites saved');
  };
  return (
    <Panel title="Install code" description="The client adds this once, just before </body>.">
      <form onSubmit={save} className="vy-form">
        <CodeBox value={`<script src="${window.location.origin}/vyro.js" data-key="${publicKey}" async></script>`} />
        <Field
          label="Websites allowed to run VYRO"
          hint={domains.length === 0 ? 'Empty: the code works on any website. Add the client’s domain to lock it.' : 'Comma separated. Subdomains are included.'}
        >
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="clientstore.com" />
        </Field>
        <ErrorNote message={error} />
        <div className="vy-actions">
          <Button type="submit" busy={busy}>
            Save websites
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function InvitePanel({ companyId, email, registered }: { companyId: string; email: string | null; registered: boolean }) {
  const [invite, setInvite] = useState<string | null>(null);
  const { busy, error, run } = useAction();
  return (
    <Panel title="Client login" description={registered ? 'The client has registered.' : 'The client has not registered yet.'}>
      <div className="vy-form">
        {invite ? (
          <>
            <p className="vy-small vy-muted">One-time link for {email}, valid 7 days:</p>
            <CodeBox value={invite} />
          </>
        ) : (
          <p className="vy-small vy-muted">
            {email ? `A registration link is tied to ${email} and works once.` : 'Add a contact email to this client before creating a link.'}
          </p>
        )}
        <ErrorNote message={error} />
        <div className="vy-actions">
          <Button
            busy={busy}
            disabled={!email}
            onClick={() =>
              void run(async () => {
                const r = await callFn<{ invite_url: string }>('admin-clients', { action: 'create_invite', company_id: companyId, email });
                setInvite(r.invite_url);
              }, 'Registration link created')
            }
          >
            {invite ? 'Create another link' : 'Create registration link'}
          </Button>
        </div>
      </div>
    </Panel>
  );
}

function NotesPanel({ companyId, notes }: { companyId: string; notes: string }) {
  const [value, setValue] = useState(notes);
  const { busy, error, run } = useAction();
  return (
    <Panel title="Internal notes" description="Only VYRO admins can see these.">
      <div className="vy-form">
        <Field label="Notes">
          <textarea rows={5} value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <ErrorNote message={error} />
        <div className="vy-actions">
          <Button
            busy={busy}
            disabled={value === notes}
            onClick={() =>
              void run(async () => {
                const { error: err } = await supabase.from('companies').update({ notes: value }).eq('id', companyId);
                if (err) throw new Error('Could not save.');
              }, 'Notes saved')
            }
          >
            Save notes
          </Button>
        </div>
      </div>
    </Panel>
  );
}
