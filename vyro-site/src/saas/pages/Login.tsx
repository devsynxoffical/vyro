import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth, type MeResponse } from '../auth';
import { Button, ErrorNote, Field, Notice, useAction } from '../ui';
import { AuthLayout } from './AuthLayout';

export function Login() {
  const { session, profile, needsSecondStep, loading, refresh, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const resetToken = params.get('reset');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const { busy, error, run } = useAction();

  useEffect(() => {
    if (loading || !session || !profile || needsSecondStep || resetToken) return;
    const from = (location.state as { from?: string } | null)?.from;
    const home = profile.role === 'admin' ? '/admin' : '/portal';
    navigate(from && from.startsWith(home) ? from : home, { replace: true });
  }, [loading, session, profile, needsSecondStep, resetToken, navigate, location.state]);

  const signIn = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await refresh(await api.post<MeResponse>('auth/login', { email: email.trim(), password }));
    });
  };

  const verify = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await refresh(await api.post<MeResponse>('auth/mfa', { code: code.trim() }));
    });
  };

  const forgot = () =>
    void run(async () => {
      if (!email.trim()) throw new Error('Enter your email first.');
      await api.post('auth/forgot', { email: email.trim() });
      setNote('If that email has an account, a reset link is on its way.');
    });

  const choosePassword = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (password.length < 10) throw new Error('Password must be at least 10 characters.');
      await api.post('auth/reset', { token: resetToken, password });
      setPassword('');
      setParams({}, { replace: true });
      setNote('Your password is set. Sign in with it now.');
    });
  };

  if (resetToken) {
    return (
      <AuthLayout>
        <h1>Choose a password</h1>
        <p>Set the password you will sign in with.</p>
        <form onSubmit={choosePassword} className="vy-form">
          <Field label="New password" hint="At least 10 characters">
            <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} autoFocus />
          </Field>
          <ErrorNote message={error} />
          <Button type="submit" variant="primary" busy={busy} block>
            Save password
          </Button>
        </form>
      </AuthLayout>
    );
  }

  if (session && needsSecondStep) {
    return (
      <AuthLayout>
        <h1>Two-step login</h1>
        <p>Enter the 6-digit code from your authenticator app.</p>
        <form onSubmit={verify} className="vy-form">
          <Field label="Code">
            <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} autoFocus required />
          </Field>
          <ErrorNote message={error} />
          <Button type="submit" variant="primary" busy={busy} block>
            Verify
          </Button>
          <button type="button" className="vy-link" style={{ justifySelf: 'start' }} onClick={() => void signOut()}>
            Use a different account
          </button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h1>Sign in</h1>
      <p>Welcome back. Enter your details to open your console.</p>
      <form onSubmit={signIn} className="vy-form">
        <Field label="Email">
          <input type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Password">
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <ErrorNote message={error} />
        {note && <Notice tone="ok" title={note} />}
        <Button type="submit" variant="primary" busy={busy} block>
          Sign in
        </Button>
        <button type="button" className="vy-link" style={{ justifySelf: 'start' }} onClick={forgot}>
          Forgot password?
        </button>
      </form>
      <p className="vy-small">New client? Accounts are created from the registration link VYRO sends you.</p>
    </AuthLayout>
  );
}
