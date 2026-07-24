import {
  ArrowLeft,
  Camera,
  Clock3,
  FileText,
  MapPin,
  Pause,
  Play,
  Receipt,
  RotateCw,
  Square,
  WalletCards,
  Wrench,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";

import { useAuth } from "../auth";
import {
  Button,
  Card,
  Dialog,
  ErrorState,
  PageHeader,
  SkeletonRows,
  StatusBadge,
} from "../components/ui";
import { useToast } from "../components/toast";
import { useApiData } from "../hooks/use-api-data";
import { api, jsonBody } from "../lib/api";
import { dateTime, duration, money, titleCase } from "../lib/format";
import type { WashJobRecord } from "../types";

interface JobItem {
  readonly id: string;
  readonly item_kind: string;
  readonly line_total_minor: number;
  readonly quantity: number;
  readonly service_name_snapshot: string;
  readonly unit_price_minor: number;
}
interface LocationEvidence {
  readonly accuracy_meters: number;
  readonly captured_at: string;
  readonly distance_from_branch_meters: number;
  readonly location_status: string;
}
interface PhotoEvidence {
  readonly captured_at: string;
  readonly id: string;
  readonly mime_type: string;
  readonly size_bytes: number;
}
interface JobDetail extends WashJobRecord {
  readonly assigned_user_id?: string | null;
  readonly items: readonly JobItem[];
  readonly locations: readonly LocationEvidence[];
  readonly photos: readonly PhotoEvidence[];
  readonly subtotal_minor: number;
  readonly coupon_discount_minor: number;
  readonly referral_discount_minor: number;
  readonly reward_discount_minor: number;
  readonly manual_discount_minor: number;
  readonly tax_minor: number;
  readonly rounding_minor: number;
}
interface TimerPayload {
  readonly events: readonly {
    readonly event_at: string;
    readonly event_type: "START" | "PAUSE" | "RESUME" | "END";
  }[];
}

function liveTimer(
  events: TimerPayload["events"],
  now: number,
): { readonly active: number; readonly paused: number } {
  let active = 0;
  let paused = 0;
  let activeFrom: number | null = null;
  let pausedFrom: number | null = null;
  for (const event of events) {
    const at = Date.parse(event.event_at);
    if (event.event_type === "START" || event.event_type === "RESUME") {
      activeFrom = at;
      pausedFrom = null;
    } else if (event.event_type === "PAUSE" && activeFrom !== null) {
      active += Math.max(0, at - activeFrom);
      activeFrom = null;
      pausedFrom = at;
    } else if (event.event_type === "END") {
      if (activeFrom !== null) active += Math.max(0, at - activeFrom);
      if (pausedFrom !== null) paused += Math.max(0, at - pausedFrom);
      activeFrom = null;
      pausedFrom = null;
    }
  }
  if (activeFrom !== null) active += Math.max(0, now - activeFrom);
  if (pausedFrom !== null) paused += Math.max(0, now - pausedFrom);
  return {
    active: Math.floor(active / 1000),
    paused: Math.floor(paused / 1000),
  };
}

export default function WashJobDetailPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const canAssign =
    user?.role === "ADMIN" || user?.permissions.includes("wash_jobs.assign");
  const job = useApiData<JobDetail>(`/wash-jobs/${id}`, id !== "");
  const timer = useApiData<TimerPayload>(`/wash-jobs/${id}/timer`, id !== "");
  const payments = useApiData<{
    readonly payments: readonly Record<string, unknown>[];
    readonly refunds: readonly Record<string, unknown>[];
  }>(`/payments/job/${id}/all`, id !== "");
  const assignable = useApiData<
    readonly {
      readonly full_name: string;
      readonly id: string;
      readonly role: string;
    }[]
  >("/wash-jobs/assignable-users", canAssign === true);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [assigneeId, setAssigneeId] = useState("");
  const toast = useToast();
  useEffect(() => {
    const handle = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(handle);
  }, []);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") {
        job.reload();
        timer.reload();
      }
    };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, [job, timer]);
  const elapsed = useMemo(
    () => liveTimer(timer.data?.events ?? [], now),
    [now, timer.data],
  );
  async function action(
    name: "start" | "pause" | "resume" | "complete" | "queue",
  ) {
    if (job.data === null) return;
    setBusy(true);
    try {
      await api(`/wash-jobs/${id}/${name}`, {
        ...jsonBody({ version: job.data.version }),
        method: "POST",
      });
      toast.success(
        name === "queue"
          ? "Draft placed in the waiting queue."
          : name === "complete"
            ? "Wash completed with a server timestamp."
            : `Timer ${name} recorded.`,
      );
      job.reload();
      timer.reload();
    } catch (reason) {
      toast.error(
        reason instanceof Error ? reason.message : "Timer action failed.",
      );
      job.reload();
      timer.reload();
    } finally {
      setBusy(false);
    }
  }
  async function assign() {
    if (job.data === null || assigneeId === "") return;
    const reason = window.prompt("Reason for changing the assignment:");
    if (reason === null || reason.trim().length < 5) return;
    setBusy(true);
    try {
      await api(`/wash-jobs/${id}/assignment`, {
        ...jsonBody({
          assignedUserId: assigneeId,
          reason,
          version: job.data.version,
        }),
        method: "PATCH",
      });
      toast.success("Assignment updated and audited.");
      setAssigneeId("");
      job.reload();
    } catch (failure) {
      toast.error(
        failure instanceof Error ? failure.message : "Assignment failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function generateInvoice() {
    setBusy(true);
    try {
      const invoice = await api<{ readonly id: string }>(
        `/wash-jobs/${id}/invoice`,
        {
          ...jsonBody({ idempotencyKey: crypto.randomUUID() }),
          method: "POST",
        },
      );
      toast.success("Immutable invoice issued.");
      window.location.assign(`/invoices/${invoice.id}`);
    } catch (reason) {
      toast.error(
        reason instanceof Error ? reason.message : "Invoice generation failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function correctTimer() {
    if (job.data === null) return;
    const newValue = window.prompt(
      "Correct active duration in seconds:",
      String(job.data.total_active_seconds),
    );
    if (newValue === null) return;
    const reason = window.prompt("Correction reason:");
    if (reason === null || reason.trim().length < 5) return;
    try {
      await api(`/wash-jobs/${id}/timer-adjustments`, {
        ...jsonBody({
          adjustmentType: "ACTIVE_DURATION_CORRECTION",
          newValue,
          reason,
          version: job.data.version,
        }),
        method: "POST",
      });
      toast.success("Audited timer correction recorded.");
      job.reload();
      timer.reload();
    } catch (failure) {
      toast.error(
        failure instanceof Error ? failure.message : "Timer correction failed.",
      );
    }
  }
  if (job.loading) return <SkeletonRows count={7} />;
  if (job.error !== null || job.data === null)
    return (
      <ErrorState
        message={job.error ?? "Wash job not found."}
        onRetry={job.reload}
      />
    );
  const record = job.data;
  return (
    <>
      <Link className="back-link" to="/wash-jobs">
        <ArrowLeft size={17} /> Back to queue
      </Link>
      <PageHeader
        actions={<StatusBadge value={record.status} />}
        eyebrow={record.job_reference}
        title={`${record.vehicle_registration_snapshot} · ${record.customer_name_snapshot}`}
      />
      <div className="job-layout">
        <div className="job-main">
          <Card className="timer-card">
            <div className="timer-card__heading">
              <div>
                <p className="eyebrow">Server timer</p>
                <h2>
                  {record.status === "IN_PROGRESS"
                    ? "Wash in progress"
                    : record.status === "PAUSED"
                      ? "Wash paused"
                      : titleCase(record.status)}
                </h2>
              </div>
              <Clock3 size={26} />
            </div>
            <div className="timer-display">
              {duration(elapsed.active || record.total_active_seconds)}
              <span>active time</span>
            </div>
            {elapsed.paused > 0 ? (
              <p className="paused-time">Paused {duration(elapsed.paused)}</p>
            ) : null}
            <div className="timer-actions">
              {record.status === "DRAFT" ? (
                <Button busy={busy} onClick={() => void action("queue")}>
                  Place in waiting queue
                </Button>
              ) : null}
              {record.status === "WAITING" ? (
                <Button busy={busy} onClick={() => void action("start")}>
                  <Play size={18} /> Start
                </Button>
              ) : null}
              {record.status === "IN_PROGRESS" ? (
                <Button
                  busy={busy}
                  onClick={() => void action("pause")}
                  tone="secondary"
                >
                  <Pause size={18} /> Pause
                </Button>
              ) : null}
              {record.status === "PAUSED" ? (
                <Button busy={busy} onClick={() => void action("resume")}>
                  <RotateCw size={18} /> Resume
                </Button>
              ) : null}
              {["IN_PROGRESS", "PAUSED"].includes(record.status) ? (
                <Button
                  busy={busy}
                  onClick={() => void action("complete")}
                  tone="secondary"
                >
                  <Square size={17} /> End wash
                </Button>
              ) : null}
              {!["COMPLETED", "CANCELLED"].includes(record.status) ? (
                <Button onClick={() => setCancelOpen(true)} tone="danger">
                  <XCircle size={18} /> Cancel
                </Button>
              ) : null}
            </div>
          </Card>
          {user?.role === "ADMIN" && record.status === "COMPLETED" ? (
            <Button onClick={() => void correctTimer()} tone="secondary">
              <Wrench size={17} /> Correct timer with audit reason
            </Button>
          ) : null}
          <Card>
            <div className="card-heading">
              <div>
                <p className="eyebrow">Service record</p>
                <h2>Wash items</h2>
              </div>
            </div>
            <div className="line-items">
              {record.items.map((item) => (
                <div key={item.id}>
                  <span>
                    <strong>{item.service_name_snapshot}</strong>
                    <small>
                      {titleCase(item.item_kind)} · {item.quantity} ×{" "}
                      {money(item.unit_price_minor)}
                    </small>
                  </span>
                  <strong>{money(item.line_total_minor)}</strong>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <div className="card-heading">
              <div>
                <p className="eyebrow">Required evidence</p>
                <h2>Photo & location</h2>
              </div>
            </div>
            <div className="evidence-grid">
              <div>
                <span className="evidence-icon">
                  <Camera />
                </span>
                <strong>Live camera photo</strong>
                <span>
                  {record.photos.length} private record
                  {record.photos.length === 1 ? "" : "s"}
                </span>
                <small>{dateTime(record.photos[0]?.captured_at)}</small>
              </div>
              <div>
                <span className="evidence-icon">
                  <MapPin />
                </span>
                <strong>Branch location</strong>
                <span>
                  {titleCase(
                    record.locations.at(-1)?.location_status ?? "NOT CAPTURED",
                  )}
                </span>
                <small>
                  {record.locations.length === 0
                    ? "—"
                    : `${Math.round(record.locations.at(-1)?.distance_from_branch_meters ?? 0)} m from branch · ±${Math.round(record.locations.at(-1)?.accuracy_meters ?? 0)} m`}
                </small>
              </div>
            </div>
          </Card>
        </div>
        <aside className="job-side">
          <Card>
            <p className="eyebrow">Billing</p>
            <div className="bill-lines">
              <span>
                Subtotal <strong>{money(record.subtotal_minor)}</strong>
              </span>
              {record.coupon_discount_minor > 0 ? (
                <span>
                  Coupon <strong>−{money(record.coupon_discount_minor)}</strong>
                </span>
              ) : null}
              {record.referral_discount_minor > 0 ? (
                <span>
                  Referral{" "}
                  <strong>−{money(record.referral_discount_minor)}</strong>
                </span>
              ) : null}
              {record.reward_discount_minor > 0 ? (
                <span>
                  Reward <strong>−{money(record.reward_discount_minor)}</strong>
                </span>
              ) : null}
              {record.manual_discount_minor > 0 ? (
                <span>
                  Manual discount{" "}
                  <strong>−{money(record.manual_discount_minor)}</strong>
                </span>
              ) : null}
              <span>
                Tax <strong>{money(record.tax_minor)}</strong>
              </span>
              <span>
                Rounding <strong>{money(record.rounding_minor)}</strong>
              </span>
            </div>
            <div className="bill-total">
              <span>Final amount</span>
              <strong>{money(record.total_amount_minor)}</strong>
            </div>
            <div className="payment-progress">
              <div>
                <span>Paid</span>
                <strong>{money(record.paid_amount_minor)}</strong>
              </div>
              <div>
                <span>Balance</span>
                <strong>{money(record.balance_minor)}</strong>
              </div>
            </div>
            <StatusBadge value={record.payment_status} />
            <div className="stacked-actions">
              {record.balance_minor > 0 && record.status !== "CANCELLED" ? (
                <Button onClick={() => setPaymentOpen(true)}>
                  <WalletCards size={18} /> Record payment
                </Button>
              ) : null}
              {record.status === "COMPLETED" ? (
                <Button
                  busy={busy}
                  onClick={() => void generateInvoice()}
                  tone="secondary"
                >
                  <FileText size={18} /> Generate / open invoice
                </Button>
              ) : null}
            </div>
          </Card>
          <Card>
            <p className="eyebrow">Assignment</p>
            <strong>
              {record.assigned_user_name_snapshot ?? "Unassigned"}
            </strong>
            <p className="muted">Created {dateTime(record.created_at)}</p>
            {record.completed_at === null ||
            record.completed_at === undefined ? null : (
              <p className="muted">Completed {dateTime(record.completed_at)}</p>
            )}
            {canAssign === true &&
            !["COMPLETED", "CANCELLED"].includes(record.status) ? (
              <div className="stacked-actions assignment-control">
                <label>
                  <span>Reassign to</span>
                  <select
                    onChange={(event) => setAssigneeId(event.target.value)}
                    value={assigneeId}
                  >
                    <option value="">Select active Staff</option>
                    {assignable.data?.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.full_name} · {titleCase(person.role)}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  busy={busy}
                  disabled={
                    assigneeId === "" || assigneeId === record.assigned_user_id
                  }
                  onClick={() => void assign()}
                  tone="secondary"
                >
                  Save assignment
                </Button>
              </div>
            ) : null}
          </Card>
        </aside>
      </div>
      <CancelDialog
        id={id}
        onClose={() => setCancelOpen(false)}
        onDone={() => {
          setCancelOpen(false);
          job.reload();
          timer.reload();
        }}
        open={cancelOpen}
        version={record.version}
      />
      <PaymentDialog
        balanceMinor={record.balance_minor}
        id={id}
        onClose={() => setPaymentOpen(false)}
        onDone={() => {
          setPaymentOpen(false);
          job.reload();
          payments.reload();
        }}
        open={paymentOpen}
      />
    </>
  );
}

function CancelDialog({
  id,
  onClose,
  onDone,
  open,
  version,
}: {
  readonly id: string;
  readonly onClose: () => void;
  readonly onDone: () => void;
  readonly open: boolean;
  readonly version: number;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = String(
      new FormData(event.currentTarget).get("reason") ?? "",
    );
    setBusy(true);
    setError(null);
    try {
      await api(`/wash-jobs/${id}/cancel`, {
        ...jsonBody({ reason, version }),
        method: "POST",
      });
      onDone();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Cancellation failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog onClose={onClose} open={open} title="Cancel wash job">
      <form className="dialog-form" onSubmit={(event) => void submit(event)}>
        <p>
          Cancellation releases reserved benefits and preserves the job history.
        </p>
        {error === null ? null : <div className="form-alert">{error}</div>}
        <label>
          <span>Cancellation reason</span>
          <textarea minLength={5} name="reason" required />
        </label>
        <div className="dialog-actions">
          <Button onClick={onClose} tone="secondary" type="button">
            Keep job
          </Button>
          <Button busy={busy} tone="danger" type="submit">
            Cancel job
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
function PaymentDialog({
  balanceMinor,
  id,
  onClose,
  onDone,
  open,
}: {
  readonly balanceMinor: number;
  readonly id: string;
  readonly onClose: () => void;
  readonly onDone: () => void;
  readonly open: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api("/payments", {
        ...jsonBody({
          amountMinor: Math.round(Number(values.get("amount")) * 100),
          idempotencyKey: crypto.randomUUID(),
          method: values.get("method"),
          notes: values.get("notes") || undefined,
          transactionReference: values.get("reference") || undefined,
          washJobId: id,
        }),
        method: "POST",
      });
      onDone();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Payment failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog onClose={onClose} open={open} title="Record payment">
      <form className="dialog-form" onSubmit={(event) => void submit(event)}>
        <div className="payment-due">
          <Receipt size={20} />
          <span>Remaining balance</span>
          <strong>{money(balanceMinor)}</strong>
        </div>
        {error === null ? null : <div className="form-alert">{error}</div>}
        <label>
          <span>Amount</span>
          <input
            max={(balanceMinor / 100).toFixed(2)}
            min="0.01"
            name="amount"
            required
            step="0.01"
            type="number"
          />
        </label>
        <label>
          <span>Method</span>
          <select name="method" required>
            <option value="CASH">Cash</option>
            <option value="UPI">UPI</option>
            <option value="CARD">Card</option>
            <option value="BANK_TRANSFER">Bank transfer</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <label>
          <span>Transaction reference (optional)</span>
          <input name="reference" />
        </label>
        <label>
          <span>Notes</span>
          <textarea name="notes" />
        </label>
        <div className="dialog-actions">
          <Button onClick={onClose} tone="secondary" type="button">
            Cancel
          </Button>
          <Button busy={busy} type="submit">
            Record payment
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
