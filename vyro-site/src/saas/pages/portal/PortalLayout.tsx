import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Building2, LayoutDashboard, Package, ReceiptText } from 'lucide-react';
import { api, logoUrl, money, type Company, type Invoice, type Payment, type PaymentMethod, type Plan, type Subscription } from '../../api';
import { useAuth } from '../../auth';
import { AppShell, type NavItem } from '../../shell';
import { Button, useAction, useAsk, useToast } from '../../ui';

export interface PortalData {
  company: Company;
  plan: Plan | null;
  sub: Subscription | null;
  invoices: Invoice[];
  card: PaymentMethod | null;
  payments: Payment[];
  widgetKey: string | null;
  liveProducts: number;
}

interface PortalState {
  data: PortalData;
  reload: () => void;
  /** Pay an invoice: with the saved card if there is one, otherwise on OMPAY's hosted page */
  pay: (invoiceId: string) => void;
  /** Add or replace the saved card on OMPAY's hosted page */
  updateCard: () => void;
  removeCard: () => void;
  busy: boolean;
}

const Ctx = createContext<PortalState | null>(null);

export function usePortal(): PortalState {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePortal outside PortalLayout');
  return v;
}

/** One request returns everything the portal shows; the server scopes it to the caller's company. */
const load = () => api.get<PortalData>('portal');

const NAV: NavItem[] = [
  { to: '/portal', label: 'Overview', icon: <LayoutDashboard />, end: true },
  { to: '/portal/billing', label: 'Billing', icon: <ReceiptText /> },
  { to: '/portal/products', label: 'Products', icon: <Package /> },
  { to: '/portal/company', label: 'Company', icon: <Building2 /> },
];

/** Loads the client's account once and shares it with every portal page. */
export function PortalLayout() {
  const { profile } = useAuth();
  const [data, setData] = useState<PortalData | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const { busy, run } = useAction();
  const ask = useAsk();
  const toast = useToast();
  const companyId = profile?.company_id;

  const reload = useCallback(() => {
    if (!companyId) return;
    setFailed(null);
    load().then(setData).catch((e: Error) => setFailed(e.message));
  }, [companyId]);
  useEffect(reload, [reload]);

  const redirect = (path: string, body: Record<string, unknown> = {}) =>
    void run(async () => {
      const res = await api.post<{ redirect_url: string }>(path, body);
      window.location.assign(res.redirect_url); // OMPAY's secure payment page
    });

  const pay = async (invoiceId: string) => {
    const inv = data?.invoices.find((i) => i.id === invoiceId);
    const card = data?.card;
    // No saved card, or a checkout was already started: use OMPAY's page.
    if (!inv || !card || inv.status === 'processing') return redirect('billing/pay', { invoice_id: invoiceId });
    const amount = money(inv.total, inv.currency);
    const useSaved = await ask({
      title: `Pay ${amount}?`,
      body: `Invoice ${inv.number} will be charged to your saved card ${card.masked_pan ?? ''}. To pay with a different card, choose "Change card" on the Billing page first.`,
      confirmLabel: `Pay ${amount}`,
    });
    if (!useSaved) return;
    void run(async () => {
      const { outcome } = await api.post<{ outcome: 'successful' | 'failed' | 'processing' | 'skipped' }>('billing/pay', {
        invoice_id: invoiceId,
        saved: true,
      });
      reload();
      if (outcome === 'successful') return toast('Payment received');
      if (outcome === 'processing') return toast('The bank is still confirming this payment. It will update here shortly.');
      const other = await ask({
        title: 'Your saved card was declined',
        body: 'No money was taken. You can pay this invoice with a different card on OMPAY’s secure page; that card is then saved for future payments.',
        confirmLabel: 'Pay with a different card',
      });
      if (other) redirect('billing/pay', { invoice_id: invoiceId });
    });
  };

  const removeCard = async () => {
    const ok = await ask({
      title: 'Remove your saved card?',
      body: 'Automatic payments will stop working. You will need to pay each invoice yourself before it is due, or VYRO will be paused on your website.',
      confirmLabel: 'Remove card',
      danger: true,
    });
    if (!ok) return;
    void run(async () => {
      await api.post('billing/remove-card');
      reload();
    }, 'Card removed');
  };

  if (failed) {
    return (
      <div className="vy vy-fullstate">
        <div>
          <p>{failed}</p>
          <Button onClick={reload} style={{ marginTop: 12 }}>
            Try again
          </Button>
        </div>
      </div>
    );
  }
  if (!data) return <div className="vy vy-fullstate">Loading your account…</div>;

  return (
    <Ctx.Provider
      value={{
        data,
        reload,
        busy,
        pay: (invoiceId) => void pay(invoiceId),
        updateCard: () => redirect('billing/update-card'),
        removeCard: () => void removeCard(),
      }}
    >
      <AppShell
        nav={NAV}
        section="Client"
        settingsTo="/portal/company"
        identity={{ name: data.company.store_name || data.company.name, logo: logoUrl(data.company.logo_path) }}
      />
    </Ctx.Provider>
  );
}
