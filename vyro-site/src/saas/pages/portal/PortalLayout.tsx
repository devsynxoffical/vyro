import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Building2, LayoutDashboard, Package, ReceiptText } from 'lucide-react';
import { api, logoUrl, type Company, type Invoice, type PaymentMethod, type Plan, type Subscription } from '../../api';
import { useAuth } from '../../auth';
import { AppShell, type NavItem } from '../../shell';
import { Button, useAction } from '../../ui';

export interface PortalData {
  company: Company;
  plan: Plan | null;
  sub: Subscription | null;
  invoices: Invoice[];
  card: PaymentMethod | null;
  widgetKey: string | null;
  liveProducts: number;
}

interface PortalState {
  data: PortalData;
  reload: () => void;
  /** Send the client to OMPAY's hosted page to pay an invoice */
  pay: (invoiceId: string) => void;
  updateCard: () => void;
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
        pay: (invoiceId) => redirect('billing/pay', { invoice_id: invoiceId }),
        updateCard: () => redirect('billing/update-card'),
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
