import { Hono, type Context } from "hono";
import { z } from "zod";

import { ApiError } from "../http/errors";
import { requirePermission } from "../middleware/auth";
import { auditStatement } from "../services/audit";
import type { AppBindings } from "../types";

const paymentMethods = [
  "CASH",
  "UPI",
  "CARD",
  "BANK_TRANSFER",
  "OTHER",
] as const;
const expenseSchema = z.object({
  amountMinor: z.number().int().positive(),
  categoryId: z.string().min(8).max(64),
  description: z.string().trim().max(2000).optional(),
  expenseDate: z.iso.date(),
  idempotencyKey: z.string().trim().min(16).max(128),
  paymentMethod: z.enum(paymentMethods).optional(),
  receiptAssetId: z.string().min(8).max(64).optional(),
  title: z.string().trim().min(2).max(160),
});
const expensePatchSchema = expenseSchema
  .omit({ idempotencyKey: true })
  .partial()
  .extend({ version: z.number().int().positive() });
const cancelSchema = z.object({
  reason: z.string().trim().min(5).max(500),
  version: z.number().int().positive(),
});
const categorySchema = z.object({
  code: z.string().trim().min(2).max(40),
  displayOrder: z.number().int().default(0),
  name: z.string().trim().min(2).max(100),
});

export const expenseRoutes = new Hono<AppBindings>();
export const expenseCategoryRoutes = new Hono<AppBindings>();
const canCreateExpense = requirePermission("expenses.create");

expenseRoutes.get("/", requirePermission("expenses.read"), async (c) => {
  const auth = c.get("auth");
  const from = c.req.query("from") ?? "0000-01-01";
  const to = c.req.query("to") ?? "9999-12-31";
  const categoryId = c.req.query("categoryId");
  const result = await c.env.DB.prepare(
    `SELECT e.*, ec.name AS category_name, u.full_name AS recorded_by_name FROM expenses e INNER JOIN expense_categories ec ON ec.id = e.category_id INNER JOIN users u ON u.id = e.recorded_by_user_id WHERE e.organization_id = ? AND e.branch_id = ? AND e.expense_date BETWEEN ? AND ? AND (? IS NULL OR e.category_id = ?) ORDER BY e.expense_date DESC, e.created_at DESC LIMIT 500`,
  )
    .bind(
      auth.organizationId,
      auth.branchId,
      from,
      to,
      categoryId ?? null,
      categoryId ?? null,
    )
    .all();
  return c.json({ data: result.results, success: true });
});

