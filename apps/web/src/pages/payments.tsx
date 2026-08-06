import { Banknote, RotateCcw, SearchX } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useAuth } from "../auth";
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
import { date, dateTime, money } from "../lib/format";
import { paymentMethodLabel } from "../lib/payment-methods";

const dateOnlyPattern = /^(\d{4})-(\d{2})-(\d{2})$/u;

interface PaymentRecord {
  readonly amount_minor: number;
  readonly assigned_user_name_snapshot?: string | null;
  readonly created_at: string;
  readonly customer_name_snapshot: string;
  readonly external_transaction_reference?: string | null;
  readonly id: string;
  readonly job_reference: string;
  readonly paid_at: string;
  readonly payment_method: string;
  readonly payment_status: string;
  readonly status: string;
  readonly tip_minor: number;
  readonly vehicle_registration_snapshot: string;
  readonly wash_job_id: string;
}
interface SettingRow {
  readonly setting_key: string;
  readonly value_text: string;
}
interface AssignedStaffOption {
  readonly active: boolean;
  readonly id: string;
  readonly name: string;
}
interface FilterOptions {
  readonly assignedStaff: readonly AssignedStaffOption[];
}
interface AppliedFilters {
  readonly assignedUserId: string | null;
  readonly from: string | null;
  readonly invalid: boolean;
  readonly to: string | null;
}
const unfiltered: AppliedFilters = {
  assignedUserId: null,
  from: null,
  invalid: false,
  to: null,
};

