import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wallet, ArrowRight } from "@phosphor-icons/react";

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) nav(user.role === "admin" ? "/" : "/portal", { replace: true });
  }, [user]);

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    const res = await login(email, password);
    setLoading(false);
    if (!res.ok) setError(res.error);
    else nav(res.user.role === "admin" ? "/" : "/portal", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-5 bg-background">
      <div className="w-full max-w-sm" data-testid="login-page">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-11 w-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
            <Wallet size={24} weight="duotone" />
          </div>
          <div>
            <div className="text-lg font-semibold" style={{ fontFamily: "Manrope" }}>Ledgerly</div>
            <div className="text-xs text-muted-foreground">AI Accountant</div>
          </div>
        </div>

        <h1 className="text-3xl font-light tracking-tight mb-1" style={{ fontFamily: "Manrope" }}>Welcome back</h1>
        <p className="text-sm text-muted-foreground mb-8">Sign in to your account to continue.</p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label className="text-xs">Email</Label>
            <Input data-testid="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com" className="bg-white" required />
          </div>
          <div>
            <Label className="text-xs">Password</Label>
            <Input data-testid="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••" className="bg-white" required />
          </div>
          {error && <p data-testid="login-error" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={loading} data-testid="login-submit" className="w-full rounded-full gap-2">
            {loading ? "Signing in…" : "Sign In"} <ArrowRight size={16} weight="bold" />
          </Button>
        </form>

        <p className="text-xs text-muted-foreground mt-8 text-center">
          Admin & customer accounts sign in here. Customer logins are created by your accountant.
        </p>
      </div>
    </div>
  );
}
