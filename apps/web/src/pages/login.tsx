import { Droplets, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "../auth";
import { Button } from "../components/ui";

const accessTeamDomain =
  typeof import.meta !== "undefined" &&
  import.meta.env?.VITE_ACCESS_TEAM_DOMAIN
    ? import.meta.env.VITE_ACCESS_TEAM_DOMAIN
    : "";

export default function LoginPage() {
  const { loginWithAccess, login, user } = useAuth();
  if (user !== null) return <Navigate replace to="/dashboard" />;

  if (accessTeamDomain !== "") {
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
              Identity verified · Audited actions · Private customer data
            </span>
          </div>
        </section>
        <section className="login-form-wrap">
          <div className="login-form">
            <div>
              <p className="eyebrow">Welcome back</p>
              <h2>Sign in to WashPro</h2>
              <p>
                Your identity is verified through Cloudflare Access.
              </p>
            </div>
            <Button
              className="login-submit"
              onClick={() => loginWithAccess()}
            >
              Sign in through Cloudflare Access
            </Button>
            <p className="login-help">
              Access is restricted to authorised personnel. Contact an
              Administrator if you need access.
            </p>
          </div>
        </section>
      </main>
    );
  }

  // Local-development password form
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(identifier, password);
      window.location.href = "/dashboard";
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
            <span>Username, email, or phone</span>
            <input
              autoComplete="username"
              onChange={(event) => setIdentifier(event.target.value)}
              required
              spellCheck={false}
              value={identifier}
            />
          </label>
          <label>
            <span>Password</span>
            <input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type={showPassword ? "text" : "password"}
              value={password}
            />
            <button
              className="icon-button"
              onClick={() => setShowPassword((v) => !v)}
              type="button"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </label>
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
