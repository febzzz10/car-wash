import {
  ArrowLeft,
  Camera,
  Clock3,
  FileText,
  Info,
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
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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
import { api, ApiError, jsonBody } from "../lib/api";
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
  readonly customer_id: string;
  readonly assigned_user_id?: string | null;
  readonly assigned_user_full_name?: string | null;
  readonly items: readonly JobItem[];
  readonly locations: readonly LocationEvidence[];
  readonly photos: readonly PhotoEvidence[];
  readonly location_place?: string | null;
  readonly location_captured_at?: string | null;
  readonly subtotal_minor: number;
  readonly coupon_discount_minor: number;
  readonly referral_discount_minor: number;
  readonly reward_discount_minor: number;
  readonly manual_discount_minor: number;
  readonly manual_discount_reason?: string | null;
  readonly tax_minor: number;
  readonly rounding_minor: number;
  readonly billing_locked_at?: string | null;
  readonly appliedBenefits?: {
    readonly coupon?: { readonly id: string; readonly code: string; readonly discountMinor: number } | null;
    readonly referral?: { readonly redemptionId: string; readonly code: string; readonly discountMinor: number } | null;
    readonly reward?: { readonly id: string; readonly amountMinor: number } | null;
    readonly manualDiscount?: { readonly amountMinor: number; readonly reason: string } | null;
  } | null;
}
interface TimerPayload {
  readonly events: readonly {
    readonly event_at: string;
    readonly event_type: "START" | "PAUSE" | "RESUME" | "END";
  }[];
}

