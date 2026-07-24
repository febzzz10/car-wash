import { Hono } from "hono";
import { z } from "zod";

import { ApiError } from "../http/errors";
import { requireAdmin, requirePermission } from "../middleware/auth";
import { auditStatement } from "../services/audit";
import type { AppBindings } from "../types";

const codePatchSchema = z.object({
  expiresAt: z.iso.datetime({ offset: true }).nullable().optional(),
  status: z.enum(["ACTIVE", "DISABLED", "EXPIRED"]).optional(),
});
const adjustmentSchema = z.object({
  amountMinor: z.number().int().positive(),
  reason: z.string().trim().min(5).max(500),
});
const cancelSchema = z.object({ reason: z.string().trim().min(5).max(500) });

export const referralRoutes = new Hono<AppBindings>();
referralRoutes.use("*", requireAdmin, requirePermission("referrals.manage"));

referralRoutes.get("/", async (c) => {
  const auth = c.get("auth");
  const [codes, redemptions, rewards, ledger] = await Promise.all([
    c.env.DB.prepare(
      `SELECT rc.*, c.full_name AS customer_name, c.phone AS customer_phone
      FROM referral_codes rc INNER JOIN customers c ON c.id = rc.customer_id
      WHERE rc.organization_id = ? ORDER BY rc.created_at DESC LIMIT 500`,
    )
      .bind(auth.organizationId)
      .all(),
    c.env.DB.prepare(
      `SELECT rr.*, referrer.full_name AS referrer_name,
      referred.full_name AS referred_name, w.job_reference
      FROM referral_redemptions rr
      INNER JOIN customers referrer ON referrer.id = rr.referring_customer_id
      INNER JOIN customers referred ON referred.id = rr.referred_customer_id
      INNER JOIN wash_jobs w ON w.id = rr.referred_wash_job_id
      WHERE rr.organization_id = ? ORDER BY rr.created_at DESC LIMIT 500`,
    )
      .bind(auth.organizationId)
      .all(),
    c.env.DB.prepare(
      `SELECT rw.*, c.full_name AS customer_name
      FROM referral_rewards rw INNER JOIN customers c ON c.id = rw.customer_id
      WHERE rw.organization_id = ? ORDER BY rw.created_at DESC LIMIT 500`,
    )
      .bind(auth.organizationId)
      .all(),
    c.env.DB.prepare(
      `SELECT rrt.*, c.full_name AS customer_name
      FROM referral_reward_transactions rrt
      INNER JOIN referral_rewards rw ON rw.id = rrt.referral_reward_id
      INNER JOIN customers c ON c.id = rrt.customer_id
      WHERE rw.organization_id = ? ORDER BY rrt.created_at DESC LIMIT 500`,
    )
      .bind(auth.organizationId)
      .all(),
  ]);
  return c.json({
    data: {
      codes: codes.results,
      ledger: ledger.results,
      redemptions: redemptions.results,
      rewards: rewards.results,
    },
    success: true,
  });
});

referralRoutes.patch("/codes/:id", async (c) => {
  const parsed = codePatchSchema.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!parsed.success || Object.keys(parsed.data).length === 0)
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      "Choose a referral-code change.",
    );
  const auth = c.get("auth");
  const previous = await c.env.DB.prepare(
    "SELECT * FROM referral_codes WHERE id = ? AND organization_id = ?",
  )
    .bind(c.req.param("id"), auth.organizationId)
    .first<Record<string, unknown>>();
  if (previous === null)
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Referral code not found.");
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `UPDATE referral_codes SET status = COALESCE(?, status),
    expires_at = CASE WHEN ? = 1 THEN ? ELSE expires_at END, updated_at = ?
    WHERE id = ? AND organization_id = ?`,
  )
    .bind(
      parsed.data.status ?? null,
      parsed.data.expiresAt === undefined ? 0 : 1,
      parsed.data.expiresAt ?? null,
      now,
      c.req.param("id"),
      auth.organizationId,
    )
    .run();
  const updated = await c.env.DB.prepare(
    "SELECT * FROM referral_codes WHERE id = ?",
  )
    .bind(c.req.param("id"))
    .first();
  await auditStatement(c.env, {
    action: "REFERRAL_CODE_UPDATED",
    auth,
    next: updated,
    previous,
    recordId: c.req.param("id"),
    recordType: "REFERRAL_CODE",
    requestId: c.get("requestId"),
    severity: "WARNING",
  }).run();
  return c.json({ data: updated, success: true });
});

