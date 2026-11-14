import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CircleCheck, LayoutDashboard, Plus, ReceiptText, Search, Settings, Users } from 'lucide-react';
import {
  ago, amount, api, day, isLive, logoUrl, money, noticeTone,
  type Company, type Invoice, type Notice, type Plan, type Subscription, type SubscriptionStatus,
} from '../../api';
import { AppShell, useCrumbs, type NavItem } from '../../shell';
import {
  Affix, Avatar, BarChart, Button, CodeBox, Empty, ErrorNote, Facts, Field, InvoiceStatus, Ledger, LiveStatus,
  PageHead, Pager, Panel, SkeletonRows, SortTh, SubStatus, Tabs, useAction, usePager, type SortState,
} from '../../ui';

const NAV: NavItem[] = [
  { to: '/admin', label: 'Overview', icon: <LayoutDashboard />, end: true },
  { to: '/admin/clients', label: 'Clients', icon: <Users /> },
  { to: '/admin/invoices', label: 'Invoices', icon: <ReceiptText /> },
  { to: '/admin/settings', label: 'Settings', icon: <Settings /> },
];

export function AdminLayout() {
  return <AppShell nav={NAV} section="Admin" settingsTo="/admin/settings" identity={{ name: 'VYRO' }} search />;
}

export interface ClientRow {
  company: Company;
  plan?: Plan | null;
  sub?: Subscription | null;
}

/** Every client with its current plan and subscription. */
export function useClients(): ClientRow[] | null {
  const [rows, setRows] = useState<ClientRow[] | null>(null);
  useEffect(() => {
    api
      .get<{ clients: ClientRow[] }>('admin/clients')
      .then(({ clients }) => setRows(clients))
      .catch(() => setRows([]));
  }, []);
  return rows;
}

const monthly = (p: Plan) => Number(p.recurring_fee) / (p.billing_interval === 'annual' ? 12 : 1);

/* --------------------------------------------------------------- Overview */

