/**
 * HOUSE-ZEN — Auth context.
 * Holds the current AuthSession (user, role, tenant) resolved from the DataApi.
 * The session role drives UI gating ONLY; PostgreSQL RLS remains the authority.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getDataApi } from '@/lib/api';
import type { AuthSession } from '@/lib/api/types';

interface AuthContextValue {
  session: AuthSession | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * getSession() with a hard ceiling. supabase-js coordinates token refreshes
 * through the Web Locks API; an immediate page reload (e.g. after a
 * stale-chunk recovery) can leave that lock pending, hanging auth calls with
 * NO network request and NO rejection — an infinite spinner. Timing out and
 * degrading to anonymous (→ redirect to /login) is strictly better.
 */
const SESSION_TIMEOUT_MS = 10_000;

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('session bootstrap timed out')),
      SESSION_TIMEOUT_MS,
    );
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const api = useMemo(() => getDataApi(), []);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    withTimeout(api.getSession())
      .then((s) => {
        if (mounted) {
          setSession(s);
          setLoading(false);
        }
      })
      .catch((err) => {
        // Never leave the app on an infinite spinner: degrade to anonymous.
        console.error('[hz] session bootstrap failed:', err?.message ?? err);
        if (mounted) {
          setSession(null);
          setLoading(false);
        }
      });
    const unsub = api.onAuthChange((s) => {
      if (mounted) setSession(s);
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, [api]);

  const refresh = useCallback(async () => {
    const s = await api.getSession();
    setSession(s);
  }, [api]);

  const signOut = useCallback(async () => {
    await api.signOut();
    setSession(null);
  }, [api]);

  const value = useMemo<AuthContextValue>(
    () => ({ session, loading, refresh, signOut }),
    [session, loading, refresh, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/** Convenience hook: current role (defaults to receptionist for guests). */
export function useCurrentRole() {
  const { session } = useAuth();
  return session?.role ?? null;
}
