import axios from "axios";
import { supabase } from "@/lib/supabaseClient";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

// Every request carries the caller's current Supabase access token.
// FastAPI verifies it (see backend/app/core/security.py) and resolves
// role/customer_id from `profiles` — there is no separate custom JWT
// anymore.
api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    // Skip the auto-redirect for /auth/me: AuthContext calls it right
    // after sign-in and needs to handle a 401 itself (and show *why*),
    // rather than being pre-empted by a hard redirect here.
    const isMe = err.config?.url?.includes("/auth/me");
    if (err.response?.status === 401 && !isMe) {
      await supabase.auth.signOut();
      if (!window.location.pathname.startsWith("/login")) window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export const money = (n) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0));

export const fmtDate = (s) => {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return s;
  }
};

export const formatApiError = (detail) => {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((e) => e?.msg || JSON.stringify(e)).join(" ");
  return String(detail);
};
