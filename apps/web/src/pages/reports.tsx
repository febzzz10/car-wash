import {
  formatMinorForDisplay,
  REPORT_COLUMNS,
  REPORT_KEYS,
} from "@washpro/domain";
import { BarChart3, Download, FileText } from "lucide-react";
import { useState } from "react";

import {
  Button,
  Card,
  ErrorState,
  PageHeader,
  SkeletonRows,
} from "../components/ui";
import { useToast } from "../components/toast";
import { useApiData } from "../hooks/use-api-data";
import { apiBlob, jsonBody } from "../lib/api";
import { activeCurrencyCode, titleCase } from "../lib/format";

const reportTypes = REPORT_KEYS;
type ReportType = (typeof reportTypes)[number];
export default function ReportsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const [report, setReport] = useState<ReportType>("profit");
  const state = useApiData<
    Record<string, unknown> | readonly Record<string, unknown>[]
  >(`/reports/${report}?from=${from}&to=${to}`);
  const toast = useToast();
  async function download(format: "CSV" | "PDF") {
    try {
      const blob = await apiBlob("/reports/export", {
        ...jsonBody({ format, from, report, to }),
        method: "POST",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `washpro-${report}-${from}-${to}.${format.toLowerCase()}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (failure) {
      toast.error(
        failure instanceof Error ? failure.message : "Report export failed.",
      );
    }
  }
  const rows = Array.isArray(state.data)
    ? state.data
    : state.data === null
      ? []
      : [state.data];
  return (
    <>
      <PageHeader
        actions={
          <div className="button-row">
            <Button onClick={() => void download("CSV")} tone="secondary">
              <Download size={17} /> CSV
            </Button>
            <Button onClick={() => void download("PDF")} tone="secondary">
              <FileText size={17} /> PDF
            </Button>
          </div>
        }
        eyebrow="Analytics"
        title="Reports"
      />
      <Card>
        <div className="report-controls">
          <label>
            <span>Report</span>
            <select
              onChange={(event) => setReport(event.target.value as ReportType)}
              value={report}
            >
              {reportTypes.map((item) => (
                <option key={item} value={item}>
                  {titleCase(item)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>From</span>
            <input
              onChange={(event) => setFrom(event.target.value)}
              type="date"
              value={from}
            />
          </label>
          <label>
            <span>To</span>
            <input
              onChange={(event) => setTo(event.target.value)}
              type="date"
              value={to}
            />
          </label>
        </div>
        {state.loading ? (
          <SkeletonRows />
        ) : state.error !== null ? (
          <ErrorState message={state.error} onRetry={state.reload} />
        ) : (
          <ReportTable report={report} rows={rows} />
        )}
      </Card>
    </>
  );
}
function ReportTable({
  report,
  rows,
}: {
  readonly report: ReportType;
  readonly rows: readonly Record<string, unknown>[];
}) {
  if (rows.length === 0)
    return (
      <div className="empty-state">
        <span className="empty-state__icon">
          <BarChart3 />
        </span>
        <h2>No report data</h2>
        <p>Try another date range.</p>
      </div>
    );
  const columns = REPORT_COLUMNS[report];
  const currency = activeCurrencyCode();
  return (
    <div className="table-wrap report-table">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map((column) => (
                <td
                  className={
                    column.type === "currencyMinor" ? "cell-currency" : undefined
                  }
                  key={column.key}
                >
                  {column.type === "currencyMinor"
                    ? formatMinorForDisplay(row[column.key], currency)
                    : String(row[column.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
