import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function ProtectedRoute({ role, children, fallback }) {
  const { user } = useAuth();

  if (user === undefined) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }
  if (!user) {
    // `fallback` lets a specific route (the public landing page at "/")
    // show something other than a redirect for signed-out visitors,
    // without changing the default (redirect to /login) anywhere else
    // this component is used.
    if (fallback) return fallback;
    return <Navigate to="/login" replace />;
  }
  const allowed = Array.isArray(role) ? role : role ? [role] : null;
  if (allowed && !allowed.includes(user.role)) {
    return <Navigate to={user.role === "customer" ? "/portal" : "/"} replace />;
  }
  return children;
}
