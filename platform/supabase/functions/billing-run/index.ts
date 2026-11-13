// Scheduled billing run (see README for the cron job). Protected by a shared
// secret; it is not callable from a browser session.
import { Ompay } from '../_shared/ompay.ts';
import { runBilling } from '../_shared/billing.ts';
import { APP_URL, rpcOf, serviceClient } from '../_shared/http.ts';

function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Emails pending notifications through Resend, if configured. */
async function sendEmails(db: ReturnType<typeof rpcOf>): Promise<number> {
  const key = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('EMAIL_FROM');
  if (!key || !from) return 0;
  const adminEmails = (Deno.env.get('ADMIN_EMAILS') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const rows = await db.rpc<{ id: string; audience: string; title: string; body: string | null; emails: string[] }[]>(
    'outbox_pending', { p_limit: 50 },
  );
  const sent: string[] = [];
  for (const n of rows ?? []) {
    const to = n.audience === 'admin' ? adminEmails : n.emails;
    if (to.length > 0) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from, to, subject: `VYRO: ${n.title}`,
          html: `<p><strong>${esc(n.title)}</strong></p>${n.body ? `<p>${esc(n.body)}</p>` : ''}<p><a href="${APP_URL}">Open your VYRO dashboard</a></p>`,
        }),
      });
      if (!res.ok) continue; // stays pending, retried next run
    }
    sent.push(n.id);
  }
  if (sent.length) await db.rpc('outbox_mark_sent', { p_ids: sent });
  return sent.length;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET') ?? '';
  const given = req.headers.get('x-cron-secret') ?? '';
  if (!secret || !sameSecret(secret, given)) return new Response('Forbidden', { status: 403 });

  const db = rpcOf(serviceClient());
  const summary = await runBilling(db, Ompay.fromEnv(), APP_URL);
  let emails = 0;
  try {
    emails = await sendEmails(db);
  } catch (err) {
    summary.errors.push(`emails: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (summary.errors.length) console.error('billing-run errors', summary.errors);
  return new Response(JSON.stringify({ ...summary, emails }), {
    status: summary.errors.length ? 207 : 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
