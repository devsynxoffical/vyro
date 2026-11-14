import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../api';
import { useAuth } from '../auth';
import { Button, ErrorNote, Field, Notice, useAction } from '../ui';
import { AuthLayout } from './AuthLayout';

export function Login() {
  const { session, profile, needsSecondStep, loading, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const { busy, error, run } = useAction();

  useEffect(() => {
    if (loading || !session || !profile || needsSecondStep) return;
    const from = (location.state as { from?: string } | null)?.from;
    const home = profile.role === 'admin' ? '/admin' : '/portal';
    navigate(from && from.startsWith(home) ? from : home, { replace: true });
  }, [loading, session, profile, needsSecondStep, navigate, location.state]);

  const signIn = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (err) throw new Error('Wrong email or password.');
    });
  };

  const verify = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const factor = factors?.totp.find((f) => f.status === 'verified');
      if (!factor) throw new Error('No authenticator is set up for this account.');
      const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
      if (err) throw new Error('That code is not correct. Try the current code from your app.');
      await refresh();
    });
  };

  const reset = () =>
    void run(async () => {
      if (!email.trim()) throw new Error('Enter your email first.');
      await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/login` });
      setResetSent(true);
    });

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
          <button type="button" className="vy-link" onClick={() => void supabase.auth.signOut()}>
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
        {resetSent && <Notice tone="ok" title="Check your inbox">If that email has an account, a reset link is on its way.</Notice>}
        <Button type="submit" variant="primary" busy={busy} block>
          Sign in
        </Button>
        <button type="button" className="vy-link" style={{ justifySelf: 'start' }} onClick={reset}>
          Forgot password?
        </button>
      </form>
      <p className="vy-small">New client? Accounts are created from the registration link VYRO sends you.</p>
    </AuthLayout>
  );
}
