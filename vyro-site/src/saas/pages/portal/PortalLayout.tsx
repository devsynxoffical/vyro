import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Building2, LayoutDashboard, Package, ReceiptText } from 'lucide-react';
import {
  callFn, CARD_COLUMNS, COMPANY_COLUMNS, logoUrl, supabase,
  type Company, type Invoice, type PaymentMethod, type Plan, type Subscription,
} from '../../api';
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

async function load(companyId: string): Promise<PortalData> {
  const [company, plan, sub, invoices, card, key, products] = await Promise.all([
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
    supabase.from('widget_keys').select('public_key').eq('company_id', companyId).maybeSingle(),
    supabase.from('products').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('active', true),
  ]);
  if (company.error || !company.data) throw new Error('Could not load your account.');
  return {
    company: company.data as Company,
    plan: plan.data as Plan | null,
    sub: sub.data as Subscription | null,
    invoices: (invoices.data ?? []) as Invoice[],
    card: card.data as PaymentMethod | null,
    widgetKey: (key.data as { public_key: string } | null)?.public_key ?? null,
    liveProducts: products.count ?? 0,
  };
}

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
    load(companyId).then(setData).catch((e: Error) => setFailed(e.message));
  }, [companyId]);
  useEffect(reload, [reload]);

  const redirect = (action: string, extra: Record<string, unknown> = {}) =>
    void run(async () => {
      const res = await callFn<{ redirect_url: string }>('client-billing', { action, ...extra });
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
        pay: (invoiceId) => redirect('pay_invoice', { invoice_id: invoiceId }),
        updateCard: () => redirect('update_card'),
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
