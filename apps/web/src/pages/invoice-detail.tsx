import {
  ArrowLeft,
  Clipboard,
  Download,
  ExternalLink,
  MessageCircle,
  Printer,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useState, type FormEvent } from "react";

import { useAuth } from "../auth";
import {
  Button,
  Card,
  Dialog,
  ErrorState,
  PageHeader,
  SkeletonRows,
  StatusBadge,
} from "../components/ui";
import { useToast } from "../components/toast";
import { useApiData } from "../hooks/use-api-data";
import { API_BASE, api, jsonBody } from "../lib/api";
import { dateTime, money } from "../lib/format";

interface InvoiceItem {
  readonly id: string;
  readonly description?: string | null;
  readonly total_minor: number;
  readonly quantity: number;
  readonly item_name: string;
  readonly unit_price_minor: number;
}
interface InvoiceDetail {
  readonly balance_minor: number;
  readonly business_address_snapshot: string;
  readonly business_name_snapshot: string;
  readonly coupon_discount_minor: number;
  readonly currency_code: string;
  readonly customer_name_snapshot: string;
  readonly customer_phone_snapshot: string;
  readonly discount_minor: number;
  readonly id: string;
  readonly invoice_number: string;
  readonly invoice_status: string;
  readonly issued_at: string;
  readonly items: readonly InvoiceItem[];
  readonly manual_discount_minor: number;
  readonly paid_minor: number;
  readonly payment_status_snapshot: string;
  readonly referral_discount_minor: number;
  readonly reward_discount_minor: number;
  readonly rounding_minor: number;
  readonly subtotal_minor: number;
  readonly tax_minor: number;
  readonly total_minor: number;
  readonly vehicle_registration_snapshot: string;
}
interface SharePayload {
  readonly copyLink: string;
  readonly copyMessage: string;
  readonly whatsappUrl: string;
}
export default function InvoiceDetailPage() {
  const { id = "" } = useParams();
  const invoice = useApiData<InvoiceDetail>(`/invoices/${id}`);
  const toast = useToast();
  const { user } = useAuth();
  async function download(print = false) {
    try {
      const response = await fetch(`${API_BASE}/api/v1/invoices/${id}/pdf`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Invoice PDF is unavailable.");
      const url = URL.createObjectURL(await response.blob());
      if (print) {
        const frame = document.createElement("iframe");
        frame.hidden = true;
        frame.src = url;
        document.body.append(frame);
        frame.onload = () => {
          frame.contentWindow?.print();
          window.setTimeout(() => {
            frame.remove();
            URL.revokeObjectURL(url);
          }, 2000);
        };
      } else {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${invoice.data?.invoice_number ?? "invoice"}.pdf`;
        anchor.click();
        URL.revokeObjectURL(url);
      }
    } catch (failure) {
      toast.error(
        failure instanceof Error ? failure.message : "Download failed.",
      );
    }
  }
  async function share(mode: "copy" | "link" | "whatsapp") {
    try {
      const payload = await api<SharePayload>(`/invoices/${id}/share-message`, {
        method: "POST",
      });
      if (mode === "whatsapp")
        window.open(payload.whatsappUrl, "_blank", "noopener,noreferrer");
      else
        await navigator.clipboard.writeText(
          mode === "copy" ? payload.copyMessage : payload.copyLink,
        );
      toast.success(
        mode === "whatsapp"
          ? "WhatsApp opened with a pre-filled message. Download the PDF separately if needed."
          : "Copied to clipboard.",
      );
    } catch (failure) {
      toast.error(
        failure instanceof Error ? failure.message : "Sharing failed.",
      );
    }
  }
  const [correctionOpen, setCorrectionOpen] = useState(false);
  if (invoice.loading) return <SkeletonRows />;
  if (invoice.error !== null || invoice.data === null)
    return (
      <ErrorState
        message={invoice.error ?? "Invoice not found."}
        onRetry={invoice.reload}
      />
    );
  const item = invoice.data;
  return (
    <>
      <Link className="back-link" to="/invoices">
        <ArrowLeft size={17} /> Invoices
      </Link>
      <PageHeader
        actions={
          <div className="button-row">
            {user?.role === "ADMIN" ? (
              <Button onClick={() => setCorrectionOpen(true)} tone="secondary">
                Create correction
              </Button>
            ) : null}
            <Button onClick={() => void download()} tone="secondary">
              <Download size={17} /> PDF
            </Button>
            <Button onClick={() => void download(true)} tone="secondary">
              <Printer size={17} /> Print
            </Button>
          </div>
        }
        eyebrow={item.invoice_number}
        title="Invoice details"
      />
      <div className="invoice-layout">
        <Card className="invoice-sheet">
          <div className="invoice-sheet__head">
            <div>
              <span className="brand__mark">W</span>
              <div>
                <strong>{item.business_name_snapshot}</strong>
                <small>{item.business_address_snapshot}</small>
              </div>
            </div>
            <div>
              <p>Invoice</p>
              <strong className="identifier">{item.invoice_number}</strong>
              <StatusBadge value={item.invoice_status} />
            </div>
          </div>
          <div className="invoice-parties">
            <div>
              <span>Billed to</span>
              <strong>{item.customer_name_snapshot}</strong>
              <small>{item.customer_phone_snapshot}</small>
            </div>
            <div>
              <span>Vehicle</span>
              <strong>{item.vehicle_registration_snapshot}</strong>
              <small>Issued {dateTime(item.issued_at)}</small>
            </div>
          </div>
          <div className="line-items invoice-lines">
            {item.items.map((line) => (
              <div key={line.id}>
                <span>
                  <strong>{line.item_name}</strong>
                  <small>
                    {line.quantity} ×{" "}
                    {money(line.unit_price_minor, item.currency_code)}
                  </small>
                </span>
                <strong>
                  {money(line.total_minor, item.currency_code)}
                </strong>
              </div>
            ))}
          </div>
          <div className="invoice-totals">
            <span>
              Subtotal{" "}
              <strong>{money(item.subtotal_minor, item.currency_code)}</strong>
            </span>
            {item.coupon_discount_minor > 0 ? (
              <span>
                Coupon{" "}
                <strong>
                  −{money(item.coupon_discount_minor, item.currency_code)}
                </strong>
              </span>
            ) : null}
            {item.referral_discount_minor > 0 ? (
              <span>
                Referral{" "}
                <strong>
                  −{money(item.referral_discount_minor, item.currency_code)}
                </strong>
              </span>
            ) : null}
            {item.reward_discount_minor > 0 ? (
              <span>
                Reward{" "}
                <strong>
                  −{money(item.reward_discount_minor, item.currency_code)}
                </strong>
              </span>
            ) : null}
            {item.manual_discount_minor > 0 ? (
              <span>
                Manual discount{" "}
                <strong>
                  −{money(item.manual_discount_minor, item.currency_code)}
                </strong>
              </span>
            ) : null}
            {item.coupon_discount_minor === 0 &&
            item.referral_discount_minor === 0 &&
            item.reward_discount_minor === 0 &&
            item.manual_discount_minor === 0 &&
            item.discount_minor > 0 ? (
              <span>
                Discount{" "}
                <strong>
                  −{money(item.discount_minor, item.currency_code)}
                </strong>
              </span>
            ) : null}
            <span>
              Tax <strong>{money(item.tax_minor, item.currency_code)}</strong>
            </span>
            <span>
              Rounding{" "}
              <strong>{money(item.rounding_minor, item.currency_code)}</strong>
            </span>
            <span className="invoice-grand">
              Final amount{" "}
              <strong>{money(item.total_minor, item.currency_code)}</strong>
            </span>
          </div>
        </Card>
        <aside className="job-side">
          <Card>
            <p className="eyebrow">Payment</p>
            <StatusBadge value={item.payment_status_snapshot} />
            <dl className="detail-list">
              <div>
                <dt>Paid</dt>
                <dd>{money(item.paid_minor)}</dd>
              </div>
              <div>
                <dt>Balance</dt>
                <dd>{money(item.balance_minor)}</dd>
              </div>
            </dl>
          </Card>
          <Card>
            <p className="eyebrow">Share invoice</p>
            <p className="muted">
              The secure link expires. WhatsApp opens a pre-filled message and
              does not attach the PDF.
            </p>
            <div className="stacked-actions">
              <Button onClick={() => void share("whatsapp")}>
                <MessageCircle size={18} /> Open WhatsApp
              </Button>
              <Button onClick={() => void share("copy")} tone="secondary">
                <Clipboard size={18} /> Copy message
              </Button>
              <Button onClick={() => void share("link")} tone="secondary">
                <ExternalLink size={18} /> Copy secure link
              </Button>
            </div>
          </Card>
        </aside>
      </div>
      <InvoiceRevisionDialog
        id={id}
        customerName={item.customer_name_snapshot}
        onClose={() => setCorrectionOpen(false)}
        open={correctionOpen}
      />
    </>
  );
}

export function InvoiceRevisionDialog({
  customerName,
  id,
  onClose,
  open,
}: {
  readonly customerName: string;
  readonly id: string;
  readonly onClose: () => void;
  readonly open: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const reason = String(data.get("reason") ?? "").trim();
    const name = String(data.get("customerName") ?? "").trim();
    if (reason.length < 5) return;
    setBusy(true);
    setError(null);
    try {
      const revised = await api<{ readonly id: string }>(
        `/invoices/${id}/revisions`,
        {
          ...jsonBody({
            customerName: name || undefined,
            idempotencyKey: crypto.randomUUID(),
            reason,
          }),
          method: "POST",
        },
      );
      toast.success(
        "Invoice revision created; the original remains unchanged.",
      );
      window.location.assign(`/invoices/${revised.id}`);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Invoice correction failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog onClose={onClose} open={open} title="Create correction">
      <form className="dialog-form" onSubmit={(event) => void submit(event)}>
        <p>
          Invoice corrections create an immutable revision. The original invoice
          remains unchanged in the audit trail.
        </p>
        {error === null ? null : <div className="form-alert">{error}</div>}
        <label>
          <span>Reason</span>
          <textarea minLength={5} name="reason" required />
        </label>
        <label>
          <span>Customer name</span>
          <input
            defaultValue={customerName}
            name="customerName"
            minLength={2}
          />
        </label>
        <div className="dialog-actions">
          <Button busy={busy} tone="primary">
            Create correction
          </Button>
          <Button onClick={onClose} tone="secondary" type="button">
            Cancel
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
