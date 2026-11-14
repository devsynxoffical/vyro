import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound, ReceiptText, ShieldCheck } from 'lucide-react';
import qrcode from 'qrcode-generator';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { useCrumbs } from '../../shell';
import { Affix, Button, ErrorNote, Field, Notice, PageHead, Panel, SkeletonRows, useAction } from '../../ui';

interface Settings {
  grace_days: number;
  max_auto_attempts: number;
  reminder_days: number;
}

type Section = 'billing' | 'security';

export function AdminSettings() {
  useCrumbs([{ label: 'Settings' }]);
  const [section, setSection] = useState<Section>('billing');
  return (
    <div>
      <PageHead title="Settings" description="Rules that apply to every client, and your own sign-in security." />
      <div className="vy-settings">
        <nav className="vy-subnav" aria-label="Settings sections">
          <button type="button" className={section === 'billing' ? 'is-active' : ''} onClick={() => setSection('billing')}>
            <ReceiptText /> Billing rules
          </button>
          <button type="button" className={section === 'security' ? 'is-active' : ''} onClick={() => setSection('security')}>
            <ShieldCheck /> Security
          </button>
        </nav>
        <div className="vy-stack">
          {section === 'billing' && <BillingRules />}
          {section === 'security' && (
            <>
              <TwoStepLogin />
              <ChangePassword />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function BillingRules() {
  const [s, setS] = useState<Settings | null>(null);
  const { busy, error, run } = useAction();
  useEffect(() => {
    void api.get<Settings>('admin/settings').then(setS).catch(() => {});
  }, []);
  if (!s) {
    return (
      <Panel title="Billing rules" flush>
        <SkeletonRows rows={3} />
      </Panel>
    );
  }
  const set = (k: keyof Settings) => (e: { target: { value: string } }) => setS({ ...s, [k]: Number(e.target.value) });
  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await api.post('admin/settings', { ...s });
    }, 'Billing rules saved');
  };
  return (
    <Panel title="Billing rules" description="What happens when a renewal payment fails.">
      <form onSubmit={save}>
        <div className="vy-formrow">
          <div>
            <h3>Grace period</h3>
            <p>After a failed payment VYRO keeps working for this long, then switches off.</p>
          </div>
          <Field label="Days">
            <Affix unit="days">
              <input type="number" min="0" max="60" inputMode="numeric" value={s.grace_days} onChange={set('grace_days')} />
            </Affix>
          </Field>
        </div>
        <div className="vy-formrow">
          <div>
            <h3>Automatic charge attempts</h3>
            <p>How many times the saved card is tried for one invoice, once per day.</p>
          </div>
          <Field label="Attempts">
            <input type="number" min="1" max="10" inputMode="numeric" value={s.max_auto_attempts} onChange={set('max_auto_attempts')} />
          </Field>
        </div>
        <div className="vy-formrow">
          <div>
            <h3>Renewal reminder</h3>
            <p>Clients are told about an upcoming renewal this many days before it.</p>
          </div>
          <Field label="Days before">
            <Affix unit="days">
              <input type="number" min="0" max="30" inputMode="numeric" value={s.reminder_days} onChange={set('reminder_days')} />
            </Affix>
          </Field>
        </div>
        <ErrorNote message={error} />
        <div className="vy-actions" style={{ marginTop: 16 }}>
          <Button type="submit" variant="primary" busy={busy}>
            Save rules
          </Button>
        </div>
      </form>
    </Panel>
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
    try {
      setEnabled((await api.get<{ enabled: boolean }>('auth/mfa/status')).enabled);
    } catch {
      setEnabled(false);
    }
  };
  useEffect(() => void check(), []);

  const start = () =>
    void run(async () => {
      const { secret, uri } = await api.post<{ secret: string; uri: string }>('auth/mfa/enroll');
      // The QR code is drawn here in the browser; the secret is never sent to a QR service.
      const qr = qrcode(0, 'M');
      qr.addData(uri);
      qr.make();
      setEnroll({ id: uri, qr: qr.createDataURL(5, 10), secret });
    });

  const confirm = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await api.post('auth/mfa/confirm', { code: code.trim() });
      setEnroll(null);
      setCode('');
      await check();
      await refresh();
    }, 'Two-step login is on');
  };

  return (
    <Panel title="Two-step login" description="A code from an authenticator app at every sign-in.">
      {enabled === null ? (
        <SkeletonRows rows={2} />
      ) : enabled ? (
        <Notice tone="ok" icon={<ShieldCheck />} title="Two-step login is on">
          A stolen password alone cannot open this console.
        </Notice>
      ) : enroll ? (
        <form onSubmit={confirm} className="vy-form">
          <p className="vy-small vy-muted">Scan this with Google Authenticator, Authy or 1Password, then enter the 6-digit code.</p>
          <img src={enroll.qr} alt="QR code for your authenticator app" width={176} height={176} style={{ background: '#fff', padding: 8, borderRadius: 6 }} />
          <p className="vy-small vy-muted">
            Or enter this key by hand: <code>{enroll.secret}</code>
          </p>
          <Field label="6-digit code">
            <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required style={{ maxWidth: 180 }} />
          </Field>
          <ErrorNote message={error} />
          <div className="vy-actions">
            <Button type="submit" variant="primary" busy={busy}>
              Turn on
            </Button>
            <Button onClick={() => setEnroll(null)}>Cancel</Button>
          </div>
        </form>
      ) : (
        <div className="vy-form">
          <Notice tone="warn" icon={<ShieldCheck />} title="Two-step login is off">
            Strongly recommended for every admin: this console controls client billing.
          </Notice>
          <ErrorNote message={error} />
          <div className="vy-actions">
            <Button variant="primary" busy={busy} onClick={start}>
              Set up two-step login
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}

export function ChangePassword() {
  const [password, setPassword] = useState('');
  const { busy, error, run } = useAction();
  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (password.length < 10) throw new Error('Password must be at least 10 characters.');
      await api.post('auth/password', { password });
      setPassword('');
    }, 'Password changed');
  };
  return (
    <Panel title="Password">
      <form onSubmit={save} className="vy-form">
        <Field label="New password" hint="At least 10 characters">
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} />
        </Field>
        <ErrorNote message={error} />
        <div className="vy-actions">
          <Button type="submit" busy={busy} icon={<KeyRound />}>
            Change password
          </Button>
        </div>
      </form>
    </Panel>
  );
}
