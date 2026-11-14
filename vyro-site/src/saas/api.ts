/**
 * Client for the VYRO API (PHP + MySQL, served from /api on the same site).
 *
 * The browser holds no keys. It is signed in by an HttpOnly session cookie, and
 * every change carries the session's CSRF token. What a user may read or change
 * is decided on the server, never here.
 */

let csrf: string | null = null;

export function setCsrf(token: string | null | undefined) {
  if (token !== undefined) csrf = token;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: Record<string, unknown> | FormData): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (method !== 'GET' && csrf) headers['X-CSRF-Token'] = csrf;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(`/api/${path}`, { method, headers, body: payload, credentials: 'same-origin' });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection and try again.', 0);
  }
  const json = (await res.json().catch(() => ({}))) as { error?: string; csrf?: string };
  if (json.csrf) csrf = json.csrf;
  if (!res.ok) {
    // The session ended (expired, or signed out in another tab): tell the app once.
    if (res.status === 401 && path !== 'me' && !path.startsWith('auth/')) window.dispatchEvent(new Event('vyro:signed-out'));
    throw new ApiError(json.error ?? 'Something went wrong. Please try again.', res.status);
  }
  return json as T;
}

export const api = {
  get: <T = Record<string, unknown>>(path: string) => request<T>('GET', path),
  post: <T = Record<string, unknown>>(path: string, body: Record<string, unknown> = {}) => request<T>('POST', path, body),
  /** Multipart upload (images) */
  upload: <T = Record<string, unknown>>(path: string, form: FormData) => request<T>('POST', path, form),
};

/** Address of a stored logo or product image. */
export function uploadUrl(path: string | null | undefined): string | null {
  return path ? `/uploads/${path}` : null;
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
  /** Whether VYRO is running on the client's website right now (decided by the server) */
  live?: boolean;
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
  company_name?: string | null;
}

export interface ExtraCharge {
  id: string;
  description: string;
  amount: number;
  bill_on: string;
  invoice_id: string | null;
}

export function money(amount: number | string, currency = 'OMR'): string {
  return `${Number(amount).toFixed(3)} ${currency}`;
}

export function day(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const logoUrl = uploadUrl;

export const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  pending_setup: 'Awaiting setup payment',
  active: 'Active',
  past_due: 'Payment overdue',
  cancel_scheduled: 'Cancelled – running until period end',
  cancelled: 'Cancelled',
  suspended: 'Suspended',
};

export function isLive(s: Subscription | null | undefined): boolean {
  return Boolean(s?.live);
}

/** "3h ago", "2d ago", then a date. */
export function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  if (mins < 60 * 24 * 7) return `${Math.round(mins / 1440)}d ago`;
  return day(iso);
}

/** Amount without the currency, for columns and figures that label it separately. */
export function amount(value: number | string): string {
  return Number(value).toLocaleString('en-GB', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

export function noticeTone(kind: string): 'bad' | 'ok' | 'warn' | undefined {
  if (/failed|suspended|refund_needed/.test(kind)) return 'bad';
  if (/cancel/.test(kind)) return 'warn';
  if (/succeeded|reactivated|registered/.test(kind)) return 'ok';
  return undefined;
}
