import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function ProtectedRoute({ role, children }) {
  const { user } = useAuth();
  if (user === undefined) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  const allowed = Array.isArray(role) ? role : role ? [role] : null;
  if (allowed && !allowed.includes(user.role)) {
    return <Navigate to={user.role === "customer" ? "/portal" : "/"} replace />;
  }
  return children;
}
