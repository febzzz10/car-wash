import { paymentInputSchema } from "@washpro/contracts";
import { derivePaymentSummary } from "@washpro/domain";
import { Hono } from "hono";
import { z } from "zod";

import { ApiError } from "../http/errors";
import { requireAdmin, requirePermission } from "../middleware/auth";
import { auditStatement } from "../services/audit";
import { integerSetting, loadSettings } from "../services/settings";
import type { AppBindings } from "../types";

const refundSchema = z.object({
  amountMinor: z.number().int().positive(),
  idempotencyKey: z.string().trim().min(16).max(128),
  reason: z.string().trim().min(5).max(500),
});

interface FinancialJob {
  readonly balance_minor: number;
  readonly branch_id: string;
  readonly id: string;
  readonly paid_amount_minor: number;
  readonly payment_status: string;
  readonly refunded_amount_minor: number;
  readonly status: string;
  readonly total_amount_minor: number;
}

function paymentResponse(
  payment: Record<string, unknown>,
  summary: ReturnType<typeof derivePaymentSummary>,
): Record<string, unknown> {
  return {
    ...payment,
    paymentStatus: summary.status,
    remainingBalanceMinor: summary.balanceMinor,
  };
}

export const paymentRoutes = new Hono<AppBindings>();

paymentRoutes.get("/", requirePermission("payments.create"), async (c) => {
  const auth = c.get("auth");
  const result = await c.env.DB.prepare(
    `SELECT p.*, w.job_reference, w.customer_name_snapshot,
      w.vehicle_registration_snapshot, w.payment_status
     FROM payments p INNER JOIN wash_jobs w ON w.id = p.wash_job_id
     WHERE p.organization_id = ? AND p.branch_id = ?
     ORDER BY p.created_at DESC LIMIT 250`,
  )
    .bind(auth.organizationId, auth.branchId)
    .all();
  return c.json({ data: result.results, success: true });
});

