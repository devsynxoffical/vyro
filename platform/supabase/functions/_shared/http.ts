import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Rpc } from './billing.ts';

export const APP_URL = (Deno.env.get('APP_URL') ?? 'http://localhost:5173').replace(/\/$/, '');

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? APP_URL)
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);

/** CORS limited to the dashboard's own origin(s). */
export function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function rpcOf(client: SupabaseClient): Rpc {
  return {
    async rpc<T>(fn: string, args?: Record<string, unknown>) {
      const { data, error } = await client.rpc(fn, args ?? {});
      if (error) throw new Error(`${fn}: ${error.message}`);
      return data as T;
    },
  };
}

export interface Caller {
  userId: string;
  email: string | null;
  role: 'admin' | 'client';
  companyId: string | null;
}

/** Verifies the caller's login token and loads their role from the database. */
export async function requireCaller(req: Request, client: SupabaseClient): Promise<Caller> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Not signed in');
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Not signed in');
  const { data: profile } = await client
    .from('profiles')
    .select('role, company_id')
    .eq('id', data.user.id)
    .maybeSingle();
  if (!profile) throw new HttpError(403, 'No access');
  return { userId: data.user.id, email: data.user.email ?? null, role: profile.role, companyId: profile.company_id };
}

export function requireAdmin(caller: Caller) {
  if (caller.role !== 'admin') throw new HttpError(403, 'Admins only');
}

/** Wraps a handler with CORS, JSON parsing and uniform error responses. */
export function handle(fn: (req: Request, body: Record<string, unknown>) => Promise<unknown>) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
    if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);
    try {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      return json(req, await fn(req, body));
    } catch (err) {
      if (err instanceof HttpError) return json(req, { error: err.message }, err.status);
      console.error(err);
      // Never leak internals (SQL, gateway messages) to the browser.
      return json(req, { error: 'Something went wrong. Please try again.' }, 500);
    }
  };
}

export function str(v: unknown, max = 300): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomToken(bytes = 32): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}
