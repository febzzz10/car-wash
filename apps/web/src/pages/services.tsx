import { Edit3, Plus, Power, SearchX } from "lucide-react";
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
import { money, titleCase } from "../lib/format";
import type {
  ServicePriceRecord,
  ServiceRecord,
  VehicleTypeRecord,
} from "../types";

interface Payload {
  readonly prices: readonly ServicePriceRecord[];
  readonly services: readonly ServiceRecord[];
  readonly vehicleTypes: readonly VehicleTypeRecord[];
}
export default function ServicesPage() {
  const state = useApiData<Payload>("/services?includeInactive=true");
  const [editing, setEditing] = useState<ServiceRecord | null | undefined>(
    undefined,
  );
  const [pricing, setPricing] = useState<ServiceRecord | null>(null);
  const toast = useToast();
  async function toggle(service: ServiceRecord) {
    try {
      await api(
        `/services/${service.id}/${service.is_active === 1 ? "disable" : "enable"}`,
        { method: "POST" },
      );
      toast.success(
        `Service ${service.is_active === 1 ? "disabled" : "enabled"}. Existing job snapshots are unchanged.`,
      );
      state.reload();
    } catch (failure) {
      toast.error(
        failure instanceof Error ? failure.message : "Service update failed.",
      );
    }
  }
  return (
    <>
      <PageHeader
        actions={
          <Button onClick={() => setEditing(null)}>
            <Plus size={17} /> Add service
          </Button>
        }
        eyebrow="Catalog"
        title="Services & pricing"
      />
      <Card>
        {state.loading ? (
          <SkeletonRows />
        ) : state.error !== null ? (
          <ErrorState message={state.error} onRetry={state.reload} />
        ) : (state.data?.services.length ?? 0) === 0 ? (
          <EmptyState
            icon={SearchX}
            message="Add primary services and add-ons, then define vehicle-specific prices."
            title="No services configured"
          />
        ) : (
          <div className="service-list">
            {state.data?.services.map((service) => (
              <div className="service-row" key={service.id}>
                <div className="service-kind">
                  {service.service_kind === "PRIMARY" ? "P" : "+"}
                </div>
                <div>
                  <strong>{service.name}</strong>
                  <span>
                    {service.code} · {titleCase(service.service_kind)} ·{" "}
                    {service.estimated_duration_minutes ?? 0} min
                  </span>
                </div>
                <strong>{money(service.base_price_minor)}</strong>
                <StatusBadge
                  value={service.is_active === 1 ? "ACTIVE" : "INACTIVE"}
                />
                <div className="table-actions">
                  <Button onClick={() => setPricing(service)} tone="secondary">
                    Price matrix
                  </Button>
                  <Button
                    aria-label="Edit service"
                    onClick={() => setEditing(service)}
                    tone="quiet"
                  >
                    <Edit3 size={17} />
                  </Button>
                  <Button
                    aria-label="Toggle service"
                    onClick={() => void toggle(service)}
                    tone="quiet"
                  >
                    <Power size={17} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      <ServiceDialog
        onClose={() => setEditing(undefined)}
        onDone={() => {
          setEditing(undefined);
          state.reload();
        }}
        open={editing !== undefined}
        service={editing}
      />
      <PriceDialog
        onClose={() => setPricing(null)}
        onDone={state.reload}
        open={pricing !== null}
        payload={state.data}
        service={pricing}
      />
    </>
  );
}
function ServiceDialog({
  onClose,
  onDone,
  open,
  service,
}: {
  readonly onClose: () => void;
  readonly onDone: () => void;
  readonly open: boolean;
  readonly service: ServiceRecord | null | undefined;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api(service === null ? "/services" : `/services/${service?.id}`, {
        ...jsonBody({
          basePriceMinor: Math.round(Number(values.get("price")) * 100),
          code: values.get("code"),
          description: values.get("description") || undefined,
          displayOrder: Number(values.get("order")),
          estimatedDurationMinutes: Number(values.get("duration")),
          isTaxable: values.get("taxable") === "on",
          name: values.get("name"),
          serviceKind: values.get("kind"),
          ...(service === null ? {} : { version: service?.version }),
        }),
        method: service === null ? "POST" : "PATCH",
      });
      onDone();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Service could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      onClose={onClose}
      open={open}
      title={service === null ? "Add service" : "Edit service"}
    >
      <form className="dialog-form" onSubmit={(event) => void submit(event)}>
        {error === null ? null : <div className="form-alert">{error}</div>}
        <div className="form-grid">
          <label>
            <span>Name</span>
            <input defaultValue={service?.name} name="name" required />
          </label>
          <label>
            <span>Code</span>
            <input defaultValue={service?.code} name="code" required />
          </label>
          <label>
            <span>Kind</span>
            <select
              defaultValue={service?.service_kind ?? "PRIMARY"}
              name="kind"
            >
              <option value="PRIMARY">Primary</option>
              <option value="ADD_ON">Add-on</option>
            </select>
          </label>
          <label>
            <span>Base price</span>
            <input
              defaultValue={(service?.base_price_minor ?? 0) / 100}
              min="0"
              name="price"
              step="0.01"
              type="number"
            />
          </label>
          <label>
            <span>Duration (minutes)</span>
            <input
              defaultValue={service?.estimated_duration_minutes ?? 0}
              min="0"
              name="duration"
              type="number"
            />
          </label>
          <label>
            <span>Display order</span>
            <input defaultValue="0" name="order" type="number" />
          </label>
        </div>
        <label>
          <span>Description</span>
          <textarea
            defaultValue={service?.description ?? ""}
            name="description"
          />
        </label>
        <label className="toggle-row">
          <input
            defaultChecked={service?.is_taxable === 1}
            name="taxable"
            type="checkbox"
          />
          <span>
            <strong>Taxable service</strong>
            <small>Current tax rules are snapshotted on jobs.</small>
          </span>
        </label>
        <div className="dialog-actions">
          <Button onClick={onClose} tone="secondary" type="button">
            Cancel
          </Button>
          <Button busy={busy} type="submit">
            Save service
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
function PriceDialog({
  onClose,
  onDone,
  open,
  payload,
  service,
}: {
  readonly onClose: () => void;
  readonly onDone: () => void;
  readonly open: boolean;
  readonly payload: Payload | null;
  readonly service: ServiceRecord | null;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const toast = useToast();
  async function save(vehicleTypeId: string, form: HTMLFormElement) {
    if (service === null) return;
    setBusyId(vehicleTypeId);
    try {
      const value = Number(new FormData(form).get("price"));
      await api("/service-prices", {
        ...jsonBody({
          priceMinor: Math.round(value * 100),
          serviceId: service.id,
          vehicleTypeId,
        }),
        method: "POST",
      });
      toast.success(
        "New price revision created; historical snapshots remain unchanged.",
      );
      onDone();
    } catch (failure) {
      toast.error(
        failure instanceof Error ? failure.message : "Price update failed.",
      );
    } finally {
      setBusyId(null);
    }
  }
  return (
    <Dialog
      onClose={onClose}
      open={open}
      title={`${service?.name ?? "Service"} pricing`}
    >
      <div className="price-matrix">
        {payload?.vehicleTypes.map((type) => {
          const current = payload.prices.find(
            (price) =>
              price.service_id === service?.id &&
              price.vehicle_type_id === type.id,
          );
          return (
            <form
              key={type.id}
              onSubmit={(event) => {
                event.preventDefault();
                void save(type.id, event.currentTarget);
              }}
            >
              <label>
                <span>{type.name}</span>
                <input
                  defaultValue={
                    (current?.price_minor ?? service?.base_price_minor ?? 0) /
                    100
                  }
                  min="0"
                  name="price"
                  step="0.01"
                  type="number"
                />
              </label>
              <Button busy={busyId === type.id} tone="secondary" type="submit">
                Save revision
              </Button>
            </form>
          );
        })}
      </div>
    </Dialog>
  );
}
