import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CircleAlert, CircleCheck, Circle, CreditCard, ReceiptText, ShieldCheck } from 'lucide-react';
import { amount, api, day, isLive, logoUrl, money, type Company, type Invoice } from '../../api';
import { useCrumbs } from '../../shell';
import {
  Avatar, Button, CodeBox, Empty, ErrorNote, Facts, Field, InvoiceStatus, Ledger, LiveStatus, Meter, Notice,
  PageHead, Panel, SubStatus, useAction, useAsk, useToast,
} from '../../ui';
import { ProductsPanel } from '../../Products';
import { ChangePassword } from '../admin/AdminSettings';
import { usePortal } from './PortalLayout';

const isDue = (i: Invoice) => i.status === 'open' || i.status === 'failed';

function invoiceFor(inv: Invoice): string {
  if (inv.kind === 'setup') return 'One-time setup fee';
  if (inv.period_start) return `${day(inv.period_start)} – ${day(inv.period_end)}`;
  return 'Additional charge';
}

/** The overdue / setup payment call to action, shown wherever money is due. */
function DueNotice() {
  const { data, pay, busy } = usePortal();
  const due = data.invoices.filter(isDue);
  if (due.length === 0) return null;
  const cur = data.plan?.currency ?? 'OMR';
  const total = due.reduce((s, i) => s + Number(i.total), 0);
  const overdue = data.sub?.status === 'past_due' || data.sub?.status === 'suspended';
  return (
    <Notice
      tone={overdue ? 'bad' : 'warn'}
      icon={<CircleAlert />}
      title={
        due.length === 1 ? `Invoice ${due[0].number} is due: ${money(total, cur)}` : `${due.length} invoices are due: ${money(total, cur)}`
      }
      action={
        <Button variant="primary" busy={busy} onClick={() => pay(due[due.length - 1].id)}>
          Pay now
        </Button>
      }
    >
      {data.sub?.status === 'past_due' && data.sub.grace_until
        ? `Pay before ${day(data.sub.grace_until)} to keep VYRO running on your website.`
        : data.sub?.status === 'suspended'
          ? 'VYRO is paused on your website. It switches back on as soon as this is paid.'
          : data.sub?.status === 'pending_setup'
            ? 'Pay the setup fee to get started. Your card is saved for the subscription payments.'
            : undefined}
    </Notice>
  );
}

/* --------------------------------------------------------------- Overview */

