// Public licence check used by the VYRO loader on client websites:
//   GET /functions/v1/widget-status?key=vyro_pk_...
// The website is taken from the browser's Origin/Referer header, not from a
// parameter, so a page cannot claim to be another domain.
import { createClient } from 'npm:@supabase/supabase-js@2';

const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
  // Short cache: cheap for busy shops, and a cancelled client is off within minutes.
  'Cache-Control': 'public, max-age=300',
  Vary: 'Origin',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  const key = new URL(req.url).searchParams.get('key') ?? '';
  if (!/^vyro_pk_[0-9a-f]{32}$/.test(key)) {
    return new Response(JSON.stringify({ active: false, reason: 'unknown_key' }), { headers });
  }
  const site = req.headers.get('origin') ?? req.headers.get('referer') ?? '';
  const { data, error } = await client.rpc('widget_status', { p_key: key, p_host: site });
  if (error) {
    // If our own service has a problem, do not switch paying clients off.
    return new Response(JSON.stringify({ active: true, degraded: true }), {
      headers: { ...headers, 'Cache-Control': 'no-store' },
    });
  }
  return new Response(JSON.stringify(data), { headers });
});
