import { ApiError } from "../http/errors";
import { sha256 } from "../security/tokens";
import type { AuthContext } from "../types";
import { auditStatement } from "./audit";
import type {
  BuiltInvoiceEmail,
  GmailError as GmailErrorClass,
  InvoiceEmailInput,
  SendInvoiceEmailInput,
} from "./gmail";
import { checkRateLimit } from "./rate-limit";

export interface InvoiceEmailDeps {
  readonly GmailError: typeof GmailErrorClass;
  readonly buildInvoiceEmail: (input: InvoiceEmailInput) => BuiltInvoiceEmail;
  readonly isValidEmail: (value: string) => boolean;
  readonly sendInvoiceEmail: (
    env: Env,
    input: SendInvoiceEmailInput,
  ) => Promise<{ messageId: string; sentAt: string }>;
}

export type SendInvoiceEmailResult =
  | { readonly idempotentReplay: true; readonly invoiceId: string }
  | {
      readonly invoiceId: string;
      readonly invoiceNumber: string;
      readonly recipientEmail: string;
      readonly sentAt: string;
    };

interface InvoiceEmailRow {
  readonly business_name_snapshot: string;
  readonly currency_code: string;
  readonly customer_email_snapshot: string | null;
  readonly customer_id: string;
  readonly customer_name_snapshot: string;
  readonly id: string;
  readonly invoice_number: string;
  readonly invoice_snapshot_json: string;
  readonly payment_status_snapshot: string;
  readonly pdf_asset_id: string | null;
  readonly total_minor: number;
  readonly vehicle_registration_snapshot: string;
}

interface InvoicePdfAssetRow {
  readonly mime_type: string;
  readonly object_key: string;
}

