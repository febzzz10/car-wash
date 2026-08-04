import { Gift, Power, Sparkles } from "lucide-react";
import { useState, type FormEvent } from "react";
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
interface ReferralCode {
  readonly code: string;
  readonly customer_name: string;
  readonly customer_phone: string;
  readonly expires_at?: string | null;
  readonly id: string;
  readonly status: string;
  readonly successful_referrals_cached: number;
}
interface Redemption {
  readonly created_at: string;
  readonly friend_discount_minor: number;
  readonly id: string;
  readonly job_reference: string;
  readonly referred_name: string;
  readonly referrer_name: string;
  readonly reward_amount_minor?: number | null;
  readonly status: string;
}
interface Reward {
  readonly customer_name: string;
  readonly earned_at?: string | null;
  readonly expires_at?: string | null;
  readonly id: string;
  readonly original_amount_minor: number;
  readonly remaining_amount_minor: number;
  readonly status: string;
}
interface Payload {
  readonly codes: readonly ReferralCode[];
  readonly ledger: readonly Record<string, unknown>[];
  readonly redemptions: readonly Redemption[];
  readonly rewards: readonly Reward[];
}
export default function ReferralsPage() {
  const state = useApiData<Payload>("/referrals");
  const [tab, setTab] = useState<"codes" | "redemptions" | "rewards">("codes");
  const toast = useToast();
  const [adjustTarget, setAdjustTarget] = useState<Reward | null>(null);
  async function toggle(code: ReferralCode) {
    try {
      await api(`/referrals/codes/${code.id}`, {
        ...jsonBody({
          status: code.status === "ACTIVE" ? "DISABLED" : "ACTIVE",
        }),
        method: "PATCH",
      });
      toast.success("Referral code status updated.");
      state.reload();
    } catch (failure) {
      toast.error(
        failure instanceof Error ? failure.message : "Referral update failed.",
      );
    }
  }
  return (
    <>
      <PageHeader eyebrow="Growth" title="Referrals & rewards" />
      <div className="filter-tabs standalone-tabs">
        <button
          className={tab === "codes" ? "active" : ""}
          onClick={() => setTab("codes")}
          type="button"
        >
          Referral codes
        </button>
        <button
          className={tab === "redemptions" ? "active" : ""}
          onClick={() => setTab("redemptions")}
          type="button"
        >
          Referral history
        </button>
        <button
          className={tab === "rewards" ? "active" : ""}
          onClick={() => setTab("rewards")}
          type="button"
        >
          Rewards
        </button>
      </div>
      <Card>
        {state.loading ? (
          <SkeletonRows />
        ) : state.error !== null ? (
          <ErrorState message={state.error} onRetry={state.reload} />
        ) : tab === "codes" ? (
          (state.data?.codes.length ?? 0) === 0 ? (
            <EmptyState
              icon={Sparkles}
              message="Each new customer receives a unique normalized referral code."
              title="No referral codes"
            />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Customer</th>
                    <th>Successful referrals</th>
                    <th>Expiry</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {state.data?.codes.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong className="identifier">{item.code}</strong>
                      </td>
                      <td>
                        {item.customer_name}
                        <small>{item.customer_phone}</small>
                      </td>
                      <td>{item.successful_referrals_cached}</td>
                      <td>{dateTime(item.expires_at)}</td>
                      <td>
                        <StatusBadge value={item.status} />
                      </td>
                      <td>
                        <Button onClick={() => void toggle(item)} tone="quiet">
                          <Power size={17} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : tab === "redemptions" ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Referrer</th>
                  <th>Friend</th>
                  <th>Friend discount</th>
                  <th>Reward</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {state.data?.redemptions.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <code className="identifier--muted">
                        {item.job_reference}
                      </code>
                    </td>
                    <td>{item.referrer_name}</td>
                    <td>{item.referred_name}</td>
                    <td>{money(item.friend_discount_minor)}</td>
                    <td>{money(item.reward_amount_minor ?? 0)}</td>
                    <td>
                      <StatusBadge value={item.status} />
                    </td>
                    <td>{dateTime(item.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Original</th>
                  <th>Remaining</th>
                  <th>Earned</th>
                  <th>Expires</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {state.data?.rewards.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.customer_name}</strong>
                    </td>
                    <td>{money(item.original_amount_minor)}</td>
                    <td>{money(item.remaining_amount_minor)}</td>
                    <td>{dateTime(item.earned_at)}</td>
                    <td>{dateTime(item.expires_at)}</td>
                    <td>
                      <StatusBadge value={item.status} />
                    </td>
                    <td>
                      {["PENDING", "AVAILABLE"].includes(item.status) ? (
                        <Button
                          onClick={() => setAdjustTarget(item)}
                          tone="secondary"
                        >
                          <Gift size={16} /> Adjust
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <RewardAdjustmentDialog
        reward={adjustTarget}
        onClose={() => setAdjustTarget(null)}
        onDone={() => {
          setAdjustTarget(null);
          state.reload();
        }}
        open={adjustTarget !== null}
      />
    </>
  );
}

export function RewardAdjustmentDialog({
  reward,
  onClose,
  onDone,
  open,
}: {
  readonly reward: Reward | null;
  readonly onClose: () => void;
  readonly onDone: () => void;
  readonly open: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const toast = useToast();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldError(null);
    const data = new FormData(event.currentTarget);
    const amountRaw = String(data.get("amount") ?? "").trim();
    const reason = String(data.get("reason") ?? "").trim();
    const amount = Number(amountRaw);
    if (!amountRaw || !Number.isFinite(amount) || amount <= 0) return;
    const parts = amountRaw.split(".");
    if (parts.length === 2 && parts[1]!.length > 2) {
      setFieldError("Adjustment amount can have at most two decimal places.");
      return;
    }
    const amountMinor = Math.round(amount * 100);
    if (amountMinor < 1) return;
    if (reason.length < 5 || reason.length > 500) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/referrals/rewards/${reward!.id}/adjust`, {
        ...jsonBody({
          amountMinor,
          reason,
        }),
        method: "POST",
      });
      toast.success("Reward adjustment added to the append-only ledger.");
      onDone();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Adjustment failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog onClose={onClose} open={open} title="Adjust referral reward">
      <form className="dialog-form" onSubmit={(event) => void submit(event)}>
        <p>
          Change the referral reward balance by entering an adjustment amount
          and a reason for the audit record.
        </p>
        {error === null ? null : <div className="form-alert">{error}</div>}
        <label>
          <span>Adjustment amount</span>
          <input
            autoFocus
            min="0.01"
            name="amount"
            required
            step="0.01"
            type="number"
          />
          {fieldError === null ? null : (
            <span className="field-error">{fieldError}</span>
          )}
        </label>
        <label>
          <span>Reason</span>
          <textarea minLength={5} name="reason" required />
        </label>
        <div className="dialog-actions">
          <Button busy={busy} tone="primary">
            Apply Adjustment
          </Button>
          <Button onClick={onClose} tone="secondary" type="button">
            Cancel
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
