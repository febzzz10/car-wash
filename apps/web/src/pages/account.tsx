import { KeyRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button, Card, PageHeader } from "../components/ui";
import { useToast } from "../components/toast";
import { api, jsonBody } from "../lib/api";
export default function AccountPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    if (values.get("new") !== values.get("confirm")) {
      setError("New passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api("/auth/change-password", {
        ...jsonBody({
          currentPassword: values.get("current"),
          newPassword: values.get("new"),
        }),
        method: "POST",
      });
      form.reset();
      toast.success("Password changed. Other sessions were revoked.");
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Password change failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader eyebrow="Account security" title="Change password" />
      <Card className="account-card">
        <span className="empty-state__icon">
          <KeyRound />
        </span>
        <form className="dialog-form" onSubmit={(event) => void submit(event)}>
          {error === null ? null : <div className="form-alert">{error}</div>}
          <label>
            <span>Current password</span>
            <input
              autoComplete="current-password"
              name="current"
              required
              type="password"
            />
          </label>
          <label>
            <span>New password</span>
            <input
              autoComplete="new-password"
              minLength={12}
              name="new"
              required
              type="password"
            />
          </label>
          <label>
            <span>Confirm new password</span>
            <input
              autoComplete="new-password"
              minLength={12}
              name="confirm"
              required
              type="password"
            />
          </label>
          <p className="muted">
            Use at least 12 characters with upper and lower case letters, a
            number, and a symbol.
          </p>
          <Button busy={busy} type="submit">
            Change password
          </Button>
        </form>
      </Card>
    </>
  );
}
