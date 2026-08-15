import { ArrowLeft, ArrowRight, ChevronRight, SearchX } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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
import { api } from "../lib/api";
import { dateTime, money } from "../lib/format";
import type { InvoiceListPayload, InvoiceRecord } from "../types";

const PAGE_SIZES = [15, 25, 50] as const;
const DEFAULT_PAGE_SIZE = 15;

function invoicesPath(search: string, limit: number, cursor: string): string {
  return `/invoices?search=${encodeURIComponent(search)}&limit=${limit}${cursor === "" ? "" : `&cursor=${encodeURIComponent(cursor)}`}`;
}

export default function InvoicesPage() {
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);
  const [cursorHistory, setCursorHistory] = useState<readonly string[]>([""]);
  const [invoices, setInvoices] = useState<readonly InvoiceRecord[] | null>(
    null,
  );
  const [hasNext, setHasNext] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [paging, setPaging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);

  function resetPagination(nextLimit?: number) {
    setPage(1);
    setCursorHistory([""]);
    setHasNext(false);
    setNextCursor(null);
    if (nextLimit !== undefined) setLimit(nextLimit);
  }

  useEffect(() => {
    let active = true;
    const cursor = cursorHistory[page - 1] ?? "";
    if (cursor === "") {
      setLoading(true);
      setError(null);
    } else {
      setPaging(true);
    }
    void api<InvoiceListPayload>(invoicesPath(search, limit, cursor))
      .then((body) => {
        if (!active) return;
        setInvoices(body.invoices);
        setHasNext(body.pagination.hasNext);
        setNextCursor(body.pagination.nextCursor);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(
          reason instanceof Error
            ? reason.message
            : "The invoice list could not be loaded.",
        );
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
        setPaging(false);
      });
    return () => {
      active = false;
    };
  }, [cursorHistory, limit, page, revision, search]);

  const goNext = useCallback(() => {
    if (nextCursor === null || paging) return;
    setCursorHistory((prev) => [...prev, nextCursor]);
    setPage((prev) => prev + 1);
  }, [nextCursor, paging]);

  const goPrevious = useCallback(() => {
    if (page <= 1 || paging) return;
    setPage((prev) => prev - 1);
  }, [page, paging]);

  return (
    <>
      <PageHeader eyebrow="Billing" title="Invoices" />
      <Card>
        <div className="toolbar">
          <SearchField
            onChange={(event) => {
              setSearch(event.target.value);
              resetPagination();
            }}
            placeholder="Invoice, phone, or vehicle…"
            value={search}
          />
        </div>
        {loading ? (
          <SkeletonRows />
        ) : error !== null ? (
          <ErrorState message={error} onRetry={reload} />
        ) : (invoices?.length ?? 0) === 0 ? (
          <EmptyState
            icon={SearchX}
            message="Complete a wash and issue its invoice to see it here."
            title="No invoices found"
          />
        ) : (
          <>
            <div aria-busy={paging} className="table-wrap">
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
                  {invoices?.map((invoice) => (
                    <tr key={invoice.id}>
                      <td>
                        <strong className="identifier">
                          {invoice.invoice_number}
                        </strong>
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
            <div className="pagination-footer">
              <p className="pagination-summary">
                Showing {invoices?.length ?? 0} invoices
              </p>
              <label className="pagination-page-size">
                <span>Rows per page</span>
                <select
                  aria-label="Rows per page"
                  onChange={(event) =>
                    resetPagination(Number(event.target.value))
                  }
                  value={limit}
                >
                  {PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              <nav aria-label="Invoice pages" className="pagination-controls">
                <Button
                  disabled={page === 1 || paging}
                  onClick={goPrevious}
                  tone="secondary"
                  type="button"
                >
                  <ArrowLeft size={15} /> Previous
                </Button>
                <span aria-live="polite" className="pagination-page">
                  Page {page}
                </span>
                <Button
                  disabled={!hasNext || paging}
                  onClick={goNext}
                  tone="secondary"
                  type="button"
                >
                  Next <ArrowRight size={15} />
                </Button>
              </nav>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
