/**
 * Minimal client for OMPAY TruePay (https://developer.truepay.ompay.om/docs).
 *
 * Capabilities VYRO needs enabled on the merchant account (ask OMPAY):
 *   - Bank-hosted payments, "Forced Saved Cards" variant (the first payment saves the card)
 *   - Card tokenization + merchant-hosted token payments without CVV / OTP (monthly charges)
 *   - Refund / reverse, Payment Links
 * TruePay has no webhooks: results are confirmed with POST /transactions/inquiry.
 */

export type OmpayStatus = 'PENDING' | 'PROCESSING' | 'SUCCESSFUL' | 'FAILED';

export interface OmpayConfig {
  baseUrl: string; // https://api.sandbox.truepay.ompay.om or https://api.truepay.ompay.om
  apiKey: string;
  apiSecret: string;
  fetch?: typeof fetch;
}

export interface StartResult {
  transaction_id: string;
  status: OmpayStatus;
  redirect_url?: string;
  otp_required?: boolean;
  error_message?: string | null;
}

export interface InquiryResult {
  transaction_id: string;
  reference_number?: string | null;
  status: OmpayStatus;
  amount?: number;
  error_message?: string | null;
  outcome_unconfirmed?: boolean;
  token?: string | null;
  saved_card?: { token: string; masked_pan?: string; brand?: string } | null;
}

export interface PaymentLink {
  id: string;
  status: 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'EXPIRED' | 'CANCELLED';
  pay_url: string;
  transaction_id?: string | null;
}

export class OmpayError extends Error {
  constructor(
    public code: string,
    message: string,
    public httpStatus: number,
  ) {
    super(message);
  }
}

export class Ompay {
  private f: typeof fetch;

  constructor(private cfg: OmpayConfig) {
    this.f = cfg.fetch ?? fetch;
  }

  static fromEnv(): Ompay {
    const baseUrl = Deno.env.get('OMPAY_BASE_URL') ?? 'https://api.sandbox.truepay.ompay.om';
    const apiKey = Deno.env.get('OMPAY_API_KEY');
    const apiSecret = Deno.env.get('OMPAY_API_SECRET');
    if (!apiKey || !apiSecret) throw new Error('OMPAY_API_KEY / OMPAY_API_SECRET are not set');
    return new Ompay({ baseUrl, apiKey, apiSecret });
  }

  private async call<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
    const res = await this.f(`${this.cfg.baseUrl.replace(/\/$/, '')}/api/v1${path}`, {
      method,
      headers: {
        'OMPAY-API-Key': this.cfg.apiKey,
        'OMPAY-API-Secret': this.cfg.apiSecret,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json: { success?: boolean; data?: T; error?: string; message?: string } = {};
    try {
      json = await res.json();
    } catch {
      // non-JSON error page
    }
    if (!res.ok || json.success === false) {
      throw new OmpayError(json.error ?? `HTTP_${res.status}`, json.message ?? res.statusText, res.status);
    }
    return json.data as T;
  }

  /** OMPAY-hosted card page; with Forced Saved Cards the card is tokenized on success. */
  bankHosted(p: { amount: number; currency: string; returnUrl: string; reference: string }) {
    return this.call<StartResult>('POST', '/transactions/bank-hosted', {
      amount: round3(p.amount),
      currency: p.currency,
      return_url: p.returnUrl,
      reference_number: p.reference,
    });
  }

  /** Charge a saved card (merchant-initiated, e.g. the monthly renewal). */
  payWithToken(p: { amount: number; currency: string; token: string; returnUrl: string; reference: string }) {
    return this.call<StartResult>('POST', '/transactions/merchant-hosted', {
      amount: round3(p.amount),
      currency: p.currency,
      token: p.token,
      return_url: p.returnUrl,
      reference_number: p.reference,
    });
  }

  /** Authoritative status; also returns the saved-card token on Forced Saved Cards accounts. */
  inquiry(p: { transactionId?: string; reference?: string }) {
    return this.call<InquiryResult>(
      'POST',
      '/transactions/inquiry',
      p.transactionId ? { transaction_id: p.transactionId } : { reference_number: p.reference },
    );
  }

  reverse(transactionId: string) {
    return this.call<unknown>('POST', `/transactions/${encodeURIComponent(transactionId)}/reverse`, {});
  }

  refund(transactionId: string, amount?: number) {
    return this.call<{ refund_status: string }>(
      'POST',
      `/transactions/${encodeURIComponent(transactionId)}/refund`,
      amount === undefined ? {} : { amount: round3(amount) },
    );
  }

  revokeToken(token: string) {
    return this.call<unknown>('DELETE', `/tokens/${encodeURIComponent(token)}`);
  }

  createPaymentLink(p: {
    amount: number;
    description: string;
    reference: string;
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    expiryHours?: number;
    returnUrl?: string;
    notify?: boolean;
  }) {
    return this.call<PaymentLink>(
      'POST',
      '/payment-links',
      {
        amount: round3(p.amount).toFixed(3),
        description: p.description.slice(0, 255),
        reference: p.reference.slice(0, 80),
        customer_name: p.customerName,
        customer_email: p.customerEmail,
        customer_phone: p.customerPhone,
        expiry_hours: p.expiryHours ?? 168,
        return_url: p.returnUrl,
        notify_via_email: !!(p.notify && p.customerEmail),
      },
      { 'Idempotency-Key': p.reference.slice(0, 80) },
    );
  }

  getPaymentLink(id: string) {
    return this.call<PaymentLink>('GET', `/payment-links/${encodeURIComponent(id)}`);
  }
}

/** OMR has three decimals; avoid float noise like 27.999999. */
export function round3(n: number): number {
  return Math.round(Number(n) * 1000) / 1000;
}
