import { ShieldCheck } from "lucide-react";
import {
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  SkeletonRows,
  StatusBadge,
} from "../components/ui";
import { useApiData } from "../hooks/use-api-data";
import { dateTime, titleCase } from "../lib/format";
interface AuditRecord {
  readonly action: string;
  readonly created_at: string;
  readonly id: string;
  readonly ip_address?: string | null;
  readonly reason?: string | null;
  readonly record_id?: string | null;
  readonly record_type: string;
  readonly severity: string;
  readonly user_name?: string | null;
}
export default function AuditPage() {
  const state = useApiData<readonly AuditRecord[]>("/audit-logs");
  return (
    <>
      <PageHeader eyebrow="Security" title="Audit log" />
      <Card>
        {state.loading ? (
          <SkeletonRows />
        ) : state.error !== null ? (
          <ErrorState message={state.error} onRetry={state.reload} />
        ) : (state.data?.length ?? 0) === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            message="Sensitive actions are appended here and cannot be edited or deleted."
            title="No audit entries"
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Action</th>
                  <th>User</th>
                  <th>Record</th>
                  <th>Reason</th>
                  <th>Severity</th>
                  <th>Timestamp</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {state.data?.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{titleCase(item.action)}</strong>
                    </td>
                    <td>{item.user_name ?? "System"}</td>
                    <td>
                      {titleCase(item.record_type)}
                      <small className="identifier--muted">
                        {item.record_id ?? ""}
                      </small>
                    </td>
                    <td>{item.reason ?? "—"}</td>
                    <td>
                      <StatusBadge value={item.severity} />
                    </td>
                    <td>{dateTime(item.created_at)}</td>
                    <td>
                      <code className="identifier--muted">
                        {item.ip_address ?? "—"}
                      </code>
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