export function PortalOverview() {
  useCrumbs([{ label: 'Overview' }]);
  const { data } = usePortal();
  const { company, plan, sub, invoices, liveProducts, widgetKey } = data;
  const cur = plan?.currency ?? 'OMR';
  const live = isLive(sub);
  const recent = invoices.slice(0, 4);

  const steps: { done: boolean; title: string; text: string; to: string; cta: string }[] = [
    {
      done: !!sub?.setup_paid_at || (sub?.status !== 'pending_setup' && !!sub),
      title: 'Pay the setup fee',
      text: 'Activates your subscription and saves your card for renewals.',
      to: '/portal/billing',
      cta: 'Go to billing',
    },
    {
      done: liveProducts > 0,
      title: 'Add your products',
      text: 'Upload the items your customers can try on.',
      to: '/portal/products',
      cta: 'Add products',
    },
    {
      done: false,
      title: 'Install VYRO on your website',
      text: 'One line of code, added once.',
      to: '/portal/company',
      cta: 'Get the code',
    },
  ];
  const onboarding = !steps[0].done || !steps[1].done;

  return (
    <div className="vy-stack">
      <header className="vy-head vy-head--entity">
        <div className="vy-entity">
          <Avatar name={company.name} src={logoUrl(company.logo_path)} size="lg" />
          <div>
            <h1>{company.store_name || company.name}</h1>
            <div className="vy-entity__meta">
              {sub && <SubStatus status={sub.status} long />}
              <LiveStatus live={live} />
            </div>
          </div>
        </div>
      </header>

      <DueNotice />

      {plan && (
        <Ledger
          metrics={[
            {
              label: sub?.cancel_at_period_end ? 'Service ends' : 'Next payment',
              value: day(sub?.cancel_at_period_end ? sub.current_period_end : sub?.next_billing_date),
              note: sub?.cancel_at_period_end ? 'Subscription cancelled' : `${money(plan.recurring_fee, cur)} plus any extras`,
              wide: true,
            },
            {
              label: plan.billing_interval === 'annual' ? 'Yearly fee' : 'Monthly fee',
              value: amount(plan.recurring_fee),
              unit: cur,
            },
            {
              label: 'Products live',
              value: (
                <>
                  {liveProducts}
                  <small>of {plan.product_limit}</small>
                </>
              ),
              note: <Meter value={liveProducts} max={plan.product_limit} />,
            },
            { label: 'Paid until', value: day(sub?.current_period_end) },
          ]}
        />
      )}

      <div className="vy-split">
        <Panel
          title="Recent invoices"
          flush
          action={
            <Link className="vy-link vy-small" to="/portal/billing">
              All billing
            </Link>
          }
        >
          {recent.length === 0 ? (
            <Empty icon={<ReceiptText />} title="No invoices yet">
              Your invoices appear here once your plan starts.
            </Empty>
          ) : (
            <InvoiceTable invoices={recent} />
          )}
        </Panel>

        {onboarding ? (
          <Panel title="Getting started" flush>
            <ul className="vy-feed">
              {steps.map((s) => (
                <li key={s.title}>
                  <span style={{ color: s.done ? 'var(--ok)' : 'var(--line-strong)', display: 'grid' }}>
                    {s.done ? <CircleCheck size={18} /> : <Circle size={18} />}
                  </span>
                  <strong style={{ textDecoration: s.done ? 'line-through' : undefined, opacity: s.done ? 0.6 : 1 }}>{s.title}</strong>
                  {!s.done ? (
                    <Link className="vy-link vy-small" to={s.to}>
                      {s.cta}
                    </Link>
                  ) : (
                    <span />
                  )}
                  <p>{s.text}</p>
                </li>
              ))}
            </ul>
          </Panel>
        ) : (
          <Panel title="Your website">
            <Facts
              rows={[
                ['Widget', <LiveStatus live={live} />],
                ['Website', company.website || '—'],
                ['Products live', `${liveProducts} of ${plan?.product_limit ?? 0}`],
              ]}
            />
            {widgetKey && (
              <p className="vy-small vy-muted" style={{ marginTop: 16 }}>
                The install code is on the <Link className="vy-link" to="/portal/company">Company</Link> page.
              </p>
            )}
          </Panel>
        )}
      </div>
    </div>
  );
}