export function liveTimer(
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
  const job = useApiData<JobDetail>(`/wash-jobs/${id}`, id !== "");
  const timer = useApiData<TimerPayload>(`/wash-jobs/${id}/timer`, id !== "");
  const payments = useApiData<{
    readonly payments: readonly Record<string, unknown>[];
    readonly refunds: readonly Record<string, unknown>[];
  }>(`/payments/job/${id}/all`, id !== "");
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [timerCorrectionOpen, setTimerCorrectionOpen] = useState(false);
  const toast = useToast();
  useEffect(() => {
    const handle = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(handle);
  }, []);
  const timerSyncRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    const isTerminal =
      job.data?.status === "COMPLETED" || job.data?.status === "CANCELLED";
    const sync = () => {
      if (document.hidden) return;
      job.reload();
      timer.reload();
    };
    const refresh = () => {
      if (document.visibilityState === "visible") sync();
    };
    document.addEventListener("visibilitychange", refresh);
    if (timerSyncRef.current !== null) {
      window.clearInterval(timerSyncRef.current);
      timerSyncRef.current = null;
    }
    if (!isTerminal) {
      timerSyncRef.current = window.setInterval(sync, 30_000);
    }
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      if (timerSyncRef.current !== null) {
        window.clearInterval(timerSyncRef.current);
        timerSyncRef.current = null;
      }
    };
  }, [id, job, timer]);
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
  function correctTimer() {
    if (job.data === null) return;
    setTimerCorrectionOpen(true);
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
                <strong>Location</strong>
                {record.location_place !== null && record.location_place !== undefined ? (
                  <>
                    <span>{record.location_place}</span>
                    <small>{dateTime(record.location_captured_at)}</small>
                  </>
                ) : record.locations.length > 0 ? (
                  <>
                    <span>Legacy location recorded</span>
                    <small>{dateTime(record.locations.at(-1)?.captured_at)}</small>
                  </>
                ) : (
                  <>
                    <span>Not captured</span>
                    <small>—</small>
                  </>
                )}
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
                  Manual discount
                  {record.manual_discount_reason
                    ? ` (${record.manual_discount_reason})`
                    : ""}{" "}
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
            <p className="eyebrow">
              {record.status === "COMPLETED"
                ? "Washed by"
                : "Assigned staff"}
            </p>
            {record.assigned_user_full_name !== null &&
            record.assigned_user_full_name !== undefined ? (
              <>
                <strong>{record.assigned_user_full_name}</strong>
                <p className="muted">Staff member</p>
              </>
            ) : (
              <strong>Assigned staff not recorded</strong>
            )}
            <p className="muted">Created {dateTime(record.created_at)}</p>
            {record.completed_at === null ||
            record.completed_at === undefined ? null : (
              <p className="muted">Completed {dateTime(record.completed_at)}</p>
            )}
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
        record={record}
        onClose={() => setPaymentOpen(false)}
        onDone={({ fullyDiscounted }) => {
          setPaymentOpen(false);
          if (fullyDiscounted) toast.success("Benefits applied — no payment required.");
          job.reload();
          payments.reload();
        }}
        open={paymentOpen}
      />
      <TimerCorrectionDialog
        currentActiveSeconds={record.total_active_seconds}
        id={id}
        onClose={() => setTimerCorrectionOpen(false)}
        onDone={() => {
          setTimerCorrectionOpen(false);
          job.reload();
          timer.reload();
        }}
        open={timerCorrectionOpen}
        version={record.version}
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
export function TimerCorrectionDialog({
  currentActiveSeconds,
  id,
  onClose,
  onDone,
  open,
  version,
}: {
  readonly currentActiveSeconds: number;
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
    const data = new FormData(event.currentTarget);
    const raw = String(data.get("newValue") ?? "").trim();
    const reason = String(data.get("reason") ?? "").trim();
    if (raw === "") {
      setError("Enter a corrected duration in seconds.");
      return;
    }
    const seconds = Number(raw);
    if (!Number.isFinite(seconds) || !Number.isSafeInteger(seconds)) {
      setError("Enter a whole number of seconds.");
      return;
    }
    if (seconds < 0) {
      setError("Duration cannot be negative.");
      return;
    }
    if (seconds > 31_536_000) {
      setError("Duration cannot exceed 31,536,000 seconds (365 days).");
      return;
    }
    if (reason.length < 5) {
      setError("Enter a correction reason (at least 5 characters).");
      return;
    }
    if (reason.length > 500) {
      setError("Reason must be at most 500 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/wash-jobs/${id}/timer-adjustments`, {
        ...jsonBody({
          adjustmentType: "ACTIVE_DURATION_CORRECTION",
          newValue: raw,
          reason,
          version,
        }),
        method: "POST",
      });
      onDone();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Timer correction failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog onClose={onClose} open={open} title="Correct timer">
      <form className="dialog-form" onSubmit={(event) => void submit(event)}>
        <p>
          Current active duration:{" "}
          <strong>{duration(currentActiveSeconds)}</strong>
        </p>
        {error === null ? null : <div className="form-alert">{error}</div>}
        <label>
          <span>Corrected active duration in seconds</span>
          <input
            defaultValue={currentActiveSeconds}
            min="0"
            name="newValue"
            required
            step="1"
            type="number"
          />
        </label>
        <label>
          <span>Correction reason</span>
          <textarea minLength={5} maxLength={500} name="reason" required />
        </label>
        <div className="dialog-actions">
          <Button onClick={onClose} tone="secondary" type="button">
            Cancel
          </Button>
          <Button busy={busy} type="submit">
            Record correction
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
export function PaymentDialog({
  record,
  onClose,
  onDone,
  open,
}: {
  readonly record: JobDetail;
  readonly onClose: () => void;
  readonly onDone: (result: { fullyDiscounted: boolean }) => void;
  readonly open: boolean;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const benefitsLocked = useMemo(() =>
    Boolean(record.billing_locked_at) || record.paid_amount_minor > 0 || record.payment_status === "PAID",
    [record.billing_locked_at, record.paid_amount_minor, record.payment_status]);

  const canApplyManualDiscount = user?.role === "ADMIN" || (user?.permissions ?? []).includes("payments.adjust");

  const [couponCode, setCouponCode] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [rewardId, setRewardId] = useState("");
  const [rewardAmount, setRewardAmount] = useState("");
  const [manualDiscount, setManualDiscount] = useState("0");
  const [manualDiscountReason, setManualDiscountReason] = useState("");

  const initializedFor = useRef<string | null>(null);
  const wasOpen = useRef(false);

  const [rewards, setRewards] = useState<readonly { id: string; remaining_amount_minor: number; expires_at?: string | null }[]>([]);
  const [rewardsLoading, setRewardsLoading] = useState(false);

  const [preview, setPreview] = useState<Record<string, any> | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewDirty, setPreviewDirty] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewSeq = useRef(0);

  const [verifiedBalanceMinor, setVerifiedBalanceMinor] = useState<number | null>(null);
  const [amountEdited, setAmountEdited] = useState(false);

  const lastAttempt = useRef<{ canonicalPayload: string; idempotencyKey: string } | null>(null);

  const effectiveBalanceMinor = verifiedBalanceMinor ?? record.balance_minor;

  useEffect(() => {
    const justOpened = open && !wasOpen.current;
    if ((justOpened || (open && initializedFor.current !== record.id)) && !benefitsLocked) {
      const ab = record.appliedBenefits;
      setCouponCode(ab?.coupon?.code ?? "");
      setReferralCode(ab?.referral?.code ?? "");
      setRewardId(ab?.reward?.id ?? "");
      setRewardAmount(ab?.reward?.amountMinor != null ? (ab.reward.amountMinor / 100).toString() : "");
      setManualDiscount(ab?.manualDiscount?.amountMinor != null ? (ab.manualDiscount.amountMinor / 100).toString() : "0");
      setManualDiscountReason(ab?.manualDiscount?.reason ?? "");
      initializedFor.current = record.id;
    }
    if (!open) {
      initializedFor.current = null;
      setCouponCode(""); setReferralCode(""); setRewardId(""); setRewardAmount("");
      setManualDiscount("0"); setManualDiscountReason("");
      setPreview(null); setPreviewDirty(false); setPreviewError(null);
      setVerifiedBalanceMinor(null); setFieldErrors({}); setError(null); setAmountEdited(false);
      lastAttempt.current = null;
    }
    wasOpen.current = open;
  }, [open, record.id, benefitsLocked, record.appliedBenefits]);

  useEffect(() => {
    if (!open || benefitsLocked || !record.customer_id) return;
    const controller = new AbortController();
    setRewardsLoading(true);
    api<readonly { id: string; remaining_amount_minor: number; expires_at?: string | null }[]>(
      `/customers/${encodeURIComponent(record.customer_id)}/rewards?washJobId=${encodeURIComponent(record.id)}`,
      { signal: controller.signal } as RequestInit,
    ).then(r => { if (!controller.signal.aborted) setRewards(r); }).catch(() => {})
     .finally(() => { if (!controller.signal.aborted) setRewardsLoading(false); });
    return () => controller.abort();
  }, [open, benefitsLocked, record.customer_id, record.id]);

  function clearField(key: string) {
    setFieldErrors(prev => { const n = { ...prev }; delete n[key]; return n; });
  }

  async function doVerify() {
    setPreviewBusy(true); setPreviewError(null);
    const seq = ++previewSeq.current;
    try {
      const r = await api<Record<string, any>>(`/wash-jobs/${encodeURIComponent(record.id)}/verify-benefits`, {
        ...jsonBody({ expectedVersion: record.version, benefits: { replaceExisting: true, couponCode: couponCode.trim() || undefined, referralCode: referralCode.trim() || undefined, rewardId: rewardId || undefined, rewardAmountMinor: rewardId ? Math.round(parseFloat(rewardAmount || "0") * 100) : undefined, manualDiscountMinor: Math.round(parseFloat(manualDiscount || "0") * 100), manualDiscountReason: manualDiscountReason.trim() || undefined } }),
        method: "POST",
      });
      if (seq !== previewSeq.current) return;
      setPreview(r); setPreviewDirty(false); setPreviewError(null); setFieldErrors({});
      setVerifiedBalanceMinor(r.revised.revisedRemainingBalanceMinor != null ? (r.revised.revisedRemainingBalanceMinor as number) : null);
      setAmountEdited(false);
    } catch (e) {
      if (seq !== previewSeq.current) return;
      if (e instanceof ApiError) { setPreviewError(e.message); if (e.fields) setFieldErrors(e.fields); }
      else setPreviewError("Verification failed.");
      setPreview(null);
    } finally { if (seq === previewSeq.current) setPreviewBusy(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const amountText = (form.get("amount") as string || "0").trim();
    const amountMinor = Math.round(parseFloat(amountText || "0") * 100);
    setBusy(true); setError(null);

    const benefitsChanged = !benefitsLocked && (
      couponCode.trim().toUpperCase() !== (record.appliedBenefits?.coupon?.code ?? "").toUpperCase() ||
      referralCode.trim().toUpperCase() !== (record.appliedBenefits?.referral?.code ?? "").toUpperCase() ||
      rewardId !== (record.appliedBenefits?.reward?.id ?? "") ||
      Math.abs(Math.round(parseFloat(rewardAmount || "0") * 100) - (record.appliedBenefits?.reward?.amountMinor ?? 0)) > 0 ||
      Math.abs(Math.round(parseFloat(manualDiscount || "0") * 100) - (record.appliedBenefits?.manualDiscount?.amountMinor ?? 0)) > 0 ||
      manualDiscountReason.trim() !== (record.appliedBenefits?.manualDiscount?.reason ?? "")
    );

    if (benefitsChanged && previewDirty && preview !== null) {
      setError("Benefits have changed. Please verify benefits again.");
      setBusy(false); return;
    }
    if (amountMinor > effectiveBalanceMinor) {
      setError(`Amount cannot exceed ${money(effectiveBalanceMinor)}.`);
      setBusy(false); return;
    }

    const payload: Record<string, unknown> = {
      washJobId: record.id, amountMinor, method: form.get("method"),
      transactionReference: (form.get("reference") as string) || undefined,
      notes: (form.get("notes") as string) || undefined,
      idempotencyKey: "",
    };
    if (benefitsChanged) {
      payload.expectedVersion = record.version;
      payload.benefits = { replaceExisting: true,
        couponCode: couponCode.trim() || undefined,
        referralCode: referralCode.trim() || undefined,
        rewardId: rewardId || undefined,
        rewardAmountMinor: rewardId ? Math.round(parseFloat(rewardAmount || "0") * 100) : undefined,
        manualDiscountMinor: Math.round(parseFloat(manualDiscount || "0") * 100),
        manualDiscountReason: manualDiscountReason.trim() || undefined,
      };
    }

    const canonical = JSON.stringify({ washJobId: payload.washJobId, amountMinor: payload.amountMinor, method: payload.method, transactionReference: payload.transactionReference, notes: payload.notes, expectedVersion: payload.expectedVersion, benefits: payload.benefits });
    payload.idempotencyKey = lastAttempt.current?.canonicalPayload === canonical ? lastAttempt.current.idempotencyKey : crypto.randomUUID();
    if (lastAttempt.current?.canonicalPayload !== canonical) lastAttempt.current = { canonicalPayload: canonical, idempotencyKey: payload.idempotencyKey as string };

    try {
      await api("/payments", { ...jsonBody(payload), method: "POST" });
      lastAttempt.current = null;
      onDone({ fullyDiscounted: effectiveBalanceMinor === 0 && preview !== null });
    } catch (e) {
      if (e instanceof ApiError) { setError(e.message); if (e.fields) setFieldErrors(e.fields); }
      else setError(e instanceof Error ? e.message : "Payment failed.");
    } finally { setBusy(false); }
  }

  const showPayFields = effectiveBalanceMinor > 0 || !preview;

  return (
    <Dialog onClose={busy ? () => {} : onClose} open={open}
      title={effectiveBalanceMinor === 0 && preview ? "Apply benefits" : "Record payment"}>
      <form className="dialog-form" onSubmit={e => void submit(e)}>
        <div className="payment-due"><Receipt size={20} /><span>Remaining balance</span><strong>{money(effectiveBalanceMinor)}</strong></div>
        {error ? <div className="form-alert">{error}</div> : null}

        {/* Benefits section */}
        {benefitsLocked ? (
          <div>
            <p className="eyebrow">Benefits and rewards</p>
            {record.appliedBenefits?.coupon ? <div className="benefit-line"><span>Coupon ({record.appliedBenefits.coupon.code})</span><strong>−{money(record.appliedBenefits.coupon.discountMinor)}</strong></div> : null}
            {record.appliedBenefits?.referral ? <div className="benefit-line"><span>Referral ({record.appliedBenefits.referral.code})</span><strong>−{money(record.appliedBenefits.referral.discountMinor)}</strong></div> : null}
            {record.appliedBenefits?.reward ? <div className="benefit-line"><span>Reward</span><strong>−{money(record.appliedBenefits.reward.amountMinor)}</strong></div> : null}
            {record.appliedBenefits?.manualDiscount ? <div className="benefit-line"><span>Manual discount{record.appliedBenefits.manualDiscount.reason ? ` (${record.appliedBenefits.manualDiscount.reason})` : ""}</span><strong>−{money(record.appliedBenefits.manualDiscount.amountMinor)}</strong></div> : null}
            {(record.coupon_discount_minor > 0 || record.referral_discount_minor > 0 || record.reward_discount_minor > 0 || record.manual_discount_minor > 0) ? null : <p className="muted">No benefits applied.</p>}
            <div className="info-panel"><Info size={16} /><p>Benefits and discounts cannot be changed after a payment has been recorded. This protects the existing payment history and prevents the paid amount from exceeding the revised bill total.</p></div>
          </div>
        ) : (
          <div>
            <p className="eyebrow">Benefits and rewards</p>
              <div className="form-grid">
              <label><span>Coupon code</span><input autoCapitalize="characters" onChange={e => { setCouponCode(e.target.value.toUpperCase()); clearField("benefits.couponCode"); setPreviewDirty(true); setVerifiedBalanceMinor(null); setAmountEdited(false); }} placeholder="Optional" value={couponCode} />{fieldErrors["benefits.couponCode"] ? <span className="field-error">{fieldErrors["benefits.couponCode"]}</span> : null}</label>
              <label><span>Referral code</span><input autoCapitalize="characters" onChange={e => { setReferralCode(e.target.value.toUpperCase()); clearField("benefits.referralCode"); setPreviewDirty(true); setVerifiedBalanceMinor(null); setAmountEdited(false); }} placeholder="Optional" value={referralCode} />{fieldErrors["benefits.referralCode"] ? <span className="field-error">{fieldErrors["benefits.referralCode"]}</span> : null}</label>
              <label><span>Available reward</span>
                {rewardsLoading ? <span className="muted">Loading...</span> : (
                  <select onChange={e => { const r = rewards.find(rw => rw.id === e.target.value); setRewardId(e.target.value); setRewardAmount(r ? (r.remaining_amount_minor / 100).toString() : ""); clearField("benefits.rewardId"); setPreviewDirty(true); setVerifiedBalanceMinor(null); setAmountEdited(false); }} value={rewardId}>
                    <option value="">Do not redeem a reward</option>
                    {rewards.map(r => <option key={r.id} value={r.id}>{money(r.remaining_amount_minor)}{r.expires_at ? ` · expires ${new Date(r.expires_at).toLocaleDateString()}` : ""}</option>)}
                  </select>
                )}
                {fieldErrors["benefits.rewardId"] ? <span className="field-error">{fieldErrors["benefits.rewardId"]}</span> : null}
              </label>
              <label><span>Reward amount</span><input disabled={rewardId === ""} max={(() => { const r = rewards.find(rw => rw.id === rewardId); return r ? (r.remaining_amount_minor / 100).toString() : "0"; })()} min="0" onChange={e => { setRewardAmount(e.target.value); clearField("benefits.rewardAmountMinor"); setPreviewDirty(true); setVerifiedBalanceMinor(null); setAmountEdited(false); }} step="0.01" type="number" value={rewardAmount} />{fieldErrors["benefits.rewardAmountMinor"] ? <span className="field-error">{fieldErrors["benefits.rewardAmountMinor"]}</span> : null}</label>
            </div>
            {canApplyManualDiscount ? (
              <div className="form-grid benefit-admin-fields">
                <label><span>Manual discount</span><input min="0" onChange={e => { setManualDiscount(e.target.value); clearField("benefits.manualDiscountMinor"); setPreviewDirty(true); setVerifiedBalanceMinor(null); setAmountEdited(false); }} step="0.01" type="number" value={manualDiscount} />{fieldErrors["benefits.manualDiscountMinor"] ? <span className="field-error">{fieldErrors["benefits.manualDiscountMinor"]}</span> : null}</label>
                <label><span>Manual discount reason</span><input disabled={parseFloat(manualDiscount || "0") === 0} minLength={5} onChange={e => { setManualDiscountReason(e.target.value); clearField("benefits.manualDiscountReason"); setPreviewDirty(true); setVerifiedBalanceMinor(null); setAmountEdited(false); }} required={parseFloat(manualDiscount || "0") > 0} value={manualDiscountReason} />{fieldErrors["benefits.manualDiscountReason"] ? <span className="field-error">{fieldErrors["benefits.manualDiscountReason"]}</span> : null}</label>
              </div>
            ) : null}
            <div style={{ marginTop: "0.75rem" }}>
              <Button busy={previewBusy} onClick={() => void doVerify()} tone="secondary" type="button">Verify benefits</Button>
              {previewError ? <span className="field-error" style={{ marginLeft: "0.75rem" }}>{previewError}</span> : null}
              {previewDirty && preview ? <span className="muted" style={{ marginLeft: "0.5rem" }}>Changed — verify again</span> : null}
            </div>
            {/* Revised billing preview */}
            {preview ? (
              <div className="bill-preview" style={{ marginTop: "0.75rem" }}>
                <p className="eyebrow">Revised billing preview</p>
                {preview.revised?.couponDiscountMinor > 0 ? <span>Coupon discount <strong>−{money(preview.revised.couponDiscountMinor)}</strong></span> : null}
                {preview.revised?.referralDiscountMinor > 0 ? <span>Referral discount <strong>−{money(preview.revised.referralDiscountMinor)}</strong></span> : null}
                {preview.revised?.rewardDiscountMinor > 0 ? <span>Reward <strong>−{money(preview.revised.rewardDiscountMinor)}</strong></span> : null}
                {preview.revised?.manualDiscountMinor > 0 ? <span>Manual discount <strong>−{money(preview.revised.manualDiscountMinor)}</strong></span> : null}
                {preview.revised?.totalAmountMinor === 0 ? <div style={{ marginTop: "0.5rem" }}><p>These benefits fully cover the remaining bill. No payment transaction will be created.</p></div> : null}
              </div>
            ) : null}
          </div>
        )}

        {/* Payment section */}
        {showPayFields ? (<>
          <label><span>Amount</span><input defaultValue={effectiveBalanceMinor > 0 && !amountEdited ? (effectiveBalanceMinor / 100).toString() : undefined} key={`a-${effectiveBalanceMinor}`} max={(effectiveBalanceMinor / 100).toFixed(2)} min="0.01" name="amount" onChange={() => setAmountEdited(true)} required step="0.01" type="number" />{fieldErrors["amountMinor"] ? <span className="field-error">{fieldErrors["amountMinor"]}</span> : null}</label>
          <label><span>Method</span><select name="method" required><option value="CASH">Cash</option><option value="UPI">UPI</option><option value="CARD">Card</option><option value="BANK_TRANSFER">Bank transfer</option><option value="OTHER">Other</option></select></label>
          <label><span>Transaction reference (optional)</span><input name="reference" /></label>
          <label><span>Notes</span><textarea name="notes" /></label>
        </>) : null}

        <div className="dialog-actions">
          <Button disabled={busy} onClick={onClose} tone="secondary" type="button">Cancel</Button>
          <Button busy={busy} type="submit">{effectiveBalanceMinor === 0 && preview ? "Apply benefits" : "Record payment"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