export function AdminOverview() {
  useCrumbs([{ label: 'Overview' }]);
  const rows = useClients();
  const [failed, setFailed] = useState<Invoice[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [revenue, setRevenue] = useState<{ month: string; collected: number; payments: number }[] | null>(null);

  useEffect(() => {
    api
      .get<{ failed: Invoice[]; notices: Notice[]; revenue: { month: string; collected: number; payments: number }[] }>('admin/overview')
      .then((o) => {
        setFailed(o.failed);
        setNotices(o.notices);
        setRevenue(o.revenue);
      })
      .catch(() => setRevenue([]));
  }, []);

  const stats = useMemo(() => {
    const list = rows ?? [];
    const count = (...st: SubscriptionStatus[]) => list.filter((r) => r.sub && st.includes(r.sub.status)).length;
    const mrr = list
      .filter((r) => r.plan && r.sub && ['active', 'past_due', 'cancel_scheduled'].includes(r.sub.status))
      .reduce((sum, r) => sum + monthly(r.plan!), 0);
    return { active: count('active', 'cancel_scheduled'), overdue: count('past_due', 'suspended'), pending: count('pending_setup'), mrr };
  }, [rows]);

  const soon = useMemo(() => {
    const limit = new Date();
    limit.setDate(limit.getDate() + 14);
    const max = limit.toISOString().slice(0, 10);
    return (rows ?? [])
      .filter((r) => r.sub?.status === 'active' && r.sub.next_billing_date && r.sub.next_billing_date <= max)
      .sort((a, b) => a.sub!.next_billing_date!.localeCompare(b.sub!.next_billing_date!));
  }, [rows]);

  const names = useMemo(() => new Map((rows ?? []).map((r) => [r.company.id, r.company.name])), [rows]);
  const thisMonth = revenue?.length ? Number(revenue[revenue.length - 1].collected) : 0;
  const lastMonth = revenue && revenue.length > 1 ? Number(revenue[revenue.length - 2].collected) : null;

  return (
    <div className="vy-stack">
      <PageHead
        title="Overview"
        description="Revenue, renewals and anything that needs you today."
        actions={
          <Link to="/admin/clients/new" className="vy-btn vy-btn--primary">
            <Plus /> New client
          </Link>
        }
      />

      <Ledger
        metrics={[
          { label: 'Monthly recurring revenue', value: amount(stats.mrr), unit: 'OMR', note: `${stats.active} paying client${stats.active === 1 ? '' : 's'}`, wide: true },
          {
            label: 'Collected this month',
            value: amount(thisMonth),
            unit: 'OMR',
            note: lastMonth !== null ? `${amount(lastMonth)} last month` : undefined,
          },
          { label: 'Overdue or suspended', value: stats.overdue, tone: stats.overdue ? 'bad' : undefined, note: stats.overdue ? 'Needs follow-up' : 'All clients paid up' },
          { label: 'Awaiting setup payment', value: stats.pending, note: 'Invited, not yet paid' },
        ]}
      />

      <div className="vy-split">
        <div className="vy-stack">
          <Panel title="Needs attention" description="Failed payments, most recent first" flush>
            {rows === null ? (
              <SkeletonRows rows={3} />
            ) : failed.length === 0 ? (
              <Empty icon={<CircleCheck />} title="Nothing needs attention">
                No failed payments right now.
              </Empty>
            ) : (
              <div className="vy-table-wrap">
                <table className="vy-table vy-table--stack vy-table--hover">
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Invoice</th>
                      <th>Attempts</th>
                      <th className="is-num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {failed.map((inv) => (
                      <tr key={inv.id}>
                        <td className="is-primary">
                          <Link className="vy-rowlink" to={`/admin/clients/${inv.company_id}?tab=billing`}>
                            {names.get(inv.company_id) ?? 'Client'}
                          </Link>
                        </td>
                        <td data-label="Invoice" className="vy-mono">
                          {inv.number}
                        </td>
                        <td data-label="Attempts" className="vy-num">
                          {inv.attempts}
                        </td>
                        <td className="is-num is-aside">{money(inv.total, inv.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Upcoming renewals" description="Next 14 days" flush>
            {rows === null ? (
              <SkeletonRows rows={3} />
            ) : soon.length === 0 ? (
              <Empty title="No renewals in the next 14 days" />
            ) : (
              <div className="vy-table-wrap">
                <table className="vy-table vy-table--stack vy-table--hover">
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Renews</th>
                      <th className="is-num">Base fee</th>
                    </tr>
                  </thead>
                  <tbody>
                    {soon.map((r) => (
                      <tr key={r.company.id}>
                        <td className="is-primary">
                          <Link className="vy-rowlink" to={`/admin/clients/${r.company.id}`}>
                            {r.company.name}
                          </Link>
                        </td>
                        <td data-label="Renews">{day(r.sub!.next_billing_date)}</td>
                        <td className="is-num is-aside">{r.plan ? money(r.plan.recurring_fee, r.plan.currency) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        <div className="vy-stack">
          <Panel title="Revenue collected" description="Last 6 months, OMR" flush>
            {revenue === null ? (
              <SkeletonRows rows={4} />
            ) : revenue.length === 0 ? (
              <Empty title="No payments yet">Collected payments are charted here by month.</Empty>
            ) : (
              <BarChart
                label="Revenue collected per month"
                bars={revenue.map((m, i) => ({
                  label: new Date(m.month).toLocaleDateString('en-GB', { month: 'short' }),
                  value: Number(m.collected),
                  tip: `${money(m.collected)} · ${m.payments} payment${m.payments === 1 ? '' : 's'}`,
                  current: i === revenue.length - 1,
                }))}
              />
            )}
          </Panel>

          <Panel title="Activity" flush>
            {notices.length === 0 ? (
              <Empty title="No activity yet">Registrations, payments and cancellations are logged here.</Empty>
            ) : (
              <ul className="vy-feed">
                {notices.map((n) => {
                  const tone = noticeTone(n.kind);
                  return (
                    <li key={n.id}>
                      <span className={`vy-feed__dot ${tone ? `vy-feed__dot--${tone}` : ''}`} />
                      <strong>
                        {n.company_id ? (
                          <Link to={`/admin/clients/${n.company_id}`}>{names.get(n.company_id) ?? 'Client'}</Link>
                        ) : (
                          'VYRO'
                        )}
                      </strong>
                      <time>{ago(n.created_at)}</time>
                      <p>
                        {n.title}
                        {n.body ? ` — ${n.body}` : ''}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Clients */

type ClientFilter = 'all' | 'active' | 'overdue' | 'pending' | 'ended';
type ClientSort = 'name' | 'status' | 'fee' | 'next' | 'products';

const FILTER_MATCH: Record<ClientFilter, SubscriptionStatus[] | null> = {
  all: null,
  active: ['active'],
  overdue: ['past_due', 'suspended'],
  pending: ['pending_setup'],
  ended: ['cancel_scheduled', 'cancelled'],
};

export function AdminClients() {
  useCrumbs([{ label: 'Clients' }]);
  const rows = useClients();
  const [params, setParams] = useSearchParams();
  const filter = (params.get('status') as ClientFilter) || 'all';
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortState<ClientSort>>({ key: 'name', dir: 'asc' });

  const counts = useMemo(() => {
    const c = (f: ClientFilter) => (rows ?? []).filter((r) => !FILTER_MATCH[f] || (r.sub && FILTER_MATCH[f]!.includes(r.sub.status))).length;
    return { all: c('all'), active: c('active'), overdue: c('overdue'), pending: c('pending'), ended: c('ended') };
  }, [rows]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const match = FILTER_MATCH[filter];
    const list = (rows ?? []).filter(
      (r) =>
        (!match || (r.sub && match.includes(r.sub.status))) &&
        (!term || `${r.company.name} ${r.company.store_name ?? ''} ${r.company.contact_email ?? ''}`.toLowerCase().includes(term)),
    );
    const dir = sort.dir === 'asc' ? 1 : -1;
    const val = (r: ClientRow): string | number =>
      sort.key === 'name'
        ? r.company.name.toLowerCase()
        : sort.key === 'status'
          ? (r.sub?.status ?? '')
          : sort.key === 'fee'
            ? (r.plan ? monthly(r.plan) : -1)
            : sort.key === 'products'
              ? (r.plan?.product_limit ?? -1)
              : (r.sub?.next_billing_date ?? '9999');
    return [...list].sort((a, b) => (val(a) < val(b) ? -dir : val(a) > val(b) ? dir : 0));
  }, [rows, q, filter, sort]);

  const pager = usePager(shown, 12);

  return (
    <div className="vy-stack">
      <PageHead
        title="Clients"
        description="Every company on VYRO, with its subscription and widget status."
        actions={
          <Link to="/admin/clients/new" className="vy-btn vy-btn--primary">
            <Plus /> New client
          </Link>
        }
      />
      <section className="vy-panel vy-panel--flush">
        <Tabs
          inset
          label="Filter clients by status"
          value={filter}
          onChange={(id) => {
            pager.setPage(0);
            setParams(id === 'all' ? {} : { status: id }, { replace: true });
          }}
          tabs={[
            { id: 'all', label: 'All', count: counts.all },
            { id: 'active', label: 'Active', count: counts.active },
            { id: 'overdue', label: 'Overdue', count: counts.overdue, countTone: 'bad' },
            { id: 'pending', label: 'Awaiting setup', count: counts.pending },
            { id: 'ended', label: 'Cancelled', count: counts.ended },
          ]}
        />
        <div className="vy-toolbar">
          <div className="vy-search">
            <Search />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                pager.setPage(0);
              }}
              placeholder="Search by company or email"
              aria-label="Search clients"
            />
          </div>
        </div>
        {rows === null ? (
          <SkeletonRows rows={6} />
        ) : shown.length === 0 ? (
          <Empty
            icon={<Users />}
            title={rows.length === 0 ? 'No clients yet' : 'No clients match'}
            action={
              rows.length === 0 ? (
                <Link to="/admin/clients/new" className="vy-btn vy-btn--primary">
                  <Plus /> Add your first client
                </Link>
              ) : undefined
            }
          >
            {rows.length === 0 ? 'Create a client to send them a registration link.' : 'Try a different search or status.'}
          </Empty>
        ) : (
          <div className="vy-table-wrap">
            <table className="vy-table vy-table--stack vy-table--hover">
              <thead>
                <tr>
                  <SortTh id="name" sort={sort} onSort={setSort}>Company</SortTh>
                  <SortTh id="status" sort={sort} onSort={setSort}>Subscription</SortTh>
                  <th>Widget</th>
                  <SortTh id="fee" sort={sort} onSort={setSort} num>Plan</SortTh>
                  <SortTh id="products" sort={sort} onSort={setSort} num>Products</SortTh>
                  <SortTh id="next" sort={sort} onSort={setSort}>Next payment</SortTh>
                </tr>
              </thead>
              <tbody>
                {pager.slice.map(({ company, plan, sub }) => (
                  <tr key={company.id}>
                    <td className="is-primary">
                      <Link to={`/admin/clients/${company.id}`} className="vy-cell vy-rowlink">
                        <Avatar name={company.name} src={logoUrl(company.logo_path)} />
                        <span>
                          <strong>{company.name}</strong>
                          {company.contact_email && <small>{company.contact_email}</small>}
                        </span>
                      </Link>
                    </td>
                    <td className="is-aside">{sub && <SubStatus status={sub.status} />}</td>
                    <td data-label="Widget">
                      <LiveStatus live={isLive(sub)} />
                    </td>
                    <td className="is-num" data-label="Plan">
                      {plan ? `${money(plan.recurring_fee, plan.currency)} / ${plan.billing_interval === 'annual' ? 'yr' : 'mo'}` : '—'}
                    </td>
                    <td className="is-num" data-label="Products">
                      {plan?.product_limit ?? '—'}
                    </td>
                    <td data-label="Next payment">{day(sub?.next_billing_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager {...pager} noun="clients" />
      </section>
    </div>
  );
}

/* ------------------------------------------------------------- New client */

export function AdminNewClient() {
  useCrumbs([{ label: 'Clients', to: '/admin/clients' }, { label: 'New client' }]);
  const navigate = useNavigate();
  const [f, setF] = useState({
    name: '', contact_name: '', contact_email: '', contact_phone: '', website: '',
    setup_fee: '0', recurring_fee: '', billing_interval: 'monthly', product_limit: '0',
    billing_start_date: '', contract_months: '', cancellation_terms: '', domains: '',
  });
  const [result, setResult] = useState<{ company_id: string; invite_url: string | null } | null>(null);
  const { busy, error, run } = useAction();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      setResult(
        await api.post('admin/clients', {
          company: { name: f.name, contact_name: f.contact_name, contact_email: f.contact_email, contact_phone: f.contact_phone, website: f.website },
          plan: {
            setup_fee: f.setup_fee || 0, recurring_fee: f.recurring_fee, billing_interval: f.billing_interval,
            product_limit: f.product_limit || 0, billing_start_date: f.billing_start_date || null,
            contract_months: f.contract_months || null, cancellation_terms: f.cancellation_terms,
          },
          allowed_domains: f.domains.split(/[\s,]+/).filter(Boolean),
        }),
      );
    }, 'Client created');
  };

  if (result) {
    return (
      <div className="vy-stack" style={{ maxWidth: 640 }}>
        <PageHead title={`${f.name} is set up`} description="Send the registration link so they can create their login and pay the setup fee." />
        <Panel title="Registration link" description="Works once. Expires in 7 days.">
          {result.invite_url ? (
            <CodeBox value={result.invite_url} />
          ) : (
            <p className="vy-muted">No email was entered, so no link was made. You can create one from the client page.</p>
          )}
        </Panel>
        <div className="vy-actions">
          <Button variant="primary" onClick={() => navigate(`/admin/clients/${result.company_id}`)}>
            Open client
          </Button>
          <Button onClick={() => navigate('/admin/clients')}>Back to clients</Button>
        </div>
      </div>
    );
  }

  const setup = Number(f.setup_fee) || 0;
  const fee = Number(f.recurring_fee) || 0;
  const per = f.billing_interval === 'annual' ? 'year' : 'month';

  return (
    <form onSubmit={submit} className="vy-stack">
      <PageHead title="New client" description="Create the company and its plan. A one-time registration link is generated when you save." />
      <div className="vy-split vy-split--form">
        <div className="vy-stack">
          <Panel title="Company">
            <div className="vy-form">
              <div className="vy-grid2">
                <Field label="Company name">
                  <input value={f.name} onChange={set('name')} required />
                </Field>
                <Field label="Client email" hint="The registration link is tied to this address">
                  <input type="email" value={f.contact_email} onChange={set('contact_email')} required />
                </Field>
                <Field label="Contact name">
                  <input value={f.contact_name} onChange={set('contact_name')} />
                </Field>
                <Field label="Phone">
                  <input value={f.contact_phone} onChange={set('contact_phone')} inputMode="tel" />
                </Field>
                <Field label="Website">
                  <input value={f.website} onChange={set('website')} placeholder="clientstore.com" inputMode="url" />
                </Field>
                <Field label="Websites allowed to run VYRO" hint="Comma separated. Empty allows any site for now.">
                  <input value={f.domains} onChange={set('domains')} placeholder="clientstore.com" />
                </Field>
              </div>
            </div>
          </Panel>
          <Panel title="Plan">
            <div className="vy-form">
              <div className="vy-grid2">
                <Field label="One-time setup fee">
                  <Affix unit="OMR">
                    <input type="number" min="0" step="0.001" inputMode="decimal" value={f.setup_fee} onChange={set('setup_fee')} />
                  </Affix>
                </Field>
                <Field label="Subscription fee">
                  <Affix unit="OMR">
                    <input type="number" min="0" step="0.001" inputMode="decimal" value={f.recurring_fee} onChange={set('recurring_fee')} required />
                  </Affix>
                </Field>
                <Field label="Billed">
                  <select value={f.billing_interval} onChange={set('billing_interval')}>
                    <option value="monthly">Monthly</option>
                    <option value="annual">Yearly</option>
                  </select>
                </Field>
                <Field label="Products included">
                  <input type="number" min="0" step="1" inputMode="numeric" value={f.product_limit} onChange={set('product_limit')} />
                </Field>
                <Field label="First subscription charge on" hint="Empty: the day the setup fee is paid">
                  <input type="date" value={f.billing_start_date} onChange={set('billing_start_date')} />
                </Field>
                <Field label="Contract length" hint="Optional">
                  <Affix unit="months">
                    <input type="number" min="1" step="1" inputMode="numeric" value={f.contract_months} onChange={set('contract_months')} />
                  </Affix>
                </Field>
              </div>
              <Field label="Cancellation conditions" hint="Shown to the client on their billing page">
                <input value={f.cancellation_terms} onChange={set('cancellation_terms')} />
              </Field>
            </div>
          </Panel>
        </div>

        <aside className="vy-summary">
          <Panel title="Summary">
            <Facts
              rows={[
                ['Client', f.name || '—'],
                ['Setup fee, once', <span className="vy-mono">{money(setup)}</span>],
                [`Then every ${per}`, <span className="vy-mono">{money(fee)}</span>],
                ['Products included', f.product_limit || '0'],
                ['First charge', f.billing_start_date ? day(f.billing_start_date) : 'When setup is paid'],
              ]}
            />
            <div className="vy-summary__total">
              <span className="vy-label">Due to start</span>
              <strong>
                {amount(setup)} <small className="vy-label">OMR</small>
              </strong>
            </div>
            <ErrorNote message={error} />
          </Panel>
          <div className="vy-actions vy-stickybar" style={{ marginTop: 16 }}>
            <Button type="submit" variant="primary" busy={busy} block>
              Create client
            </Button>
          </div>
        </aside>
      </div>
    </form>
  );
}

/* --------------------------------------------------------------- Invoices */

type InvFilter = 'all' | 'due' | 'failed' | 'paid';
type InvSort = 'date' | 'client' | 'total' | 'status';

export function AdminInvoices() {
  useCrumbs([{ label: 'Invoices' }]);
  const [rows, setRows] = useState<Invoice[] | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [filter, setFilter] = useState<InvFilter>('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortState<InvSort>>({ key: 'date', dir: 'desc' });

  useEffect(() => {
    api
      .get<{ invoices: (Invoice & { company_name: string })[] }>('admin/invoices')
      .then(({ invoices }) => {
        setNames(new Map(invoices.map((i) => [i.company_id, i.company_name])));
        setRows(invoices);
      })
      .catch(() => setRows([]));
  }, []);

  const is = (f: InvFilter, inv: Invoice) =>
    f === 'all' || (f === 'due' ? inv.status === 'open' || inv.status === 'processing' : inv.status === f);
  const counts = useMemo(
    () => ({
      all: rows?.length ?? 0,
      due: (rows ?? []).filter((r) => is('due', r)).length,
      failed: (rows ?? []).filter((r) => is('failed', r)).length,
      paid: (rows ?? []).filter((r) => is('paid', r)).length,
    }),
    [rows],
  );
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = (rows ?? []).filter(
      (r) => is(filter, r) && (!term || `${r.number} ${names.get(r.company_id) ?? ''}`.toLowerCase().includes(term)),
    );
    const dir = sort.dir === 'asc' ? 1 : -1;
    const val = (r: Invoice): string | number =>
      sort.key === 'date' ? r.created_at : sort.key === 'client' ? (names.get(r.company_id) ?? '').toLowerCase() : sort.key === 'total' ? Number(r.total) : r.status;
    return [...list].sort((a, b) => (val(a) < val(b) ? -dir : val(a) > val(b) ? dir : 0));
  }, [rows, names, q, filter, sort]);
  const pager = usePager(shown, 15);
  const outstanding = (rows ?? []).filter((r) => r.status !== 'paid').reduce((s, r) => s + Number(r.total), 0);

  return (
    <div className="vy-stack">
      <PageHead
        title="Invoices"
        description={rows ? `${money(outstanding)} outstanding across ${counts.due + counts.failed} unpaid invoices.` : 'Every invoice across all clients.'}
      />
      <section className="vy-panel vy-panel--flush">
        <Tabs
          inset
          label="Filter invoices"
          value={filter}
          onChange={(id) => {
            setFilter(id);
            pager.setPage(0);
          }}
          tabs={[
            { id: 'all', label: 'All', count: counts.all },
            { id: 'due', label: 'Due', count: counts.due },
            { id: 'failed', label: 'Failed', count: counts.failed, countTone: 'bad' },
            { id: 'paid', label: 'Paid', count: counts.paid },
          ]}
        />
        <div className="vy-toolbar">
          <div className="vy-search">
            <Search />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                pager.setPage(0);
              }}
              placeholder="Search by invoice number or client"
              aria-label="Search invoices"
            />
          </div>
        </div>
        {rows === null ? (
          <SkeletonRows rows={6} />
        ) : shown.length === 0 ? (
          <Empty icon={<ReceiptText />} title={rows.length === 0 ? 'No invoices yet' : 'No invoices match'}>
            {rows.length === 0 ? 'Invoices are created when a client’s plan starts and at each renewal.' : 'Try a different search or filter.'}
          </Empty>
        ) : (
          <div className="vy-table-wrap">
            <table className="vy-table vy-table--stack vy-table--hover">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <SortTh id="client" sort={sort} onSort={setSort}>Client</SortTh>
                  <SortTh id="date" sort={sort} onSort={setSort}>Issued</SortTh>
                  <th>Type</th>
                  <SortTh id="status" sort={sort} onSort={setSort}>Status</SortTh>
                  <SortTh id="total" sort={sort} onSort={setSort} num>Amount</SortTh>
                </tr>
              </thead>
              <tbody>
                {pager.slice.map((inv) => (
                  <tr key={inv.id}>
                    <td className="is-primary">
                      <Link className="vy-rowlink vy-mono" to={`/admin/invoices/${inv.id}`}>
                        {inv.number}
                      </Link>
                    </td>
                    <td data-label="Client">
                      <Link className="vy-rowlink" to={`/admin/clients/${inv.company_id}?tab=billing`}>
                        {names.get(inv.company_id) ?? 'Client'}
                      </Link>
                    </td>
                    <td data-label="Issued">{day(inv.created_at)}</td>
                    <td data-label="Type">{inv.kind === 'setup' ? 'Setup fee' : inv.kind === 'subscription' ? 'Subscription' : 'Charge'}</td>
                    <td className="is-aside">
                      <InvoiceStatus status={inv.status} />
                    </td>
                    <td className="is-num" data-label="Amount">
                      {money(inv.total, inv.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager {...pager} noun="invoices" />
      </section>
    </div>
  );
}
