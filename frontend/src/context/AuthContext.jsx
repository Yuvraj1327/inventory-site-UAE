import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { api, formatApiError } from "@/lib/api";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

// TEMPORARY: set to false once /accounting and the loading-state issue are
// both confirmed fixed in the browser. Logs every auth state transition so
// a stuck "Loading…" screen can be traced to the exact step it stalls at.
const AUTH_DEBUG = true;
const alog = (...args) => { if (AUTH_DEBUG) console.log("[AuthContext]", ...args); };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined=loading, null=guest, obj=profile

  const loadProfile = useCallback(async ({ throwOnError = false } = {}) => {
    alog("loadProfile: calling GET /auth/me");
    try {
      const { data } = await api.get("/auth/me");
      alog("loadProfile: success, setting user ->", data);
      setUser(data);
      return data;
    } catch (e) {
      alog("loadProfile: failed ->", e?.message, e?.response?.status);
      setUser(null);
      if (throwOnError) throw e;
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    alog("effect: subscribing to onAuthStateChange");

    // onAuthStateChange is the single source of truth: Supabase fires it
    // immediately on subscribe with the current session (event
    // "INITIAL_SESSION"), so there's no need for a separate getSession()
    // call up front — that was a source of duplicate /auth/me requests.
    //
    // Deliberately simple: every event that carries a session re-fetches
    // the profile (including TOKEN_REFRESHED, which fires automatically
    // every ~10 minutes and on tab focus). That's a few more /auth/me
    // calls over a long session than a token-based dedup would produce,
    // but it removes an entire class of "did the dedup key get out of
    // sync" bugs in favor of a flow that's easy to reason about.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      alog("onAuthStateChange fired: event=", event, "hasSession=", !!session);
      if (cancelled) {
        alog("onAuthStateChange: effect already cleaned up, ignoring");
        return;
      }
      if (!session) {
        alog("onAuthStateChange: no session -> user = null (guest)");
        setUser(null);
        return;
      }
      alog("onAuthStateChange: session present -> loading profile");
      loadProfile();
    });

    return () => {
      alog("effect cleanup: unsubscribing");
      cancelled = true;
      sub?.subscription?.unsubscribe();
    };
  }, [loadProfile]);

  const login = useCallback(async (email, password) => {
    alog("login: signing in", email);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { alog("login: signInWithPassword failed ->", error.message); return { ok: false, error: error.message }; }
    try {
      const profile = await loadProfile({ throwOnError: true });
      alog("login: profile loaded ->", profile);
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
    alog("logout");
    await supabase.auth.signOut();
    setUser(null);
    window.location.href = "/login";
  }, []);

  useEffect(() => { alog("render: user state is now", user === undefined ? "undefined (loading)" : user); }, [user]);

  // Memoized so consumers of useAuth() only re-render when user/login/logout
  // actually change identity, not on every AuthProvider render.
  const value = useMemo(() => ({ user, login, logout }), [user, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
