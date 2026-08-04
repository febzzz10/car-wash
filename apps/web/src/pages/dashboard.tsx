import {
  Activity,
  ArrowRight,
  Car,
  CircleDollarSign,
  Clock3,
  Pause,
  ReceiptText,
  Sparkles,
  WalletCards,
} from "lucide-react";
import { Link } from "react-router-dom";

import { useAuth } from "../auth";
import {
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  SkeletonRows,
  StatusBadge,
} from "../components/ui";
import { useApiData } from "../hooks/use-api-data";
import { dateTime, duration, money, titleCase } from "../lib/format";
import type { WashJobRecord } from "../types";

interface Summary {
  readonly averageWashDurationSeconds: number;
  readonly carsWashed: number;
  readonly expensesMinor: number;
  readonly inProgressJobs: number;
  readonly netProfitMinor: number;
  readonly pausedJobs: number;
  readonly pendingPaymentsMinor: number;
  readonly referralRewardsMinor: number;
  readonly revenueMinor: number;
  readonly waitingJobs: number;
}
interface ActivityRecord {
  readonly action: string;
  readonly created_at: string;
  readonly record_type: string;
  readonly severity: string;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const admin = user?.role === "ADMIN";
  const summary = useApiData<Summary>(
    `/dashboard/summary?from=${today}&to=${today}`,
    admin,
  );
  const activity = useApiData<readonly ActivityRecord[]>(
    "/dashboard/activity",
    admin,
  );
  const jobs = useApiData<readonly WashJobRecord[]>("/wash-jobs");
  const operational = jobs.data ?? [];

  return (
    <>
      <PageHeader
        actions={
          <Link className="button button--primary" to="/wash-jobs/new">
            New wash <ArrowRight size={18} />
          </Link>
        }
        eyebrow={new Intl.DateTimeFormat("en-IN", { dateStyle: "full" }).format(
          new Date(),
        )}
        title={`Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, ${user?.fullName.split(" ")[0] ?? "team"}`}
      />
      {admin ? (
        summary.loading ? (
          <SkeletonRows count={2} />
        ) : summary.error !== null ? (
          <ErrorState message={summary.error} onRetry={summary.reload} />
        ) : (
          <div className="metric-grid">
            <Metric
              icon={CircleDollarSign}
              label="Revenue today"
              tone="blue"
              value={money(summary.data?.revenueMinor ?? 0)}
            />
            <Metric
              icon={ReceiptText}
              label="Expenses today"
              tone="amber"
              value={money(summary.data?.expensesMinor ?? 0)}
            />
            <Metric
              icon={Sparkles}
              label="Net profit"
              tone="green"
              value={money(summary.data?.netProfitMinor ?? 0)}
            />
            <Metric
              icon={Car}
              label="Vehicles washed"
              tone="navy"
              value={String(summary.data?.carsWashed ?? 0)}
            />
            <Metric
              icon={Clock3}
              label="Waiting"
              tone="muted"
              value={String(summary.data?.waitingJobs ?? 0)}
            />
            <Metric
              icon={Activity}
              label="In progress"
              tone="blue"
              value={String(summary.data?.inProgressJobs ?? 0)}
            />
            <Metric
              icon={Pause}
              label="Paused"
              tone="amber"
              value={String(summary.data?.pausedJobs ?? 0)}
            />
            <Metric
              icon={WalletCards}
              label="Pending payments"
              tone="red"
              value={money(summary.data?.pendingPaymentsMinor ?? 0)}
            />
          </div>
        )
      ) : null}
      <div className="dashboard-grid">
        <Card className="dashboard-queue">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Live floor</p>
              <h2>Wash queue</h2>
            </div>
            <Link to="/wash-jobs">
              View all <ArrowRight size={16} />
            </Link>
          </div>
          {jobs.loading ? (
            <SkeletonRows />
          ) : jobs.error !== null ? (
            <ErrorState message={jobs.error} onRetry={jobs.reload} />
          ) : operational.length === 0 ? (
            <EmptyState
              icon={Car}
              message="New washes will appear here as they move through the floor."
              title="The queue is clear"
            />
          ) : (
            <div className="queue-list">
              {operational.slice(0, 6).map((job) => (
                <Link
                  className="queue-item"
                  key={job.id}
                  to={`/wash-jobs/${job.id}`}
                >
                  <span className="vehicle-mark">
                    {job.vehicle_registration_snapshot.slice(-4)}
                  </span>
                  <div>
                    <strong className="identifier">
                      {job.vehicle_registration_snapshot}
                    </strong>
                    <span>
                      {job.customer_name_snapshot} ·{" "}
                      {job.primary_service_name_snapshot}
                    </span>
                  </div>
                  <StatusBadge value={job.status} />
                  <span className="queue-amount">
                    {money(job.total_amount_minor)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>
        <Card>
          <div className="card-heading">
            <div>
              <p className="eyebrow">{admin ? "Audit pulse" : "At a glance"}</p>
              <h2>Recent activity</h2>
            </div>
          </div>
          {admin ? (
            activity.loading ? (
              <SkeletonRows />
            ) : (activity.data?.length ?? 0) === 0 ? (
              <EmptyState
                icon={Activity}
                message="Sensitive actions will be recorded here."
                title="No recent activity"
              />
            ) : (
              <div className="activity-list">
                {activity.data?.slice(0, 7).map((item, index) => (
                  <div
                    className="activity-item"
                    key={`${item.created_at}-${index}`}
                  >
                    <span
                      className={`activity-dot activity-dot--${item.severity.toLowerCase()}`}
                    />
                    <div>
                      <strong>{titleCase(item.action)}</strong>
                      <span>
                        {titleCase(item.record_type)} ·{" "}
                        {dateTime(item.created_at)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="staff-glance">
              <div>
                <span>Active queue</span>
                <strong>
                  {
                    operational.filter((job) =>
                      ["WAITING", "IN_PROGRESS", "PAUSED"].includes(job.status),
                    ).length
                  }
                </strong>
              </div>
              <div>
                <span>Average completed time</span>
                <strong>{duration(0)}</strong>
              </div>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function Metric({
  icon: Icon,
  label,
  tone,
  value,
}: {
  readonly icon: typeof Car;
  readonly label: string;
  readonly tone: string;
  readonly value: string;
}) {
  return (
    <Card className="metric-card">
      <span className={`metric-icon metric-icon--${tone}`}>
        <Icon size={20} />
      </span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </Card>
  );
}
