import { Edit3, Plus, Power, TicketPercent } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

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
import type { ServiceRecord, VehicleTypeRecord } from "../types";

interface Coupon {
  readonly code: string;
  readonly description?: string | null;
  readonly discount_type: "FIXED" | "PERCENTAGE";
  readonly discount_value: number;
  readonly eligible_service_count: number;
  readonly eligible_vehicle_type_count: number;
  readonly expires_at: string;
  readonly id: string;
  readonly is_active: number;
  readonly maximum_discount_minor?: number | null;
  readonly minimum_bill_minor: number;
  readonly new_customers_only: number;
  readonly redeemed_count: number;
  readonly start_at: string;
  readonly total_usage_count_cached: number;
  readonly total_usage_limit?: number | null;
  readonly usage_limit_per_customer?: number | null;
  readonly version: number;
}
interface CouponDetail extends Coupon {
  readonly eligibleServices: readonly { readonly service_id: string }[];
  readonly eligibleVehicleTypes: readonly {
    readonly vehicle_type_id: string;
  }[];
  readonly redemptions: readonly {
    readonly customer_name: string;
    readonly discount_minor: number;
    readonly job_reference: string;
    readonly reserved_at: string;
    readonly status: string;
  }[];
}
interface Catalog {
  readonly services: readonly ServiceRecord[];
  readonly vehicleTypes: readonly VehicleTypeRecord[];
}
export default function CouponsPage() {
  const state = useApiData<readonly Coupon[]>("/coupons");
  const catalog = useApiData<Catalog>("/services");
  const [editing, setEditing] = useState<Coupon | null | undefined>(undefined);
  const toast = useToast();
  async function toggle(coupon: Coupon) {
    try {
      await api(
        `/coupons/${coupon.id}/${coupon.is_active === 1 ? "disable" : "enable"}`,
        { method: "POST" },
      );
      toast.success(
        `Coupon ${coupon.is_active === 1 ? "disabled" : "enabled"}.`,
      );
      state.reload();
    } catch (failure) {
      toast.error(
        failure instanceof Error ? failure.message : "Coupon update failed.",
      );
    }
  }
  return (
    <>
      <PageHeader
        actions={
          <Button onClick={() => setEditing(null)}>
            <Plus size={17} /> Add coupon
          </Button>
        }
        eyebrow="Promotions"
        title="Coupons"
      />
      <Card>
        {state.loading ? (
          <SkeletonRows />
        ) : state.error !== null ? (
          <ErrorState message={state.error} onRetry={state.reload} />
        ) : (state.data?.length ?? 0) === 0 ? (
          <EmptyState
            action={
              <Button onClick={() => setEditing(null)}>Create coupon</Button>
            }
            icon={TicketPercent}
            message="Configure dates, limits, minimum bills, maximum discounts, and eligibility."
            title="No coupons yet"
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Discount</th>
                  <th>Eligibility</th>
                  <th>Usage</th>
                  <th>Expires</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {state.data?.map((coupon) => (
                  <tr key={coupon.id}>
                    <td>
                      <strong>{coupon.code}</strong>
                      <small>{coupon.description ?? ""}</small>
                    </td>
                    <td>
                      {coupon.discount_type === "FIXED"
                        ? money(coupon.discount_value)
                        : `${coupon.discount_value / 100}%`}
                      <small>Min {money(coupon.minimum_bill_minor)}</small>
                    </td>
                    <td>
                      {coupon.eligible_service_count === 0
                        ? "All services"
                        : `${coupon.eligible_service_count} services`}
                      <small>
                        {coupon.eligible_vehicle_type_count === 0
                          ? "All vehicles"
                          : `${coupon.eligible_vehicle_type_count} vehicle types`}
                      </small>
                    </td>
                    <td>
                      {coupon.total_usage_count_cached}
                      {coupon.total_usage_limit === null ||
                      coupon.total_usage_limit === undefined
                        ? ""
                        : ` / ${coupon.total_usage_limit}`}
                      <small>
                        {coupon.usage_limit_per_customer ?? "Unlimited"} per
                        customer
                      </small>
                    </td>
                    <td>{dateTime(coupon.expires_at)}</td>
                    <td>
                      <StatusBadge
                        value={coupon.is_active === 1 ? "ACTIVE" : "DISABLED"}
                      />
                    </td>
                    <td>
                      <div className="table-actions">
                        <Button
                          aria-label={`Edit ${coupon.code}`}
                          onClick={() => setEditing(coupon)}
                          tone="quiet"
                        >
                          <Edit3 size={17} />
                        </Button>
                        <Button
                          aria-label="Toggle coupon"
                          onClick={() => void toggle(coupon)}
                          tone="quiet"
                        >
                          <Power size={17} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <CouponDialog
        catalog={catalog.data}
        coupon={editing ?? null}
        key={editing?.id ?? "new"}
        onClose={() => setEditing(undefined)}
        onDone={() => {
          setEditing(undefined);
          state.reload();
        }}
        open={editing !== undefined}
      />
    </>
  );
}
function CouponDialog({
  catalog,
  coupon,
  onClose,
  onDone,
  open,
}: {
  readonly catalog: Catalog | null;
  readonly coupon: Coupon | null;
  readonly onClose: () => void;
  readonly onDone: () => void;
  readonly open: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const detail = useApiData<CouponDetail>(
    `/coupons/${coupon?.id ?? "none"}`,
    open && coupon !== null,
  );
  const vehicleTypeIdToCode = useMemo(
    () => new Map(catalog?.vehicleTypes.map((vt) => [vt.id, vt.code]) ?? []),
    [catalog],
  );
  const mappedVehicleTypes: string[] | null | undefined = useMemo(() => {
    if (detail.data === null) return undefined;
    const codes: string[] = [];
    for (const item of detail.data.eligibleVehicleTypes) {
      const code = vehicleTypeIdToCode.get(item.vehicle_type_id);
      if (code === undefined) return null;
      codes.push(code);
    }
    return codes;
  }, [detail.data, vehicleTypeIdToCode]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const type = String(form.get("type"));
    setBusy(true);
    setError(null);
    try {
      await api(coupon === null ? "/coupons" : `/coupons/${coupon.id}`, {
        ...jsonBody({
          code: form.get("code"),
          description: form.get("description") || undefined,
          discountType: type,
          discountValue:
            type === "FIXED"
              ? Math.round(Number(form.get("value")) * 100)
              : Math.round(Number(form.get("value")) * 100),
          eligibleServiceIds: form.getAll("services"),
          eligibleVehicleTypeCodes: form.getAll("vehicles"),
          expiresAt: new Date(String(form.get("expires"))).toISOString(),
          maximumDiscountMinor:
            form.get("maximum") === ""
              ? null
              : Math.round(Number(form.get("maximum")) * 100),
          minimumBillMinor: Math.round(Number(form.get("minimum")) * 100),
          newCustomersOnly: form.get("newOnly") === "on",
          startAt: new Date(String(form.get("starts"))).toISOString(),
          totalUsageLimit:
            form.get("totalLimit") === ""
              ? null
              : Number(form.get("totalLimit")),
          usageLimitPerCustomer:
            form.get("customerLimit") === ""
              ? null
              : Number(form.get("customerLimit")),
          ...(coupon === null ? {} : { version: coupon.version }),
        }),
        method: coupon === null ? "POST" : "PATCH",
      });
      onDone();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : `Coupon could not be ${coupon === null ? "created" : "updated"}.`,
      );
    } finally {
      setBusy(false);
    }
  }
  const now = new Date();
  const later = new Date(now.getTime() + 30 * 86_400_000);
  const local = (date: Date) =>
    new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16);
  if (coupon !== null) {
    if (detail.loading || mappedVehicleTypes === undefined)
      return (
        <Dialog onClose={onClose} open={open} title="Edit coupon">
          <SkeletonRows />
        </Dialog>
      );
    if (detail.error !== null)
      return (
        <Dialog onClose={onClose} open={open} title="Edit coupon">
          <div className="form-alert">Failed to load coupon details.</div>
        </Dialog>
      );
    if (mappedVehicleTypes === null)
      return (
        <Dialog onClose={onClose} open={open} title="Edit coupon">
          <div className="form-alert">
            A vehicle type in this coupon is no longer available. Contact your
            administrator.
          </div>
        </Dialog>
      );
  }
  const current = detail.data ?? coupon;
  const selectedServices = new Set(
    detail.data?.eligibleServices.map((item) => item.service_id) ?? [],
  );
  const selectedVehicleTypes = new Set(
    coupon !== null && mappedVehicleTypes !== null && mappedVehicleTypes !== undefined
      ? mappedVehicleTypes
      : [],
  );
  return (
    <Dialog
      onClose={onClose}
      open={open}
      title={coupon === null ? "Add coupon" : "Edit coupon"}
    >
      <form
        className="dialog-form wide-dialog"
        onSubmit={(event) => void submit(event)}
      >
        {error === null ? null : <div className="form-alert">{error}</div>}
        <div className="form-grid">
          <label>
            <span>Coupon code</span>
            <input
              autoCapitalize="characters"
              autoComplete="off"
              defaultValue={current?.code}
              name="code"
              required
              spellCheck={false}
            />
          </label>
          <label>
            <span>Discount type</span>
            <select
              defaultValue={current?.discount_type ?? "FIXED"}
              name="type"
            >
              <option value="FIXED">Fixed amount</option>
              <option value="PERCENTAGE">Percentage</option>
            </select>
          </label>
          <label>
            <span>Value (amount or %)</span>
            <input
              defaultValue={
                current === null || current === undefined
                  ? undefined
                  : current.discount_value / 100
              }
              min="0.01"
              name="value"
              required
              step="0.01"
              type="number"
            />
          </label>
          <label>
            <span>Minimum bill</span>
            <input
              defaultValue={(current?.minimum_bill_minor ?? 0) / 100}
              min="0"
              name="minimum"
              step="0.01"
              type="number"
            />
          </label>
          <label>
            <span>Maximum discount</span>
            <input
              defaultValue={
                current?.maximum_discount_minor === null ||
                current?.maximum_discount_minor === undefined
                  ? undefined
                  : current.maximum_discount_minor / 100
              }
              min="0"
              name="maximum"
              step="0.01"
              type="number"
            />
          </label>
          <label>
            <span>Total usage limit</span>
            <input
              defaultValue={current?.total_usage_limit ?? undefined}
              min="1"
              name="totalLimit"
              type="number"
            />
          </label>
          <label>
            <span>Per-customer limit</span>
            <input
              defaultValue={current?.usage_limit_per_customer ?? undefined}
              min="1"
              name="customerLimit"
              type="number"
            />
          </label>
          <label>
            <span>Starts at</span>
            <input
              defaultValue={local(new Date(current?.start_at ?? now))}
              name="starts"
              required
              type="datetime-local"
            />
          </label>
          <label>
            <span>Expires at</span>
            <input
              defaultValue={local(new Date(current?.expires_at ?? later))}
              name="expires"
              required
              type="datetime-local"
            />
          </label>
        </div>
        <label>
          <span>Description</span>
          <textarea
            defaultValue={current?.description ?? ""}
            name="description"
          />
        </label>
        <fieldset>
          <legend>Eligible services (none means all)</legend>
          <div className="permission-grid">
            {catalog?.services.map((item) => (
              <label key={item.id}>
                <input
                  defaultChecked={selectedServices.has(item.id)}
                  name="services"
                  type="checkbox"
                  value={item.id}
                />
                <span>{item.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Eligible vehicle types (none means all)</legend>
          <div className="permission-grid">
            {catalog?.vehicleTypes.map((item) => (
              <label key={item.code}>
                <input
                  defaultChecked={selectedVehicleTypes.has(item.code)}
                  name="vehicles"
                  type="checkbox"
                  value={item.code}
                />
                <span>{item.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="toggle-row">
          <input
            defaultChecked={current?.new_customers_only === 1}
            name="newOnly"
            type="checkbox"
          />
          <span>
            <strong>New customers only</strong>
            <small>
              Only customers without prior completed washes qualify.
            </small>
          </span>
        </label>
        <div className="dialog-actions">
          <Button onClick={onClose} tone="secondary" type="button">
            Cancel
          </Button>
          <Button busy={busy} type="submit">
            {coupon === null ? "Create coupon" : "Save changes"}
          </Button>
        </div>
        {coupon === null ||
        (detail.data?.redemptions.length ?? 0) === 0 ? null : (
          <details>
            <summary>
              Redemption history ({detail.data?.redemptions.length})
            </summary>
            <div className="activity-list">
              {detail.data?.redemptions.map((item) => (
                <div
                  className="activity-item"
                  key={`${item.job_reference}-${item.reserved_at}`}
                >
                  <div>
                    <strong>
                      {item.job_reference} · {item.customer_name}
                    </strong>
                    <span>
                      {dateTime(item.reserved_at)} · {item.status}
                    </span>
                  </div>
                  <strong>{money(item.discount_minor)}</strong>
                </div>
              ))}
            </div>
          </details>
        )}
      </form>
    </Dialog>
  );
}