function InvoiceTable({ invoices }: { invoices: Invoice[] }) {
  const { pay, busy } = usePortal();
  return (
    <div className="vy-table-wrap">
      <table className="vy-table vy-table--stack vy-table--hover">
        <thead>
          <tr>
            <th>Invoice</th>
            <th>For</th>
            <th>Status</th>
            <th className="is-num">Amount</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <tr key={inv.id}>
              <td className="is-primary">
                <Link className="vy-rowlink vy-mono" to={`/portal/invoices/${inv.id}`}>
                  {inv.number}
                </Link>
                <small className="vy-muted vy-small" style={{ display: 'block' }}>
                  {day(inv.created_at)}
                </small>
              </td>
              <td className="is-full" data-label="For">
                {invoiceFor(inv)}
              </td>
              <td className="is-aside">
                <InvoiceStatus status={inv.status} />
              </td>
              <td className="is-num" data-label="Amount">
                {money(inv.total, inv.currency)}
              </td>
              <td className="is-actions">
                {isDue(inv) && (
                  <Button size="sm" variant="primary" busy={busy} onClick={() => pay(inv.id)}>
                    Pay
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------------------------------------------------------- Billing */

export function PortalBilling() {
  useCrumbs([{ label: 'Billing' }]);
  const { data, reload, updateCard, busy } = usePortal();
  const { plan, sub, invoices, card } = data;
  const cur = plan?.currency ?? 'OMR';
  const ask = useAsk();
  const { busy: acting, run } = useAction();

  const cancel = async () => {
    const until = sub?.current_period_end ? ` VYRO keeps working on your website until ${day(sub.current_period_end)}.` : '';
    const ok = await ask({
      title: 'Cancel your subscription?',
      body: `You will not be charged again.${until}`,
      confirmLabel: 'Cancel subscription',
      danger: true,
    });
    if (!ok) return;
    void run(async () => {
      await api.post('billing/cancel');
      reload();
    }, 'Subscription cancelled');
  };
  const resume = () =>
    void run(async () => {
      await api.post('billing/resume');
      reload();
    }, 'Subscription resumed');

  return (
    <div className="vy-stack">
      <PageHead title="Billing" description="Your plan, payment method and every invoice." />
      <DueNotice />

      <div className="vy-split vy-split--even">
        <Panel
          title="Plan"
          action={sub && <SubStatus status={sub.status} />}
          foot={
            sub?.status === 'cancel_scheduled' ? (
              <div className="vy-actions">
                <Button busy={acting} onClick={resume}>
                  Keep my subscription
                </Button>
                <span className="vy-small vy-muted">Ends {day(sub.current_period_end)}</span>
              </div>
            ) : sub?.status === 'active' || sub?.status === 'past_due' ? (
              <Button variant="danger" size="sm" busy={acting} onClick={() => void cancel()}>
                Cancel subscription
              </Button>
            ) : undefined
          }
        >
          {plan ? (
            <Facts
              rows={[
                ['Plan', plan.name],
                [plan.billing_interval === 'annual' ? 'Yearly fee' : 'Monthly fee', <span className="vy-mono">{money(plan.recurring_fee, cur)}</span>],
                [
                  'One-time setup fee',
                  <>
                    <span className="vy-mono">{money(plan.setup_fee, cur)}</span>
                    {sub?.setup_paid_at && <span className="vy-muted"> · paid {day(sub.setup_paid_at)}</span>}
                  </>,
                ],
                ['Products included', plan.product_limit],
                [sub?.cancel_at_period_end ? 'Service ends' : 'Next payment', day(sub?.cancel_at_period_end ? sub.current_period_end : sub?.next_billing_date)],
                ...(plan.contract_months
                  ? ([['Contract', `${plan.contract_months} months${sub?.contract_end ? `, until ${day(sub.contract_end)}` : ''}`]] as [string, string][])
                  : []),
                ...(plan.cancellation_terms ? ([['Cancellation', plan.cancellation_terms]] as [string, string][]) : []),
              ]}
            />
          ) : (
            <p className="vy-muted">Your plan is being prepared.</p>
          )}
        </Panel>

        <Panel
          title="Payment method"
          foot={
            card ? (
              <Button size="sm" busy={busy} onClick={updateCard} icon={<CreditCard />}>
                Update card
              </Button>
            ) : undefined
          }
        >
          {card ? (
            <Facts
              rows={[
                ['Card', <span className="vy-mono">{card.masked_pan}</span>],
                ['Type', card.brand ?? 'Card'],
                ['Used for', 'Automatic subscription payments'],
              ]}
            />
          ) : (
            <Empty icon={<CreditCard />} title="No card saved yet">
              Your card is saved when you make your first payment.
            </Empty>
          )}
          <p className="vy-small vy-muted" style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <ShieldCheck size={16} style={{ flex: 'none', marginTop: 1 }} />
            <span>
              Cards are entered on OMPAY’s secure page. VYRO never sees or stores your card number.
              {card && ' Updating your card makes a small check charge that is refunded straight away.'}
            </span>
          </p>
        </Panel>
      </div>

      <Panel title="Invoices" description={invoices.length ? `${invoices.length} in total` : undefined} flush>
        {invoices.length === 0 ? (
          <Empty icon={<ReceiptText />} title="No invoices yet">
            Your invoices appear here once your plan starts.
          </Empty>
        ) : (
          <InvoiceTable invoices={invoices} />
        )}
      </Panel>
    </div>
  );
}

/* --------------------------------------------------------------- Products */

export function PortalProducts() {
  useCrumbs([{ label: 'Products' }]);
  const { data, reload } = usePortal();
  return (
    <div className="vy-stack">
      <PageHead title="Try-on products" description="The items your customers can try on from your website." />
      {data.plan ? (
        <ProductsPanel companyId={data.company.id} limit={data.plan.product_limit} onChange={reload} />
      ) : (
        <p className="vy-muted">Your plan is being prepared.</p>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Company */

export function PortalCompany() {
  useCrumbs([{ label: 'Company' }]);
  const { data, reload } = usePortal();
  const { company, widgetKey } = data;
  return (
    <div className="vy-stack">
      <PageHead title="Company" description="Your business details, website install code and sign-in." />
      <div className="vy-split">
        <CompanyForm company={company} onSaved={reload} />
        <div className="vy-stack">
          {widgetKey && (
            <Panel title="Install on your website" description="Add once, just before </body>.">
              <CodeBox value={`<script src="${window.location.origin}/vyro.js" data-key="${widgetKey}" async></script>`} />
              <p className="vy-small vy-muted" style={{ marginTop: 12 }}>
                VYRO switches on and off with your subscription. You never need to remove this code.
              </p>
            </Panel>
          )}
          <ChangePassword />
        </div>
      </div>
    </div>
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
  const { busy, error, run } = useAction();
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await api.post('portal/company', form);
      onSaved();
    }, 'Company details saved');
  };

  const upload = (file: File | undefined) => {
    if (!file) return;
    void run(async () => {
      if (file.size > 1024 * 1024) throw new Error('The logo must be smaller than 1 MB.');
      const data = new FormData();
      data.append('file', file);
      await api.upload('portal/logo', data);
      onSaved();
    }, 'Logo updated');
  };

  return (
    <Panel title="Business details">
      <form onSubmit={save} className="vy-form">
        <div className="vy-cell">
          <Avatar name={company.name} src={logoUrl(company.logo_path)} size="lg" />
          <Field label="Logo" hint="PNG, JPG or WebP, up to 1 MB">
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => upload(e.target.files?.[0])} />
          </Field>
        </div>
        <div className="vy-grid2">
          <Field label="Company name">
            <input value={form.name} onChange={set('name')} required />
          </Field>
          <Field label="Store name">
            <input value={form.store_name} onChange={set('store_name')} />
          </Field>
          <Field label="Website">
            <input value={form.website} onChange={set('website')} inputMode="url" />
          </Field>
          <Field label="Contact name">
            <input value={form.contact_name} onChange={set('contact_name')} autoComplete="name" />
          </Field>
          <Field label="Contact email">
            <input type="email" value={form.contact_email} onChange={set('contact_email')} autoComplete="email" />
          </Field>
          <Field label="Phone">
            <input value={form.contact_phone} onChange={set('contact_phone')} inputMode="tel" autoComplete="tel" />
          </Field>
        </div>
        <Field label="Address">
          <input value={form.address} onChange={set('address')} autoComplete="street-address" />
        </Field>
        <ErrorNote message={error} />
        <div className="vy-actions">
          <Button type="submit" variant="primary" busy={busy}>
            Save changes
          </Button>
        </div>
      </form>
    </Panel>
  );
}

/* ---------------------------------------------------------- Payment return */

/** Where OMPAY sends the client back. The result is confirmed server-side, never read from the URL. */
export function BillingReturn() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const payment = params.get('payment') ?? '';
  const [state, setState] = useState<'checking' | 'successful' | 'failed' | 'processing'>('checking');

  useEffect(() => {
    let stop = false;
    let tries = 0;
    const check = async () => {
      try {
        const { status } = await api.post<{ status: 'successful' | 'failed' | 'processing' | 'skipped' }>(
          'billing/confirm', { payment_id: payment },
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

  useEffect(() => {
    if (state === 'successful') toast('Payment received');
  }, [state, toast]);

  const copy = {
    checking: ['Confirming your payment', 'Checking the result with the bank. This takes a few seconds.'],
    successful: ['Payment received', 'Thank you. Your account is up to date.'],
    failed: ['The payment did not go through', 'No money was taken. You can try again from Billing.'],
    processing: ['Still processing', 'The bank has not confirmed this payment yet. Your billing page updates as soon as it does.'],
  }[state];

  return (
    <div className="vy vy-fullstate">
      <div className="vy-auth__form" style={{ textAlign: 'left' }}>
        <div className="vy-auth__mark" style={{ display: 'block' }}>VYRO</div>
        <h1 style={{ font: 'var(--t-display)' }}>{copy[0]}</h1>
        <p>{copy[1]}</p>
        {state === 'checking' ? (
          <span className="vy-skel" style={{ width: '60%' }} />
        ) : (
          <Button variant="primary" onClick={() => navigate('/portal/billing')}>
            Back to billing
          </Button>
        )}
      </div>
    </div>
  );
}