expenseRoutes.post(
  "/",
  canCreateExpense,
  async (c: Context<AppBindings>): Promise<Response> => {
    const parsed = expenseSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success)
      throw new ApiError(422, "VALIDATION_ERROR", "Check the expense details.");
    const auth = c.get("auth");
    if (auth.branchId === null)
      throw new ApiError(422, "VALIDATION_ERROR", "Select a branch.");
    const replayId = await c.env.DB.prepare(
      "SELECT resource_id FROM idempotency_keys WHERE organization_id = ? AND operation_type = 'EXPENSE_CREATE' AND idempotency_key = ? AND state = 'COMPLETED'",
    )
      .bind(auth.organizationId, parsed.data.idempotencyKey)
      .first<string>("resource_id");
    if (replayId !== null) {
      const existing = await c.env.DB.prepare(
        "SELECT * FROM expenses WHERE id = ? AND organization_id = ?",
      )
        .bind(replayId, auth.organizationId)
        .first();
      if (existing !== null)
        return c.json({
          data: existing,
          idempotentReplay: true,
          success: true,
        });
    }
    const category = await c.env.DB.prepare(
      "SELECT 1 FROM expense_categories WHERE id = ? AND organization_id = ? AND is_active = 1",
    )
      .bind(parsed.data.categoryId, auth.organizationId)
      .first();
    if (category === null)
      throw new ApiError(
        422,
        "VALIDATION_ERROR",
        "Select an active expense category.",
      );
    if (parsed.data.receiptAssetId !== undefined) {
      const asset = await c.env.DB.prepare(
        "SELECT 1 FROM file_assets WHERE id = ? AND organization_id = ? AND asset_type = 'EXPENSE_RECEIPT' AND access_level = 'PRIVATE' AND upload_status = 'READY'",
      )
        .bind(parsed.data.receiptAssetId, auth.organizationId)
        .first();
      if (asset === null)
        throw new ApiError(
          422,
          "VALIDATION_ERROR",
          "The receipt upload is unavailable.",
        );
    }
    const id = crypto.randomUUID();
    const year = Number(parsed.data.expenseDate.slice(0, 4));
    const current = await c.env.DB.prepare(
      "SELECT current_value FROM number_sequences WHERE organization_id = ? AND branch_id = ? AND sequence_type = 'EXPENSE' AND sequence_year = ?",
    )
      .bind(auth.organizationId, auth.branchId, year)
      .first<number>("current_value");
    const next = (current ?? 0) + 1;
    const reference = `EXP-${year}-${String(next).padStart(6, "0")}`;
    const now = new Date().toISOString();
    const statements: D1PreparedStatement[] = [
      c.env.DB.prepare(
        `INSERT INTO number_sequences (organization_id, branch_id, sequence_type, sequence_year, current_value, updated_at) VALUES (?, ?, 'EXPENSE', ?, ?, ?) ON CONFLICT (organization_id, branch_id, sequence_type, sequence_year) DO UPDATE SET current_value = excluded.current_value, updated_at = excluded.updated_at WHERE number_sequences.current_value = ?`,
      ).bind(auth.organizationId, auth.branchId, year, next, now, next - 1),
      c.env.DB.prepare(
        "INSERT INTO expenses (id, organization_id, branch_id, expense_reference, category_id, title, amount_minor, expense_date, payment_method, description, status, recorded_by_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)",
      ).bind(
        id,
        auth.organizationId,
        auth.branchId,
        reference,
        parsed.data.categoryId,
        parsed.data.title,
        parsed.data.amountMinor,
        parsed.data.expenseDate,
        parsed.data.paymentMethod ?? null,
        parsed.data.description ?? null,
        auth.userId,
        now,
        now,
      ),
      c.env.DB.prepare(
        "INSERT INTO idempotency_keys (id, organization_id, user_id, idempotency_key, operation_type, request_hash, response_status, resource_type, resource_id, state, expires_at, created_at, completed_at) VALUES (?, ?, ?, ?, 'EXPENSE_CREATE', ?, 201, 'EXPENSE', ?, 'COMPLETED', ?, ?, ?)",
      ).bind(
        crypto.randomUUID(),
        auth.organizationId,
        auth.userId,
        parsed.data.idempotencyKey,
        parsed.data.idempotencyKey,
        id,
        new Date(Date.parse(now) + 86_400_000).toISOString(),
        now,
        now,
      ),
      auditStatement(c.env, {
        action: "EXPENSE_CREATED",
        auth,
        next: { ...parsed.data, id, reference },
        recordId: id,
        recordType: "EXPENSE",
        requestId: c.get("requestId"),
      }),
    ];
    if (parsed.data.receiptAssetId !== undefined)
      statements.push(
        c.env.DB.prepare(
          "INSERT INTO expense_attachments (id, expense_id, file_asset_id, attachment_type, created_at) VALUES (?, ?, ?, 'RECEIPT', ?)",
        ).bind(crypto.randomUUID(), id, parsed.data.receiptAssetId, now),
      );
    await c.env.DB.batch(statements);
    return c.json(
      {
        data: await c.env.DB.prepare("SELECT * FROM expenses WHERE id = ?")
          .bind(id)
          .first(),
        success: true,
      },
      201,
    );
  },
);

