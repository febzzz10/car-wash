import { ChevronRight, SearchX } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import {
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

interface InvoiceRecord {
  readonly balance_minor: number;
  readonly created_at: string;
  readonly customer_name_snapshot: string;
  readonly id: string;
  readonly invoice_number: string;
  readonly invoice_status: string;
  readonly issued_at: string;
  readonly payment_status_snapshot: string;
  readonly revision_number: number;
  readonly total_minor: number;
  readonly vehicle_registration_snapshot: string;
}
export default function InvoicesPage() {
  const [search, setSearch] = useState("");
  const state = useApiData<readonly InvoiceRecord[]>(
    `/invoices?search=${encodeURIComponent(search)}`,
  );
  return (
    <>
      <PageHeader eyebrow="Billing" title="Invoices" />
      <Card>
        <div className="toolbar">
          <SearchField
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Invoice, phone, or vehicle…"
            value={search}
          />
        </div>
        {state.loading ? (
          <SkeletonRows />
        ) : state.error !== null ? (
          <ErrorState message={state.error} onRetry={state.reload} />
        ) : (state.data?.length ?? 0) === 0 ? (
          <EmptyState
            icon={SearchX}
            message="Complete a wash and issue its invoice to see it here."
            title="No invoices found"
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Customer & vehicle</th>
                  <th>Issued</th>
                  <th>Document</th>
                  <th>Payment</th>
                  <th className="align-right">Total</th>
                  <th>
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {state.data?.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>
                      <strong>{invoice.invoice_number}</strong>
                      <small>
                        {invoice.revision_number === 0
                          ? "Original"
                          : `Revision ${invoice.revision_number}`}
                      </small>
                    </td>
                    <td>
                      <strong>{invoice.customer_name_snapshot}</strong>
                      <small>{invoice.vehicle_registration_snapshot}</small>
                    </td>
                    <td>{dateTime(invoice.issued_at)}</td>
                    <td>
                      <StatusBadge value={invoice.invoice_status} />
                    </td>
                    <td>
                      <StatusBadge value={invoice.payment_status_snapshot} />
                    </td>
                    <td className="align-right">
                      <strong>{money(invoice.total_minor)}</strong>
                      {invoice.balance_minor > 0 ? (
                        <small>{money(invoice.balance_minor)} due</small>
                      ) : null}
                    </td>
                    <td>
                      <Link
                        aria-label={`Open ${invoice.invoice_number}`}
                        className="row-link"
                        to={`/invoices/${invoice.id}`}
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
