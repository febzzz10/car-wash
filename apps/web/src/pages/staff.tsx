import {
  Activity,
  Edit3,
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

interface ConfirmAction {
  user: StaffRecord;
  action: "disable" | "enable";
}

export default function StaffPage() {
  const state = useApiData<readonly StaffRecord[]>("/users");
  const [editing, setEditing] = useState<StaffRecord | null | undefined>(
    undefined,
  );
  const [activity, setActivity] = useState<StaffRecord | null>(null);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [resetUser, setResetUser] = useState<StaffRecord | null>(null);
  const toast = useToast();

  async function revoke(user: StaffRecord) {
    const reason = window.prompt(
      `Reason to revoke all sessions for ${user.full_name}:`,
    );
    if (reason === null || reason.trim().length < 5) return;
    try {
      await api(`/users/${user.id}/revoke-sessions`, {
        ...jsonBody({ reason }),
        method: "POST",
      });
      toast.success("Active sessions revoked.");
    } catch (failure) {
      toast.error(
        failure instanceof Error
          ? failure.message
          : "Session revocation failed.",
      );
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
                            onClick={() => setResetUser(user)}
                            tone="quiet"
                          >
                            <KeyRound size={17} />
                          </Button>
                          <Button
                            aria-label="Revoke sessions"
                            onClick={() => void revoke(user)}
                            tone="quiet"
                          >
                            <RefreshCw size={17} />
                          </Button>
                          <Button
                            aria-label={`${user.status === "ACTIVE" ? "Disable" : "Enable"} account`}
                            onClick={() =>
                              setConfirm({
                                user,
                                action: user.status === "ACTIVE" ? "disable" : "enable",
                              })
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
      <ConfirmActionDialog
        confirm={confirm}
        onClose={() => setConfirm(null)}
        onDone={() => {
          setConfirm(null);
          state.reload();
        }}
      />
      <ResetPasswordDialog
        onClose={() => setResetUser(null)}
        onDone={() => {
          setResetUser(null);
          state.reload();
        }}
        user={resetUser}
      />
    </>
  );
}
function ConfirmActionDialog({
  confirm,
  onClose,
  onDone,
}: {
  readonly confirm: ConfirmAction | null;
  readonly onClose: () => void;
  readonly onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const action = confirm?.action ?? "disable";
  const title =
    action === "disable" ? "Disable staff account?" : "Activate staff account?";
  const message =
    action === "disable"
      ? "This staff member will no longer be able to sign in."
      : "This staff member will be reactivated.";
  const label = action === "disable" ? "Disable" : "Activate";
  async function handleConfirm() {
    if (confirm === null) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/users/${confirm.user.id}/${action}`, {
        ...jsonBody({ version: confirm.user.version }),
        method: "POST",
      });
      toast.success(
        action === "disable"
          ? "Staff account disabled successfully."
          : "Staff account activated successfully.",
      );
      onDone();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Account update failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog onClose={onClose} open={confirm !== null} title={title}>
      <div className="dialog-form">
        {error === null ? null : <div className="form-alert">{error}</div>}
        <p>{message}</p>
        <div className="dialog-actions">
          <Button onClick={onClose} tone="secondary" type="button">
            Cancel
          </Button>
          <Button busy={busy} onClick={() => void handleConfirm()} tone="danger">
            {label}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function ResetPasswordDialog({
  onClose,
  onDone,
  user,
}: {
  readonly onClose: () => void;
  readonly onDone: () => void;
  readonly user: StaffRecord | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  function validate(): boolean {
    if (password.length < 12) {
      setValidationError("Password must be at least 12 characters.");
      return false;
    }
    if (!/[A-Z]/u.test(password)) {
      setValidationError("Password must contain an uppercase letter.");
      return false;
    }
    if (!/[a-z]/u.test(password)) {
      setValidationError("Password must contain a lowercase letter.");
      return false;
    }
    if (!/[0-9]/u.test(password)) {
      setValidationError("Password must contain a digit.");
      return false;
    }
    if (!/[^A-Za-z0-9]/u.test(password)) {
      setValidationError("Password must contain a symbol.");
      return false;
    }
    if (password !== confirmPassword) {
      setValidationError("Passwords do not match.");
      return false;
    }
    return true;
  }
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setValidationError(null);
    if (!validate()) return;
    if (user === null) return;
    setBusy(true);
    try {
      await api(`/users/${user.id}/reset-password`, {
        ...jsonBody({ temporaryPassword: password }),
        method: "POST",
      });
      toast.success("Password updated successfully.");
      onDone();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Password update failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  function handleClose() {
    setPassword("");
    setConfirmPassword("");
    setError(null);
    setValidationError(null);
    onClose();
  }
  return (
    <Dialog
      onClose={handleClose}
      open={user !== null}
      title={`Reset password for ${user?.full_name ?? ""}`}
    >
      <form className="dialog-form" onSubmit={(e) => void handleSubmit(e)}>
        {error === null ? null : <div className="form-alert">{error}</div>}
        {validationError === null ? null : (
          <div className="form-alert">{validationError}</div>
        )}
        <div className="form-grid">
          <label>
            <span>New password</span>
            <input
              autoComplete="new-password"
              minLength={12}
              onChange={(e) => setPassword(e.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          <label>
            <span>Confirm new password</span>
            <input
              autoComplete="new-password"
              minLength={12}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              type="password"
              value={confirmPassword}
            />
          </label>
        </div>
        <div className="dialog-actions">
          <Button onClick={handleClose} tone="secondary" type="button">
            Cancel
          </Button>
          <Button busy={busy} type="submit">
            Update Password
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