export async function sendInvoiceEmailForInvoice(
  env: Env,
  auth: AuthContext,
  invoiceId: string,
  idempotencyKey: string,
  requestId: string,
  deps: InvoiceEmailDeps,
): Promise<SendInvoiceEmailResult> {
  const limit = Math.min(
    1000,
    Math.max(1, Number(env.INVOICE_EMAIL_RATE_LIMIT) || 60),
  );
  const { allowed } = await checkRateLimit(
    env,
    `invoice:email:v1:rate:${await sha256(auth.userId)}`,
    limit,
    3600,
    0,
  );
  if (!allowed)
    throw new ApiError(
      429,
      "RATE_LIMITED",
      "Too many invoice emails. Try again later.",
    );
  const replayId = await env.DB.prepare(
    "SELECT resource_id FROM idempotency_keys WHERE organization_id = ? AND operation_type = 'INVOICE_EMAIL_SEND' AND idempotency_key = ? AND state = 'COMPLETED'",
  )
    .bind(auth.organizationId, idempotencyKey)
    .first<string>("resource_id");
  if (replayId !== null) {
    if (replayId !== invoiceId)
      throw new ApiError(
        409,
        "IDEMPOTENCY_CONFLICT",
        "This idempotency key was already used for a different invoice.",
      );
    return { idempotentReplay: true, invoiceId: replayId };
  }
  const invoice = await env.DB.prepare(
    `SELECT i.id, i.invoice_number, i.business_name_snapshot,
      i.customer_name_snapshot, i.customer_email_snapshot,
      i.vehicle_registration_snapshot, i.payment_status_snapshot,
      i.total_minor, i.currency_code, i.invoice_snapshot_json,
      i.pdf_asset_id, w.customer_id
     FROM invoices i
     INNER JOIN wash_jobs w ON w.id = i.wash_job_id
     WHERE i.id = ? AND i.organization_id = ?`,
  )
    .bind(invoiceId, auth.organizationId)
    .first<InvoiceEmailRow>();
  if (invoice === null)
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Invoice not found.");
  const recipient = invoice.customer_email_snapshot?.trim() ?? "";
  if (recipient === "")
    throw new ApiError(
      422,
      "CUSTOMER_EMAIL_MISSING",
      "No email address available for this customer.",
    );
  if (!deps.isValidEmail(recipient))
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      "The customer email address is invalid.",
    );
  const asset = await env.DB.prepare(
    "SELECT object_key, mime_type FROM file_assets WHERE id = ? AND organization_id = ? AND upload_status = 'READY' AND asset_type = 'INVOICE_PDF'",
  )
    .bind(invoice.pdf_asset_id, auth.organizationId)
    .first<InvoicePdfAssetRow>();
  if (asset === null)
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Invoice PDF not found.");
  const object = await env.INVOICES.get(asset.object_key);
  if (object === null)
    throw new ApiError(
      503,
      "INVOICE_GENERATION_FAILED",
      "The invoice file is temporarily unavailable.",
    );
  const pdfBytes = new Uint8Array(await object.arrayBuffer());
  let snapshot: { readonly items?: readonly { readonly name?: string }[] };
  try {
    snapshot = JSON.parse(invoice.invoice_snapshot_json) as typeof snapshot;
  } catch {
    snapshot = {};
  }
  const built = deps.buildInvoiceEmail({
    attachmentBytes: pdfBytes,
    businessName: invoice.business_name_snapshot,
    currencyCode: invoice.currency_code,
    customerEmail: recipient,
    customerName: invoice.customer_name_snapshot,
    invoiceNumber: invoice.invoice_number,
    paymentStatus: invoice.payment_status_snapshot,
    serviceName: snapshot.items?.[0]?.name ?? "",
    totalMinor: invoice.total_minor,
    vehicleRegistration: invoice.vehicle_registration_snapshot,
  });
  let messageId: string;
  let sentAt: string;
  try {
    const result = await deps.sendInvoiceEmail(env, {
      attachmentBytes: pdfBytes,
      attachmentFilename: built.attachmentFilename,
      fromDisplayName: invoice.business_name_snapshot || "WashPro",
      subject: built.subject,
      text: built.text,
      to: recipient,
    });
    messageId = result.messageId;
    sentAt = result.sentAt;
  } catch (error) {
    if (error instanceof deps.GmailError) {
      if (error.code === "NOT_CONFIGURED")
        throw new ApiError(
          503,
          "EMAIL_NOT_CONFIGURED",
          "Invoice email is not configured. Contact support.",
        );
      if (error.code === "AUTH_FAILED")
        throw new ApiError(
          502,
          "EMAIL_SEND_FAILED",
          "The email service could not authenticate. Try again later.",
        );
      if (error.code === "RATE_LIMITED")
        throw new ApiError(
          502,
          "EMAIL_SEND_FAILED",
          "The email service is busy. Try again later.",
        );
    }
    throw new ApiError(
      502,
      "EMAIL_SEND_FAILED",
      "The invoice email could not be sent. Try again later.",
    );
  }
  const now = new Date();
  const expirySeconds = Math.max(
    3600,
    Number(env.INVOICE_EMAIL_IDEMPOTENCY_TTL_SECONDS) || 3600,
  );
  const expiresAt = new Date(
    now.getTime() + expirySeconds * 1000,
  ).toISOString();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO idempotency_keys (id, organization_id, user_id, idempotency_key, operation_type, request_hash, response_status, resource_type, resource_id, state, expires_at, created_at, completed_at) VALUES (?, ?, ?, ?, 'INVOICE_EMAIL_SEND', ?, 200, 'INVOICE', ?, 'COMPLETED', ?, ?, ?)",
    ).bind(
      crypto.randomUUID(),
      auth.organizationId,
      auth.userId,
      idempotencyKey,
      idempotencyKey,
      invoice.id,
      expiresAt,
      now.toISOString(),
      now.toISOString(),
    ),
    auditStatement(env, {
      action: "INVOICE_EMAIL_SENT",
      auth,
      next: {
        attachment: "PDF",
        channel: "EMAIL",
        customerId: invoice.customer_id,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        messageId,
        recipientEmail: recipient,
      },
      recordId: invoice.id,
      recordType: "INVOICE",
      requestId,
      severity: "INFO",
    }),
  ]);
  return {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoice_number,
    recipientEmail: recipient,
    sentAt,
  };
}
