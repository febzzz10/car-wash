import { normalizePhone } from "@washpro/domain";
import {
  ChevronRight,
  MessageCircle,
  Phone,
  Plus,
  UserRoundSearch,
} from "lucide-react";
import { useState, type FormEvent } from "react";
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
import { useApiData } from "../hooks/use-api-data";
import { api, jsonBody } from "../lib/api";
import { dateTime, money } from "../lib/format";
import type { CustomerRecord } from "../types";

export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [dialog, setDialog] = useState(false);
  const state = useApiData<readonly CustomerRecord[]>(
    `/customers?search=${encodeURIComponent(search)}&status=${status}`,
  );
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
              onClick={() => setStatus("ACTIVE")}
              type="button"
            >
              Active
            </button>
            <button
              className={status === "INACTIVE" ? "active" : ""}
              onClick={() => setStatus("INACTIVE")}
              type="button"
            >
              Inactive
            </button>
          </div>
          <SearchField
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name or phone…"
            value={search}
          />
        </div>
        {state.loading ? (
          <SkeletonRows />
        ) : state.error !== null ? (
          <ErrorState message={state.error} onRetry={state.reload} />
        ) : (state.data?.length ?? 0) === 0 ? (
          <EmptyState
            action={
              <Button onClick={() => setDialog(true)}>Add customer</Button>
            }
            icon={UserRoundSearch}
            message="Try another name or phone, or create a new profile."
            title="No customers found"
          />
        ) : (
          <div className="table-wrap">
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
                {state.data?.map((customer) => (
                  <tr key={customer.id}>
                    <td>
                      <strong>{customer.full_name}</strong>
                      <small>{customer.customer_code ?? "Customer"}</small>
                    </td>
                    <td>{customer.phone}</td>
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
        )}
      </Card>
      <CustomerDialog
        onClose={() => setDialog(false)}
        onDone={() => {
          setDialog(false);
          state.reload();
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