paymentRoutes.post("/", requirePermission("payments.create"), async (c) => {
  const parsed = paymentInputSchema.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!parsed.success)
    throw new ApiError(422, "VALIDATION_ERROR", "Check the payment details.");
  const auth = c.get("auth");
  const replay = await c.env.DB.prepare(
    `SELECT p.*, w.payment_status, w.balance_minor
     FROM payments p INNER JOIN wash_jobs w ON w.id = p.wash_job_id
     WHERE p.organization_id = ? AND p.idempotency_key = ?`,
  )
    .bind(auth.organizationId, parsed.data.idempotencyKey)
    .first<
      Record<string, unknown> & {
        balance_minor: number;
        payment_status: string;
      }
    >();
  if (replay !== null) {
    return c.json({
      data: {
        ...replay,
        paymentStatus: replay.payment_status,
        remainingBalanceMinor: replay.balance_minor,
      },
      idempotentReplay: true,
      success: true,
    });
  }
  const job = await c.env.DB.prepare(
    "SELECT id, branch_id, status, payment_status, total_amount_minor, paid_amount_minor, refunded_amount_minor, balance_minor FROM wash_jobs WHERE id = ? AND organization_id = ? AND branch_id = ?",
  )
    .bind(parsed.data.washJobId, auth.organizationId, auth.branchId)
    .first<FinancialJob>();
  if (job === null)
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Wash job not found.");
  if (job.status === "CANCELLED")
    throw new ApiError(
      409,
      "PAYMENT_AMOUNT_INVALID",
      "Cancelled jobs cannot receive payments.",
    );
  let summary: ReturnType<typeof derivePaymentSummary>;
  try {
    summary = derivePaymentSummary(
      job.total_amount_minor,
      [job.paid_amount_minor + parsed.data.amountMinor],
      job.refunded_amount_minor > 0 ? [job.refunded_amount_minor] : [],
    );
  } catch {
    throw new ApiError(
      422,
      "PAYMENT_AMOUNT_INVALID",
      "The payment exceeds the remaining balance.",
    );
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare(
      `INSERT INTO payments (id, organization_id, branch_id, wash_job_id, transaction_type, amount_minor, payment_method, status, external_transaction_reference, paid_at, received_by_user_id, notes, idempotency_key, created_at) VALUES (?, ?, ?, ?, 'PAYMENT', ?, ?, 'SUCCESS', ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      auth.organizationId,
      job.branch_id,
      job.id,
      parsed.data.amountMinor,
      parsed.data.method,
      parsed.data.transactionReference ?? null,
      now,
      auth.userId,
      parsed.data.notes ?? null,
      parsed.data.idempotencyKey,
      now,
    ),
    c.env.DB.prepare(
      "UPDATE wash_jobs SET paid_amount_minor = ?, refunded_amount_minor = ?, balance_minor = ?, payment_status = ?, updated_by_user_id = ?, updated_at = ?, version = version + 1 WHERE id = ? AND organization_id = ? AND paid_amount_minor = ? AND refunded_amount_minor = ?",
    ).bind(
      summary.paidMinor,
      summary.refundedMinor,
      summary.balanceMinor,
      summary.status,
      auth.userId,
      now,
      job.id,
      auth.organizationId,
      job.paid_amount_minor,
      job.refunded_amount_minor,
    ),
    auditStatement(c.env, {
      action: "PAYMENT_RECORDED",
      auth,
      next: {
        amountMinor: parsed.data.amountMinor,
        method: parsed.data.method,
        paymentId: id,
        summary,
      },
      recordId: id,
      recordType: "PAYMENT",
      requestId: c.get("requestId"),
    }),
  ];

  if (summary.status === "PAID" && job.status === "COMPLETED") {
    const redemption = await c.env.DB.prepare(
      `SELECT rr.id, rr.referring_customer_id, rr.reward_type_snapshot,
        rr.reward_value_snapshot, rr.status
       FROM referral_redemptions rr
       LEFT JOIN referral_rewards rw ON rw.referral_redemption_id = rr.id
       WHERE rr.referred_wash_job_id = ? AND rr.status IN ('PENDING', 'QUALIFIED')
         AND rw.id IS NULL`,
    )
      .bind(job.id)
      .first<{
        id: string;
        referring_customer_id: string;
        reward_type_snapshot: "FIXED" | "PERCENTAGE";
        reward_value_snapshot: number;
        status: string;
      }>();
    if (redemption !== null) {
      const settings = await loadSettings(
        c.env,
        auth.organizationId,
        auth.branchId,
      );
      const calculated =
        redemption.reward_type_snapshot === "FIXED"
          ? redemption.reward_value_snapshot
          : Math.floor(
              (job.total_amount_minor * redemption.reward_value_snapshot +
                5000) /
                10_000,
            );
      const maximum = integerSetting(
        settings,
        "referral.reward_maximum_minor",
        0,
      );
      const rewardAmount =
        maximum > 0 ? Math.min(calculated, maximum) : calculated;
      const rewardId = crypto.randomUUID();
      const expiryDays = Math.max(
        1,
        integerSetting(settings, "referral.reward_expiry_days", 90),
      );
      const expiresAt = new Date(
        Date.parse(now) + expiryDays * 86_400_000,
      ).toISOString();
      statements.push(
        c.env.DB.prepare(
          "UPDATE referral_redemptions SET status = 'REWARD_ISSUED', qualified_at = ?, reward_amount_minor = ? WHERE id = ? AND status IN ('PENDING', 'QUALIFIED')",
        ).bind(now, rewardAmount, redemption.id),
        c.env.DB.prepare(
          `INSERT INTO referral_rewards (id, organization_id, customer_id, referral_redemption_id, status, original_amount_minor, remaining_amount_minor, earned_at, available_from, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'AVAILABLE', ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          rewardId,
          auth.organizationId,
          redemption.referring_customer_id,
          redemption.id,
          rewardAmount,
          rewardAmount,
          now,
          now,
          expiresAt,
          now,
          now,
        ),
        c.env.DB.prepare(
          "INSERT INTO referral_reward_transactions (id, referral_reward_id, customer_id, wash_job_id, transaction_type, amount_minor, balance_after_minor, performed_by_user_id, created_at) VALUES (?, ?, ?, ?, 'EARN', ?, ?, ?, ?)",
        ).bind(
          crypto.randomUUID(),
          rewardId,
          redemption.referring_customer_id,
          job.id,
          rewardAmount,
          rewardAmount,
          auth.userId,
          now,
        ),
        c.env.DB.prepare(
          "UPDATE referral_codes SET successful_referrals_cached = successful_referrals_cached + 1, updated_at = ? WHERE customer_id = ? AND organization_id = ?",
        ).bind(now, redemption.referring_customer_id, auth.organizationId),
      );
    }
  }
  try {
    await c.env.DB.batch(statements);
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      throw new ApiError(
        409,
        "PAYMENT_DUPLICATE",
        "This payment was already recorded.",
      );
    }
    throw error;
  }
  const payment = await c.env.DB.prepare("SELECT * FROM payments WHERE id = ?")
    .bind(id)
    .first<Record<string, unknown>>();
  return c.json(
    { data: paymentResponse(payment ?? { id }, summary), success: true },
    201,
  );
});

