import { Droplets, Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../auth";
import { Button } from "../components/ui";

export default function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (user !== null) return <Navigate replace to="/dashboard" />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(identifier, password);
      const target =
        (location.state as { readonly from?: string } | null)?.from ??
        "/dashboard";
      navigate(target, { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-story">
        <div className="login-brand">
          <span className="brand__mark">W</span>
          <strong>WashPro</strong>
        </div>
        <div className="login-story__copy">
          <span className="story-icon">
            <Droplets size={30} />
          </span>
          <p className="eyebrow">Every wash, in control</p>
          <h1>
            Run the floor.
            <br />
            Know the numbers.
          </h1>
          <p>
            One secure workspace for live wash operations, customers, billing,
            and business performance.
          </p>
        </div>
        <div className="login-trust">
          <ShieldCheck size={19} />
          <span>
            Protected sessions · Audited actions · Private customer data
          </span>
        </div>
      </section>
      <section className="login-form-wrap">
        <form className="login-form" onSubmit={(event) => void submit(event)}>
          <div>
            <p className="eyebrow">Welcome back</p>
            <h2>Sign in to WashPro</h2>
            <p>Use your Admin or Staff account.</p>
          </div>
          {error === null ? null : (
            <div className="form-alert" role="alert">
              {error}
            </div>
          )}
          <label>
            <span>Email or username</span>
            <div className="input-with-icon">
              <LockKeyhole size={18} />
              <input
                autoComplete="email"
                onChange={(event) => setIdentifier(event.target.value)}
                required
                spellCheck={false}
                type="email"
                value={identifier}
              />
            </div>
          </label>
          <div className="field-stack">
            <label htmlFor="login-password">Password</label>
            <div className="input-with-icon">
              <LockKeyhole size={18} />
              <input
                autoComplete="current-password"
                id="login-password"
                onChange={(event) => setPassword(event.target.value)}
                required
                type={showPassword ? "text" : "password"}
                value={password}
              />
              <button
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="icon-button"
                onClick={() => setShowPassword((value) => !value)}
                type="button"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <Button busy={busy} className="login-submit" type="submit">
            Sign in
          </Button>
          <p className="login-help">
            If you cannot access your account, ask an Administrator to verify
            your status or reset your password.
          </p>
        </form>
      </section>
    </main>
  );
}
