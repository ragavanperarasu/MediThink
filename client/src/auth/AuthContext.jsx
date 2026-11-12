import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as api from '../api';

const AuthContext = createContext(null);

const EMPTY = { user: null, profile: null, profiles: [] };

/**
 * Session state for the whole app: the account (`user`), the profile in use
 * (`profile` — the person whose reports are shown), and all of the account's
 * `profiles`. Until /me answers we do not know whether anyone is signed in,
 * and routing on a guess would flash the sign-in page at someone who already
 * is — so `loading` holds the routes.
 */
export function AuthProvider({ children }) {
  const [session, setSession] = useState(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.fetchMe().then((me) => {
      if (!cancelled) {
        setSession(me);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  // Any request that finds the session gone signs the page out with it.
  useEffect(() => {
    const onUnauthorized = () => setSession(EMPTY);
    // The server needs a profile chosen: drop the current one so the picker shows.
    const onProfileRequired = () => setSession((s) => ({ ...s, profile: null }));
    window.addEventListener(api.UNAUTHORIZED_EVENT, onUnauthorized);
    window.addEventListener(api.PROFILE_REQUIRED_EVENT, onProfileRequired);
    return () => {
      window.removeEventListener(api.UNAUTHORIZED_EVENT, onUnauthorized);
      window.removeEventListener(api.PROFILE_REQUIRED_EVENT, onProfileRequired);
    };
  }, []);

  const signInWithGoogle = useCallback(async (credential) => {
    const me = await api.googleSignIn(credential);
    setSession(me);
    return me;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setSession(EMPTY);
    }
  }, []);

  /** Re-reads the account's profiles (after adding, editing or deleting one). */
  const refresh = useCallback(async () => {
    const me = await api.fetchMe();
    setSession(me);
    return me;
  }, []);

  /** Switches every page to this profile's reports. */
  const chooseProfile = useCallback(async (id) => {
    const profile = await api.selectProfile(id);
    setSession((s) => ({ ...s, profile }));
    return profile;
  }, []);

  const value = useMemo(
    () => ({ ...session, loading, signInWithGoogle, signOut, refresh, chooseProfile }),
    [session, loading, signInWithGoogle, signOut, refresh, chooseProfile],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>.');
  return context;
}
