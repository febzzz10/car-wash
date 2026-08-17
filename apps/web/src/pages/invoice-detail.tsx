import { useRef, useState } from "react";
import { ArrowLeft, Download, Mail, Printer } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import {
  Button,
  Card,
  ErrorState,
  PageHeader,
  SkeletonRows,
  StatusBadge,
} from "../components/ui";
import { useToast } from "../components/toast";
import { useApiData } from "../hooks/use-api-data";
import { useMaskedPhone } from "../hooks/use-masked-phone";
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
  readonly customer_email_snapshot: string | null;
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
export default function InvoiceDetailPage() {
  const { id = "" } = useParams();
  const maskPhone = useMaskedPhone();
  const invoice = useApiData<InvoiceDetail>(`/invoices/${id}`);
  const toast = useToast();
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
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
  async function sendEmail() {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    try {
      await api(`/invoices/${id}/send-email`, {
        method: "POST",
        ...jsonBody({ idempotencyKey: crypto.randomUUID() }),
      });
      toast.success("Invoice PDF sent successfully.");
    } catch (failure) {
      toast.error(
        failure instanceof Error
          ? failure.message
          : "Unable to send invoice email.",
      );
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }
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
              <small>{maskPhone(item.customer_phone_snapshot)}</small>
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
                <strong>{money(line.total_minor, item.currency_code)}</strong>
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
            <p className="eyebrow">Send invoice</p>
            <p className="muted">
              Send the invoice PDF directly to the customer's email address.
            </p>
            <dl className="detail-list">
              <div>
                <dt>Customer email</dt>
                <dd>{invoice.data.customer_email_snapshot ?? "—"}</dd>
              </div>
            </dl>
            <Button
              onClick={() => void sendEmail()}
              busy={sending}
              disabled={invoice.data.customer_email_snapshot === null}
            >
              <Mail size={18} /> {sending ? "Sending…" : "Send Invoice PDF"}
            </Button>
            {invoice.data.customer_email_snapshot === null && (
              <p className="muted">
                No email address available for this customer.
              </p>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
