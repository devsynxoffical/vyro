// Invite-only registration. Public endpoint: the one-time invite token is the
// credential. Accounts can only be created through a valid invite.
import { handle, HttpError, rpcOf, serviceClient, sha256Hex, str } from '../_shared/http.ts';

Deno.serve(
  handle(async (_req, body) => {
    const client = serviceClient();
    const db = rpcOf(client);
    const token = str(body.token, 128);
    if (!/^[0-9a-f]{64}$/.test(token)) throw new HttpError(400, 'This registration link is not valid');
    const hash = await sha256Hex(token);

    const invite = await db.rpc<Record<string, string> | null>('invite_lookup', { p_token_hash: hash });
    if (!invite) throw new HttpError(410, 'This registration link has expired or was already used');

    if (str(body.action, 20) === 'lookup') {
      const { invite_id: _i, company_id: _c, ...shown } = invite;
      return shown;
    }

    const password = typeof body.password === 'string' ? body.password : '';
    if (password.length < 10) throw new HttpError(400, 'Password must be at least 10 characters');
    const fullName = str(body.full_name, 150);
    if (!fullName) throw new HttpError(400, 'Your name is required');

    const { data: created, error } = await client.auth.admin.createUser({
      email: invite.email,
      password,
      email_confirm: true, // the invite link was sent to this address
      user_metadata: { full_name: fullName },
    });
    if (error || !created.user) {
      throw new HttpError(409, 'An account already exists for this email. Please sign in instead.');
    }

    try {
      const c = (body.company ?? {}) as Record<string, unknown>;
      await db.rpc('invite_complete', {
        p_token_hash: hash,
        p_user: created.user.id,
        p_full_name: fullName,
        p_company: {
          name: str(c.name, 150), store_name: str(c.store_name, 150), website: str(c.website, 200),
          contact_name: fullName, contact_phone: str(c.contact_phone, 40), address: str(c.address, 400),
        },
      });
    } catch (err) {
      await client.auth.admin.deleteUser(created.user.id); // do not leave a login without a company
      throw err;
    }
    return { email: invite.email };
  }),
);
