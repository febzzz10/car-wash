import { ArrowLeft, Car, Edit3, History, Power } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";

import {
  Card,
  Button,
  Dialog,
  ErrorState,
  PageHeader,
  SkeletonRows,
  StatusBadge,
} from "../components/ui";
import { useApiData } from "../hooks/use-api-data";
import { useToast } from "../components/toast";
import { api, jsonBody } from "../lib/api";
import { dateTime, money } from "../lib/format";
import type { VehicleRecord, VehicleTypeRecord, WashJobRecord } from "../types";

interface VehicleHistory {
  readonly invoices: readonly {
    readonly created_at: string;
    readonly id: string;
    readonly invoice_number: string;
    readonly payment_status_snapshot: string;
    readonly total_amount_minor: number;
  }[];
  readonly locations: readonly Record<string, unknown>[];
  readonly photos: readonly Record<string, unknown>[];
  readonly washJobs: readonly WashJobRecord[];
}
export default function VehicleDetailPage() {
  const { id = "" } = useParams();
  const [editing, setEditing] = useState(false);
  const toast = useToast();
  const vehicle = useApiData<
    VehicleRecord & {
      readonly customer_phone: string;
      readonly last_wash_at?: string | null;
    }
  >(`/vehicles/${id}`);
  const history = useApiData<VehicleHistory>(`/vehicles/${id}/history`);
  const catalog = useApiData<{
    readonly vehicleTypes: readonly VehicleTypeRecord[];
  }>("/services");
  async function changeStatus(item: VehicleRecord) {
    const action = item.status === "ACTIVE" ? "deactivate" : "reactivate";
    const reason = window.prompt(`Reason to ${action} this vehicle:`);
    if (reason === null || reason.trim().length < 3) return;
    try {
      await api(`/vehicles/${item.id}/${action}`, {
        ...jsonBody({ reason, version: item.version }),
        method: "POST",
      });
      toast.success(`Vehicle ${action}d.`);
      vehicle.reload();
    } catch (failure) {
      toast.error(
        failure instanceof Error ? failure.message : "Vehicle update failed.",
      );
    }
  }
  if (vehicle.loading) return <SkeletonRows />;
  if (vehicle.error !== null || vehicle.data === null)
    return (
      <ErrorState
        message={vehicle.error ?? "Vehicle not found."}
        onRetry={vehicle.reload}
      />
    );
  const item = vehicle.data;
  return (
    <>
      <Link className="back-link" to="/vehicles">
        <ArrowLeft size={17} /> Vehicles
      </Link>
      <PageHeader
        actions={
          <div className="page-actions">
            <StatusBadge value={item.status} />
            <Button onClick={() => setEditing(true)} tone="secondary">
              <Edit3 size={17} /> Edit
            </Button>
            <Button onClick={() => void changeStatus(item)} tone="quiet">
              <Power size={17} />
              {item.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
            </Button>
          </div>
        }
        eyebrow={item.vehicle_type_name ?? "Vehicle profile"}
        title={item.registration_number}
      />
      <div className="profile-grid">
        <Card>
          <div className="vehicle-profile-mark">
            <Car size={34} />
          </div>
          <dl className="detail-list">
            <div>
              <dt>Owner</dt>
              <dd>
                <Link to={`/customers/${item.customer_id}`}>
                  {item.customer_name}
                </Link>
              </dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{item.customer_phone}</dd>
            </div>
            <div>
              <dt>Make & model</dt>
              <dd>
                {[item.make, item.model].filter(Boolean).join(" ") || "—"}
              </dd>
            </div>
            <div>
              <dt>Colour</dt>
              <dd>{item.colour ?? "—"}</dd>
            </div>
            <div>
              <dt>Last wash</dt>
              <dd>{dateTime(item.last_wash_at)}</dd>
            </div>
          </dl>
        </Card>
        <Card>
          <div className="card-heading">
            <div>
              <p className="eyebrow">Historical snapshots</p>
              <h2>Service history</h2>
            </div>
            <History />
          </div>
          {history.loading ? (
            <SkeletonRows />
          ) : (
            <div className="timeline">
              {history.data?.washJobs.map((job) => (
                <Link key={job.id} to={`/wash-jobs/${job.id}`}>
                  <span className="timeline-mark" />
                  <div>
                    <strong>{job.primary_service_name_snapshot}</strong>
                    <small>
                      {job.job_reference} · {dateTime(job.created_at)}
                    </small>
                  </div>
                  <StatusBadge value={job.status} />
                  <strong>{money(job.total_amount_minor)}</strong>
                </Link>
              ))}
            </div>
          )}
          {(history.data?.invoices.length ?? 0) > 0 ? (
            <div className="linked-invoices">
              <h3>Invoices</h3>
              {history.data?.invoices.map((invoice) => (
                <Link key={invoice.id} to={`/invoices/${invoice.id}`}>
                  <span>
                    <strong>{invoice.invoice_number}</strong>
                    <small>{dateTime(invoice.created_at)}</small>
                  </span>
                  <StatusBadge value={invoice.payment_status_snapshot} />
                  <strong>{money(invoice.total_amount_minor)}</strong>
                </Link>
              ))}
            </div>
          ) : null}
        </Card>
      </div>
      <VehicleEditDialog
        key={`${item.id}-${item.version}`}
        onClose={() => setEditing(false)}
        onDone={() => {
          setEditing(false);
          vehicle.reload();
        }}
        open={editing}
        vehicle={item}
        vehicleTypes={catalog.data?.vehicleTypes ?? []}
      />
    </>
  );
}

function VehicleEditDialog({
  onClose,
  onDone,
  open,
  vehicle,
  vehicleTypes,
}: {
  readonly onClose: () => void;
  readonly onDone: () => void;
  readonly open: boolean;
  readonly vehicle: VehicleRecord;
  readonly vehicleTypes: readonly VehicleTypeRecord[];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api(`/vehicles/${vehicle.id}`, {
        ...jsonBody({
          colour: values.get("colour") || null,
          fuelType: values.get("fuelType") || null,
          make: values.get("make") || null,
          manufacturingYear:
            values.get("year") === "" ? null : Number(values.get("year")),
          model: values.get("model") || null,
          notes: values.get("notes") || null,
          registrationNumber: values.get("registrationNumber"),
          vehicleTypeId: values.get("vehicleTypeId"),
          version: vehicle.version,
        }),
        method: "PATCH",
      });
      onDone();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Vehicle update failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog onClose={onClose} open={open} title="Edit vehicle">
      <form className="dialog-form" onSubmit={(event) => void submit(event)}>
        {error === null ? null : (
          <div className="form-alert" role="alert">
            {error}
          </div>
        )}
        <div className="form-grid">
          <label>
            <span>Registration number</span>
            <input
              autoCapitalize="characters"
              defaultValue={vehicle.registration_number}
              name="registrationNumber"
              required
              spellCheck={false}
            />
          </label>
          <label>
            <span>Vehicle type</span>
            <select
              defaultValue={vehicle.vehicle_type_id}
              name="vehicleTypeId"
              required
            >
              {vehicleTypes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Make</span>
            <input defaultValue={vehicle.make ?? ""} name="make" />
          </label>
          <label>
            <span>Model</span>
            <input defaultValue={vehicle.model ?? ""} name="model" />
          </label>
          <label>
            <span>Manufacturing year</span>
            <input
              defaultValue={vehicle.manufacturing_year ?? ""}
              max="2100"
              min="1900"
              name="year"
              type="number"
            />
          </label>
          <label>
            <span>Colour</span>
            <input defaultValue={vehicle.colour ?? ""} name="colour" />
          </label>
          <label>
            <span>Fuel type</span>
            <input defaultValue={vehicle.fuel_type ?? ""} name="fuelType" />
          </label>
        </div>
        <label>
          <span>Notes</span>
          <textarea defaultValue={vehicle.notes ?? ""} name="notes" />
        </label>
        <div className="dialog-actions">
          <Button onClick={onClose} tone="secondary" type="button">
            Cancel
          </Button>
          <Button busy={busy} type="submit">
            Save vehicle
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
