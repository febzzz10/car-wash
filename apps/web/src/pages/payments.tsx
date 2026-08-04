import { Banknote, RotateCcw, SearchX } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

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
import { dateTime, money } from "../lib/format";
import { paymentMethodLabel } from "../lib/payment-methods";

interface PaymentRecord {
  readonly amount_minor: number;
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
export default function PaymentsPage() {
  const state = useApiData<readonly PaymentRecord[]>("/payments");
  const settingsState = useApiData<{
    readonly settings: readonly SettingRow[];
  }>("/settings");
  const { user } = useAuth();
  const refundsEnabled =
    settingsState.data?.settings.find(
      (s) => s.setting_key === "payment.allow_refunds",
    )?.value_text === "true";
  const [refund, setRefund] = useState<PaymentRecord | null>(null);
  return (
    <>
      <PageHeader eyebrow="Finance" title="Payments" />
      <Card>
        {state.loading ? (
          <SkeletonRows />
        ) : state.error !== null ? (
          <ErrorState message={state.error} onRetry={state.reload} />
        ) : (state.data?.length ?? 0) === 0 ? (
          <EmptyState
            icon={SearchX}
            message="Successful partial and full payments will appear here."
            title="No payments recorded"
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Customer & vehicle</th>
                  <th>Method</th>
                  <th>Paid at</th>
                  <th>Status</th>
              <th className="align-right">Amount</th>
              <th className="align-right">Tip</th>
              {user?.role === "ADMIN" && refundsEnabled ? <th>Action</th> : null}
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
