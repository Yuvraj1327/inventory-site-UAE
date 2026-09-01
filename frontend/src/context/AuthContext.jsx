import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { api, formatApiError } from "@/lib/api";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined=loading, null=guest, obj=profile

  const loadProfile = async ({ throwOnError = false } = {}) => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
      return data;
    } catch (e) {
      setUser(null);
      if (throwOnError) throw e;
      return null;
    }
  };

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data?.session) loadProfile();
      else setUser(null);
    });

    // Keeps the profile in sync across tabs / token refresh / sign-out.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") setUser(null);
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") loadProfile();
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  const login = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: error.message };
    try {
      const profile = await loadProfile({ throwOnError: true });
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
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    window.location.href = "/login";
  };

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}
