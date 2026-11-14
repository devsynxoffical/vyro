import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { COMPANY_COLUMNS, day, money, supabase, type Company, type Invoice } from '../api';
import { useAuth } from '../auth';
import { useCrumbs } from '../shell';
import { Button, Empty, Facts, InvoiceStatus, SkeletonRows } from '../ui';

interface PaymentRow {
  id: string;
  flow: string;
  amount: number;
  card_brand: string | null;
  card_masked: string | null;
  updated_at: string;
}

// Seller details printed on invoices, e.g. "VYRO LLC\nCR 1234567\nMuscat, Oman".
const SELLER = ((import.meta.env.VITE_INVOICE_FROM as string | undefined) ?? 'VYRO').split('\\n');

/** A printable invoice ("Print" then "Save as PDF" in any browser). */
export function InvoicePage() {
  const { id = '' } = useParams();
  const { profile } = useAuth();
  const admin = profile?.role === 'admin';
  const [inv, setInv] = useState<Invoice | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [missing, setMissing] = useState(false);
  useCrumbs(
    admin
      ? [{ label: 'Invoices', to: '/admin/invoices' }, { label: inv?.number ?? 'Invoice' }]
      : [{ label: 'Billing', to: '/portal/billing' }, { label: inv?.number ?? 'Invoice' }],
  );

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('invoices').select('*, invoice_items(id, description, amount)').eq('id', id).maybeSingle();
      if (!data) return setMissing(true);
      const invoice = data as Invoice;
      setInv(invoice);
      const [c, p] = await Promise.all([
        supabase.from('companies').select(COMPANY_COLUMNS).eq('id', invoice.company_id).single(),
        supabase.from('payments').select('id, flow, amount, card_brand, card_masked, updated_at').eq('invoice_id', id).eq('status', 'successful'),
      ]);
      setCompany(c.data as Company);
      setPayments((p.data ?? []) as PaymentRow[]);
    })();
  }, [id]);

  if (missing) return <Empty title="Invoice not found" />;
  if (!inv || !company) return <SkeletonRows rows={8} />;
  const back = admin ? `/admin/clients/${inv.company_id}?tab=billing` : '/portal/billing';

  return (
    <div>
      <div className="vy-doc-bar">
        <Link to={back} className="vy-btn vy-btn--ghost">
          <ArrowLeft /> Back
        </Link>
        <Button variant="primary" icon={<Printer />} onClick={() => window.print()}>
          Print / save as PDF
        </Button>
      </div>
      <article className="vy-doc">
        <div className="vy-doc__top">
          <div>
            <p className="vy-label">Invoice</p>
            <h1 className="vy-mono" style={{ font: 'var(--t-display)', fontFamily: 'var(--font-mono)' }}>
              {inv.number}
            </h1>
            <div style={{ marginTop: 8 }}>
              <InvoiceStatus status={inv.status} />
            </div>
          </div>
          <address>
            {SELLER.map((line, i) => (i === 0 ? <strong key={line}>{line}</strong> : <div key={line}>{line}</div>))}
          </address>
        </div>
        <div className="vy-doc__meta">
          <div>
            <p className="vy-label" style={{ marginBottom: 6 }}>
              Billed to
            </p>
            <strong>{company.name}</strong>
            {company.address && <div className="vy-muted">{company.address}</div>}
            {company.contact_email && <div className="vy-muted">{company.contact_email}</div>}
          </div>
          <Facts
            rows={[
              ['Issued', day(inv.created_at)],
              ['Due', day(inv.due_date)],
              ...(inv.period_start ? ([['Period', `${day(inv.period_start)} – ${day(inv.period_end)}`]] as [string, string][]) : []),
              ...(inv.paid_at ? ([['Paid', day(inv.paid_at)]] as [string, string][]) : []),
            ]}
          />
        </div>
        <table className="vy-table">
          <thead>
            <tr>
              <th>Description</th>
              <th className="is-num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(inv.invoice_items ?? []).map((it) => (
              <tr key={it.id}>
                <td>{it.description}</td>
                <td className="is-num">{money(it.amount, inv.currency)}</td>
              </tr>
            ))}
            <tr className="vy-doc__total">
              <td>Total</td>
              <td className="is-num">{money(inv.total, inv.currency)}</td>
            </tr>
          </tbody>
        </table>
        {payments.map((p) => (
          <p key={p.id} className="vy-small vy-muted" style={{ marginTop: 16 }}>
            Paid {money(p.amount, inv.currency)} on {day(p.updated_at)}
            {p.flow === 'offline' ? ' (recorded by VYRO)' : p.card_brand ? ` by ${p.card_brand} ${p.card_masked ?? ''}` : ' by card'}
          </p>
        ))}
      </article>
    </div>
  );
}
