import { Hono } from "hono";
import { z } from "zod";

import { ApiError } from "../http/errors";
import { requireAdmin, requirePermission } from "../middleware/auth";
import { auditStatement } from "../services/audit";
import {
  buildInvoiceEmail,
  GmailError,
  isValidEmail,
  sendInvoiceEmail,
} from "../services/gmail";
import {
  buildListCursor,
  parseListCursor,
  parseListLimit,
} from "../services/pagination";
import { maskPhoneSnapshotRow } from "../services/phone-masking";
import { sendInvoiceEmailForInvoice } from "../services/invoice-email";
import { buildWhatsAppMessage, buildWhatsAppUrl } from "../services/whatsapp";
import {
  buildInvoicePdf,
  type InvoiceLogo,
  type InvoicePdfSnapshot,
} from "../services/invoice-pdf";
import { loadSettings, stringSetting } from "../services/settings";
import type { AppBindings } from "../types";

const generateSchema = z.object({
  idempotencyKey: z.string().trim().min(16).max(128),
});
const emailSendSchema = z.object({
  idempotencyKey: z.string().trim().min(16).max(128),
});
const revisionSchema = z.object({
  customerAddress: z.string().trim().max(500).nullable().optional(),
  customerEmail: z.string().trim().email().max(254).nullable().optional(),
  customerName: z.string().trim().min(2).max(120).optional(),
  customerPhone: z.string().trim().min(7).max(24).optional(),
  footer: z.string().trim().max(2000).optional(),
  idempotencyKey: z.string().trim().min(16).max(128),
  reason: z.string().trim().min(5).max(500),
  terms: z.string().trim().max(5000).optional(),
  thankYouMessage: z.string().trim().max(1000).optional(),
  vehicleRegistration: z.string().trim().min(3).max(24).optional(),
});

interface InvoiceJobRow {
  readonly address_line_1: string | null;
  readonly address_line_2: string | null;
  readonly balance_minor: number;
  readonly branch_id: string;
  readonly business_email: string | null;
  readonly business_name: string;
  readonly business_phone: string | null;
  readonly business_whatsapp: string | null;
  readonly city: string | null;
  readonly completed_at: string | null;
  readonly coupon_discount_minor: number;
  readonly currency_code: string;
  readonly customer_address: string | null;
  readonly customer_email: string | null;
  readonly customer_name_snapshot: string;
  readonly customer_phone_snapshot: string;
  readonly id: string;
  readonly job_reference: string;
  readonly manual_discount_minor: number;
  readonly organization_id: string;
  readonly paid_amount_minor: number;
  readonly payment_status: string;
  readonly referral_code: string | null;
  readonly referral_discount_minor: number;
  readonly refunded_amount_minor: number;
  readonly reward_discount_minor: number;
  readonly rounding_minor: number;
  readonly staff_name: string;
  readonly started_at: string | null;
  readonly state: string | null;
  readonly status: string;
  readonly subtotal_minor: number;
  readonly tax_minor: number;
  readonly taxable_amount_minor: number;
  readonly total_active_seconds: number;
  readonly total_amount_minor: number;
  readonly total_discount_minor: number;
  readonly vehicle_make_snapshot: string | null;
  readonly vehicle_model_snapshot: string | null;
  readonly vehicle_registration_snapshot: string;
  readonly vehicle_type_name_snapshot: string;
}

interface JobItemRow {
  readonly discount_minor: number;
  readonly display_order: number;
  readonly id: string;
  readonly item_kind: "PRIMARY" | "ADD_ON";
  readonly line_subtotal_minor: number;
  readonly line_total_minor: number;
  readonly quantity: number;
  readonly service_code_snapshot: string | null;
  readonly service_name_snapshot: string;
  readonly tax_minor: number;
  readonly tax_rate_basis_points: number | null;
  readonly unit_price_minor: number;
}

interface InvoiceAssetRow {
  readonly invoice_number: string;
  readonly mime_type: string;
  readonly object_key: string;
}

interface WhatsAppInvoiceRow {
  readonly currency_code: string;
  readonly customer_name_snapshot: string;
  readonly customer_phone_snapshot: string;
  readonly invoice_snapshot_json: string;
  readonly payment_status_snapshot: string;
  readonly referral_code_snapshot: string | null;
  readonly total_minor: number;
  readonly vehicle_registration_snapshot: string;
}

interface RevisionInvoiceRow {
  readonly branch_id: string;
  readonly business_logo_asset_id: string | null;
  readonly id: string;
  readonly invoice_number: string;
  readonly invoice_snapshot_json: string;
  readonly revision_number: number;
  readonly wash_job_id: string;
}

interface RevisionItemRow {
  readonly description: string | null;
  readonly discount_minor: number;
  readonly display_order: number;
  readonly item_code: string | null;
  readonly item_kind: "PRIMARY" | "ADD_ON" | "ADJUSTMENT";
  readonly item_name: string;
  readonly quantity: number;
  readonly source_wash_job_item_id: string | null;
  readonly subtotal_minor: number;
  readonly tax_minor: number;
  readonly tax_rate_basis_points: number | null;
  readonly total_minor: number;
  readonly unit_price_minor: number;
}

export const invoiceJobRoutes = new Hono<AppBindings>();
export const invoiceRoutes = new Hono<AppBindings>();

