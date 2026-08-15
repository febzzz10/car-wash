import { normalizePhone } from "@washpro/domain";
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  MessageCircle,
  Phone,
  Plus,
  UserRoundSearch,
} from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import {
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  PageHeader,
  SearchField,
  SkeletonRows,
} from "../components/ui";
import { useToast } from "../components/toast";
import { useAuth } from "../auth";
import { useMaskedPhone } from "../hooks/use-masked-phone";
import { api, jsonBody } from "../lib/api";
import { dateTime, money } from "../lib/format";
import type { CustomerRecord, CursorPagination } from "../types";

const PAGE_SIZES = [15, 25, 50] as const;
const DEFAULT_PAGE_SIZE = 15;

interface CustomersListPayload {
  readonly data: readonly CustomerRecord[];
  readonly pagination: CursorPagination;
}

function customersPath(
  search: string,
  status: string,
  limit: number,
  cursor: string,
): string {
  return `/customers?search=${encodeURIComponent(search)}&status=${status}&limit=${limit}${cursor === "" ? "" : `&cursor=${encodeURIComponent(cursor)}`}`;
}

export default function CustomersPage() {
  const { user } = useAuth();
  const maskPhone = useMaskedPhone();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [dialog, setDialog] = useState(false);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);
  const [cursorHistory, setCursorHistory] = useState<readonly string[]>([""]);
  const [customers, setCustomers] = useState<
    readonly CustomerRecord[] | null
  >(null);
  const [hasNext, setHasNext] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [paging, setPaging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const isStaff = user?.role === "STAFF";
  const searchActive = search.trim() !== "";
  const searchRequired = isStaff && !searchActive;
  const enabled = !searchRequired;
  const reload = useCallback(() => setRevision((value) => value + 1), []);

  function resetPagination(nextLimit?: number) {
    setPage(1);
    setCursorHistory([""]);
    setHasNext(false);
    setNextCursor(null);
    if (nextLimit !== undefined) setLimit(nextLimit);
  }

  useEffect(() => {
    if (!enabled) {
      setCustomers(null);
      setLoading(false);
      setPaging(false);
      setError(null);
      setHasNext(false);
      setNextCursor(null);
      return;
    }
    let active = true;
    const cursor = cursorHistory[page - 1] ?? "";
    if (cursor === "") {
      setLoading(true);
      setError(null);
    } else {
      setPaging(true);
    }
    void api<CustomersListPayload>(
      customersPath(search, status, limit, cursor),
    )
      .then((body) => {
        if (!active) return;
        setCustomers(body.data);
        setHasNext(body.pagination.hasNext);
        setNextCursor(body.pagination.nextCursor);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(
          reason instanceof Error
            ? reason.message
            : "The customer list could not be loaded.",
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
  }, [cursorHistory, enabled, limit, page, revision, search, status]);

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
      <PageHeader
        actions={
          <Button onClick={() => setDialog(true)}>
            <Plus size={18} /> Add customer
          </Button>
        }
        eyebrow="Directory"
        title="Customers"
      />
      <Card>
        <div className="toolbar">
          <div className="filter-tabs">
            <button
              className={status === "ACTIVE" ? "active" : ""}
              onClick={() => {
                setStatus("ACTIVE");
                resetPagination();
              }}
              type="button"
            >
              Active
            </button>
            <button
              className={status === "INACTIVE" ? "active" : ""}
              onClick={() => {
                setStatus("INACTIVE");
                resetPagination();
              }}
              type="button"
            >
              Inactive
            </button>
          </div>
          <SearchField
            onChange={(event) => {
              setSearch(event.target.value);
              resetPagination();
            }}
            placeholder="Search name, phone, or registration…"
            value={search}
          />
        </div>
        {searchRequired ? (
          <EmptyState
            action={
              <Button onClick={() => setDialog(true)}>Add customer</Button>
            }
            icon={UserRoundSearch}
            message="Enter a customer name, phone number, or vehicle registration number to view results."
            title="Search for a customer"
          />
        ) : loading ? (
          <SkeletonRows />
        ) : error !== null ? (
          <ErrorState message={error} onRetry={reload} />
        ) : (customers?.length ?? 0) === 0 ? (
          <EmptyState
            action={
              <Button onClick={() => setDialog(true)}>Add customer</Button>
            }
            icon={UserRoundSearch}
            message="Try another name, phone, or registration, or create a new profile."
            title="No customers found"
          />
        ) : (
          <>
            <div aria-busy={paging} className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Phone</th>
                    <th>Visits</th>
                    <th>Lifetime value</th>
                    <th>Last visit</th>
                    <th>Actions</th>
                    <th>
                      <span className="sr-only">Open</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {customers?.map((customer) => (
                    <tr key={customer.id}>
                      <td>
                        <strong>{customer.full_name}</strong>
                        <small>{customer.customer_code ?? "Customer"}</small>
                        {customer.matching_registrations === undefined ? null : (
                          <small className="matched-registration">
                            Matched vehicle:{" "}
                            {customer.matching_registrations.join(", ")}
                          </small>
                        )}
                      </td>
                      <td>{maskPhone(customer.phone)}</td>
                      <td>{customer.total_visits_cached}</td>
                      <td>{money(customer.total_spent_minor_cached)}</td>
                      <td>{dateTime(customer.last_visit_at)}</td>
                      <td>
                        <ContactActions customer={customer} />
                      </td>
                      <td>
                        <Link
                          aria-label={`Open ${customer.full_name}`}
                          className="row-link"
                          to={`/customers/${customer.id}`}
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
                Showing {customers?.length ?? 0} customers
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
              <nav aria-label="Customer pages" className="pagination-controls">
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
      <CustomerDialog
        onClose={() => setDialog(false)}
        onDone={() => {
          setDialog(false);
          reload();
        }}
        open={dialog}
      />
    </>
  );
}

function contactTargets(
  phone: string,
  customerName: string,
): { readonly tel: string; readonly whatsappUrl: string } | null {
  try {
    const normalized = normalizePhone(phone);
    const message = `Hi ${customerName}, your vehicle wash has been completed. Thank you for choosing WashPro.`;
    return {
      tel: `tel:${normalized}`,
      whatsappUrl: `https://wa.me/${normalized.slice(1)}?text=${encodeURIComponent(message)}`,
    };
  } catch {
    return null;
  }
}

function ContactActions({ customer }: { readonly customer: CustomerRecord }) {
  const target = contactTargets(customer.phone, customer.full_name);
  if (target === null)
    return (
      <span className="contact-actions">
        <button
          aria-label={`Call ${customer.full_name}`}
          className="icon-button"
          disabled
          title="Phone number unavailable"
          type="button"
        >
          <Phone aria-hidden size={18} />
        </button>
        <button
          aria-label={`Message ${customer.full_name} on WhatsApp`}
          className="icon-button"
          disabled
          title="Phone number unavailable"
          type="button"
        >
          <MessageCircle aria-hidden size={18} />
        </button>
      </span>
    );
  return (
    <span className="contact-actions">
      <a
        aria-label={`Call ${customer.full_name}`}
        className="icon-button"
        href={target.tel}
        onClick={(event) => event.stopPropagation()}
        title="Call customer"
      >
        <Phone aria-hidden size={18} />
      </a>
      <a
        aria-label={`Message ${customer.full_name} on WhatsApp`}
        className="icon-button"
        href={target.whatsappUrl}
        onClick={(event) => event.stopPropagation()}
        rel="noopener noreferrer"
        target="_blank"
        title="Send wash completion message"
      >
        <MessageCircle aria-hidden size={18} />
      </a>
    </span>
  );
}

export function CustomerDialog({
  customer,
  onClose,
  onDone,
  open,
}: {
  readonly customer?: CustomerRecord;
  readonly onClose: () => void;
  readonly onDone: () => void;
  readonly open: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api(
        customer === undefined ? "/customers" : `/customers/${customer.id}`,
        {
          ...jsonBody({
            address: values.get("address") || undefined,
            email: values.get("email") || "",
            fullName: values.get("fullName"),
            notes: values.get("notes") || undefined,
            phone: values.get("phone"),
            ...(customer === undefined ? {} : { version: customer.version }),
          }),
          method: customer === undefined ? "POST" : "PATCH",
        },
      );
      toast.success(
        customer === undefined ? "Customer added." : "Customer updated.",
      );
      onDone();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Customer could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      onClose={onClose}
      open={open}
      title={customer === undefined ? "Add customer" : "Edit customer"}
    >
      <form className="dialog-form" onSubmit={(event) => void submit(event)}>
        {error === null ? null : <div className="form-alert">{error}</div>}
        <label>
          <span>Full name</span>
          <input defaultValue={customer?.full_name} name="fullName" required />
        </label>
        <label>
          <span>Phone</span>
          <input
            defaultValue={customer?.phone}
            inputMode="tel"
            name="phone"
            required
          />
        </label>
        <label>
          <span>Email</span>
          <input
            defaultValue={customer?.email ?? ""}
            name="email"
            type="email"
          />
        </label>
        <label>
          <span>Address</span>
          <textarea name="address" />
        </label>
        <label>
          <span>Notes</span>
          <textarea name="notes" />
        </label>
        <div className="dialog-actions">
          <Button onClick={onClose} tone="secondary" type="button">
            Cancel
          </Button>
          <Button busy={busy} type="submit">
            Save customer
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