expenseRoutes.get("/:id", requirePermission("expenses.read"), async (c) => {
  const auth = c.get("auth");
  const expense = await c.env.DB.prepare(
    "SELECT * FROM expenses WHERE id = ? AND organization_id = ?",
  )
    .bind(c.req.param("id"), auth.organizationId)
    .first();
  if (expense === null)
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Expense not found.");
  const attachments = await c.env.DB.prepare(
    "SELECT ea.*, fa.mime_type, fa.size_bytes FROM expense_attachments ea INNER JOIN file_assets fa ON fa.id = ea.file_asset_id WHERE ea.expense_id = ?",
  )
    .bind(c.req.param("id"))
    .all();
  return c.json({
    data: { ...expense, attachments: attachments.results },
    success: true,
  });
});

expenseRoutes.patch("/:id", requirePermission("expenses.update"), async (c) => {
  const parsed = expensePatchSchema.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!parsed.success)
    throw new ApiError(422, "VALIDATION_ERROR", "Check the expense changes.");
  const auth = c.get("auth");
  const previous = await c.env.DB.prepare(
    "SELECT * FROM expenses WHERE id = ? AND organization_id = ?",
  )
    .bind(c.req.param("id"), auth.organizationId)
    .first<Record<string, unknown>>();
  if (previous === null)
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Expense not found.");
  if (previous.status !== "ACTIVE")
    throw new ApiError(
      409,
      "RESOURCE_CONFLICT",
      "Cancelled expenses cannot be edited.",
    );
  const result = await c.env.DB.prepare(
    `UPDATE expenses SET category_id = COALESCE(?, category_id), title = COALESCE(?, title), amount_minor = COALESCE(?, amount_minor), expense_date = COALESCE(?, expense_date), payment_method = CASE WHEN ? = 1 THEN ? ELSE payment_method END, description = CASE WHEN ? = 1 THEN ? ELSE description END, updated_at = ?, version = version + 1 WHERE id = ? AND organization_id = ? AND version = ? AND status = 'ACTIVE'`,
  )
    .bind(
      parsed.data.categoryId ?? null,
      parsed.data.title ?? null,
      parsed.data.amountMinor ?? null,
      parsed.data.expenseDate ?? null,
      parsed.data.paymentMethod === undefined ? 0 : 1,
      parsed.data.paymentMethod ?? null,
      parsed.data.description === undefined ? 0 : 1,
      parsed.data.description ?? null,
      new Date().toISOString(),
      c.req.param("id"),
      auth.organizationId,
      parsed.data.version,
    )
    .run();
  if (result.meta.changes === 0)
    throw new ApiError(
      409,
      "RESOURCE_CONFLICT",
      "The expense changed on another device.",
    );
  const updated = await c.env.DB.prepare("SELECT * FROM expenses WHERE id = ?")
    .bind(c.req.param("id"))
    .first();
  await auditStatement(c.env, {
    action: "EXPENSE_UPDATED",
    auth,
    next: updated,
    previous,
    recordId: c.req.param("id"),
    recordType: "EXPENSE",
    requestId: c.get("requestId"),
    severity: "WARNING",
  }).run();
  return c.json({ data: updated, success: true });
});

expenseRoutes.post(
  "/:id/cancel",
  requirePermission("expenses.cancel"),
  async (c) => {
    const parsed = cancelSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      throw new ApiError(
        422,
        "VALIDATION_ERROR",
        "A cancellation reason and current version are required.",
      );
    const auth = c.get("auth");
    const now = new Date().toISOString();
    const result = await c.env.DB.prepare(
      "UPDATE expenses SET status = 'CANCELLED', cancelled_by_user_id = ?, cancelled_at = ?, cancellation_reason = ?, updated_at = ?, version = version + 1 WHERE id = ? AND organization_id = ? AND version = ? AND status = 'ACTIVE'",
    )
      .bind(
        auth.userId,
        now,
        parsed.data.reason,
        now,
        c.req.param("id"),
        auth.organizationId,
        parsed.data.version,
      )
      .run();
    if (result.meta.changes === 0)
      throw new ApiError(
        409,
        "RESOURCE_CONFLICT",
        "The expense could not be cancelled.",
      );
    await auditStatement(c.env, {
      action: "EXPENSE_CANCELLED",
      auth,
      reason: parsed.data.reason,
      recordId: c.req.param("id"),
      recordType: "EXPENSE",
      requestId: c.get("requestId"),
      severity: "CRITICAL",
    }).run();
    return c.json({
      data: await c.env.DB.prepare("SELECT * FROM expenses WHERE id = ?")
        .bind(c.req.param("id"))
        .first(),
      success: true,
    });
  },
);

