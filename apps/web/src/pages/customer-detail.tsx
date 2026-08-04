import { ArrowLeft, Car, ChevronDown, Edit3, History, Plus, UserRoundX } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";

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
import { useApiData, type ApiDataState } from "../hooks/use-api-data";
import { api, jsonBody } from "../lib/api";
import { dateTime, formatBytes, money } from "../lib/format";
import { paymentMethodLabel } from "../lib/payment-methods";
import type {
  CustomerRecord,
  VehicleRecord,
  WashJobRecord,
} from "../types";
import { CustomerDialog } from "./customers";
import { NewVehicleDialog } from "./new-wash";

interface CustomerDetail extends CustomerRecord {
  readonly address?: string | null;
  readonly notes?: string | null;
  readonly rewardBalance: { readonly balance_minor: number };
  readonly vehicles: readonly VehicleRecord[];
}
interface VehiclePhoto {
  readonly captured_at: string;
  readonly id: string;
  readonly job_reference: string | null;
  readonly make: string | null;
  readonly model: string | null;
  readonly photo_type: string;
  readonly registration_number: string;
  readonly size_bytes: number | null;
}
interface HistoryPayload {
  readonly coupons: readonly {
    readonly discount_minor: number;
    readonly id: string;
    readonly reserved_at: string;
    readonly status: string;
  }[];
  readonly invoices: readonly {
    readonly created_at: string;
    readonly id: string;
    readonly invoice_number: string;
    readonly payment_status_snapshot: string;
    readonly total_amount_minor: number;
  }[];
  readonly locations: readonly {
    readonly accuracy_meters: number;
    readonly captured_at: string;
    readonly distance_from_branch_meters: number;
    readonly id: string;
    readonly location_status: string;
  }[];
  readonly payments: readonly {
    readonly amount_minor: number;
    readonly created_at: string;
    readonly id: string;
    readonly payment_method: string;
    readonly status: string;
    readonly tip_minor: number;
    readonly wash_job_id: string;
  }[];
  readonly photos: readonly VehiclePhoto[];
  readonly referrals: readonly {
    readonly created_at: string;
    readonly friend_discount_minor: number;
    readonly id: string;
    readonly referrer_reward_minor: number;
    readonly status: string;
  }[];
}
interface WashJobsPage {
  readonly jobs: readonly WashJobRecord[];
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
}

