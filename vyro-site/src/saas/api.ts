import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configured = Boolean(url && anonKey);

// The anon key is public by design: what a browser may read or change is
// decided by row-level security in the database, not by this key.
export const supabase = createClient(url ?? 'http://localhost:54321', anonKey ?? 'missing');

export const FUNCTIONS_URL = `${url ?? ''}/functions/v1`;

/** Calls an Edge Function with the signed-in user's token. */
export async function callFn<T = Record<string, unknown>>(
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey ?? '',
      Authorization: `Bearer ${data.session?.access_token ?? anonKey ?? ''}`,
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? 'Something went wrong. Please try again.');
  return json as T;
}

export type SubscriptionStatus =
  | 'pending_setup'
  | 'active'
  | 'past_due'
  | 'cancel_scheduled'
  | 'cancelled'
  | 'suspended';

export interface Company {
  id: string;
  name: string;
  store_name: string | null;
  website: string | null;
  logo_path: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  created_at: string;
}

export interface Plan {
  id: string;
  company_id: string;
  name: string;
  currency: string;
  setup_fee: number;
  recurring_fee: number;
  billing_interval: 'monthly' | 'annual';
  product_limit: number;
  billing_start_date: string | null;
  contract_months: number | null;
  cancellation_terms: string | null;
}

export interface Subscription {
  id: string;
  company_id: string;
  status: SubscriptionStatus;
  setup_paid_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  next_billing_date: string | null;
  cancel_at_period_end: boolean;
  grace_until: string | null;
  contract_end: string | null;
  widget_override: 'force_on' | 'force_off' | null;
}

export interface InvoiceItem {
  id: string;
  description: string;
  amount: number;
}

export interface Invoice {
  id: string;
  number: string;
  company_id: string;
  kind: 'setup' | 'subscription' | 'manual';
  status: 'open' | 'processing' | 'paid' | 'failed' | 'void';
  currency: string;
  total: number;
  period_start: string | null;
  period_end: string | null;
  due_date: string;
  paid_at: string | null;
  attempts: number;
  created_at: string;
  invoice_items?: InvoiceItem[];
}

export interface PaymentMethod {
  id: string;
  brand: string | null;
  masked_pan: string | null;
  is_default: boolean;
  revoked_at: string | null;
}

export interface Notice {
  id: string;
  company_id: string | null;
  kind: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
}

export interface ExtraCharge {
  id: string;
  description: string;
  amount: number;
  bill_on: string;
  invoice_id: string | null;
}

export const COMPANY_COLUMNS =
  'id, name, store_name, website, logo_path, contact_name, contact_email, contact_phone, address, created_at';
export const CARD_COLUMNS = 'id, company_id, brand, masked_pan, is_default, revoked_at, created_at';

export function money(amount: number | string, currency = 'OMR'): string {
  return `${Number(amount).toFixed(3)} ${currency}`;
}

export function day(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function logoUrl(path: string | null): string | null {
  return path ? supabase.storage.from('logos').getPublicUrl(path).data.publicUrl : null;
}

export const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  pending_setup: 'Awaiting setup payment',
  active: 'Active',
  past_due: 'Payment overdue',
  cancel_scheduled: 'Cancelled – running until period end',
  cancelled: 'Cancelled',
  suspended: 'Suspended',
};

/** Mirrors public.subscription_is_live in the database (for display only). */
export function isLive(s: Subscription | null | undefined): boolean {
  if (!s) return false;
  if (s.widget_override === 'force_on') return true;
  if (s.widget_override === 'force_off') return false;
  const today = new Date().toISOString().slice(0, 10);
  if (s.status === 'active') {
    if (!s.current_period_end) return false;
    const slack = new Date(s.current_period_end);
    slack.setDate(slack.getDate() + 1);
    return slack.toISOString().slice(0, 10) >= today;
  }
  if (s.status === 'cancel_scheduled') return !!s.current_period_end && s.current_period_end > today;
  if (s.status === 'past_due') return !!s.grace_until && new Date(s.grace_until) > new Date();
  return false;
}
