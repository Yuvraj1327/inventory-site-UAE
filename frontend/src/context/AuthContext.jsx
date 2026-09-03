import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { api, formatApiError } from "@/lib/api";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined=loading, null=guest, obj=profile

  // Tracks which access token we last fetched a profile for. Supabase's
  // onAuthStateChange fires its own SIGNED_IN event as a side effect of
  // signInWithPassword() — without this guard, login() would fetch the
  // profile directly *and* the subscription below would fetch it again
  // for the same token, doubling every /auth/me call.
  const lastTokenRef = useRef(null);

  const loadProfile = useCallback(async (token, { throwOnError = false } = {}) => {
    lastTokenRef.current = token ?? null;
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
      return data;
    } catch (e) {
      setUser(null);
      if (throwOnError) throw e;
      return null;
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    // onAuthStateChange alone is the source of truth: Supabase fires it
    // immediately on subscribe with the current session (event
    // "INITIAL_SESSION"), so a separate getSession() call up front is
    // redundant and was the other source of duplicate /auth/me requests.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (!session) { lastTokenRef.current = null; setUser(null); return; }
      if (session.access_token === lastTokenRef.current) return; // already loaded for this token
      loadProfile(session.access_token);
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
    };
  }, [loadProfile]);

  const login = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: error.message };
    try {
      const profile = await loadProfile(data.session?.access_token, { throwOnError: true });
      return { ok: true, user: profile };
    } catch (e) {
      // Distinguish "request never got a response" (network/CORS/backend
      // down) from "backend responded with an error" so the message
      // actually points at the right place instead of always saying
      // "Something went wrong".
      if (!e.response) {
        // eslint-disable-next-line no-console
        console.error("auth/me network error (no response received):", e);
        return { ok: false, error: `Could not reach the API at ${e.config?.baseURL || ""}. Is the backend running and REACT_APP_BACKEND_URL correct?` };
      }
      // eslint-disable-next-line no-console
      console.error("auth/me failed:", e.response.status, e.response.data);
      return { ok: false, error: formatApiError(e.response?.data?.detail) };
    }
  }, [loadProfile]);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    lastTokenRef.current = null;
    setUser(null);
    window.location.href = "/login";
  }, []);

  // Memoized so consumers of useAuth() only re-render when user/login/logout
  // actually change identity, not on every AuthProvider render.
  const value = useMemo(() => ({ user, login, logout }), [user, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
