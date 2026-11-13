import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../api';
import { useAuth } from '../auth';
import { Card, ErrorNote, Field, Shell, useAction } from '../ui';
import { adminNav } from './AdminHome';

interface Settings {
  grace_days: number;
  max_auto_attempts: number;
  reminder_days: number;
}

export function AdminSettings() {
  return (
    <Shell title="Admin" nav={adminNav}>
      <div className="sa-cols">
        <BillingRules />
        <div>
          <TwoStepLogin />
          <ChangePassword />
        </div>
      </div>
    </Shell>
  );
}

function BillingRules() {
  const [s, setS] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAction();
  useEffect(() => {
    void supabase.from('app_settings').select('grace_days, max_auto_attempts, reminder_days').single().then(({ data }) => setS(data as Settings));
  }, []);
  if (!s) return <Card title="Billing rules"><p className="sa-muted">Loading…</p></Card>;
  const set = (k: keyof Settings) => (e: { target: { value: string } }) => { setSaved(false); setS({ ...s, [k]: Number(e.target.value) }); };
  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { error: err } = await supabase.from('app_settings').update(s).eq('id', true);
      if (err) throw new Error('Could not save. Check the numbers.');
      setSaved(true);
    });
  };
  return (
    <Card title="Billing rules">
      <form onSubmit={save}>
        <Field label="Grace period after a failed payment (days)" hint="VYRO keeps working during this time, then switches off.">
          <input type="number" min="0" max="60" value={s.grace_days} onChange={set('grace_days')} />
        </Field>
        <Field label="Automatic charge attempts per invoice" hint="One attempt per day.">
          <input type="number" min="1" max="10" value={s.max_auto_attempts} onChange={set('max_auto_attempts')} />
        </Field>
        <Field label="Renewal reminder (days before)">
          <input type="number" min="0" max="30" value={s.reminder_days} onChange={set('reminder_days')} />
        </Field>
        <ErrorNote message={error} />
        <div className="sa-actions"><button className="sa-btn" disabled={busy}>Save</button>{saved && <span className="sa-ok">Saved</span>}</div>
      </form>
    </Card>
  );
}

/** Authenticator-app second step for admin accounts. */
function TwoStepLogin() {
  const { refresh } = useAuth();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const { busy, error, run } = useAction();

  const check = async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    setEnabled(Boolean(data?.totp.some((f) => f.status === 'verified')));
  };
  useEffect(() => void check(), []);

  const start = () =>
    void run(async () => {
      const { data: existing } = await supabase.auth.mfa.listFactors();
      for (const f of existing?.all ?? []) {
        if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error: err } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `VYRO ${Date.now()}` });
      if (err || !data) throw new Error('Could not start setup. Is two-step login enabled in the Supabase project?');
      setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    });

  const confirm = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId: enroll!.id, code: code.trim() });
      if (err) throw new Error('That code is not correct. Try the current code from your app.');
      setEnroll(null);
      setCode('');
      await check();
      await refresh();
    });
  };

  return (
    <Card title="Two-step login">
      {enabled === null ? (
        <p className="sa-muted">Loading…</p>
      ) : enabled ? (
        <p className="sa-ok">On. A code from your authenticator app is required at every sign-in.</p>
      ) : enroll ? (
        <form onSubmit={confirm}>
          <p className="sa-muted">Scan this with Google Authenticator, Authy or 1Password, then enter the 6-digit code.</p>
          <img className="sa-qr" src={enroll.qr} alt="QR code for your authenticator app" />
          <p className="sa-sub">Or enter this key by hand: <code>{enroll.secret}</code></p>
          <Field label="Code"><input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} required /></Field>
          <ErrorNote message={error} />
          <div className="sa-actions"><button className="sa-btn" disabled={busy}>Turn on</button></div>
        </form>
      ) : (
        <>
          <p className="sa-muted">Strongly recommended for every admin: a stolen password alone can then not open this dashboard.</p>
          <ErrorNote message={error} />
          <div className="sa-actions"><button className="sa-btn" disabled={busy} onClick={start}>Set up</button></div>
        </>
      )}
    </Card>
  );
}

export function ChangePassword() {
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const { busy, error, run } = useAction();
  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (password.length < 10) throw new Error('Password must be at least 10 characters.');
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw new Error('Could not change the password. Sign in again and retry.');
      setPassword('');
      setDone(true);
    });
  };
  return (
    <Card title="Change password">
      <form onSubmit={save}>
        <Field label="New password" hint="At least 10 characters">
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => { setDone(false); setPassword(e.target.value); }} required />
        </Field>
        <ErrorNote message={error} />
        <div className="sa-actions"><button className="sa-btn sa-btn--ghost" disabled={busy}>Change password</button>{done && <span className="sa-ok">Changed</span>}</div>
      </form>
    </Card>
  );
}
