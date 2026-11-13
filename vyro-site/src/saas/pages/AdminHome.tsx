import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  callFn, COMPANY_COLUMNS, day, isLive, logoUrl, money, supabase,
  type Company, type Invoice, type Notice, type Plan, type Subscription, type SubscriptionStatus,
} from '../api';
import { Card, CopyBox, ErrorNote, Field, Shell, StatusBadge, useAction } from '../ui';

export const adminNav = (
  <>
    <Link to="/admin">Clients</Link>
    <Link to="/admin/new">New client</Link>
    <Link to="/admin/settings">Settings</Link>
  </>
);

interface Row {
  company: Company;
  plan?: Plan;
  sub?: Subscription;
}

export function AdminHome() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState<Invoice[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [revenue, setRevenue] = useState<{ month: string; collected: number; payments: number }[]>([]);
  const [filter, setFilter] = useState<'all' | SubscriptionStatus>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    void (async () => {
      const [c, p, s, f, n, r] = await Promise.all([
        supabase.from('companies').select(COMPANY_COLUMNS).order('created_at', { ascending: false }),
        supabase.from('plans').select('*').eq('active', true),
        supabase.from('subscriptions').select('*'),
        supabase.from('invoices').select('*').eq('status', 'failed').order('created_at', { ascending: false }),
        supabase.from('notifications').select('*').eq('audience', 'admin').order('created_at', { ascending: false }).limit(12),
        supabase.rpc('admin_revenue_by_month', { p_months: 6 }),
      ]);
      const plans = new Map(((p.data ?? []) as Plan[]).map((x) => [x.company_id, x]));
      const subs = new Map(((s.data ?? []) as Subscription[]).map((x) => [x.company_id, x]));
      setRows(((c.data ?? []) as Company[]).map((company) => ({ company, plan: plans.get(company.id), sub: subs.get(company.id) })));
      setFailed((f.data ?? []) as Invoice[]);
      setNotices((n.data ?? []) as Notice[]);
      setRevenue((r.data ?? []) as typeof revenue);
    })();
  }, []);

  const stats = useMemo(() => {
    const list = rows ?? [];
    const count = (st: SubscriptionStatus) => list.filter((r) => r.sub?.status === st).length;
    const mrr = list
      .filter((r) => r.sub && ['active', 'past_due', 'cancel_scheduled'].includes(r.sub.status) && r.plan)
      .reduce((sum, r) => sum + Number(r.plan!.recurring_fee) / (r.plan!.billing_interval === 'annual' ? 12 : 1), 0);
    const thisMonth = revenue.length ? Number(revenue[revenue.length - 1].collected) : 0;
    return { active: count('active'), overdue: count('past_due') + count('suspended'), cancelled: count('cancelled') + count('cancel_scheduled'), pending: count('pending_setup'), mrr, thisMonth };
  }, [rows, revenue]);

  const soon = useMemo(() => {
    const limit = new Date();
    limit.setDate(limit.getDate() + 14);
    const max = limit.toISOString().slice(0, 10);
    return (rows ?? [])
      .filter((r) => r.sub?.status === 'active' && r.sub.next_billing_date && r.sub.next_billing_date <= max)
      .sort((a, b) => a.sub!.next_billing_date!.localeCompare(b.sub!.next_billing_date!));
  }, [rows]);

  if (!rows) return <div className="sa sa-center">Loading…</div>;
  const names = new Map(rows.map((r) => [r.company.id, r.company.name]));
  const shown = rows.filter(
    (r) =>
      (filter === 'all' || r.sub?.status === filter) &&
      (!search || `${r.company.name} ${r.company.store_name ?? ''}`.toLowerCase().includes(search.toLowerCase())),
  );
  const peak = Math.max(1, ...revenue.map((m) => Number(m.collected)));

  return (
    <Shell title="Admin" nav={adminNav}>
      <div className="sa-stats">
        <Stat label="Active clients" value={String(stats.active)} />
        <Stat label="Overdue / suspended" value={String(stats.overdue)} tone={stats.overdue ? 'bad' : undefined} />
        <Stat label="Awaiting setup payment" value={String(stats.pending)} />
        <Stat label="Monthly recurring revenue" value={money(stats.mrr)} />
        <Stat label="Collected this month" value={money(stats.thisMonth)} />
      </div>

      <div className="sa-cols">
        <Card title="Needs attention">
          {failed.length === 0 ? (
            <p className="sa-muted">No failed payments.</p>
          ) : (
            <ul className="sa-feed">
              {failed.map((inv) => (
                <li key={inv.id}>
                  <strong>
                    <Link to={`/admin/clients/${inv.company_id}`}>{names.get(inv.company_id) ?? 'Client'}</Link>: payment failed
                  </strong>
                  <span>
                    {inv.number} · {money(inv.total, inv.currency)} · {inv.attempts} attempt{inv.attempts === 1 ? '' : 's'}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <h3>Upcoming payments (14 days)</h3>
          {soon.length === 0 ? (
            <p className="sa-muted">None.</p>
          ) : (
            <ul className="sa-feed">
              {soon.map((r) => (
                <li key={r.company.id}>
                  <strong>
                    <Link to={`/admin/clients/${r.company.id}`}>{r.company.name}</Link>
                  </strong>
                  <span>
                    {day(r.sub!.next_billing_date)} · {r.plan ? money(r.plan.recurring_fee, r.plan.currency) : ''} + extras
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div>
          <Card title="Revenue collected">
            {revenue.length === 0 ? (
              <p className="sa-muted">No payments yet.</p>
            ) : (
              <div className="sa-bars">
                {revenue.map((m) => (
                  <div key={m.month} className="sa-bar" title={`${money(m.collected)} from ${m.payments} payments`}>
                    <span className="sa-bar__value">{Number(m.collected).toFixed(0)}</span>
                    <div style={{ height: `${Math.max(2, (Number(m.collected) / peak) * 100)}%` }} />
                    <span>{new Date(m.month).toLocaleDateString('en-GB', { month: 'short' })}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card title="Notifications">
            {notices.length === 0 ? (
              <p className="sa-muted">Nothing yet.</p>
            ) : (
              <ul className="sa-feed">
                {notices.map((n) => (
                  <li key={n.id}>
                    <strong>
                      {n.company_id ? <Link to={`/admin/clients/${n.company_id}`}>{names.get(n.company_id) ?? 'Client'}</Link> : 'VYRO'}: {n.title}
                    </strong>
                    {n.body && <span>{n.body}</span>}
                    <time>{day(n.created_at)}</time>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Card
        title={`Clients (${shown.length})`}
        action={
          <div className="sa-filters">
            <input placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search clients" />
            <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Filter by status">
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="past_due">Overdue</option>
              <option value="suspended">Suspended</option>
              <option value="pending_setup">Awaiting setup</option>
              <option value="cancel_scheduled">Cancelling</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        }
      >
        {shown.length === 0 ? (
          <p className="sa-muted">
            No clients here. <Link to="/admin/new">Add a client</Link>.
          </p>
        ) : (
          <table className="sa-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Status</th>
                <th>VYRO</th>
                <th>Plan</th>
                <th>Products</th>
                <th>Next payment</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ company, plan, sub }) => (
                <tr key={company.id}>
                  <td>
                    <Link to={`/admin/clients/${company.id}`} className="sa-company">
                      {logoUrl(company.logo_path) ? (
                        <img src={logoUrl(company.logo_path)!} alt="" />
                      ) : (
                        <span className="sa-logo--mini">{company.name.slice(0, 1)}</span>
                      )}
                      {company.name}
                    </Link>
                  </td>
                  <td>{sub && <StatusBadge status={sub.status} />}</td>
                  <td>
                    <span className={`sa-badge sa-badge--${isLive(sub) ? 'good' : 'off'}`}>{isLive(sub) ? 'On' : 'Off'}</span>
                  </td>
                  <td>{plan ? `${money(plan.recurring_fee, plan.currency)} / ${plan.billing_interval === 'annual' ? 'year' : 'month'}` : '—'}</td>
                  <td>{plan?.product_limit ?? '—'}</td>
                  <td>{day(sub?.next_billing_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </Shell>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'bad' }) {
  return (
    <div className={`sa-stat ${tone ? `sa-stat--${tone}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function AdminNewClient() {
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
        await callFn('admin-clients', {
          action: 'create_client',
          company: { name: f.name, contact_name: f.contact_name, contact_email: f.contact_email, contact_phone: f.contact_phone, website: f.website },
          plan: {
            setup_fee: f.setup_fee || 0, recurring_fee: f.recurring_fee, billing_interval: f.billing_interval,
            product_limit: f.product_limit || 0, billing_start_date: f.billing_start_date || null,
            contract_months: f.contract_months || null, cancellation_terms: f.cancellation_terms,
          },
          allowed_domains: f.domains.split(/[\s,]+/).filter(Boolean),
        }),
      );
    });
  };

  if (result) {
    return (
      <Shell title="Admin" nav={adminNav}>
        <Card title="Client created">
          {result.invite_url ? (
            <>
              <p>Send this registration link to the client. It works once and expires in 7 days.</p>
              <CopyBox value={result.invite_url} />
            </>
          ) : (
            <p className="sa-muted">No email was entered, so no registration link was made. You can create one from the client page.</p>
          )}
          <div className="sa-actions">
            <button className="sa-btn" onClick={() => navigate(`/admin/clients/${result.company_id}`)}>
              Open client
            </button>
          </div>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell title="Admin" nav={adminNav}>
      <form onSubmit={submit}>
        <Card title="New client">
          <div className="sa-grid2">
            <Field label="Company name"><input value={f.name} onChange={set('name')} required /></Field>
            <Field label="Client email" hint="The registration link is tied to this address"><input type="email" value={f.contact_email} onChange={set('contact_email')} required /></Field>
            <Field label="Contact name"><input value={f.contact_name} onChange={set('contact_name')} /></Field>
            <Field label="Phone"><input value={f.contact_phone} onChange={set('contact_phone')} /></Field>
            <Field label="Website"><input value={f.website} onChange={set('website')} placeholder="clientstore.com" /></Field>
            <Field label="Websites allowed to run VYRO" hint="Comma separated. Leave empty to allow any site for now."><input value={f.domains} onChange={set('domains')} placeholder="clientstore.com" /></Field>
          </div>
        </Card>
        <Card title="Plan">
          <div className="sa-grid2">
            <Field label="One-time setup fee (OMR)"><input type="number" min="0" step="0.001" value={f.setup_fee} onChange={set('setup_fee')} /></Field>
            <Field label="Subscription fee (OMR)"><input type="number" min="0" step="0.001" value={f.recurring_fee} onChange={set('recurring_fee')} required /></Field>
            <Field label="Billed">
              <select value={f.billing_interval} onChange={set('billing_interval')}>
                <option value="monthly">Monthly</option>
                <option value="annual">Yearly</option>
              </select>
            </Field>
            <Field label="Products included"><input type="number" min="0" step="1" value={f.product_limit} onChange={set('product_limit')} /></Field>
            <Field label="First subscription charge on" hint="Empty = the day the setup fee is paid"><input type="date" value={f.billing_start_date} onChange={set('billing_start_date')} /></Field>
            <Field label="Contract length (months)" hint="Optional"><input type="number" min="1" step="1" value={f.contract_months} onChange={set('contract_months')} /></Field>
          </div>
          <Field label="Cancellation conditions" hint="Shown to the client"><input value={f.cancellation_terms} onChange={set('cancellation_terms')} /></Field>
          <ErrorNote message={error} />
          <div className="sa-actions">
            <button className="sa-btn" disabled={busy}>{busy ? 'Creating…' : 'Create client and registration link'}</button>
          </div>
        </Card>
      </form>
    </Shell>
  );
}
