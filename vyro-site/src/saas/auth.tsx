import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api } from './api';

export interface Profile {
  id: string;
  email: string;
  role: 'admin' | 'client';
  company_id: string | null;
  full_name: string | null;
}

export interface MeResponse {
  user: Profile | null;
  mfa_required?: boolean;
}

/** Present whenever a login exists, even if the second step is still pending. */
interface Session {
  user: { id: string; email: string };
}

interface AuthState {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  /** True when the account has two-step login set up but this session has not passed it yet. */
  needsSecondStep: boolean;
  /** Apply a login / registration response, or re-read the session from the server. */
  refresh: (known?: MeResponse) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [needsSecondStep, setNeedsSecondStep] = useState(false);

  const apply = (me: MeResponse) => {
    setProfile(me.user);
    setNeedsSecondStep(Boolean(me.mfa_required));
    setLoading(false);
  };

  const refresh = useCallback(async (known?: MeResponse) => {
    try {
      apply(known ?? (await api.get<MeResponse>('me')));
    } catch {
      apply({ user: null });
    }
  }, []);

  useEffect(() => {
    void refresh();
    // The API reports an ended session (expired, or signed out in another tab).
    const onSignedOut = () => apply({ user: null });
    window.addEventListener('vyro:signed-out', onSignedOut);
    return () => window.removeEventListener('vyro:signed-out', onSignedOut);
  }, [refresh]);

  const session: Session | null = profile
    ? { user: { id: profile.id, email: profile.email } }
    : needsSecondStep
      ? { user: { id: '', email: '' } }
      : null;

  const value: AuthState = {
    loading,
    session,
    profile,
    needsSecondStep,
    refresh,
    signOut: async () => {
      await api.post('auth/logout').catch(() => {});
      apply({ user: null });
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}

/**
 * Route guard. This only decides what to show; the real protection is on the
 * server, which refuses data to anyone without the right role.
 */
export function RequireRole({ role, children }: { role: 'admin' | 'client'; children: ReactNode }) {
  const { loading, session, profile, needsSecondStep } = useAuth();
  const location = useLocation();
  if (loading) return <div className="vy vy-fullstate">Loading…</div>;
  if (!session || needsSecondStep || !profile) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (profile.role !== role) return <Navigate to={profile.role === 'admin' ? '/admin' : '/portal'} replace />;
  return <>{children}</>;
}