invoiceJobRoutes.post(
  "/:id/invoice",
  requirePermission("invoices.generate"),
  async (c) => {
    const parsed = generateSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success)
      throw new ApiError(
        422,
        "VALIDATION_ERROR",
        "An invoice idempotency key is required.",
      );
    const auth = c.get("auth");
    const replayId = await c.env.DB.prepare(
      "SELECT resource_id FROM idempotency_keys WHERE organization_id = ? AND operation_type = 'INVOICE_GENERATE' AND idempotency_key = ? AND state = 'COMPLETED'",
    )
      .bind(auth.organizationId, parsed.data.idempotencyKey)
      .first<string>("resource_id");
    if (replayId !== null) {
      const existing = await c.env.DB.prepare(
        "SELECT * FROM invoices WHERE id = ? AND organization_id = ?",
      )
        .bind(replayId, auth.organizationId)
        .first<Record<string, unknown>>();
      if (existing !== null) {
        return c.json({
          data: { ...existing },
          idempotentReplay: true,
          success: true,
        });
      }
    }
    const existingForJob = await c.env.DB.prepare(
      "SELECT * FROM invoices WHERE wash_job_id = ? AND organization_id = ? AND revision_number = 0",
    )
      .bind(c.req.param("id"), auth.organizationId)
      .first<Record<string, unknown>>();
    if (existingForJob !== null) {
      return c.json({
        data: { ...existingForJob },
        idempotentReplay: true,
        success: true,
      });
    }

    const job = await c.env.DB.prepare(
      `SELECT w.*, o.display_name AS business_name,
      b.address_line_1, b.address_line_2, b.city, b.state,
      b.phone AS business_phone, b.whatsapp_number AS business_whatsapp,
      b.email AS business_email, c.email AS customer_email,
      c.address AS customer_address, u.full_name AS staff_name,
      rc.code AS referral_code
     FROM wash_jobs w
     INNER JOIN organizations o ON o.id = w.organization_id
     INNER JOIN branches b ON b.id = w.branch_id
     INNER JOIN customers c ON c.id = w.customer_id
     INNER JOIN users u ON u.id = w.assigned_user_id
     LEFT JOIN referral_codes rc ON rc.customer_id = w.customer_id
     WHERE w.id = ? AND w.organization_id = ?`,
    )
      .bind(c.req.param("id"), auth.organizationId)
      .first<InvoiceJobRow>();
    if (job === null)
      throw new ApiError(
        404,
        "RESOURCE_NOT_FOUND",
        "Completed wash job not found.",
      );
    if (job.status !== "COMPLETED")
      throw new ApiError(
        409,
        "INVALID_JOB_STATUS",
        "Complete the wash before issuing its invoice.",
      );
    const discountSum =
      job.coupon_discount_minor +
      job.referral_discount_minor +
      job.reward_discount_minor +
      job.manual_discount_minor;
    if (job.total_discount_minor !== discountSum)
      throw new ApiError(
        500,
        "DISCOUNT_RECONCILIATION_FAILED",
        "The wash job discount totals are inconsistent. Contact support.",
      );
    const [itemsResult, paymentsResult, settings] = await Promise.all([
      c.env.DB.prepare(
        "SELECT * FROM wash_job_items WHERE wash_job_id = ? ORDER BY display_order",
      )
        .bind(job.id)
        .all<JobItemRow>(),
      c.env.DB.prepare(
        "SELECT payment_method, amount_minor, tip_minor, paid_at, status FROM payments WHERE wash_job_id = ? AND organization_id = ? ORDER BY created_at",
      )
        .bind(job.id, auth.organizationId)
        .all<Record<string, unknown>>(),
      loadSettings(c.env, auth.organizationId, job.branch_id),
    ]);
    if (itemsResult.results.length === 0)
      throw new ApiError(
        503,
        "INVOICE_GENERATION_FAILED",
        "The invoice line-item snapshot is unavailable.",
      );

    const now = new Date();
    const year = now.getUTCFullYear();
    const current = await c.env.DB.prepare(
      "SELECT current_value FROM number_sequences WHERE organization_id = ? AND branch_id = ? AND sequence_type = 'INVOICE' AND sequence_year = ?",
    )
      .bind(auth.organizationId, job.branch_id, year)
      .first<number>("current_value");
    const next = (current ?? 0) + 1;
    const prefix =
      stringSetting(settings, "invoice.prefix", "WP")
        .replace(/[^A-Za-z0-9]/gu, "")
        .toUpperCase() || "WP";
    const invoiceNumber = `${prefix}-${year}-${String(next).padStart(6, "0")}`;
    const invoiceId = crypto.randomUUID();
    const pdfAssetId = crypto.randomUUID();
    const expirySeconds = Math.max(
      3600,
      Number(c.env.INVOICE_LINK_TTL_SECONDS) || 604_800,
    );
    const expiresAt = new Date(
      now.getTime() + expirySeconds * 1000,
    ).toISOString();
    const address = [
      job.address_line_1,
      job.address_line_2,
      job.city,
      job.state,
    ]
      .filter(Boolean)
      .join(", ");
    const contact = [job.business_phone, job.business_email]
      .filter(Boolean)
      .join(" | ");
    const paymentMethods = [
      ...new Set(
        paymentsResult.results
          .filter((payment) => payment.status === "SUCCESS")
          .map((payment) => String(payment.payment_method)),
      ),
    ];
    const tipMinor = paymentsResult.results
      .filter((payment) => payment.status === "SUCCESS")
      .reduce(
        (sum, payment) =>
          sum + (typeof payment.tip_minor === "number" ? payment.tip_minor : 0),
        0,
      );
    const snapshot: InvoicePdfSnapshot & {
      readonly jobReference: string;
      readonly payments: readonly Record<string, unknown>[];
    } = {
      balanceMinor: job.balance_minor,
      businessAddress: address,
      businessContact: contact,
      businessName: stringSetting(settings, "business.name", job.business_name),
      couponDiscountMinor: job.coupon_discount_minor,
      currencyCode: job.currency_code,
      customerName: job.customer_name_snapshot,
      customerPhone: job.customer_phone_snapshot,
      discountMinor: job.total_discount_minor,
      footer: stringSetting(
        settings,
        "invoice.footer",
        "Generated by WashPro.",
      ),
      invoiceNumber,
      issuedAt: now.toISOString(),
      items: itemsResult.results.map((item) => ({
        name: item.service_name_snapshot,
        quantity: item.quantity,
        totalMinor: item.line_total_minor,
        unitPriceMinor: item.unit_price_minor,
      })),
      jobReference: job.job_reference,
      manualDiscountMinor: job.manual_discount_minor,
      paidMinor: job.paid_amount_minor - job.refunded_amount_minor,
      paymentStatus: job.payment_status,
      payments: paymentsResult.results,
      referralCode: job.referral_code,
      referralDiscountMinor: job.referral_discount_minor,
      rewardDiscountMinor: job.reward_discount_minor,
      roundingMinor: job.rounding_minor,
      staffName: job.staff_name,
      subtotalMinor: job.subtotal_minor,
      taxMinor: job.tax_minor,
      tipMinor,
      taxRegistration:
        stringSetting(settings, "business.tax_number", "") || null,
      terms: stringSetting(
        settings,
        "invoice.terms",
        "Payment records are retained as append-only transactions.",
      ),
      thankYouMessage: stringSetting(
        settings,
        "invoice.thank_you_message",
        "Thank you for choosing WashPro.",
      ),
      totalMinor: job.total_amount_minor,
      vehicle: [
        job.vehicle_registration_snapshot,
        job.vehicle_type_name_snapshot,
        job.vehicle_make_snapshot,
        job.vehicle_model_snapshot,
      ]
        .filter(Boolean)
        .join(" - "),
      washCompletedAt: job.completed_at,
      washDurationSeconds: job.total_active_seconds,
      washStartedAt: job.started_at,
    };
    const logoAssetId =
      stringSetting(settings, "business.logo_asset_id", "") || null;
    let logo: InvoiceLogo | undefined;
    if (logoAssetId !== null) {
      const logoAsset = await c.env.DB.prepare(
        "SELECT object_key, mime_type FROM file_assets WHERE id = ? AND organization_id = ? AND asset_type = 'BUSINESS_LOGO' AND upload_status = 'READY'",
      )
        .bind(logoAssetId, auth.organizationId)
        .first<{ mime_type: string; object_key: string }>();
      if (
        logoAsset !== null &&
        (logoAsset.mime_type === "image/png" ||
          logoAsset.mime_type === "image/jpeg")
      ) {
        const object = await c.env.UPLOADS.get(logoAsset.object_key);
        if (object !== null)
          logo = {
            bytes: new Uint8Array(await object.arrayBuffer()),
            mimeType: logoAsset.mime_type,
          };
      }
    }
    let pdf: Uint8Array;
    try {
      pdf = await buildInvoicePdf(snapshot, logo);
    } catch {
      throw new ApiError(
        503,
        "INVOICE_GENERATION_FAILED",
        "The invoice PDF could not be rendered. Retry without creating a duplicate.",
      );
    }
    const objectKey = `${auth.organizationId}/${job.branch_id}/invoices/${year}/${invoiceNumber}-r0.pdf`;
    try {
      await c.env.INVOICES.put(objectKey, pdf, {
        customMetadata: { invoiceId, organizationId: auth.organizationId },
        httpMetadata: {
          contentDisposition: `attachment; filename="${invoiceNumber}.pdf"`,
          contentType: "application/pdf",
        },
      });
      const statements: D1PreparedStatement[] = [
        c.env.DB.prepare(
          `INSERT INTO number_sequences (organization_id, branch_id, sequence_type, sequence_year, current_value, updated_at) VALUES (?, ?, 'INVOICE', ?, ?, ?) ON CONFLICT (organization_id, branch_id, sequence_type, sequence_year) DO UPDATE SET current_value = excluded.current_value, updated_at = excluded.updated_at WHERE number_sequences.current_value = ?`,
        ).bind(
          auth.organizationId,
          job.branch_id,
          year,
          next,
          now.toISOString(),
          next - 1,
        ),
        c.env.DB.prepare(
          "INSERT INTO file_assets (id, organization_id, branch_id, bucket_name, object_key, original_filename, mime_type, size_bytes, asset_type, access_level, upload_status, uploaded_by_user_id, created_at, ready_at) VALUES (?, ?, ?, 'INVOICES', ?, ?, 'application/pdf', ?, 'INVOICE_PDF', 'TOKEN_PROTECTED', 'READY', ?, ?, ?)",
        ).bind(
          pdfAssetId,
          auth.organizationId,
          job.branch_id,
          objectKey,
          `${invoiceNumber}.pdf`,
          pdf.byteLength,
          auth.userId,
          now.toISOString(),
          now.toISOString(),
        ),
        c.env.DB.prepare(
          `INSERT INTO invoices (id, organization_id, branch_id, wash_job_id, invoice_number, revision_number, invoice_status, business_name_snapshot, business_logo_asset_id, business_address_snapshot, business_phone_snapshot, business_whatsapp_snapshot, business_email_snapshot, tax_registration_snapshot, customer_name_snapshot, customer_phone_snapshot, customer_email_snapshot, customer_address_snapshot, vehicle_registration_snapshot, vehicle_type_snapshot, vehicle_make_snapshot, vehicle_model_snapshot, wash_started_at_snapshot, wash_completed_at_snapshot, wash_duration_seconds_snapshot, staff_name_snapshot, subtotal_minor, discount_minor, taxable_amount_minor, tax_minor, rounding_minor, total_minor, paid_minor, balance_minor, currency_code, coupon_code_snapshot, referral_code_snapshot, referral_message_snapshot, payment_method_summary, payment_status_snapshot, thank_you_message_snapshot, terms_snapshot, footer_snapshot, invoice_snapshot_json, pdf_asset_id, public_access_token_hash, public_access_expires_at, issued_at, issued_by_user_id, created_at, coupon_discount_minor, referral_discount_minor, reward_discount_minor, manual_discount_minor) VALUES (?, ?, ?, ?, ?, 0, 'ISSUED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          invoiceId,
          auth.organizationId,
          job.branch_id,
          job.id,
          invoiceNumber,
          snapshot.businessName,
          logoAssetId,
          snapshot.businessAddress,
          job.business_phone,
          job.business_whatsapp,
          job.business_email,
          snapshot.taxRegistration,
          job.customer_name_snapshot,
          job.customer_phone_snapshot,
          job.customer_email,
          job.customer_address,
          job.vehicle_registration_snapshot,
          job.vehicle_type_name_snapshot,
          job.vehicle_make_snapshot,
          job.vehicle_model_snapshot,
          job.started_at,
          job.completed_at,
          job.total_active_seconds,
          job.staff_name,
          job.subtotal_minor,
          job.total_discount_minor,
          job.taxable_amount_minor,
          job.tax_minor,
          job.rounding_minor,
          job.total_amount_minor,
          snapshot.paidMinor,
          job.balance_minor,
          job.currency_code,
          job.referral_code,
          job.referral_code === null
            ? null
            : `Share code ${job.referral_code} with a friend.`,
          paymentMethods.join(", "),
          job.payment_status,
          snapshot.thankYouMessage,
          snapshot.terms,
          snapshot.footer,
          JSON.stringify(snapshot),
          pdfAssetId,
          null,
          null,
          now.toISOString(),
          auth.userId,
          now.toISOString(),
          job.coupon_discount_minor,
          job.referral_discount_minor,
          job.reward_discount_minor,
          job.manual_discount_minor,
        ),
        ...itemsResult.results.map((item) =>
          c.env.DB.prepare(
            "INSERT INTO invoice_items (id, invoice_id, source_wash_job_item_id, item_kind, item_code, item_name, quantity, unit_price_minor, subtotal_minor, discount_minor, tax_rate_basis_points, tax_minor, total_minor, display_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          ).bind(
            crypto.randomUUID(),
            invoiceId,
            item.id,
            item.item_kind,
            item.service_code_snapshot,
            item.service_name_snapshot,
            item.quantity,
            item.unit_price_minor,
            item.line_subtotal_minor,
            item.discount_minor,
            item.tax_rate_basis_points,
            item.tax_minor,
            item.line_total_minor,
            item.display_order,
          ),
        ),
        c.env.DB.prepare(
          "INSERT INTO idempotency_keys (id, organization_id, user_id, idempotency_key, operation_type, request_hash, response_status, resource_type, resource_id, state, expires_at, created_at, completed_at) VALUES (?, ?, ?, ?, 'INVOICE_GENERATE', ?, 201, 'INVOICE', ?, 'COMPLETED', ?, ?, ?)",
        ).bind(
          crypto.randomUUID(),
          auth.organizationId,
          auth.userId,
          parsed.data.idempotencyKey,
          parsed.data.idempotencyKey,
          invoiceId,
          expiresAt,
          now.toISOString(),
          now.toISOString(),
        ),
        auditStatement(c.env, {
          action: "INVOICE_ISSUED",
          auth,
          next: { invoiceId, invoiceNumber, revision: 0 },
          recordId: invoiceId,
          recordType: "INVOICE",
          requestId: c.get("requestId"),
          severity: "WARNING",
        }),
      ];
      await c.env.DB.batch(statements);
    } catch (error) {
      await c.env.INVOICES.delete(objectKey).catch(() => undefined);
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        503,
        "INVOICE_GENERATION_FAILED",
        "The invoice could not be saved. Retry without creating a duplicate.",
      );
    }
    const invoice = await c.env.DB.prepare(
      "SELECT * FROM invoices WHERE id = ?",
    )
      .bind(invoiceId)
      .first();
    return c.json(
      { data: maskPhoneSnapshotRow(invoice, auth.role), success: true },
      201,
    );
  },
);

invoiceRoutes.get("/", requirePermission("invoices.generate"), async (c) => {
  const auth = c.get("auth");
  const query = c.req.query("search")?.trim() ?? "";
  const search = `%${query}%`;
  const columns = `id, wash_job_id, invoice_number, revision_number, invoice_status, customer_name_snapshot, customer_phone_snapshot, vehicle_registration_snapshot, total_minor, paid_minor, balance_minor, payment_status_snapshot, issued_at, created_at`;
  const filters = `organization_id = ? AND (invoice_number LIKE ? OR customer_phone_snapshot LIKE ? OR vehicle_registration_snapshot LIKE ?)`;
  const baseParams = [auth.organizationId, search, search, search] as const;
  // Temporary rollout-compatibility path: the previously deployed Web
  // client calls this endpoint without limit/cursor and expects the legacy
  // bare-array shape. Remove once the new paginated Web is verified.
  if (
    c.req.query("limit") === undefined &&
    c.req.query("cursor") === undefined
  ) {
    const result = await c.env.DB.prepare(
      `SELECT ${columns}
       FROM invoices
       WHERE ${filters}
       ORDER BY created_at DESC LIMIT 250`,
    )
      .bind(...baseParams)
      .all();
    return c.json({
      data: result.results.map((invoice) =>
        maskPhoneSnapshotRow(invoice, auth.role),
      ),
      success: true,
    });
  }
  const limit = parseListLimit(c.req.query("limit"));
  const rawCursor = c.req.query("cursor");
  const cursor =
    rawCursor === undefined || rawCursor === ""
      ? undefined
      : parseListCursor(rawCursor);
  const result =
    cursor === undefined
      ? await c.env.DB.prepare(
          `SELECT ${columns}
           FROM invoices
           WHERE ${filters}
           ORDER BY created_at DESC, id DESC
           LIMIT ?`,
        )
          .bind(...baseParams, limit + 1)
          .all()
      : await c.env.DB.prepare(
          `SELECT ${columns}
           FROM invoices
           WHERE ${filters}
             AND (created_at < ? OR (created_at = ? AND id < ?))
           ORDER BY created_at DESC, id DESC
           LIMIT ?`,
        )
          .bind(
            ...baseParams,
            cursor.orderValue,
            cursor.orderValue,
            cursor.id,
            limit + 1,
          )
          .all();
  const rows = result.results;
  const hasNext = rows.length > limit;
  const pageRows = hasNext ? rows.slice(0, limit) : rows;
  const lastRow = pageRows[pageRows.length - 1];
  const nextCursor =
    hasNext && lastRow !== undefined
      ? buildListCursor(lastRow.created_at as string, lastRow.id as string)
      : null;
  return c.json({
    data: {
      invoices: pageRows.map((invoice) =>
        maskPhoneSnapshotRow(invoice, auth.role),
      ),
      pagination: { hasNext, limit, nextCursor },
    },
    success: true,
  });
});

invoiceRoutes.post(
  "/:id/revisions",
  requireAdmin,
  requirePermission("invoices.adjust"),
  async (c) => {
    const parsed = revisionSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success)
      throw new ApiError(
        422,
        "VALIDATION_ERROR",
        "Check the invoice correction and reason.",
      );
    const auth = c.get("auth");
    const replayId = await c.env.DB.prepare(
      "SELECT resource_id FROM idempotency_keys WHERE organization_id = ? AND operation_type = 'INVOICE_REVISION' AND idempotency_key = ? AND state = 'COMPLETED'",
    )
      .bind(auth.organizationId, parsed.data.idempotencyKey)
      .first<string>("resource_id");
    if (replayId !== null) {
      const replay = await c.env.DB.prepare(
        "SELECT * FROM invoices WHERE id = ? AND organization_id = ?",
      )
        .bind(replayId, auth.organizationId)
        .first();
      if (replay !== null)
        return c.json({ data: replay, idempotentReplay: true, success: true });
    }
    const previous = await c.env.DB.prepare(
      "SELECT id, branch_id, wash_job_id, invoice_number, revision_number, invoice_snapshot_json, business_logo_asset_id FROM invoices WHERE id = ? AND organization_id = ? AND invoice_status IN ('ISSUED', 'REVISED')",
    )
      .bind(c.req.param("id"), auth.organizationId)
      .first<RevisionInvoiceRow>();
    if (previous === null)
      throw new ApiError(
        404,
        "RESOURCE_NOT_FOUND",
        "Issued invoice not found.",
      );
    const latestRevision =
      (await c.env.DB.prepare(
        "SELECT COALESCE(MAX(revision_number), -1) AS revision FROM invoices WHERE wash_job_id = ? AND organization_id = ?",
      )
        .bind(previous.wash_job_id, auth.organizationId)
        .first<number>("revision")) ?? -1;
    if (previous.revision_number !== latestRevision)
      throw new ApiError(
        409,
        "RESOURCE_CONFLICT",
        "Create corrections from the latest invoice revision.",
      );
    let previousSnapshot: InvoicePdfSnapshot;
    try {
      previousSnapshot = JSON.parse(
        previous.invoice_snapshot_json,
      ) as InvoicePdfSnapshot;
    } catch {
      throw new ApiError(
        503,
        "INVOICE_GENERATION_FAILED",
        "The prior invoice snapshot is unavailable.",
      );
    }
    const revisionNumber = latestRevision + 1;
    const invoiceId = crypto.randomUUID();
    const pdfAssetId = crypto.randomUUID();
    const now = new Date();
    const expirySeconds = Math.max(
      3600,
      Number(c.env.INVOICE_LINK_TTL_SECONDS) || 604_800,
    );
    const expiresAt = new Date(
      now.getTime() + expirySeconds * 1000,
    ).toISOString();
    const snapshot: InvoicePdfSnapshot = {
      ...previousSnapshot,
      customerName: parsed.data.customerName ?? previousSnapshot.customerName,
      customerPhone:
        parsed.data.customerPhone ?? previousSnapshot.customerPhone,
      footer: parsed.data.footer ?? previousSnapshot.footer,
      invoiceNumber: `${previous.invoice_number} / R${revisionNumber}`,
      issuedAt: now.toISOString(),
      terms: parsed.data.terms ?? previousSnapshot.terms,
      thankYouMessage:
        parsed.data.thankYouMessage ?? previousSnapshot.thankYouMessage,
      vehicle: parsed.data.vehicleRegistration ?? previousSnapshot.vehicle,
    };
    let logo: InvoiceLogo | undefined;
    if (previous.business_logo_asset_id !== null) {
      const logoAsset = await c.env.DB.prepare(
        "SELECT object_key, mime_type FROM file_assets WHERE id = ? AND organization_id = ? AND asset_type = 'BUSINESS_LOGO' AND upload_status = 'READY'",
      )
        .bind(previous.business_logo_asset_id, auth.organizationId)
        .first<{ mime_type: string; object_key: string }>();
      if (
        logoAsset !== null &&
        (logoAsset.mime_type === "image/png" ||
          logoAsset.mime_type === "image/jpeg")
      ) {
        const object = await c.env.UPLOADS.get(logoAsset.object_key);
        if (object !== null)
          logo = {
            bytes: new Uint8Array(await object.arrayBuffer()),
            mimeType: logoAsset.mime_type,
          };
      }
    }
    const items = await c.env.DB.prepare(
      "SELECT source_wash_job_item_id, item_kind, item_code, item_name, description, quantity, unit_price_minor, subtotal_minor, discount_minor, tax_rate_basis_points, tax_minor, total_minor, display_order FROM invoice_items WHERE invoice_id = ? ORDER BY display_order",
    )
      .bind(previous.id)
      .all<RevisionItemRow>();
    let pdf: Uint8Array;
    try {
      pdf = await buildInvoicePdf(snapshot, logo);
    } catch {
      throw new ApiError(
        503,
        "INVOICE_GENERATION_FAILED",
        "The corrected invoice PDF could not be rendered.",
      );
    }
    const objectKey = `${auth.organizationId}/${previous.branch_id}/invoices/${now.getUTCFullYear()}/${previous.invoice_number}-r${revisionNumber}.pdf`;
    try {
      await c.env.INVOICES.put(objectKey, pdf, {
        customMetadata: { invoiceId, organizationId: auth.organizationId },
        httpMetadata: {
          contentDisposition: `attachment; filename="${previous.invoice_number}-r${revisionNumber}.pdf"`,
          contentType: "application/pdf",
        },
      });
      await c.env.DB.batch([
        c.env.DB.prepare(
          "INSERT INTO file_assets (id, organization_id, branch_id, bucket_name, object_key, original_filename, mime_type, size_bytes, asset_type, access_level, upload_status, uploaded_by_user_id, created_at, ready_at) VALUES (?, ?, ?, 'INVOICES', ?, ?, 'application/pdf', ?, 'INVOICE_PDF', 'TOKEN_PROTECTED', 'READY', ?, ?, ?)",
        ).bind(
          pdfAssetId,
          auth.organizationId,
          previous.branch_id,
          objectKey,
          `${previous.invoice_number}-r${revisionNumber}.pdf`,
          pdf.byteLength,
          auth.userId,
          now.toISOString(),
          now.toISOString(),
        ),
        c.env.DB.prepare(
          `INSERT INTO invoices (
        id, organization_id, branch_id, wash_job_id, invoice_number, revision_number,
        invoice_status, business_name_snapshot, business_logo_asset_id,
        business_address_snapshot, business_phone_snapshot, business_whatsapp_snapshot,
        business_email_snapshot, tax_registration_snapshot, customer_name_snapshot,
        customer_phone_snapshot, customer_email_snapshot, customer_address_snapshot,
        vehicle_registration_snapshot, vehicle_type_snapshot, vehicle_make_snapshot,
        vehicle_model_snapshot, wash_started_at_snapshot, wash_completed_at_snapshot,
        wash_duration_seconds_snapshot, staff_name_snapshot, subtotal_minor, discount_minor,
        taxable_amount_minor, tax_minor, rounding_minor, total_minor, paid_minor,
        balance_minor, currency_code, coupon_code_snapshot, referral_code_snapshot,
        referral_message_snapshot, payment_method_summary, payment_status_snapshot,
        thank_you_message_snapshot, terms_snapshot, footer_snapshot, invoice_snapshot_json,
        pdf_asset_id, public_access_token_hash, public_access_expires_at, issued_at,
        issued_by_user_id, revised_from_invoice_id, created_at,
        coupon_discount_minor, referral_discount_minor, reward_discount_minor, manual_discount_minor
      ) SELECT ?, organization_id, branch_id, wash_job_id, invoice_number, ?,
        'ISSUED', business_name_snapshot, business_logo_asset_id,
        business_address_snapshot, business_phone_snapshot, business_whatsapp_snapshot,
        business_email_snapshot, tax_registration_snapshot, COALESCE(?, customer_name_snapshot),
        COALESCE(?, customer_phone_snapshot),
        CASE WHEN ? = 1 THEN ? ELSE customer_email_snapshot END,
        CASE WHEN ? = 1 THEN ? ELSE customer_address_snapshot END,
        COALESCE(?, vehicle_registration_snapshot), vehicle_type_snapshot, vehicle_make_snapshot,
        vehicle_model_snapshot, wash_started_at_snapshot, wash_completed_at_snapshot,
        wash_duration_seconds_snapshot, staff_name_snapshot, subtotal_minor, discount_minor,
        taxable_amount_minor, tax_minor, rounding_minor, total_minor, paid_minor,
        balance_minor, currency_code, coupon_code_snapshot, referral_code_snapshot,
        referral_message_snapshot, payment_method_summary, payment_status_snapshot,
        COALESCE(?, thank_you_message_snapshot), COALESCE(?, terms_snapshot),
        COALESCE(?, footer_snapshot), ?, ?, ?, ?, ?, ?, id, ?,
        coupon_discount_minor, referral_discount_minor, reward_discount_minor, manual_discount_minor
      FROM invoices WHERE id = ? AND organization_id = ?`,
        ).bind(
          invoiceId,
          revisionNumber,
          parsed.data.customerName ?? null,
          parsed.data.customerPhone ?? null,
          parsed.data.customerEmail === undefined ? 0 : 1,
          parsed.data.customerEmail ?? null,
          parsed.data.customerAddress === undefined ? 0 : 1,
          parsed.data.customerAddress ?? null,
          parsed.data.vehicleRegistration ?? null,
          parsed.data.thankYouMessage ?? null,
          parsed.data.terms ?? null,
          parsed.data.footer ?? null,
          JSON.stringify(snapshot),
          pdfAssetId,
          null,
          null,
          now.toISOString(),
          auth.userId,
          now.toISOString(),
          previous.id,
          auth.organizationId,
        ),
        ...items.results.map((item) =>
          c.env.DB.prepare(
            "INSERT INTO invoice_items (id, invoice_id, source_wash_job_item_id, item_kind, item_code, item_name, description, quantity, unit_price_minor, subtotal_minor, discount_minor, tax_rate_basis_points, tax_minor, total_minor, display_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          ).bind(
            crypto.randomUUID(),
            invoiceId,
            item.source_wash_job_item_id,
            item.item_kind,
            item.item_code,
            item.item_name,
            item.description,
            item.quantity,
            item.unit_price_minor,
            item.subtotal_minor,
            item.discount_minor,
            item.tax_rate_basis_points,
            item.tax_minor,
            item.total_minor,
            item.display_order,
          ),
        ),
        c.env.DB.prepare(
          "INSERT INTO idempotency_keys (id, organization_id, user_id, idempotency_key, operation_type, request_hash, response_status, resource_type, resource_id, state, expires_at, created_at, completed_at) VALUES (?, ?, ?, ?, 'INVOICE_REVISION', ?, 201, 'INVOICE', ?, 'COMPLETED', ?, ?, ?)",
        ).bind(
          crypto.randomUUID(),
          auth.organizationId,
          auth.userId,
          parsed.data.idempotencyKey,
          parsed.data.idempotencyKey,
          invoiceId,
          expiresAt,
          now.toISOString(),
          now.toISOString(),
        ),
        auditStatement(c.env, {
          action: "INVOICE_REVISED",
          auth,
          next: {
            invoiceId,
            invoiceNumber: previous.invoice_number,
            revisionNumber,
          },
          previous: {
            invoiceId: previous.id,
            revisionNumber: previous.revision_number,
          },
          reason: parsed.data.reason,
          recordId: invoiceId,
          recordType: "INVOICE",
          requestId: c.get("requestId"),
          severity: "CRITICAL",
        }),
      ]);
    } catch (error) {
      await c.env.INVOICES.delete(objectKey).catch(() => undefined);
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        503,
        "INVOICE_GENERATION_FAILED",
        "The corrected invoice could not be stored. Retry without creating a duplicate.",
      );
    }
    const revised = await c.env.DB.prepare(
      "SELECT * FROM invoices WHERE id = ?",
    )
      .bind(invoiceId)
      .first<Record<string, unknown>>();
    return c.json(
      {
        data: revised ?? { id: invoiceId },
        success: true,
      },
      201,
    );
  },
);

function isValidMinorAmount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    Number.isInteger(value)
  );
}

invoiceRoutes.get("/:id", requirePermission("invoices.generate"), async (c) => {
  const auth = c.get("auth");
  const invoice = await c.env.DB.prepare(
    "SELECT * FROM invoices WHERE id = ? AND organization_id = ?",
  )
    .bind(c.req.param("id"), auth.organizationId)
    .first<Record<string, unknown>>();
  if (invoice === null)
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Invoice not found.");
  const hasCategorizedDiscounts =
    (Number(invoice.coupon_discount_minor) ?? 0) > 0 ||
    (Number(invoice.referral_discount_minor) ?? 0) > 0 ||
    (Number(invoice.reward_discount_minor) ?? 0) > 0 ||
    (Number(invoice.manual_discount_minor) ?? 0) > 0;
  if (!hasCategorizedDiscounts && (Number(invoice.discount_minor) ?? 0) > 0) {
    if (typeof invoice.invoice_snapshot_json === "string") {
      try {
        const snap = JSON.parse(invoice.invoice_snapshot_json) as Record<
          string,
          unknown
        >;
        const coupon = snap.couponDiscountMinor;
        const referral = snap.referralDiscountMinor;
        const reward = snap.rewardDiscountMinor;
        const manual = snap.manualDiscountMinor;
        if (
          isValidMinorAmount(coupon) &&
          isValidMinorAmount(referral) &&
          isValidMinorAmount(reward) &&
          isValidMinorAmount(manual) &&
          coupon + referral + reward + manual === Number(invoice.discount_minor)
        ) {
          invoice.coupon_discount_minor = coupon;
          invoice.referral_discount_minor = referral;
          invoice.reward_discount_minor = reward;
          invoice.manual_discount_minor = manual;
        }
      } catch {
        /* skip invalid JSON */
      }
    }
  }
  const items = await c.env.DB.prepare(
    "SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY display_order",
  )
    .bind(c.req.param("id"))
    .all();
  return c.json({
    data: { ...maskPhoneSnapshotRow(invoice, auth.role), items: items.results },
    success: true,
  });
});

invoiceRoutes.get(
  "/:id/pdf",
  requirePermission("invoices.generate"),
  async (c) => {
    const auth = c.get("auth");
    const asset = await c.env.DB.prepare(
      "SELECT i.invoice_number, fa.object_key, fa.mime_type FROM invoices i INNER JOIN file_assets fa ON fa.id = i.pdf_asset_id WHERE i.id = ? AND i.organization_id = ? AND fa.upload_status = 'READY'",
    )
      .bind(c.req.param("id"), auth.organizationId)
      .first<InvoiceAssetRow>();
    if (asset === null)
      throw new ApiError(404, "RESOURCE_NOT_FOUND", "Invoice PDF not found.");
    const object = await c.env.INVOICES.get(asset.object_key);
    if (object === null)
      throw new ApiError(
        503,
        "INVOICE_GENERATION_FAILED",
        "The invoice file is temporarily unavailable.",
      );
    c.header(
      "content-disposition",
      `attachment; filename="${asset.invoice_number}.pdf"`,
    );
    c.header("content-type", "application/pdf");
    return c.body(await object.arrayBuffer());
  },
);

invoiceRoutes.post(
  "/:id/send-email",
  requirePermission("invoices.send"),
  async (c) => {
    const parsed = emailSendSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success)
      throw new ApiError(
        422,
        "VALIDATION_ERROR",
        "An idempotency key is required.",
      );
    const data = await sendInvoiceEmailForInvoice(
      c.env,
      c.get("auth"),
      c.req.param("id"),
      parsed.data.idempotencyKey,
      c.get("requestId"),
      { GmailError, buildInvoiceEmail, isValidEmail, sendInvoiceEmail },
    );
    return c.json({ data, success: true });
  },
);

invoiceRoutes.get(
  "/:id/whatsapp-action",
  requirePermission("invoices.send"),
  async (c) => {
    const auth = c.get("auth");
    const invoice = await c.env.DB.prepare(
      `SELECT customer_name_snapshot, customer_phone_snapshot,
        payment_status_snapshot, referral_code_snapshot,
        vehicle_registration_snapshot, total_minor, currency_code,
        invoice_snapshot_json
       FROM invoices WHERE id = ? AND organization_id = ?`,
    )
      .bind(c.req.param("id"), auth.organizationId)
      .first<WhatsAppInvoiceRow>();
    if (invoice === null)
      throw new ApiError(404, "RESOURCE_NOT_FOUND", "Invoice not found.");
    let snapshot: { readonly items?: readonly { readonly name?: string }[] };
    try {
      snapshot = JSON.parse(invoice.invoice_snapshot_json) as typeof snapshot;
    } catch {
      snapshot = {};
    }
    const message = buildWhatsAppMessage({
      currencyCode: invoice.currency_code,
      customerName: invoice.customer_name_snapshot,
      paymentStatus: invoice.payment_status_snapshot,
      referralCode: invoice.referral_code_snapshot,
      serviceName: snapshot.items?.[0]?.name ?? "",
      totalMinor: invoice.total_minor,
      vehicleRegistration: invoice.vehicle_registration_snapshot,
    });
    const whatsappUrl = buildWhatsAppUrl(
      invoice.customer_phone_snapshot,
      message,
    );
    return c.json({ data: { whatsappUrl }, success: true });
  },
);
