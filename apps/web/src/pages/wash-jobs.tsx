import { Car, ChevronRight, Plus, RotateCw } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  SearchField,
  SkeletonRows,
  StatusBadge,
} from "../components/ui";
import { useApiData } from "../hooks/use-api-data";
import { dateTime, money } from "../lib/format";
import type { WashJobRecord } from "../types";

const statuses = [
  "ALL",
  "DRAFT",
  "WAITING",
  "IN_PROGRESS",
  "PAUSED",
  "COMPLETED",
  "CANCELLED",
] as const;

export default function WashJobsPage() {
  const [status, setStatus] = useState<(typeof statuses)[number]>("ALL");
  const [search, setSearch] = useState("");
  const state = useApiData<readonly WashJobRecord[]>(
    `/wash-jobs${status === "ALL" ? "" : `?status=${status}`}`,
  );
  const filtered = (state.data ?? []).filter((job) =>
    `${job.job_reference} ${job.customer_name_snapshot} ${job.vehicle_registration_snapshot}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHeader
        actions={
          <Link className="button button--primary" to="/wash-jobs/new">
            <Plus size={18} /> New wash
          </Link>
        }
        eyebrow="Operations"
        title="Wash queue"
      />
      <Card>
        <div className="toolbar">
          <div className="filter-tabs" role="tablist">
            {statuses.map((value) => (
              <button
                aria-selected={status === value}
                className={status === value ? "active" : ""}
                key={value}
                onClick={() => setStatus(value)}
                role="tab"
                type="button"
              >
                {value.replace("_", " ")}
              </button>
            ))}
          </div>
          <div className="toolbar__right">
            <SearchField
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search job, customer, vehicle…"
              value={search}
            />
            <Button
              aria-label="Refresh queue"
              onClick={state.reload}
              tone="quiet"
            >
              <RotateCw size={18} />
            </Button>
          </div>
        </div>
        {state.loading ? (
          <SkeletonRows count={6} />
        ) : state.error !== null ? (
          <ErrorState message={state.error} onRetry={state.reload} />
        ) : filtered.length === 0 ? (
          <EmptyState
            action={
              <Link className="button button--primary" to="/wash-jobs/new">
                Create a wash
              </Link>
            }
            icon={Car}
            message="No wash jobs match this view."
            title="Nothing in this queue"
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Customer & vehicle</th>
                  <th>Assigned staff</th>
                  <th>Status</th>
                  <th>Payment</th>
                  <th className="align-right">Amount</th>
                  <th>
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((job) => (
                  <tr key={job.id}>
                    <td>
                      <strong className="identifier">{job.job_reference}</strong>
                      <small>{dateTime(job.created_at)}</small>
                    </td>
                    <td>
                      <strong className="identifier">
                        {job.vehicle_registration_snapshot}
                      </strong>
                      <small>{job.customer_name_snapshot}</small>
                    </td>
                    <td>
                      {job.assigned_user_name_snapshot !== null &&
                      job.assigned_user_name_snapshot !== undefined &&
                      job.assigned_user_name_snapshot.trim() !== "" ? (
                        <span className="queue-assignee">
                          {job.assigned_user_name_snapshot}
                        </span>
                      ) : (
                        <span className="muted">Unassigned</span>
                      )}
                    </td>
                    <td>
                      <StatusBadge value={job.status} />
                    </td>
                    <td>
                      <StatusBadge value={job.payment_status} />
                    </td>
                    <td className="align-right">
                      <strong>{money(job.total_amount_minor)}</strong>
                      {job.balance_minor > 0 ? (
                        <small>{money(job.balance_minor)} due</small>
                      ) : null}
                    </td>
                    <td>
                      <Link
                        aria-label={`Open ${job.job_reference}`}
                        className="row-link"
                        to={`/wash-jobs/${job.id}`}
                      >
                        <ChevronRight />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