paymentRoutes.get("/:id", requirePermission("payments.create"), async (c) => {
  const auth = c.get("auth");
  const payment = await c.env.DB.prepare(
    "SELECT * FROM payments WHERE id = ? AND organization_id = ?",
  )
    .bind(c.req.param("id"), auth.organizationId)
    .first();
  if (payment === null)
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Payment not found.");
  const refunds = await c.env.DB.prepare(
    "SELECT * FROM refunds WHERE payment_id = ? AND organization_id = ? ORDER BY created_at",
  )
    .bind(c.req.param("id"), auth.organizationId)
    .all();
  return c.json({
    data: { ...payment, refunds: refunds.results },
    success: true,
  });
});

paymentRoutes.post(
  "/:id/refund",
  requireAdmin,
  requirePermission("payments.refund"),
  async (c) => {
    const parsed = refundSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      throw new ApiError(
        422,
        "VALIDATION_ERROR",
        "A valid refund amount, reason, and idempotency key are required.",
      );
    const auth = c.get("auth");
    const replay = await c.env.DB.prepare(
      "SELECT r.*, w.payment_status, w.balance_minor FROM refunds r INNER JOIN wash_jobs w ON w.id = r.wash_job_id WHERE r.organization_id = ? AND r.idempotency_key = ?",
    )
      .bind(auth.organizationId, parsed.data.idempotencyKey)
      .first<
        Record<string, unknown> & {
          balance_minor: number;
          payment_status: string;
        }
      >();
    if (replay !== null)
      return c.json({
        data: {
          ...replay,
          paymentStatus: replay.payment_status,
          remainingBalanceMinor: replay.balance_minor,
        },
        idempotentReplay: true,
        success: true,
      });
    const payment = await c.env.DB.prepare(
      `SELECT p.id, p.amount_minor, p.wash_job_id, p.branch_id,
      w.total_amount_minor, w.paid_amount_minor, w.refunded_amount_minor,
      w.balance_minor, w.status, w.payment_status
     FROM payments p INNER JOIN wash_jobs w ON w.id = p.wash_job_id
     WHERE p.id = ? AND p.organization_id = ? AND p.status = 'SUCCESS'`,
    )
      .bind(c.req.param("id"), auth.organizationId)
      .first<FinancialJob & { amount_minor: number; wash_job_id: string }>();
    if (payment === null)
      throw new ApiError(
        404,
        "RESOURCE_NOT_FOUND",
        "Successful payment not found.",
      );
    const alreadyRefunded =
      (await c.env.DB.prepare(
        "SELECT COALESCE(SUM(amount_minor), 0) AS total FROM refunds WHERE payment_id = ? AND status = 'SUCCESS'",
      )
        .bind(c.req.param("id"))
        .first<number>("total")) ?? 0;
    if (parsed.data.amountMinor > payment.amount_minor - alreadyRefunded)
      throw new ApiError(
        422,
        "REFUND_NOT_ALLOWED",
        "The refund exceeds the refundable payment amount.",
      );
    const summary = derivePaymentSummary(
      payment.total_amount_minor,
      [payment.paid_amount_minor],
      [payment.refunded_amount_minor + parsed.data.amountMinor],
    );
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const statements: D1PreparedStatement[] = [
      c.env.DB.prepare(
        "INSERT INTO refunds (id, organization_id, branch_id, payment_id, wash_job_id, amount_minor, status, reason, approved_by_user_id, processed_at, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?, 'SUCCESS', ?, ?, ?, ?, ?)",
      ).bind(
        id,
        auth.organizationId,
        payment.branch_id,
        c.req.param("id"),
        payment.wash_job_id,
        parsed.data.amountMinor,
        parsed.data.reason,
        auth.userId,
        now,
        parsed.data.idempotencyKey,
        now,
      ),
      c.env.DB.prepare(
        "UPDATE wash_jobs SET refunded_amount_minor = ?, balance_minor = ?, payment_status = ?, updated_by_user_id = ?, updated_at = ?, version = version + 1 WHERE id = ? AND organization_id = ? AND refunded_amount_minor = ?",
      ).bind(
        summary.refundedMinor,
        summary.balanceMinor,
        summary.status,
        auth.userId,
        now,
        payment.wash_job_id,
        auth.organizationId,
        payment.refunded_amount_minor,
      ),
      auditStatement(c.env, {
        action: "PAYMENT_REFUNDED",
        auth,
        next: { amountMinor: parsed.data.amountMinor, refundId: id, summary },
        reason: parsed.data.reason,
        recordId: id,
        recordType: "REFUND",
        requestId: c.get("requestId"),
        severity: "CRITICAL",
      }),
    ];
    if (summary.status !== "PAID") {
      const reward = await c.env.DB.prepare(
        "SELECT rw.id, rw.customer_id, rw.remaining_amount_minor, rw.status FROM referral_rewards rw INNER JOIN referral_redemptions rr ON rr.id = rw.referral_redemption_id WHERE rr.referred_wash_job_id = ? AND rw.status IN ('AVAILABLE', 'RESERVED')",
      )
        .bind(payment.wash_job_id)
        .first<{
          customer_id: string;
          id: string;
          remaining_amount_minor: number;
          status: string;
        }>();
      if (reward !== null) {
        statements.push(
          c.env.DB.prepare(
            "UPDATE referral_rewards SET status = 'CANCELLED', remaining_amount_minor = 0, cancelled_at = ?, cancellation_reason = 'REFERRED_PAYMENT_REFUNDED', updated_at = ?, version = version + 1 WHERE id = ? AND status IN ('AVAILABLE', 'RESERVED')",
          ).bind(now, now, reward.id),
          c.env.DB.prepare(
            "INSERT INTO referral_reward_transactions (id, referral_reward_id, customer_id, wash_job_id, transaction_type, amount_minor, balance_after_minor, reason, performed_by_user_id, created_at) VALUES (?, ?, ?, ?, 'CANCEL', ?, 0, 'REFERRED_PAYMENT_REFUNDED', ?, ?)",
          ).bind(
            crypto.randomUUID(),
            reward.id,
            reward.customer_id,
            payment.wash_job_id,
            reward.remaining_amount_minor,
            auth.userId,
            now,
          ),
        );
      }
    }
    await c.env.DB.batch(statements);
    const refund = await c.env.DB.prepare("SELECT * FROM refunds WHERE id = ?")
      .bind(id)
      .first<Record<string, unknown>>();
    return c.json(
      { data: paymentResponse(refund ?? { id }, summary), success: true },
      201,
    );
  },
);

paymentRoutes.get(
  "/job/:id/all",
  requirePermission("payments.create"),
  async (c) => {
    const auth = c.get("auth");
    const [payments, refunds] = await Promise.all([
      c.env.DB.prepare(
        "SELECT * FROM payments WHERE wash_job_id = ? AND organization_id = ? ORDER BY created_at",
      )
        .bind(c.req.param("id"), auth.organizationId)
        .all(),
      c.env.DB.prepare(
        "SELECT * FROM refunds WHERE wash_job_id = ? AND organization_id = ? ORDER BY created_at",
      )
        .bind(c.req.param("id"), auth.organizationId)
        .all(),
    ]);
    return c.json({
      data: { payments: payments.results, refunds: refunds.results },
      success: true,
    });
  },
);
