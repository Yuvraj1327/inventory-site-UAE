import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // eslint-disable-next-line no-console
  console.warn(
    "REACT_APP_SUPABASE_URL / REACT_APP_SUPABASE_ANON_KEY are not set. " +
    "Sign-in will fail until frontend/.env is configured — see frontend/.env.example."
  );
}

// The frontend only ever holds the Supabase anon/public key. All data
// access still goes through FastAPI (see lib/api.js) — this client is
// used purely for Supabase Auth (sign in/out, session refresh).
export const supabase = createClient(SUPABASE_URL || "", SUPABASE_ANON_KEY || "");
