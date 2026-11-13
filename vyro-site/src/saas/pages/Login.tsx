import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../api';
import { useAuth } from '../auth';
import { ErrorNote, Field, useAction } from '../ui';

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

  return (
    <div className="sa sa-auth">
      <form className="sa-card sa-auth__card" onSubmit={session && needsSecondStep ? verify : signIn}>
        <h1>VYRO</h1>
        {session && needsSecondStep ? (
          <>
            <p className="sa-muted">Enter the 6-digit code from your authenticator app.</p>
            <Field label="Code">
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoFocus
                required
              />
            </Field>
            <ErrorNote message={error} />
            <button className="sa-btn" disabled={busy}>
              {busy ? 'Checking…' : 'Verify'}
            </button>
            <button type="button" className="sa-link" onClick={() => void supabase.auth.signOut()}>
              Use a different account
            </button>
          </>
        ) : (
          <>
            <p className="sa-muted">Sign in to your dashboard.</p>
            <Field label="Email">
              <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label="Password">
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
            <ErrorNote message={error} />
            {resetSent && <p className="sa-ok">If that email has an account, a reset link is on its way.</p>}
            <button className="sa-btn" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <button type="button" className="sa-link" onClick={reset}>
              Forgot password?
            </button>
          </>
        )}
      </form>
    </div>
  );
}