export default function CustomerDetailPage() {
  const { id = "" } = useParams();
  const profile = useApiData<CustomerDetail>(`/customers/${id}`);
  const history = useApiData<HistoryPayload>(`/customers/${id}/history`);
  const [edit, setEdit] = useState(false);
  const [addVehicle, setAddVehicle] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const toast = useToast();

  const [jobs, setJobs] = useState<readonly WashJobRecord[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    setJobs([]);
    setJobsLoading(true);
    setJobsError(null);
    setNextCursor(null);
    void api<WashJobsPage>(`/customers/${id}/wash-jobs?limit=20`)
      .then((page) => {
        if (!mountedRef.current) return;
        setJobs(page.jobs);
        setNextCursor(page.nextCursor);
      })
      .catch((reason: unknown) => {
        if (!mountedRef.current) return;
        setJobsError(
          reason instanceof Error ? reason.message : "Failed to load history.",
        );
      })
      .finally(() => {
        if (mountedRef.current) setJobsLoading(false);
      });
    return () => {
      mountedRef.current = false;
    };
  }, [id]);

  const loadMore = useCallback(() => {
    if (nextCursor === null || loadingMore) return;
    setLoadingMore(true);
    void api<WashJobsPage>(
      `/customers/${id}/wash-jobs?cursor=${encodeURIComponent(nextCursor)}&limit=20`,
    )
      .then((page) => {
        if (!mountedRef.current) return;
        setJobs((prev) => [...prev, ...page.jobs]);
        setNextCursor(page.nextCursor);
      })
      .catch((reason: unknown) => {
        if (!mountedRef.current) return;
        toast.error(
          reason instanceof Error
            ? reason.message
            : "Failed to load more history.",
        );
      })
      .finally(() => {
        if (mountedRef.current) setLoadingMore(false);
      });
  }, [id, nextCursor, loadingMore, toast]);
  if (profile.loading) return <SkeletonRows />;
  if (profile.error !== null || profile.data === null)
    return (
      <ErrorState
        message={profile.error ?? "Customer not found."}
        onRetry={profile.reload}
      />
    );
  const customer = profile.data;
  return (
    <>
      <Link className="back-link" to="/customers">
        <ArrowLeft size={17} /> Customers
      </Link>
      <PageHeader
        actions={
          <div className="button-row">
            <Button onClick={() => setEdit(true)} tone="secondary">
              <Edit3 size={17} /> Edit
            </Button>
            <Button
              onClick={() => setDeactivateOpen(true)}
              tone={customer.status === "ACTIVE" ? "danger" : "secondary"}
            >
              <UserRoundX size={17} />{" "}
              {customer.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
            </Button>
          </div>
        }
        eyebrow={customer.customer_code ?? "Customer profile"}
        title={customer.full_name}
      />
      <div className="profile-grid">
        <Card>
          <div className="profile-hero">
            <span className="profile-avatar">
              {customer.full_name.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <StatusBadge value={customer.status} />
              <p>{customer.phone}</p>
              <p>{customer.email ?? "No email"}</p>
            </div>
          </div>
          <dl className="detail-list">
            <div>
              <dt>Lifetime visits</dt>
              <dd>{customer.total_visits_cached}</dd>
            </div>
            <div>
              <dt>Lifetime value</dt>
              <dd>{money(customer.total_spent_minor_cached)}</dd>
            </div>
            <div>
              <dt>Reward balance</dt>
              <dd>{money(customer.rewardBalance.balance_minor)}</dd>
            </div>
            <div>
              <dt>Last visit</dt>
              <dd>{dateTime(customer.last_visit_at)}</dd>
            </div>
            <div>
              <dt>Address</dt>
              <dd>{customer.address ?? "—"}</dd>
            </div>
            <div>
              <dt>Notes</dt>
              <dd>{customer.notes ?? "—"}</dd>
            </div>
          </dl>
        </Card>
        <div className="profile-content">
          <Card>
            <div className="card-heading">
              <div>
                <p className="eyebrow">Owned vehicles</p>
                <h2>Vehicles</h2>
              </div>
              <div className="button-row">
                <Button onClick={() => setAddVehicle(true)} tone="secondary">
                  <Plus size={17} /> Add vehicle
                </Button>
                <Link className="button button--secondary" to="/wash-jobs/new">
                  New wash
                </Link>
              </div>
            </div>
            <div className="vehicle-cards">
              {customer.vehicles.map((vehicle) => (
                <Link key={vehicle.id} to={`/vehicles/${vehicle.id}`}>
                  <span>
                    <Car />
                  </span>
                  <div>
                    <strong className="identifier">
                      {vehicle.registration_number}
                    </strong>
                    <small>
                      {vehicle.vehicle_type_name} ·{" "}
                      {vehicle.make ?? "Make not recorded"}
                    </small>
                  </div>
                  <StatusBadge value={vehicle.status} />
                </Link>
              ))}
            </div>
          </Card>
          <VehiclePhotosCard history={history} />
          <Card>
            <div className="card-heading">
              <div>
                <p className="eyebrow">Linked ledgers</p>
                <h2>Invoices, benefits & evidence</h2>
              </div>
            </div>
            {history.loading ? (
              <SkeletonRows />
            ) : history.error !== null ? (
              <ErrorState message={history.error} onRetry={history.reload} />
            ) : (
              <div className="history-ledger-grid">
                <HistoryGroup
                  title={`Invoices (${history.data?.invoices.length ?? 0})`}
                >
                  {history.data?.invoices.slice(0, 5).map((invoice) => (
                    <Link key={invoice.id} to={`/invoices/${invoice.id}`}>
                      <span>
                        <strong className="identifier">
                          {invoice.invoice_number}
                        </strong>
                        <small>{dateTime(invoice.created_at)}</small>
                      </span>
                      <span>
                        <StatusBadge value={invoice.payment_status_snapshot} />
                        <strong>{money(invoice.total_amount_minor)}</strong>
                      </span>
                    </Link>
                  ))}
                </HistoryGroup>
                <HistoryGroup
                  title={`Payments (${history.data?.payments.length ?? 0})`}
                >
                  {history.data?.payments.slice(0, 5).map((payment) => (
                    <Link
                      key={payment.id}
                      to={`/wash-jobs/${payment.wash_job_id}`}
                    >
                      <span>
                        <strong>{paymentMethodLabel(payment.payment_method)}</strong>
                        <small>{dateTime(payment.created_at)}</small>
                      </span>
                      <span>
                        <StatusBadge value={payment.status} />
                        <strong>{money(payment.amount_minor)}</strong>
                        {payment.tip_minor > 0 ? (
                          <small>+{money(payment.tip_minor)} tip</small>
                        ) : null}
                      </span>
                    </Link>
                  ))}
                </HistoryGroup>
                <HistoryGroup
                  title={`Coupons (${history.data?.coupons.length ?? 0})`}
                >
                  {history.data?.coupons.slice(0, 5).map((coupon) => (
                    <div key={coupon.id}>
                      <span>
                        <strong>Coupon benefit</strong>
                        <small>{dateTime(coupon.reserved_at)}</small>
                      </span>
                      <span>
                        <StatusBadge value={coupon.status} />
                        <strong>{money(coupon.discount_minor)}</strong>
                      </span>
                    </div>
                  ))}
                </HistoryGroup>
                <HistoryGroup
                  title={`Referrals (${history.data?.referrals.length ?? 0})`}
                >
                  {history.data?.referrals.slice(0, 5).map((referral) => (
                    <div key={referral.id}>
                      <span>
                        <strong>
                          Friend {money(referral.friend_discount_minor)}
                        </strong>
                        <small>{dateTime(referral.created_at)}</small>
                      </span>
                      <span>
                        <StatusBadge value={referral.status} />
                        <strong>
                          Reward {money(referral.referrer_reward_minor)}
                        </strong>
                      </span>
                    </div>
                  ))}
                </HistoryGroup>
                {history.data?.locations && history.data.locations.length > 0 ? (
                  <HistoryGroup
                    title={`Location captures (${history.data.locations.length})`}
                  >
                    {history.data.locations.slice(0, 5).map((location) => (
                      <div key={location.id}>
                        <span>
                          <strong>Legacy location recorded</strong>
                          <small>{dateTime(location.captured_at)}</small>
                        </span>
                      </div>
                    ))}
                  </HistoryGroup>
                ) : null}
              </div>
            )}
          </Card>
          <Card>
            <div className="card-heading">
              <div>
                <p className="eyebrow">Complete history</p>
                <h2>Wash timeline</h2>
              </div>
              <History size={20} />
            </div>
            {jobsLoading ? (
              <SkeletonRows />
            ) : jobsError !== null ? (
              <ErrorState message={jobsError} />
            ) : (
              <>
                <div className="timeline">
                  {jobs.map((job) => (
                    <Link key={job.id} to={`/wash-jobs/${job.id}`}>
                      <span className="timeline-mark" />
                      <div>
                        <strong>
                          <span className="identifier--muted">
                            {job.job_reference}
                          </span>{" "}
                          · {job.vehicle_registration_snapshot}
                        </strong>
                        <small>
                          {job.primary_service_name_snapshot} ·{" "}
                          {dateTime(job.created_at)}
                        </small>
                      </div>
                      <StatusBadge value={job.status} />
                      <strong>{money(job.total_amount_minor)}</strong>
                    </Link>
                  ))}
                </div>
                {jobs.length === 0 ? (
                  <EmptyState
                    icon={History}
                    message="No wash history for this customer yet."
                    title="No records"
                  />
                ) : null}
                {nextCursor !== null ? (
                  <div style={{ marginTop: "12px", textAlign: "center" }}>
                    <Button
                      busy={loadingMore}
                      onClick={loadMore}
                      tone="secondary"
                    >
                      <ChevronDown size={17} /> Load more
                    </Button>
                  </div>
                ) : jobs.length > 0 ? (
                  <div style={{ marginTop: "12px", textAlign: "center" }}>
                    <small className="muted-text">
                      All {jobs.length} records loaded.
                    </small>
                  </div>
                ) : null}
              </>
            )}
          </Card>
        </div>
      </div>
      <CustomerDialog
        customer={customer}
        onClose={() => setEdit(false)}
        onDone={() => {
          setEdit(false);
          profile.reload();
        }}
        open={edit}
      />
      <NewVehicleDialog
        customerId={customer.id}
        onClose={() => setAddVehicle(false)}
        onCreated={() => {
          setAddVehicle(false);
          profile.reload();
        }}
        open={addVehicle}
      />
      <DeactivateCustomerDialog
        id={id}
        onClose={() => setDeactivateOpen(false)}
        onDone={() => {
          setDeactivateOpen(false);
          profile.reload();
        }}
        open={deactivateOpen}
        status={customer.status}
        version={customer.version}
      />
    </>
  );
}

function DeactivateCustomerDialog({
  id,
  onClose,
  onDone,
  open,
  status,
  version,
}: {
  readonly id: string;
  readonly onClose: () => void;
  readonly onDone: () => void;
  readonly open: boolean;
  readonly status: string;
  readonly version: number;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isActive = status === "ACTIVE";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = String(
      new FormData(event.currentTarget).get("reason") ?? "",
    );
    setBusy(true);
    setError(null);
    try {
      await api(`/customers/${id}/${isActive ? "deactivate" : "reactivate"}`, {
        ...jsonBody({ reason, version }),
        method: "POST",
      });
      onDone();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Status change failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      onClose={onClose}
      open={open}
      title={isActive ? "Deactivate customer" : "Reactivate customer"}
    >
      <form className="dialog-form" onSubmit={(event) => void submit(event)}>
        <p>
          {isActive
            ? "Deactivation hides this customer from selection and prevents new wash jobs."
            : "Reactivation restores this customer for normal use."}
        </p>
        {error === null ? null : <div className="form-alert">{error}</div>}
        <label>
          <span>Reason</span>
          <textarea minLength={3} name="reason" required />
        </label>
        <div className="dialog-actions">
          <Button busy={busy} tone={isActive ? "danger" : "primary"}>
            {isActive ? "Deactivate" : "Reactivate"}
          </Button>
          <Button onClick={onClose} tone="secondary" type="button">
            Cancel
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function HistoryGroup({
  children,
  title,
}: {
  readonly children: ReactNode;
  readonly title: string;
}) {
  return (
    <section className="history-group">
      <h3>{title}</h3>
      <div>{children}</div>
    </section>
  );
}

const PHOTO_TYPE_LABELS: Readonly<Record<string, string>> = {
  LIVE_BEFORE_WASH: "Live vehicle capture",
  LIVE_AFTER_WASH: "After-wash photo",
  VEHICLE_FRONT: "Vehicle front photo",
  VEHICLE_REAR: "Vehicle rear photo",
  OTHER: "Vehicle photo",
};

function photoTypeLabel(photoType: string): string {
  return PHOTO_TYPE_LABELS[photoType] ?? "Vehicle photo";
}

function VehiclePhotosCard({
  history,
}: {
  readonly history: ApiDataState<HistoryPayload>;
}) {
  const [preview, setPreview] = useState<VehiclePhoto | null>(null);
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set());
  const photos = history.data?.photos ?? [];
  const uniquePhotos = photos.filter(
    (photo, index, all) => all.findIndex((other) => other.id === photo.id) === index,
  );
  const byVehicle = new Map<string, VehiclePhoto[]>();
  for (const photo of uniquePhotos) {
    const list = byVehicle.get(photo.registration_number);
    if (list === undefined) byVehicle.set(photo.registration_number, [photo]);
    else list.push(photo);
  }
  const groups = [...byVehicle.entries()].map(([registration_number, group]) => ({
    make: group[0]?.make ?? null,
    model: group[0]?.model ?? null,
    photos: group,
    registration_number,
  }));
  let content: ReactNode;
  if (history.loading) {
    content = <p className="muted-text">Loading vehicle photos…</p>;
  } else if (history.error !== null) {
    content = (
      <div className="form-alert">
        <span>Vehicle photos could not be loaded.</span>
        <Button onClick={history.reload} tone="secondary">
          Retry
        </Button>
      </div>
    );
  } else if (uniquePhotos.length === 0) {
    content = (
      <EmptyState
        icon={Car}
        message="No vehicle photos are available for this customer."
        title="No vehicle photos"
      />
    );
  } else {
    content = (
      <div className="vehicle-photo-groups">
        {groups.map((group) => (
          <div key={group.registration_number} className="vehicle-photo-group">
            <h3>
              <span className="identifier">{group.registration_number}</span>
              {group.make !== null || group.model !== null ? (
                <small>
                  {" "}
                  — {[group.make, group.model].filter(Boolean).join(" ")}
                </small>
              ) : null}
            </h3>
            <div className="vehicle-photo-grid">
              {group.photos.map((photo) => (
                <button
                  className="vehicle-photo-card"
                  key={photo.id}
                  onClick={() => setPreview(photo)}
                  type="button"
                >
                  {broken.has(photo.id) ? (
                    <span className="vehicle-photo-thumb vehicle-photo-thumb--broken" />
                  ) : (
                    <img
                      alt={`${photoTypeLabel(photo.photo_type)} of vehicle ${photo.registration_number}`}
                      className="vehicle-photo-thumb"
                      loading="lazy"
                      onError={() =>
                        setBroken((previous) => new Set(previous).add(photo.id))
                      }
                      src={`/api/v1/uploads/photos/${photo.id}`}
                    />
                  )}
                  <span className="vehicle-photo-type">
                    {photoTypeLabel(photo.photo_type)}
                  </span>
                  <small className="vehicle-photo-meta">
                    {photo.registration_number}
                    {photo.job_reference !== null
                      ? ` · ${photo.job_reference}`
                      : ""}
                  </small>
                  <small className="vehicle-photo-meta">
                    {dateTime(photo.captured_at)}
                  </small>
                  {formatBytes(photo.size_bytes) !== null ? (
                    <small className="vehicle-photo-meta">
                      {formatBytes(photo.size_bytes)}
                    </small>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <Card>
      <div className="card-heading">
        <div>
          <p className="eyebrow">Vehicle evidence</p>
          <h2>Vehicle photos ({uniquePhotos.length})</h2>
        </div>
      </div>
      {content}
      <Dialog
        onClose={() => setPreview(null)}
        open={preview !== null}
        title={
          preview === null
            ? "Vehicle photo"
            : `${photoTypeLabel(preview.photo_type)} of vehicle ${preview.registration_number}`
        }
      >
        {preview === null ? null : (
          <img
            alt={`${photoTypeLabel(preview.photo_type)} of vehicle ${preview.registration_number}`}
            className="vehicle-photo-preview"
            src={`/api/v1/uploads/photos/${preview.id}`}
          />
        )}
      </Dialog>
    </Card>
  );
}