expenseCategoryRoutes.get(
  "/",
  requirePermission("expenses.read"),
  async (c) => {
    const auth = c.get("auth");
    const result = await c.env.DB.prepare(
      "SELECT * FROM expense_categories WHERE organization_id = ? ORDER BY display_order, name",
    )
      .bind(auth.organizationId)
      .all();
    return c.json({ data: result.results, success: true });
  },
);

expenseCategoryRoutes.post(
  "/",
  requirePermission("settings.manage"),
  async (c) => {
    const parsed = categorySchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success)
      throw new ApiError(
        422,
        "VALIDATION_ERROR",
        "Check the category details.",
      );
    const auth = c.get("auth");
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const next = {
      code: parsed.data.code.toUpperCase().replace(/[^A-Z0-9]+/gu, "_"),
      displayOrder: parsed.data.displayOrder,
      id,
      name: parsed.data.name,
    };
    await c.env.DB.batch([
      c.env.DB.prepare(
        "INSERT INTO expense_categories (id, organization_id, code, name, display_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).bind(
        id,
        auth.organizationId,
        next.code,
        next.name,
        next.displayOrder,
        now,
        now,
      ),
      auditStatement(c.env, {
        action: "EXPENSE_CATEGORY_CREATED",
        auth,
        next,
        recordId: id,
        recordType: "EXPENSE_CATEGORY",
        requestId: c.get("requestId"),
        severity: "WARNING",
      }),
    ]);
    return c.json(
      {
        data: await c.env.DB.prepare(
          "SELECT * FROM expense_categories WHERE id = ?",
        )
          .bind(id)
          .first(),
        success: true,
      },
      201,
    );
  },
);

expenseCategoryRoutes.patch(
  "/:id",
  requirePermission("settings.manage"),
  async (c) => {
    const parsed = categorySchema
      .partial()
      .extend({ isActive: z.boolean().optional() })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      throw new ApiError(
        422,
        "VALIDATION_ERROR",
        "Check the category details.",
      );
    const auth = c.get("auth");
    const previous = await c.env.DB.prepare(
      "SELECT * FROM expense_categories WHERE id = ? AND organization_id = ?",
    )
      .bind(c.req.param("id"), auth.organizationId)
      .first<Record<string, unknown>>();
    if (previous === null)
      throw new ApiError(404, "RESOURCE_NOT_FOUND", "Category not found.");
    const results = await c.env.DB.batch([
      c.env.DB.prepare(
        "UPDATE expense_categories SET code = COALESCE(?, code), name = COALESCE(?, name), display_order = COALESCE(?, display_order), is_active = COALESCE(?, is_active), updated_at = ? WHERE id = ? AND organization_id = ?",
      ).bind(
        parsed.data.code?.toUpperCase().replace(/[^A-Z0-9]+/gu, "_") ?? null,
        parsed.data.name ?? null,
        parsed.data.displayOrder ?? null,
        parsed.data.isActive === undefined
          ? null
          : parsed.data.isActive
            ? 1
            : 0,
        new Date().toISOString(),
        c.req.param("id"),
        auth.organizationId,
      ),
      auditStatement(c.env, {
        action: "EXPENSE_CATEGORY_UPDATED",
        auth,
        next: parsed.data,
        previous,
        recordId: c.req.param("id"),
        recordType: "EXPENSE_CATEGORY",
        requestId: c.get("requestId"),
        severity: "WARNING",
      }),
    ]);
    if (results[0]?.meta.changes === 0)
      throw new ApiError(404, "RESOURCE_NOT_FOUND", "Category not found.");
    return c.json({
      data: await c.env.DB.prepare(
        "SELECT * FROM expense_categories WHERE id = ?",
      )
        .bind(c.req.param("id"))
        .first(),
      success: true,
    });
  },
);
