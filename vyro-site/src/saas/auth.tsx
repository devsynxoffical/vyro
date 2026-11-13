import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './api';

export interface Profile {
  id: string;
  role: 'admin' | 'client';
  company_id: string | null;
  full_name: string | null;
}

interface AuthState {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  /** True when the account has two-step login set up but this session has not passed it yet. */
  needsSecondStep: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [needsSecondStep, setNeedsSecondStep] = useState(false);

  const load = async (s: Session | null) => {
    setSession(s);
    if (!s) {
      setProfile(null);
      setNeedsSecondStep(false);
      setLoading(false);
      return;
    }
    const [{ data: p }, { data: aal }] = await Promise.all([
      supabase.from('profiles').select('id, role, company_id, full_name').eq('id', s.user.id).maybeSingle(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    setProfile((p as Profile | null) ?? null);
    setNeedsSecondStep(aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2');
    setLoading(false);
  };

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => load(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      // Defer: Supabase must not be called from inside this callback.
      setTimeout(() => void load(s), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value: AuthState = {
    loading,
    session,
    profile,
    needsSecondStep,
    refresh: async () => load((await supabase.auth.getSession()).data.session),
    signOut: async () => {
      await supabase.auth.signOut();
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
 * Route guard. This only decides what to show; the real protection is in the
 * database, which refuses data to anyone without the right role.
 */
export function RequireRole({ role, children }: { role: 'admin' | 'client'; children: ReactNode }) {
  const { loading, session, profile, needsSecondStep } = useAuth();
  const location = useLocation();
  if (loading) return <div className="sa sa-center">Loading…</div>;
  if (!session || needsSecondStep) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!profile) return <div className="sa sa-center">This account has no access. Contact VYRO support.</div>;
  if (profile.role !== role) return <Navigate to={profile.role === 'admin' ? '/admin' : '/portal'} replace />;
  return <>{children}</>;
}
