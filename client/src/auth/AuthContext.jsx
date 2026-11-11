import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as api from '../api';

const AuthContext = createContext(null);

/**
 * Session state for the whole app. Until /me answers we do not know whether
 * anyone is signed in, and routing on a guess would flash the sign-in page at
 * someone who already is — so `loading` holds the routes.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.fetchMe().then((me) => {
      if (!cancelled) {
        setUser(me);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  // Any request that finds the session gone signs the page out with it.
  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener(api.UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(api.UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const signIn = useCallback(async (username, password) => {
    const me = await api.login(username, password);
    setUser(me);
    return me;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(() => ({ user, loading, signIn, signOut }), [user, loading, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>.');
  return context;
}