referralRoutes.post("/rewards/:id/adjust", async (c) => {
  const parsed = adjustmentSchema.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!parsed.success)
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      "A positive reward adjustment and reason are required.",
    );
  const auth = c.get("auth");
  const reward = await c.env.DB.prepare(
    "SELECT id, customer_id, status, remaining_amount_minor, version FROM referral_rewards WHERE id = ? AND organization_id = ?",
  )
    .bind(c.req.param("id"), auth.organizationId)
    .first<{
      customer_id: string;
      id: string;
      remaining_amount_minor: number;
      status: string;
      version: number;
    }>();
  if (reward === null)
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Referral reward not found.");
  if (!["PENDING", "AVAILABLE"].includes(reward.status))
    throw new ApiError(
      409,
      "REFERRAL_REWARD_UNAVAILABLE",
      "Only unreserved rewards can be adjusted.",
    );
  const now = new Date().toISOString();
  const balance = reward.remaining_amount_minor + parsed.data.amountMinor;
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE referral_rewards SET status = 'AVAILABLE', original_amount_minor = original_amount_minor + ?, remaining_amount_minor = remaining_amount_minor + ?, available_from = COALESCE(available_from, ?), updated_at = ?, version = version + 1 WHERE id = ? AND organization_id = ? AND version = ? AND status IN ('PENDING', 'AVAILABLE')",
    ).bind(
      parsed.data.amountMinor,
      parsed.data.amountMinor,
      now,
      now,
      reward.id,
      auth.organizationId,
      reward.version,
    ),
    c.env.DB.prepare(
      "INSERT INTO referral_reward_transactions (id, referral_reward_id, customer_id, transaction_type, amount_minor, balance_after_minor, reason, performed_by_user_id, created_at) VALUES (?, ?, ?, 'ADMIN_ADJUSTMENT', ?, ?, ?, ?, ?)",
    ).bind(
      crypto.randomUUID(),
      reward.id,
      reward.customer_id,
      parsed.data.amountMinor,
      balance,
      parsed.data.reason,
      auth.userId,
      now,
    ),
    auditStatement(c.env, {
      action: "REFERRAL_REWARD_ADJUSTED",
      auth,
      next: { amountMinor: parsed.data.amountMinor, balance },
      reason: parsed.data.reason,
      recordId: reward.id,
      recordType: "REFERRAL_REWARD",
      requestId: c.get("requestId"),
      severity: "CRITICAL",
    }),
  ]);
  return c.json({
    data: await c.env.DB.prepare("SELECT * FROM referral_rewards WHERE id = ?")
      .bind(reward.id)
      .first(),
    success: true,
  });
});

referralRoutes.post("/rewards/:id/cancel", async (c) => {
  const parsed = cancelSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      "A cancellation reason is required.",
    );
  const auth = c.get("auth");
  const reward = await c.env.DB.prepare(
    "SELECT id, customer_id, remaining_amount_minor, status, version FROM referral_rewards WHERE id = ? AND organization_id = ?",
  )
    .bind(c.req.param("id"), auth.organizationId)
    .first<{
      customer_id: string;
      id: string;
      remaining_amount_minor: number;
      status: string;
      version: number;
    }>();
  if (reward === null)
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Referral reward not found.");
  if (!["PENDING", "AVAILABLE"].includes(reward.status))
    throw new ApiError(
      409,
      "REFERRAL_REWARD_UNAVAILABLE",
      "Reserved or used rewards cannot be cancelled.",
    );
  const now = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE referral_rewards SET status = 'CANCELLED', remaining_amount_minor = 0, cancelled_at = ?, cancellation_reason = ?, updated_at = ?, version = version + 1 WHERE id = ? AND organization_id = ? AND version = ? AND status IN ('PENDING', 'AVAILABLE')",
    ).bind(
      now,
      parsed.data.reason,
      now,
      reward.id,
      auth.organizationId,
      reward.version,
    ),
    c.env.DB.prepare(
      "INSERT INTO referral_reward_transactions (id, referral_reward_id, customer_id, transaction_type, amount_minor, balance_after_minor, reason, performed_by_user_id, created_at) VALUES (?, ?, ?, 'CANCEL', ?, 0, ?, ?, ?)",
    ).bind(
      crypto.randomUUID(),
      reward.id,
      reward.customer_id,
      reward.remaining_amount_minor,
      parsed.data.reason,
      auth.userId,
      now,
    ),
    auditStatement(c.env, {
      action: "REFERRAL_REWARD_CANCELLED",
      auth,
      reason: parsed.data.reason,
      recordId: reward.id,
      recordType: "REFERRAL_REWARD",
      requestId: c.get("requestId"),
      severity: "CRITICAL",
    }),
  ]);
  return c.json({ data: { status: "CANCELLED" }, success: true });
});
