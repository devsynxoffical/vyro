import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { COMPANY_COLUMNS, day, money, supabase, type Company, type Invoice } from '../api';
import { useAuth } from '../auth';
import { InvoiceBadge } from '../ui';

interface PaymentRow {
  id: string;
  status: string;
  flow: string;
  amount: number;
  card_brand: string | null;
  card_masked: string | null;
  updated_at: string;
}

// Seller details printed on invoices, e.g. "VYRO LLC\nCR 1234567\nMuscat, Oman".
const SELLER = ((import.meta.env.VITE_INVOICE_FROM as string | undefined) ?? 'VYRO').split('\\n');

/** A printable invoice ("Print" → "Save as PDF" in any browser). */
export function InvoicePage() {
  const { id = '' } = useParams();
  const { profile } = useAuth();
  const [inv, setInv] = useState<Invoice | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('invoices').select('*, invoice_items(id, description, amount)').eq('id', id).maybeSingle();
      if (!data) return setMissing(true);
      const invoice = data as Invoice;
      setInv(invoice);
      const [c, p] = await Promise.all([
        supabase.from('companies').select(COMPANY_COLUMNS).eq('id', invoice.company_id).single(),
        supabase.from('payments').select('id, status, flow, amount, card_brand, card_masked, updated_at').eq('invoice_id', id).eq('status', 'successful'),
      ]);
      setCompany(c.data as Company);
      setPayments((p.data ?? []) as PaymentRow[]);
    })();
  }, [id]);

  if (missing) return <div className="sa sa-center">Invoice not found.</div>;
  if (!inv || !company) return <div className="sa sa-center">Loading…</div>;
  const back = profile?.role === 'admin' ? `/admin/clients/${inv.company_id}` : '/portal';

  return (
    <div className="sa sa-invoice-page">
      <div className="sa-invoice-bar">
        <Link to={back}>← Back</Link>
        <button className="sa-btn" onClick={() => window.print()}>
          Print / save as PDF
        </button>
      </div>
      <article className="sa-invoice">
        <header>
          <div>
            <h1>Invoice {inv.number}</h1>
            <InvoiceBadge status={inv.status} />
          </div>
          <address>
            {SELLER.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </address>
        </header>
        <div className="sa-invoice__meta">
          <div>
            <h3>Billed to</h3>
            <strong>{company.name}</strong>
            {company.address && <div>{company.address}</div>}
            {company.contact_email && <div>{company.contact_email}</div>}
          </div>
          <dl className="sa-dl">
            <dt>Issued</dt>
            <dd>{day(inv.created_at)}</dd>
            <dt>Due</dt>
            <dd>{day(inv.due_date)}</dd>
            {inv.period_start && (
              <>
                <dt>Period</dt>
                <dd>
                  {day(inv.period_start)} – {day(inv.period_end)}
                </dd>
              </>
            )}
            {inv.paid_at && (
              <>
                <dt>Paid</dt>
                <dd>{day(inv.paid_at)}</dd>
              </>
            )}
          </dl>
        </div>
        <table className="sa-table">
          <thead>
            <tr>
              <th>Description</th>
              <th className="sa-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(inv.invoice_items ?? []).map((it) => (
              <tr key={it.id}>
                <td>{it.description}</td>
                <td className="sa-right">{money(it.amount, inv.currency)}</td>
              </tr>
            ))}
            <tr className="sa-invoice__total">
              <td>Total</td>
              <td className="sa-right">{money(inv.total, inv.currency)}</td>
            </tr>
          </tbody>
        </table>
        {payments.map((p) => (
          <p key={p.id} className="sa-muted">
            Paid {money(p.amount, inv.currency)} on {day(p.updated_at)}
            {p.flow === 'offline' ? ' (recorded by VYRO)' : p.card_brand ? ` by ${p.card_brand} ${p.card_masked ?? ''}` : ' by card'}
          </p>
        ))}
      </article>
    </div>
  );
}
