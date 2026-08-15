import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  RotateCcw,
  SearchX,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
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
import type { PaymentListPayload, PaymentRecord } from "../types";

const dateOnlyPattern = /^(\d{4})-(\d{2})-(\d{2})$/u;
const PAGE_SIZES = [15, 25, 50] as const;
const DEFAULT_PAGE_SIZE = 15;

function paymentsPath(base: string, limit: number, cursor: string): string {
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}limit=${limit}${cursor === "" ? "" : `&cursor=${encodeURIComponent(cursor)}`}`;
}
interface SettingRow {
  readonly setting_key: string;
  readonly value_text: string;
}
interface StaffOption {
  readonly active: boolean;
  readonly id: string;
  readonly name: string;
}
interface FilterOptions {
  readonly staff: readonly StaffOption[];
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
  const basePath = isAdmin ? buildPaymentsQuery(applied) : "/payments";
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);
  const [cursorHistory, setCursorHistory] = useState<readonly string[]>([""]);
  const [payments, setPayments] = useState<readonly PaymentRecord[] | null>(
    null,
  );
  const [hasNext, setHasNext] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [paging, setPaging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
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

  function resetPagination(nextLimit?: number) {
    setPage(1);
    setCursorHistory([""]);
    setHasNext(false);
    setNextCursor(null);
    if (nextLimit !== undefined) setLimit(nextLimit);
  }

  useEffect(() => {
    let active = true;
    const cursor = cursorHistory[page - 1] ?? "";
    if (cursor === "") {
      setLoading(true);
      setError(null);
    } else {
      setPaging(true);
    }
    void api<PaymentListPayload>(paymentsPath(basePath, limit, cursor))
      .then((body) => {
        if (!active) return;
        setPayments(body.payments);
        setHasNext(body.pagination.hasNext);
        setNextCursor(body.pagination.nextCursor);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(
          reason instanceof Error
            ? reason.message
            : "The payment list could not be loaded.",
        );
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
        setPaging(false);
        setApplying(false);
      });
    return () => {
      active = false;
    };
  }, [basePath, cursorHistory, limit, page, revision]);

  const goNext = useCallback(() => {
    if (nextCursor === null || paging) return;
    setCursorHistory((prev) => [...prev, nextCursor]);
    setPage((prev) => prev + 1);
  }, [nextCursor, paging]);

  const goPrevious = useCallback(() => {
    if (page <= 1 || paging) return;
    setPage((prev) => prev - 1);
  }, [page, paging]);

  const settingsState = useApiData<{
    readonly settings: readonly SettingRow[];
  }>("/settings");
  const refundsEnabled =
    settingsState.data?.settings.find(
      (s) => s.setting_key === "payment.allow_refunds",
    )?.value_text === "true";
  const [refund, setRefund] = useState<PaymentRecord | null>(null);

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

  const staffOptions = optionsState.data?.staff ?? [];
  const collectorLabel = staffOptions.find(
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
    setApplyError(null);
    resetPagination();
    setRevision((value) => value + 1);
    setApplying(true);
    setSearchParams(next.size === 0 ? {} : next, { replace: true });
  }

  function clearFilters() {
    if (!isAdmin) return;
    setFromDraft("");
    setToDraft("");
    setAssignedIdDraft("");
    setApplyError(null);
    resetPagination();
    setRevision((value) => value + 1);
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
  const clearDisabled = nothingDrafted && nothingApplied && applyError === null;

  const appliedFrom =
    applied.from !== null && isValidDateOnly(applied.from)
      ? applied.from
      : null;
  const appliedTo =
    applied.to !== null && isValidDateOnly(applied.to) ? applied.to : null;
  const appliedAssigned =
    applied.assignedUserId !== null && applied.assignedUserId !== ""
      ? applied.assignedUserId
      : null;
  const summaryParts: string[] = [];
  if (appliedFrom !== null) summaryParts.push(`from ${date(appliedFrom)}`);
  if (appliedTo !== null) summaryParts.push(`to ${date(appliedTo)}`);
  if (appliedAssigned !== null && collectorLabel !== undefined) {
    summaryParts.push(`collected by ${collectorLabel}`);
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
          <div
            className="payments-filters"
            role="group"
            aria-label="Payment filters"
          >
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
                <span>Collected by</span>
                <select
                  id="paymentAssignedUserId"
                  name="assignedUserId"
                  onChange={(event) => {
                    setAssignedIdDraft(event.target.value);
                    setApplyError(null);
                  }}
                  value={assignedIdDraft}
                >
                  <option value="">All employees</option>
                  {staffOptions.map((option) => (
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
                disabled={loading || paging || applying}
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
        {loading ? (
          <SkeletonRows />
        ) : error !== null ? (
          <ErrorState message={error} onRetry={reload} />
        ) : (payments?.length ?? 0) === 0 ? (
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
          <>
            <div aria-busy={paging} className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Customer & vehicle</th>
                    <th>Collected by</th>
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
                  {payments?.map((payment) => (
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
                        {payment.collected_by_name_snapshot !== null &&
                        payment.collected_by_name_snapshot !== undefined &&
                        payment.collected_by_name_snapshot.trim() !== "" ? (
                          <span className="payment-assignee">
                            {payment.collected_by_name_snapshot}
                          </span>
                        ) : (
                          <span className="muted">Not recorded</span>
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
                        {payment.tip_minor > 0
                          ? money(payment.tip_minor)
                          : null}
                      </td>
                      {user?.role === "ADMIN" && refundsEnabled ? (
                        <td>
                          <Button
                            onClick={() => setRefund(payment)}
                            tone="quiet"
                          >
                            <RotateCcw size={16} /> Refund
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination-footer">
              <p className="pagination-summary">
                Showing {payments?.length ?? 0} payments
              </p>
              <label className="pagination-page-size">
                <span>Rows per page</span>
                <select
                  aria-label="Rows per page"
                  onChange={(event) =>
                    resetPagination(Number(event.target.value))
                  }
                  value={limit}
                >
                  {PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              <nav aria-label="Payment pages" className="pagination-controls">
                <Button
                  disabled={page === 1 || paging}
                  onClick={goPrevious}
                  tone="secondary"
                  type="button"
                >
                  <ArrowLeft size={15} /> Previous
                </Button>
                <span aria-live="polite" className="pagination-page">
                  Page {page}
                </span>
                <Button
                  disabled={!hasNext || paging}
                  onClick={goNext}
                  tone="secondary"
                  type="button"
                >
                  Next <ArrowRight size={15} />
                </Button>
              </nav>
            </div>
          </>
        )}
      </Card>
      <RefundDialog
        onClose={() => setRefund(null)}
        onDone={() => {
          setRefund(null);
          reload();
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