function isValidDateOnly(value: string): boolean {
  const match = dateOnlyPattern.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

function isValidAssignedId(value: string): boolean {
  return value.length >= 8 && value.length <= 64 && value !== "UNASSIGNED";
}

function buildPaymentsQuery(applied: AppliedFilters): string {
  if (applied.invalid) return "/payments";
  if (
    applied.from === null &&
    applied.to === null &&
    applied.assignedUserId === null
  ) {
    return "/payments";
  }
  const params = new URLSearchParams();
  if (applied.from !== null) params.set("from", applied.from);
  if (applied.to !== null) params.set("to", applied.to);
  if (applied.assignedUserId !== null)
    params.set("assignedUserId", applied.assignedUserId);
  return `/payments?${params.toString()}`;
}

export default function PaymentsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [searchParams, setSearchParams] = useSearchParams();
  const applied = useMemo<AppliedFilters>(() => {
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const assignedUserId = searchParams.get("assignedUserId");
    if (from === null && to === null && assignedUserId === null)
      return unfiltered;
    const fromValid = from === null || isValidDateOnly(from);
    const toValid = to === null || isValidDateOnly(to);
    const assignedValid =
      assignedUserId === null || isValidAssignedId(assignedUserId);
    const dateOrderValid = !(from !== null && to !== null && from > to);
    if (!fromValid || !toValid || !assignedValid || !dateOrderValid)
      return { ...unfiltered, invalid: true };
    return { assignedUserId, from, invalid: false, to };
  }, [searchParams]);
  const listPath = isAdmin ? buildPaymentsQuery(applied) : "/payments";
  const state = useApiData<readonly PaymentRecord[]>(listPath);
  const optionsState = useApiData<FilterOptions>(
    "/payments/filter-options",
    isAdmin,
  );
  const [fromDraft, setFromDraft] = useState(searchParams.get("from") ?? "");
  const [toDraft, setToDraft] = useState(searchParams.get("to") ?? "");
  const [assignedIdDraft, setAssignedIdDraft] = useState(
    searchParams.get("assignedUserId") ?? "",
  );
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const appliedPathRef = useRef("/payments");

  const settingsState = useApiData<{
    readonly settings: readonly SettingRow[];
  }>("/settings");
  const refundsEnabled =
    settingsState.data?.settings.find(
      (s) => s.setting_key === "payment.allow_refunds",
    )?.value_text === "true";
  const [refund, setRefund] = useState<PaymentRecord | null>(null);

  useEffect(() => {
    appliedPathRef.current = applied.invalid
      ? "/payments"
      : buildPaymentsQuery(applied);
  }, [applied]);

  useEffect(() => {
    if (!isAdmin) {
      const hasFilterParams =
        searchParams.get("from") !== null ||
        searchParams.get("to") !== null ||
        searchParams.get("assignedUserId") !== null;
      if (hasFilterParams) {
        setSearchParams({}, { replace: true });
      }
      return;
    }
    if (!applied.invalid) return;
    setApplyError("Enter a valid payment filter.");
    setSearchParams({}, { replace: true });
  }, [applied.invalid, isAdmin, searchParams, setSearchParams]);

  useEffect(() => {
    if (!applying) return;
    if (!state.loading && listPath === appliedPathRef.current) {
      setApplying(false);
    }
  }, [applying, listPath, state.loading]);

  const assignedOptions = optionsState.data?.assignedStaff ?? [];
  const assignedLabel = assignedOptions.find(
    (option) => option.id === applied.assignedUserId,
  )?.name;

  function applyFilters() {
    if (!isAdmin || applying) return;
    const from = fromDraft.trim();
    const to = toDraft.trim();
    const assignedUserId = assignedIdDraft.trim();
    const fromValid = from === "" || isValidDateOnly(from);
    const toValid = to === "" || isValidDateOnly(to);
    if (!fromValid || !toValid) {
      setApplyError("Enter a valid payment filter.");
      return;
    }
    if (from !== "" && to !== "" && from > to) {
      setApplyError("From date cannot be later than To date.");
      return;
    }
    if (assignedUserId !== "" && !isValidAssignedId(assignedUserId)) {
      setApplyError("Enter a valid payment filter.");
      return;
    }
    const next = new URLSearchParams();
    if (from !== "") next.set("from", from);
    if (to !== "") next.set("to", to);
    if (assignedUserId !== "") next.set("assignedUserId", assignedUserId);
    const targetPath =
      next.size === 0
        ? "/payments"
        : `/payments?${next.toString()}`;
    setApplyError(null);
    appliedPathRef.current = targetPath;
    setApplying(true);
    setSearchParams(next.size === 0 ? {} : next, { replace: true });
  }

  function clearFilters() {
    if (!isAdmin) return;
    setFromDraft("");
    setToDraft("");
    setAssignedIdDraft("");
    setApplyError(null);
    appliedPathRef.current = "/payments";
    setSearchParams({}, { replace: true });
  }

  const nothingDrafted =
    fromDraft.trim() === "" &&
    toDraft.trim() === "" &&
    assignedIdDraft.trim() === "";
  const nothingApplied =
    applied.from === null &&
    applied.to === null &&
    applied.assignedUserId === null &&
    !applied.invalid;
  const clearDisabled =
    nothingDrafted && nothingApplied && applyError === null;

  const appliedFrom =
    applied.from !== null && isValidDateOnly(applied.from) ? applied.from : null;
  const appliedTo =
    applied.to !== null && isValidDateOnly(applied.to) ? applied.to : null;
  const appliedAssigned =
    applied.assignedUserId !== null && applied.assignedUserId !== ""
      ? applied.assignedUserId
      : null;
  const summaryParts: string[] = [];
  if (appliedFrom !== null) summaryParts.push(`from ${date(appliedFrom)}`);
  if (appliedTo !== null) summaryParts.push(`to ${date(appliedTo)}`);
  if (appliedAssigned !== null && assignedLabel !== undefined) {
    summaryParts.push(`assigned to ${assignedLabel}`);
  }
  const summary =
    summaryParts.length === 0
      ? null
      : `Showing payments ${summaryParts.join(" · ")}`;

  return (
    <>
      <PageHeader eyebrow="Finance" title="Payments" />
      <Card>
        {isAdmin ? (
          <div className="payments-filters" role="group" aria-label="Payment filters">
            <div className="payments-filters__field">
              <label htmlFor="paymentFrom">
                <span>From</span>
                <input
                  aria-describedby={
                    applyError === null ? undefined : "payments-filter-error"
                  }
                  id="paymentFrom"
                  onChange={(event) => {
                    setFromDraft(event.target.value);
                    setApplyError(null);
                  }}
                  name="from"
                  type="date"
                  value={fromDraft}
                />
              </label>
            </div>
            <div className="payments-filters__field">
              <label htmlFor="paymentTo">
                <span>To</span>
                <input
                  aria-describedby={
                    applyError === null ? undefined : "payments-filter-error"
                  }
                  id="paymentTo"
                  onChange={(event) => {
                    setToDraft(event.target.value);
                    setApplyError(null);
                  }}
                  name="to"
                  type="date"
                  value={toDraft}
                />
              </label>
            </div>
            <div className="payments-filters__field">
              <label htmlFor="paymentAssignedUserId">
                <span>Assigned staff</span>
                <select
                  id="paymentAssignedUserId"
                  name="assignedUserId"
                  onChange={(event) => {
                    setAssignedIdDraft(event.target.value);
                    setApplyError(null);
                  }}
                  value={assignedIdDraft}
                >
                  <option value="">All staff</option>
                  {assignedOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="payments-filters__actions">
              <Button
                busy={applying}
                disabled={state.loading}
                onClick={applyFilters}
                type="button"
              >
                Apply filters
              </Button>
              <Button
                disabled={clearDisabled}
                onClick={clearFilters}
                tone="secondary"
                type="button"
              >
                Clear filters
              </Button>
            </div>
          </div>
        ) : null}
        {applyError === null ? null : (
          <p className="form-alert" id="payments-filter-error" role="alert">
            {applyError}
          </p>
        )}
        {summary === null ? null : (
          <p className="payments-filter-summary">{summary}</p>
        )}
        {state.loading ? (
          <SkeletonRows />
        ) : state.error !== null ? (
          <ErrorState message={state.error} onRetry={state.reload} />
        ) : (state.data?.length ?? 0) === 0 ? (
          applied.invalid ||
          applied.from !== null ||
          applied.to !== null ||
          applied.assignedUserId !== null ? (
            <EmptyState
              action={
                <Button onClick={clearFilters} tone="secondary" type="button">
                  Clear filters
                </Button>
              }
              icon={SearchX}
              message="Try changing the date range or assigned staff selection."
              title="No payments match these filters"
            />
          ) : (
            <EmptyState
              icon={SearchX}
              message="Successful partial and full payments will appear here."
              title="No payments recorded"
            />
          )
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Customer & vehicle</th>
                  <th>Assigned staff</th>
                  <th>Method</th>
                  <th>Paid at</th>
                  <th>Status</th>
                  <th className="align-right">Amount</th>
                  <th className="align-right">Tip</th>
                  {user?.role === "ADMIN" && refundsEnabled ? (
                    <th>Action</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {state.data?.map((payment) => (
                  <tr key={payment.id}>
                    <td>
                      <Link
                        className="identifier"
                        to={`/wash-jobs/${payment.wash_job_id}`}
                      >
                        {payment.job_reference}
                      </Link>
                    </td>
                    <td>
                      <strong>{payment.vehicle_registration_snapshot}</strong>
                      <small>{payment.customer_name_snapshot}</small>
                    </td>
                    <td>
                      {payment.assigned_user_name_snapshot !== null &&
                      payment.assigned_user_name_snapshot !== undefined &&
                      payment.assigned_user_name_snapshot.trim() !== "" ? (
                        <span className="payment-assignee">
                          {payment.assigned_user_name_snapshot}
                        </span>
                      ) : (
                        <span className="muted">Unassigned</span>
                      )}
                    </td>
                    <td>
                      {paymentMethodLabel(payment.payment_method)}
                      <small>
                        {payment.external_transaction_reference ? (
                          <code className="identifier--muted">
                            {payment.external_transaction_reference}
                          </code>
                        ) : null}
                      </small>
                    </td>
                    <td>{dateTime(payment.paid_at)}</td>
                    <td>
                      <StatusBadge value={payment.status} />
                    </td>
                    <td className="align-right">
                      <strong>{money(payment.amount_minor)}</strong>
                    </td>
                    <td className="align-right">
                      {payment.tip_minor > 0 ? money(payment.tip_minor) : null}
                    </td>
                    {user?.role === "ADMIN" && refundsEnabled ? (
                      <td>
                        <Button onClick={() => setRefund(payment)} tone="quiet">
                          <RotateCcw size={16} /> Refund
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <RefundDialog
        onClose={() => setRefund(null)}
        onDone={() => {
          setRefund(null);
          state.reload();
        }}
        payment={refund}
      />
    </>
  );
}
function RefundDialog({
  onClose,
  onDone,
  payment,
}: {
  readonly onClose: () => void;
  readonly onDone: () => void;
  readonly payment: PaymentRecord | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (payment === null) return;
    const values = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api(`/payments/${payment.id}/refund`, {
        ...jsonBody({
          amountMinor: Math.round(Number(values.get("amount")) * 100),
          idempotencyKey: crypto.randomUUID(),
          reason: values.get("reason"),
        }),
        method: "POST",
      });
      toast.success("Refund recorded without changing the original payment.");
      onDone();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Refund failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog onClose={onClose} open={payment !== null} title="Record refund">
      <form className="dialog-form" onSubmit={(event) => void submit(event)}>
        <div className="payment-due">
          <Banknote />
          <span>Original payment</span>
          <strong>{money(payment?.amount_minor ?? 0)}</strong>
        </div>
        {error === null ? null : <div className="form-alert">{error}</div>}
        <label>
          <span>Refund amount</span>
          <input
            max={((payment?.amount_minor ?? 0) / 100).toFixed(2)}
            min="0.01"
            name="amount"
            required
            step="0.01"
            type="number"
          />
        </label>
        <label>
          <span>Reason</span>
          <textarea minLength={5} name="reason" required />
        </label>
        <div className="dialog-actions">
          <Button onClick={onClose} tone="secondary" type="button">
            Cancel
          </Button>
          <Button busy={busy} tone="danger" type="submit">
            Confirm refund
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
