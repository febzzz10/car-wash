import {
  Activity,
  Edit3,
  Eye,
  EyeOff,
  KeyRound,
  Plus,
  Power,
  RefreshCw,
  SearchX,
  ShieldCheck,
} from "lucide-react";
import { useState, type FormEvent } from "react";

import { PERMISSIONS } from "@washpro/contracts";
import {
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  PageHeader,
  SkeletonRows,
  StatusBadge,
} from "../components/ui";
import { useToast } from "../components/toast";
import { useApiData } from "../hooks/use-api-data";
import { api, jsonBody } from "../lib/api";
import { dateTime, titleCase } from "../lib/format";

interface StaffRecord {
  readonly email?: string | null;
  readonly full_name: string;
  readonly id: string;
  readonly last_login_at?: string | null;
  readonly permissions_json?: string | null;
  readonly phone?: string | null;
  readonly role: "ADMIN" | "STAFF";
  readonly status: string;
  readonly username: string;
  readonly version: number;
}

type ActionTarget =
  | { readonly kind: "status"; readonly user: StaffRecord }
  | { readonly kind: "revoke"; readonly user: StaffRecord }
  | { readonly kind: "reset"; readonly user: StaffRecord };

export default function StaffPage() {
  const state = useApiData<readonly StaffRecord[]>("/users");
  const [editing, setEditing] = useState<StaffRecord | null | undefined>(
    undefined,
  );
  const [activity, setActivity] = useState<StaffRecord | null>(null);
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null);
  const toast = useToast();

  async function executeStatus(user: StaffRecord) {
    const action = user.status === "ACTIVE" ? "disable" : "enable";
    try {
      await api(`/users/${user.id}/${action}`, {
        ...jsonBody({ version: user.version }),
        method: "POST",
      });
      toast.success(`Account ${action}d and active sessions updated.`);
      setActionTarget(null);
      state.reload();
    } catch (failure) {
      toast.error(
        failure instanceof Error ? failure.message : "Account update failed.",
      );
    }
  }

  async function executeRevoke(user: StaffRecord) {
    try {
      await api(`/users/${user.id}/revoke-sessions`, {
        method: "POST",
      });
      toast.success("Active sessions revoked.");
      setActionTarget(null);
    } catch (failure) {
      toast.error(
        failure instanceof Error
          ? failure.message
          : "Session revocation failed.",
      );
    }
  }

  async function executeReset(
    user: StaffRecord,
    password: string,
    confirmPassword: string,
  ) {
    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    if (password.length < 12) {
      toast.error("Password must be at least 12 characters.");
      return;
    }
    try {
      await api(`/users/${user.id}/reset-password`, {
        ...jsonBody({ temporaryPassword: password }),
        method: "POST",
      });
      toast.success("Temporary password set; active sessions revoked.");
      setActionTarget(null);
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Reset failed.");
    }
  }

  return (
    <>
      <PageHeader
        actions={
          <Button onClick={() => setEditing(null)}>
            <Plus size={17} /> Add Staff
          </Button>
        }
        eyebrow="Administration"
        title="Staff & access"
      />
      <Card>
        {state.loading ? (
          <SkeletonRows />
        ) : state.error !== null ? (
          <ErrorState message={state.error} onRetry={state.reload} />
        ) : (state.data?.length ?? 0) === 0 ? (
          <EmptyState
            icon={SearchX}
            message="Create a Staff account and grant only the permissions they need."
            title="No users found"
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last login</th>
                  <th>Permissions</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {state.data?.map((user) => {
                  const count = JSON.parse(
                    user.permissions_json ?? "[]",
                  ) as readonly string[];
                  return (
                    <tr key={user.id}>
                      <td>
                        <strong>{user.full_name}</strong>
                        <small>@{user.username}</small>
                      </td>
                      <td>
                        <StatusBadge value={user.role} />
                      </td>
                      <td>
                        <StatusBadge value={user.status} />
                      </td>
                      <td>{dateTime(user.last_login_at)}</td>
                      <td>
                        {user.role === "ADMIN"
                          ? "Full access"
                          : `${count.length} granted`}
                      </td>
                      <td>
                        <div className="table-actions">
                          <Button
                            aria-label="Edit account"
                            onClick={() => setEditing(user)}
                            tone="quiet"
                          >
                            <Edit3 size={17} />
                          </Button>
                          <Button
                            aria-label="View activity"
                            onClick={() => setActivity(user)}
                            tone="quiet"
                          >
                            <Activity size={17} />
                          </Button>
                          <Button
                            aria-label="Reset password"
                            onClick={() =>
                              setActionTarget({ kind: "reset", user })
                            }
                            tone="quiet"
                          >
                            <KeyRound size={17} />
                          </Button>
                          <Button
                            aria-label="Revoke sessions"
                            onClick={() =>
                              setActionTarget({ kind: "revoke", user })
                            }
                            tone="quiet"
                          >
                            <RefreshCw size={17} />
                          </Button>
                          <Button
                            aria-label={`${user.status === "ACTIVE" ? "Disable" : "Enable"} account`}
                            onClick={() =>
                              setActionTarget({ kind: "status", user })
                            }
                            tone="quiet"
                          >
                            <Power size={17} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <StaffDialog
        key={editing?.id ?? "new"}
        onClose={() => setEditing(undefined)}
        onDone={() => {
          setEditing(undefined);
          state.reload();
        }}
        open={editing !== undefined}
        user={editing ?? null}
      />
      <StaffActivity onClose={() => setActivity(null)} user={activity} />
      <StatusConfirmDialog
        onCancel={() => setActionTarget(null)}
        onConfirm={() => {
          const target = actionTarget as { kind: "status"; user: StaffRecord };
          void executeStatus(target.user);
        }}
        user={actionTarget?.kind === "status" ? actionTarget.user : null}
      />
      <RevokeConfirmDialog
        onCancel={() => setActionTarget(null)}
        onConfirm={() => {
          const target = actionTarget as { kind: "revoke"; user: StaffRecord };
          void executeRevoke(target.user);
        }}
        user={actionTarget?.kind === "revoke" ? actionTarget.user : null}
      />
      <PasswordResetDialog
        onCancel={() => setActionTarget(null)}
        onReset={async (password, confirmPassword) => {
          const target = actionTarget as { kind: "reset"; user: StaffRecord };
          await executeReset(target.user, password, confirmPassword);
        }}
        user={actionTarget?.kind === "reset" ? actionTarget.user : null}
      />
    </>
  );
}

function StatusConfirmDialog({
  onCancel,
  onConfirm,
  user,
}: {
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  readonly user: StaffRecord | null;
}) {
  const [busy, setBusy] = useState(false);
  if (user === null) return null;
  const action = user.status === "ACTIVE" ? "disable" : "enable";
  const label = action === "disable" ? "Disable" : "Enable";

  return (
    <Dialog
      onClose={onCancel}
      open
      title={`${label} ${user.full_name}'s account?`}
    >
      <p className="dialog-message">
        {action === "disable"
          ? "The user will be signed out and cannot sign in again until re-enabled."
          : "The user will be able to sign in again."}
      </p>
      <div className="dialog-actions">
        <Button onClick={onCancel} tone="secondary" type="button">
          Cancel
        </Button>
        <Button
          busy={busy}
          onClick={async () => {
            setBusy(true);
            await onConfirm();
            setBusy(false);
          }}
          type="button"
        >
          <Power size={17} />
          {label} account
        </Button>
      </div>
    </Dialog>
  );
}

function RevokeConfirmDialog({
  onCancel,
  onConfirm,
  user,
}: {
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  readonly user: StaffRecord | null;
}) {
  const [busy, setBusy] = useState(false);
  if (user === null) return null;

  return (
    <Dialog
      onClose={onCancel}
      open
      title={`Revoke all active sessions for ${user.full_name}?`}
    >
      <p className="dialog-message">
        The user will be signed out from every device immediately.
      </p>
      <div className="dialog-actions">
        <Button onClick={onCancel} tone="secondary" type="button">
          Cancel
        </Button>
        <Button
          busy={busy}
          onClick={async () => {
            setBusy(true);
            await onConfirm();
            setBusy(false);
          }}
          type="button"
        >
          <RefreshCw size={17} />
          Revoke sessions
        </Button>
      </div>
    </Dialog>
  );
}

function PasswordResetDialog({
  onCancel,
  onReset,
  user,
}: {
  readonly onCancel: () => void;
  readonly onReset: (password: string, confirmPassword: string) => Promise<void>;
  readonly user: StaffRecord | null;
}) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user === null) return null;

  return (
    <Dialog
      onClose={() => {
        setPassword("");
        setConfirmPassword("");
        onCancel();
      }}
      open
      title={`Reset password for ${user.full_name}`}
    >
      <form
        className="dialog-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setError(null);
          if (password.length < 12) {
            setError("Password must be at least 12 characters.");
            return;
          }
          if (password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
          }
          setBusy(true);
          await onReset(password, confirmPassword);
          setBusy(false);
          setPassword("");
          setConfirmPassword("");
        }}
      >
        {error === null ? null : <div className="form-alert">{error}</div>}
        <label>
          <span>New temporary password</span>
          <div className="input-with-icon">
            <input
              autoComplete="new-password"
              disabled={busy}
              minLength={12}
              onChange={(event) => setPassword(event.target.value)}
              required
              type={showPassword ? "text" : "password"}
              value={password}
            />
            <button
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="icon-button"
              onClick={() => setShowPassword((v) => !v)}
              type="button"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </label>
        <label>
          <span>Confirm temporary password</span>
          <div className="input-with-icon">
            <input
              autoComplete="new-password"
              disabled={busy}
              minLength={12}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              type={showConfirm ? "text" : "password"}
              value={confirmPassword}
            />
            <button
              aria-label={showConfirm ? "Hide password" : "Show password"}
              className="icon-button"
              onClick={() => setShowConfirm((v) => !v)}
              type="button"
            >
              {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </label>
        <div className="dialog-actions">
          <Button
            onClick={() => {
              setPassword("");
              setConfirmPassword("");
              onCancel();
            }}
            tone="secondary"
            type="button"
          >
            Cancel
          </Button>
          <Button busy={busy} type="submit">
            <KeyRound size={17} />
            Reset password
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function StaffDialog({
  onClose,
  onDone,
  open,
  user,
}: {
  readonly onClose: () => void;
  readonly onDone: () => void;
  readonly open: boolean;
  readonly user: StaffRecord | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const permissions = PERMISSIONS.filter((permission) =>
      values.getAll("permission").includes(permission),
    );
    setBusy(true);
    setError(null);
    try {
      await api(user === null ? "/users" : `/users/${user.id}`, {
        ...jsonBody({
          email: values.get("email") || undefined,
          fullName: values.get("fullName"),
          permissions,
          phone: values.get("phone") || undefined,
          role: values.get("role"),
          ...(user === null
            ? {
                temporaryPassword: values.get("password"),
                username: values.get("username"),
              }
            : { version: user.version }),
        }),
        method: user === null ? "POST" : "PATCH",
      });
      onDone();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : `User could not be ${user === null ? "created" : "updated"}.`,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      onClose={onClose}
      open={open}
      title={user === null ? "Add Staff account" : "Edit Staff account"}
    >
      <form
        className="dialog-form wide-dialog"
        onSubmit={(event) => void submit(event)}
      >
        {error === null ? null : <div className="form-alert">{error}</div>}
        <div className="form-grid">
          <label>
            <span>Full name</span>
            <input defaultValue={user?.full_name} name="fullName" required />
          </label>
          <label>
            <span>Username</span>
            <input
              autoComplete="off"
              defaultValue={user?.username}
              disabled={user !== null}
              name="username"
              pattern="[A-Za-z0-9._-]+"
              required
              spellCheck={false}
            />
          </label>
          <label>
            <span>Phone</span>
            <input
              defaultValue={user?.phone ?? ""}
              inputMode="tel"
              name="phone"
              type="tel"
            />
          </label>
          <label>
            <span>Email</span>
            <input defaultValue={user?.email ?? ""} name="email" type="email" />
          </label>
          <label>
            <span>Role</span>
            <select defaultValue={user?.role ?? "STAFF"} name="role">
              <option value="STAFF">Staff</option>
              <option value="ADMIN">Administrator</option>
            </select>
          </label>
          {user === null ? (
            <label>
              <span>Temporary password</span>
              <input
                autoComplete="new-password"
                minLength={12}
                name="password"
                required
                type="password"
              />
            </label>
          ) : null}
        </div>
        <fieldset>
          <legend>Staff permissions</legend>
          <div className="permission-grid">
            {PERMISSIONS.map((permission) => (
              <label key={permission}>
                <input
                  defaultChecked={(
                    JSON.parse(
                      user?.permissions_json ?? "[]",
                    ) as readonly string[]
                  ).includes(permission)}
                  name="permission"
                  type="checkbox"
                  value={permission}
                />
                <span>{titleCase(permission.replace(".", " "))}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="dialog-actions">
          <Button onClick={onClose} tone="secondary" type="button">
            Cancel
          </Button>
          <Button busy={busy} type="submit">
            <ShieldCheck size={17} />
            {user === null ? "Create account" : "Save changes"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
function StaffActivity({
  onClose,
  user,
}: {
  readonly onClose: () => void;
  readonly user: StaffRecord | null;
}) {
  const state = useApiData<{
    readonly audits: readonly {
      readonly action: string;
      readonly created_at: string;
      readonly severity: string;
    }[];
    readonly loginAttempts: readonly {
      readonly attempted_at: string;
      readonly outcome: string;
    }[];
    readonly sessions: readonly {
      readonly created_at: string;
      readonly status: string;
    }[];
  }>(`/users/${user?.id ?? "none"}/activity`, user !== null);
  return (
    <Dialog
      onClose={onClose}
      open={user !== null}
      title={`${user?.full_name ?? "User"} activity`}
    >
      {state.loading ? (
        <SkeletonRows />
      ) : state.error !== null ? (
        <ErrorState message={state.error} />
      ) : (
        <div className="activity-list dialog-activity">
          {state.data?.audits.map((item, index) => (
            <div className="activity-item" key={`${item.created_at}-${index}`}>
              <span
                className={`activity-dot activity-dot--${item.severity.toLowerCase()}`}
              />
              <div>
                <strong>{titleCase(item.action)}</strong>
                <span>{dateTime(item.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}
