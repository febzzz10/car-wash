import {
  isBenefitReplacementRequest,
  paymentInputSchema,
} from "@washpro/contracts";
import {
  calculateBill,
  derivePaymentSummary,
  normalizeCode,
  validateCoupon,
  validateReferral,
} from "@washpro/domain";
import { Hono } from "hono";
import { z } from "zod";

import { ApiError } from "../http/errors";
import { requireAdmin, requirePermission } from "../middleware/auth";
import { sha256 } from "../security/tokens";
import { auditStatement } from "../services/audit";
import {
  booleanSetting,
  integerSetting,
  loadSettings,
  stringSetting,
} from "../services/settings";
import type { AppBindings } from "../types";

const refundSchema = z.object({
  amountMinor: z.number().int().positive(),
  idempotencyKey: z.string().trim().min(16).max(128),
  reason: z.string().trim().min(5).max(500),
});

interface FinancialJob {
  readonly balance_minor: number;
  readonly billing_locked_at: string | null;
  readonly branch_id: string;
  readonly coupon_discount_minor: number;
  readonly customer_id: string;
  readonly id: string;
  readonly manual_discount_minor: number;
  readonly manual_discount_reason: string | null;
  readonly organization_id: string;
  readonly paid_amount_minor: number;
  readonly payment_status: string;
  readonly referral_discount_minor: number;
  readonly refunded_amount_minor: number;
  readonly reward_discount_minor: number;
  readonly rounding_mode: string | null;
  readonly status: string;
  readonly subtotal_minor: number;
  readonly tax_rate_basis_points: number | null;
  readonly total_amount_minor: number;
  readonly version: number;
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

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const pairs = keys
    .filter(
      (k) => (value as Record<string, unknown>)[k] !== undefined,
    )
    .map(
      (k) =>
        `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`,
    );
  return `{${pairs.join(",")}}`;
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const paymentRoutes = new Hono<AppBindings>();

paymentRoutes.get("/", requirePermission("payments.create"), async (c) => {
  const auth = c.get("auth");
  const result = await c.env.DB.prepare(
    `SELECT p.*, w.job_reference, w.customer_name_snapshot,
      w.vehicle_registration_snapshot, w.payment_status,
      w.assigned_user_name_snapshot
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
    `SELECT id, branch_id, organization_id, status, payment_status,
      total_amount_minor, paid_amount_minor, refunded_amount_minor, balance_minor,
      billing_locked_at, customer_id, subtotal_minor, manual_discount_minor,
      manual_discount_reason, coupon_discount_minor, referral_discount_minor,
      reward_discount_minor, rounding_mode, tax_rate_basis_points, version
     FROM wash_jobs WHERE id = ? AND organization_id = ? AND branch_id = ?`,
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

  // ---- Benefits replacement branch ----
  const hasBenefits = isBenefitReplacementRequest(parsed.data.benefits);
  let revisedTotal: number | undefined;
  let combinedResponseData: Record<string, unknown> | undefined;

  if (hasBenefits) {
    const benefits = parsed.data.benefits!;
    const expectedVersion = parsed.data.expectedVersion!;
    const operationId = crypto.randomUUID();

    // Fast-fail guards
    if (job.version !== expectedVersion) {
      throw new ApiError(409, "STALE_VERSION", "The job changed on another device.");
    }
    if (job.billing_locked_at !== null || job.paid_amount_minor > 0 || job.payment_status === "PAID") {
      throw new ApiError(409, "BENEFITS_LOCKED", "Benefits cannot be changed after a payment has been recorded.");
    }
    if (job.rounding_mode === null) {
      throw new ApiError(422, "ROUNDING_MODE_UNKNOWN", "Legacy billing cannot be recalculated.");
    }

    // Load context
    const settings = await loadSettings(c.env, auth.organizationId, auth.branchId);
    const items = await c.env.DB.prepare(
      "SELECT service_id, unit_price_minor FROM wash_job_items WHERE wash_job_id = ? ORDER BY display_order"
    ).bind(job.id).all<{ service_id: string | null; unit_price_minor: number }>();
    const serviceIds = items.results.map(i => i.service_id).filter((s): s is string => s !== null);
    const billItems = items.results.map(i => ({ unitPriceMinor: i.unit_price_minor, quantity: 1 }));
    const vehicleType = await c.env.DB.prepare(
      "SELECT vehicle_type_id FROM vehicles WHERE id = (SELECT vehicle_id FROM wash_jobs WHERE id = ?)"
    ).bind(job.id).first<{ vehicle_type_id: string }>();
    const visits = await c.env.DB.prepare(
      "SELECT total_visits_cached FROM customers WHERE id = ?"
    ).bind(job.customer_id).first<number>("total_visits_cached") ?? 0;

    // Load existing reservations
    const [existingCoupon, existingReferral, existingReward] = await Promise.all([
      c.env.DB.prepare(
        "SELECT id, coupon_id, coupon_code_snapshot AS code, discount_amount_minor AS discountMinor, status FROM coupon_redemptions WHERE wash_job_id = ?"
      ).bind(job.id).first<{ id: string; coupon_id: string; code: string; discountMinor: number; status: string } | null>(),
      c.env.DB.prepare(
        "SELECT rr.id AS redemptionId, rr.referral_code_id, rc.code, rr.friend_discount_minor AS discountMinor, rr.status, rr.referring_customer_id AS customer_id FROM referral_redemptions rr JOIN referral_codes rc ON rc.id = rr.referral_code_id WHERE rr.referred_wash_job_id = ?"
      ).bind(job.id).first<{ redemptionId: string; referral_code_id: string; code: string; discountMinor: number; status: string; customer_id: string } | null>(),
      c.env.DB.prepare(
        "SELECT id, active_reservation_transaction_id, active_reservation_amount_minor, status, version, remaining_amount_minor FROM referral_rewards WHERE reserved_for_wash_job_id = ? AND status = 'RESERVED'"
      ).bind(job.id).first<{ id: string; active_reservation_transaction_id: string | null; active_reservation_amount_minor: number; status: string; version: number; remaining_amount_minor: number } | null>(),
    ]);

    // Validate & determine changes
    let couponDiscountMinor = 0;
    let referralDiscountMinor = 0;
    let rewardDiscountMinor = 0;

    type CouponInfo = { id: string; code: string; discountType: string; discountValue: number };
    type ReferralInfo = { codeId: string; code: string; discountMinor: number; referrerCustomerId: string };
    type RewardInfo = { id: string; amountMinor: number; version: number };

    let newCoupon: CouponInfo | null = null;
    let prevCouponCount = 0;
    let existingCouponCount = 0;
    let newReferral: ReferralInfo | null = null;
    let newReward: RewardInfo | null = null;
    const rewardTxnId = crypto.randomUUID();

    // Coupon validation
    const couponCodeStr = benefits.couponCode;
    if (couponCodeStr !== undefined && couponCodeStr.trim() !== "") {
      const coupon = await c.env.DB.prepare(
        "SELECT * FROM coupons WHERE organization_id = ? AND code_normalized = ?"
      ).bind(auth.organizationId, normalizeCode(couponCodeStr)).first<Record<string, unknown>>();
      if (coupon === null)
        throw new ApiError(422, "COUPON_INVALID", "The coupon code is invalid.", { "benefits.couponCode": "The coupon code is invalid." });

      const [eligibleSvcs, eligibleVTypes, usageCount] = await Promise.all([
        c.env.DB.prepare("SELECT service_id FROM coupon_eligible_services WHERE coupon_id = ?").bind(coupon.id as string).all<{ service_id: string }>(),
        c.env.DB.prepare("SELECT vehicle_type_id FROM coupon_eligible_vehicle_types WHERE coupon_id = ?").bind(coupon.id as string).all<{ vehicle_type_id: string }>(),
        c.env.DB.prepare(
          "SELECT COUNT(*) AS count FROM coupon_redemptions WHERE coupon_id = ? AND customer_id = ? AND status IN ('RESERVED','REDEEMED') AND wash_job_id <> ?"
        ).bind(coupon.id as string, job.customer_id, job.id).first<number>("count"),
      ]);

      const v = validateCoupon({
        active: (coupon.is_active as number) === 1,
        code: coupon.code as string,
        discountType: coupon.discount_type as "FIXED" | "PERCENTAGE",
        discountValue: coupon.discount_value as number,
        eligibleServiceIds: eligibleSvcs.results.map(r => r.service_id),
        eligibleVehicleTypeIds: eligibleVTypes.results.map(r => r.vehicle_type_id),
        expiresAt: coupon.expires_at as string,
        maximumDiscountMinor: coupon.maximum_discount_minor as number | null,
        minimumBillMinor: coupon.minimum_bill_minor as number,
        newCustomersOnly: (coupon.new_customers_only as number) === 1,
        perCustomerLimit: coupon.usage_limit_per_customer as number | null,
        startsAt: coupon.start_at as string,
        totalUsageLimit: coupon.total_usage_limit as number | null,
      }, {
        customerCompletedVisits: visits,
        customerUsageCount: usageCount ?? 0,
        now: new Date().toISOString(),
        serviceIds,
        subtotalMinor: job.subtotal_minor,
        totalUsageCount: coupon.total_usage_count_cached as number,
        vehicleTypeId: vehicleType?.vehicle_type_id ?? "",
      });
      if (!v.valid)
        throw new ApiError(422, v.reason, "The coupon is not eligible.", { "benefits.couponCode": "The coupon is not eligible for this wash." });
      couponDiscountMinor = v.discountMinor;
      newCoupon = { id: coupon.id as string, code: coupon.code as string, discountType: coupon.discount_type as string, discountValue: coupon.discount_value as number };
      prevCouponCount = coupon.total_usage_count_cached as number;
    }

    // Referral validation
    const referralCodeStr = benefits.referralCode;
    if (referralCodeStr !== undefined && referralCodeStr.trim() !== "") {
      const code = await c.env.DB.prepare(
        "SELECT * FROM referral_codes WHERE organization_id = ? AND code_normalized = ?"
      ).bind(auth.organizationId, normalizeCode(referralCodeStr)).first<Record<string, unknown>>();
      if (code === null)
        throw new ApiError(422, "REFERRAL_INVALID", "The referral code is invalid.", { "benefits.referralCode": "The referral code is invalid." });

      const alreadyUsed = await c.env.DB.prepare(
        "SELECT COUNT(*) AS count FROM referral_redemptions WHERE referred_customer_id = ? AND status IN ('PENDING','QUALIFIED','REWARD_ISSUED') AND referred_wash_job_id <> ?"
      ).bind(job.customer_id, job.id).first<number>("count");

      const friendType = stringSetting(settings, "referral.friend_discount_type", "FIXED") as "FIXED" | "PERCENTAGE";
      const rv = validateReferral({
        enabled: booleanSetting(settings, "referral.enabled", true),
        status: code.status as "ACTIVE" | "DISABLED" | "EXPIRED",
        referrerCustomerId: code.customer_id as string,
        expiresAt: code.expires_at as string | null,
        friendDiscountType: friendType,
        friendDiscountValue: integerSetting(settings, "referral.friend_discount_value", 0),
        minimumBillMinor: integerSetting(settings, "referral.minimum_bill_minor", 0),
        maximumDiscountMinor: integerSetting(settings, "referral.maximum_discount_minor", 0) || null,
        eligibleServiceIds: parseStringArray(stringSetting(settings, "referral.eligible_service_ids", "[]")),
        eligibleVehicleTypeIds: parseStringArray(stringSetting(settings, "referral.eligible_vehicle_type_ids", "[]")),
        newCustomersOnly: booleanSetting(settings, "referral.new_customers_only", true),
      }, {
        now: new Date().toISOString(),
        referredCustomerId: job.customer_id,
        subtotalMinor: job.subtotal_minor,
        completedVisits: visits,
        benefitAlreadyUsed: (alreadyUsed ?? 0) > 0,
        serviceIds,
        vehicleTypeId: vehicleType?.vehicle_type_id ?? "",
      });
      if (!rv.valid)
        throw new ApiError(422, rv.reason, "The referral is not eligible.", { "benefits.referralCode": "The referral is not eligible." });
      referralDiscountMinor = rv.discountMinor;
      newReferral = { codeId: code.id as string, code: code.code as string, discountMinor: rv.discountMinor, referrerCustomerId: code.customer_id as string };
    }

    // Reward validation
    if (benefits.rewardId !== undefined) {
      const reward = await c.env.DB.prepare(
        "SELECT id, remaining_amount_minor, active_reservation_amount_minor, status, reserved_for_wash_job_id, version FROM referral_rewards WHERE id = ? AND organization_id = ? AND customer_id = ?"
      ).bind(benefits.rewardId, auth.organizationId, job.customer_id).first<Record<string, unknown>>();
      if (reward === null)
        throw new ApiError(422, "REWARD_NOT_FOUND", "The selected reward is unavailable.", { "benefits.rewardId": "The selected reward is unavailable." });

      const isAvail = reward.status === "AVAILABLE" && reward.reserved_for_wash_job_id === null;
      const isOwn = reward.status === "RESERVED" && reward.reserved_for_wash_job_id === job.id;
      if (!isAvail && !isOwn)
        throw new ApiError(422, "REWARD_UNAVAILABLE", "This reward is not available.", { "benefits.rewardId": "This reward is not available." });

      const effBalance = (reward.remaining_amount_minor as number) + (isOwn ? (reward.active_reservation_amount_minor as number) : 0);
      const requested = benefits.rewardAmountMinor ?? effBalance;
      if (requested > effBalance)
        throw new ApiError(422, "REWARD_INSUFFICIENT", "The requested amount exceeds available reward.", { "benefits.rewardAmountMinor": "The requested amount exceeds available reward." });
      rewardDiscountMinor = Math.min(requested, job.subtotal_minor - couponDiscountMinor - referralDiscountMinor);
      newReward = { id: reward.id as string, amountMinor: rewardDiscountMinor, version: reward.version as number };
    }

    // Manual discount validation
    const manualDiscountEnabled = booleanSetting(
      settings,
      "payment.manual_discount_enabled",
      false,
    );
    if (benefits.manualDiscountMinor > 0 && !manualDiscountEnabled)
      throw new ApiError(
        403,
        "MANUAL_DISCOUNT_DISABLED",
        "Manual discounts are disabled for this business.",
        { "benefits.manualDiscountMinor": "Manual discounts are disabled for this business." },
      );
    if (benefits.manualDiscountMinor > 0) {
      const maxManual = job.subtotal_minor - couponDiscountMinor - referralDiscountMinor - rewardDiscountMinor;
      if (benefits.manualDiscountMinor > maxManual)
        throw new ApiError(422, "MANUAL_DISCOUNT_EXCEEDS_TOTAL", "The manual discount exceeds the remaining bill amount.", { "benefits.manualDiscountMinor": "The manual discount exceeds the remaining bill amount." });
    }

    // Change detection
    const couponChanged = (newCoupon?.id) !== (existingCoupon?.coupon_id ?? undefined);

    // Load existing coupon's usage count for guard verification
    if (couponChanged && existingCoupon) {
      const existingCouponRow = await c.env.DB.prepare(
        "SELECT total_usage_count_cached FROM coupons WHERE id = ? AND organization_id = ?"
      ).bind(existingCoupon.coupon_id, auth.organizationId).first<{ total_usage_count_cached: number }>();
      existingCouponCount = existingCouponRow?.total_usage_count_cached ?? 0;
    }
    const referralChanged = (newReferral?.codeId) !== (existingReferral?.referral_code_id ?? undefined);
    const rewardChanged = (newReward?.id) !== (existingReward?.id ?? undefined) || (newReward?.amountMinor) !== (existingReward?.active_reservation_amount_minor ?? undefined);
    const manualDiscountChanged = benefits.manualDiscountMinor !== job.manual_discount_minor || (benefits.manualDiscountReason ?? null) !== (job.manual_discount_reason ?? null);

    // Calculate bill
    const taxRate = booleanSetting(settings, "tax.enabled", true) ? integerSetting(settings, "tax.rate_basis_points", 0) : 0;
    const bill = calculateBill({
      couponDiscountMinor, referralDiscountMinor, rewardDiscountMinor,
      manualDiscountMinor: benefits.manualDiscountMinor,
      items: billItems,
      roundingMode: job.rounding_mode as "NONE" | "NEAREST_RUPEE",
      taxRateBasisPoints: taxRate,
    });
    revisedTotal = bill.totalAmountMinor;

    // Early computations for referral qualification
    const effectiveReferralId = referralChanged
      ? null
      : existingReferral?.redemptionId ?? null;
    const paymentStatus = bill.totalAmountMinor === 0 ? "PAID" : ((job.paid_amount_minor + parsed.data.amountMinor) >= bill.totalAmountMinor ? "PAID" : "PARTIALLY_PAID");
    const newPaid = bill.totalAmountMinor === 0 ? 0 : (job.paid_amount_minor + parsed.data.amountMinor);
    const newBalance = bill.totalAmountMinor === 0 ? 0 : Math.max(0, bill.totalAmountMinor - newPaid);

    // Validate payment vs revised balance
    if (bill.totalAmountMinor > 0 && parsed.data.amountMinor > bill.totalAmountMinor)
      throw new ApiError(422, "PAYMENT_AMOUNT_INVALID", "The payment exceeds the revised balance.", { "amountMinor": "The payment exceeds the revised balance." });

    // Build idempotency + batch
    const now = new Date().toISOString();
    const canonicalPayload = stableStringify({ washJobId: parsed.data.washJobId, amountMinor: parsed.data.amountMinor, tipMinor: parsed.data.tipMinor, method: parsed.data.method, transactionReference: parsed.data.transactionReference, notes: parsed.data.notes, expectedVersion: parsed.data.expectedVersion, benefits: parsed.data.benefits });
    const requestHash = await sha256(canonicalPayload);
    const idemRecordId = crypto.randomUUID();

    // Pre-batch replay check
    const replay = await c.env.DB.prepare(
      "SELECT * FROM idempotency_keys WHERE organization_id = ? AND operation_type = 'FIRST_PAYMENT_WITH_BENEFITS' AND idempotency_key = ?"
    ).bind(auth.organizationId, parsed.data.idempotencyKey).first<{ state: string; request_hash: string; response_status: number | null; response_body_json: string | null }>();
    if (replay) {
      if (replay.state === "COMPLETED" && replay.request_hash === requestHash)
        return c.json(JSON.parse(replay.response_body_json!), 201);
      if (replay.request_hash !== requestHash)
        throw new ApiError(409, "IDEMPOTENCY_MISMATCH" as never, "Same key, different payload.");
      throw new ApiError(409, "IDEMPOTENCY_CONFLICT" as never, "Previous request still processing.");
    }

    // Pre-fetch referral count for qualification guard
    let prevReferralCount = 0;
    if (effectiveReferralId && paymentStatus === "PAID" && job.status === "COMPLETED" && existingReferral) {
      prevReferralCount = (await c.env.DB.prepare(
        "SELECT successful_referrals_cached FROM referral_codes WHERE customer_id = ? AND organization_id = ?"
      ).bind(existingReferral.customer_id, auth.organizationId).first<number>("successful_referrals_cached")) ?? 0;
    }

    // ---- D1 BATCH ----
    const statements: D1PreparedStatement[] = [];

    // 1. Idempotency insert
    statements.push(c.env.DB.prepare(
      `INSERT INTO idempotency_keys (id, organization_id, user_id, idempotency_key, operation_type, request_hash, resource_type, resource_id, state, expires_at, created_at) VALUES (?, ?, ?, ?, 'FIRST_PAYMENT_WITH_BENEFITS', ?, 'WASH_JOB', ?, 'PROCESSING', ?, ?)`
    ).bind(idemRecordId, auth.organizationId, auth.userId, parsed.data.idempotencyKey, requestHash, job.id, new Date(Date.now() + 86400000).toISOString(), now));

    // 2. WASH_JOB_UNLOCKED guard
    statements.push(c.env.DB.prepare(
      `INSERT INTO financial_operation_guards (operation_id, guard_name, passed, created_at) VALUES (?, 'WASH_JOB_UNLOCKED', CASE WHEN EXISTS (SELECT 1 FROM wash_jobs WHERE id = ? AND organization_id = ? AND version = ? AND billing_locked_at IS NULL AND paid_amount_minor = 0 AND refunded_amount_minor = 0 AND payment_status <> 'PAID' AND NOT EXISTS (SELECT 1 FROM payments WHERE wash_job_id = wash_jobs.id AND organization_id = wash_jobs.organization_id AND status = 'SUCCESS')) THEN 1 ELSE 0 END, ?)`
    ).bind(operationId, job.id, auth.organizationId, job.version, now));

    // 3. ROUNDING_MODE_KNOWN guard
    statements.push(c.env.DB.prepare(
      `INSERT INTO financial_operation_guards (operation_id, guard_name, passed, created_at) VALUES (?, 'ROUNDING_MODE_KNOWN', CASE WHEN EXISTS (SELECT 1 FROM wash_jobs WHERE id = ? AND rounding_mode IS NOT NULL) THEN 1 ELSE 0 END, ?)`
    ).bind(operationId, job.id, now));

    // 4-9. Per-benefit guards (coupon ownership/releasable/capacity, referral, reward)
    if (couponChanged && existingCoupon) {
      statements.push(c.env.DB.prepare(
        `INSERT INTO financial_operation_guards (operation_id, guard_name, passed, created_at) VALUES (?, 'COUPON_OWNERSHIP', CASE WHEN EXISTS (SELECT 1 FROM coupon_redemptions WHERE id = ? AND wash_job_id = ? AND status = 'RESERVED' AND coupon_id = ?) THEN 1 ELSE 0 END, ?)`
      ).bind(operationId, existingCoupon.id, job.id, existingCoupon.coupon_id, now));
      statements.push(c.env.DB.prepare(
        `INSERT INTO financial_operation_guards (operation_id, guard_name, passed, created_at) VALUES (?, 'COUPON_RELEASABLE', CASE WHEN EXISTS (SELECT 1 FROM coupon_redemptions cr JOIN coupons c ON c.id = cr.coupon_id WHERE cr.id = ? AND cr.wash_job_id = ? AND cr.status = 'RESERVED' AND c.organization_id = ? AND c.total_usage_count_cached > 0) THEN 1 ELSE 0 END, ?)`
      ).bind(operationId, existingCoupon.id, job.id, auth.organizationId, now));
    }
    if (couponChanged && newCoupon) {
      statements.push(c.env.DB.prepare(
        `INSERT INTO financial_operation_guards (operation_id, guard_name, passed, created_at) VALUES (?, 'COUPON_CAPACITY', CASE WHEN EXISTS (SELECT 1 FROM coupons WHERE id = ? AND organization_id = ? AND (total_usage_limit IS NULL OR total_usage_count_cached < total_usage_limit)) THEN 1 ELSE 0 END, ?)`
      ).bind(operationId, newCoupon.id, auth.organizationId, now));
    }
    if (referralChanged && newReferral) {
      statements.push(c.env.DB.prepare(
        `INSERT INTO financial_operation_guards (operation_id, guard_name, passed, created_at) VALUES (?, 'REFERRAL_ELIGIBILITY', CASE WHEN NOT EXISTS (SELECT 1 FROM referral_redemptions WHERE referred_customer_id = ? AND status IN ('PENDING','QUALIFIED','REWARD_ISSUED') AND referred_wash_job_id <> ?) THEN 1 ELSE 0 END, ?)`
      ).bind(operationId, job.customer_id, job.id, now));
    }
    if (referralChanged && existingReferral) {
      statements.push(c.env.DB.prepare(
        `INSERT INTO financial_operation_guards (operation_id, guard_name, passed, created_at) VALUES (?, 'REFERRAL_OWNERSHIP', CASE WHEN EXISTS (SELECT 1 FROM referral_redemptions WHERE id = ? AND referred_wash_job_id = ? AND status = 'PENDING') THEN 1 ELSE 0 END, ?)`
      ).bind(operationId, existingReferral.redemptionId, job.id, now));
    }
    if (rewardChanged && existingReward) {
      statements.push(c.env.DB.prepare(
        `INSERT INTO financial_operation_guards (operation_id, guard_name, passed, created_at) VALUES (?, 'REWARD_RELEASABLE', CASE WHEN EXISTS (SELECT 1 FROM referral_rewards WHERE id = ? AND organization_id = ? AND customer_id = ? AND status = 'RESERVED' AND reserved_for_wash_job_id = ? AND active_reservation_transaction_id IS NOT NULL AND active_reservation_amount_minor > 0) THEN 1 ELSE 0 END, ?)`
      ).bind(operationId, existingReward.id, auth.organizationId, job.customer_id, job.id, now));
    }
    if (rewardChanged && newReward) {
      statements.push(c.env.DB.prepare(
        `INSERT INTO financial_operation_guards (operation_id, guard_name, passed, created_at) VALUES (?, 'REWARD_BALANCE', CASE WHEN EXISTS (SELECT 1 FROM referral_rewards WHERE id = ? AND organization_id = ? AND customer_id = ? AND ((status = 'AVAILABLE' AND reserved_for_wash_job_id IS NULL) OR (status = 'RESERVED' AND reserved_for_wash_job_id = ?)) AND (remaining_amount_minor + CASE WHEN status = 'RESERVED' THEN active_reservation_amount_minor ELSE 0 END) >= ?) THEN 1 ELSE 0 END, ?)`
      ).bind(operationId, newReward.id, auth.organizationId, job.customer_id, job.id, newReward.amountMinor, now));
    }

    // 10-12. Release mutations + verification guards
    if (couponChanged && existingCoupon) {
      statements.push(
        c.env.DB.prepare("UPDATE coupons SET total_usage_count_cached = total_usage_count_cached - 1, updated_at = ? WHERE id = ? AND total_usage_count_cached > 0").bind(now, existingCoupon.coupon_id),
        c.env.DB.prepare("UPDATE coupon_redemptions SET status = 'RELEASED', released_at = ? WHERE id = ? AND wash_job_id = ? AND coupon_id = ? AND status = 'RESERVED'").bind(now, existingCoupon.id, job.id, existingCoupon.coupon_id),
      );
      statements.push(c.env.DB.prepare(
        `INSERT INTO financial_operation_guards (operation_id, guard_name, passed, created_at) VALUES (?, 'COUPON_USAGE_DECREMENT_APPLIED', CASE WHEN EXISTS (SELECT 1 FROM coupons WHERE id = ? AND organization_id = ? AND total_usage_count_cached = ?) THEN 1 ELSE 0 END, ?)`
      ).bind(operationId, existingCoupon.coupon_id, auth.organizationId, existingCouponCount - 1, now));
      statements.push(c.env.DB.prepare(
        `INSERT INTO financial_operation_guards (operation_id, guard_name, passed, created_at) VALUES (?, 'COUPON_RELEASE_APPLIED', CASE WHEN EXISTS (SELECT 1 FROM coupon_redemptions WHERE id = ? AND wash_job_id = ? AND coupon_id = ? AND status = 'RELEASED' AND released_at = ?) THEN 1 ELSE 0 END, ?)`
      ).bind(operationId, existingCoupon.id, job.id, existingCoupon.coupon_id, now, now));
    }
    if (referralChanged && existingReferral) {
      statements.push(
        c.env.DB.prepare("UPDATE referral_redemptions SET status = 'CANCELLED', cancelled_at = ?, cancellation_reason = 'BENEFITS_REPLACED' WHERE id = ? AND referred_wash_job_id = ? AND status = 'PENDING'").bind(now, existingReferral.redemptionId, job.id),
      );
      statements.push(c.env.DB.prepare(
        `INSERT INTO financial_operation_guards (operation_id, guard_name, passed, created_at) VALUES (?, 'REFERRAL_CANCEL_APPLIED', CASE WHEN EXISTS (SELECT 1 FROM referral_redemptions WHERE id = ? AND referred_wash_job_id = ? AND status = 'CANCELLED' AND cancelled_at = ?) THEN 1 ELSE 0 END, ?)`
      ).bind(operationId, existingReferral.redemptionId, job.id, now, now));
    }
    if (rewardChanged && existingReward) {
      const restoredBalance = (existingReward.remaining_amount_minor ?? 0) + (existingReward.active_reservation_amount_minor ?? 0);
      statements.push(
        c.env.DB.prepare("UPDATE referral_rewards SET status = 'AVAILABLE', remaining_amount_minor = remaining_amount_minor + active_reservation_amount_minor, reserved_for_wash_job_id = NULL, active_reservation_transaction_id = NULL, active_reservation_amount_minor = 0, updated_at = ?, version = version + 1 WHERE id = ? AND reserved_for_wash_job_id = ? AND status = 'RESERVED'").bind(now, existingReward.id, job.id),
        c.env.DB.prepare("INSERT INTO referral_reward_transactions (id, referral_reward_id, customer_id, wash_job_id, transaction_type, amount_minor, balance_after_minor, performed_by_user_id, created_at) VALUES (?, ?, ?, ?, 'RELEASE', ?, ?, ?, ?)").bind(crypto.randomUUID(), existingReward.id, job.customer_id, job.id, existingReward.active_reservation_amount_minor ?? 0, restoredBalance, auth.userId, now),
      );
      statements.push(c.env.DB.prepare(
        `INSERT INTO financial_operation_guards (operation_id, guard_name, passed, created_at) VALUES (?, 'REWARD_RELEASE_APPLIED', CASE WHEN EXISTS (SELECT 1 FROM referral_rewards WHERE id = ? AND organization_id = ? AND customer_id = ? AND status = 'AVAILABLE' AND reserved_for_wash_job_id IS NULL AND active_reservation_transaction_id IS NULL AND active_reservation_amount_minor = 0 AND remaining_amount_minor = ? AND version = ?) THEN 1 ELSE 0 END, ?)`
      ).bind(operationId, existingReward.id, auth.organizationId, job.customer_id, restoredBalance, existingReward.version + 1, now));
    }

    // 13-14. Acquisition mutations + verification guards
    if (couponChanged && newCoupon) {
      const crId = crypto.randomUUID();
      statements.push(
        c.env.DB.prepare("INSERT INTO coupon_redemptions (id, coupon_id, customer_id, wash_job_id, status, original_amount_minor, discount_amount_minor, coupon_code_snapshot, discount_type_snapshot, discount_value_snapshot, reserved_at, created_by_user_id) VALUES (?, ?, ?, ?, 'RESERVED', ?, ?, ?, ?, ?, ?, ?)").bind(crId, newCoupon.id, job.customer_id, job.id, job.subtotal_minor, bill.couponDiscountMinor, newCoupon.code, newCoupon.discountType, newCoupon.discountValue, now, auth.userId),
        c.env.DB.prepare("UPDATE coupons SET total_usage_count_cached = total_usage_count_cached + 1, updated_at = ?, version = version + 1 WHERE id = ?").bind(now, newCoupon.id),
      );
      statements.push(c.env.DB.prepare(
        `INSERT INTO financial_operation_guards (operation_id, guard_name, passed, created_at) VALUES (?, 'COUPON_USAGE_INCREMENT_APPLIED', CASE WHEN EXISTS (SELECT 1 FROM coupons WHERE id = ? AND organization_id = ? AND total_usage_count_cached = ?) THEN 1 ELSE 0 END, ?)`
      ).bind(operationId, newCoupon.id, auth.organizationId, prevCouponCount + 1, now));
    }
    if (referralChanged && newReferral) {
      statements.push(c.env.DB.prepare(
        "INSERT INTO referral_redemptions (id, organization_id, referral_code_id, referring_customer_id, referred_customer_id, referred_wash_job_id, status, friend_discount_type_snapshot, friend_discount_value_snapshot, friend_discount_minor, reward_type_snapshot, reward_value_snapshot, created_at, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?)"
      ).bind(crypto.randomUUID(), auth.organizationId, newReferral.codeId, newReferral.referrerCustomerId, job.customer_id, job.id, stringSetting(settings, "referral.friend_discount_type", "FIXED"), integerSetting(settings, "referral.friend_discount_value", 0), newReferral.discountMinor, stringSetting(settings, "referral.reward_type", "FIXED"), integerSetting(settings, "referral.reward_value", 0), now, auth.userId));
    }
    if (rewardChanged && newReward) {
      const newBalance = (existingReward ? existingReward.remaining_amount_minor + (existingReward.active_reservation_amount_minor ?? 0) : newReward.amountMinor) - newReward.amountMinor;
      statements.push(
        c.env.DB.prepare("UPDATE referral_rewards SET status = 'RESERVED', reserved_for_wash_job_id = ?, active_reservation_transaction_id = ?, active_reservation_amount_minor = ?, remaining_amount_minor = remaining_amount_minor - ?, updated_at = ?, version = version + 1 WHERE id = ? AND status IN ('AVAILABLE','RESERVED') AND version = ? AND remaining_amount_minor + CASE WHEN reserved_for_wash_job_id = ? THEN active_reservation_amount_minor ELSE 0 END >= ?").bind(job.id, rewardTxnId, newReward.amountMinor, newReward.amountMinor, now, newReward.id, newReward.version, job.id, newReward.amountMinor),
        c.env.DB.prepare("INSERT INTO referral_reward_transactions (id, referral_reward_id, customer_id, wash_job_id, transaction_type, amount_minor, balance_after_minor, performed_by_user_id, created_at) SELECT ?, id, customer_id, ?, 'RESERVE', ?, remaining_amount_minor, ?, ? FROM referral_rewards WHERE id = ? AND reserved_for_wash_job_id = ?").bind(rewardTxnId, job.id, newReward.amountMinor, auth.userId, now, newReward.id, job.id),
      );
      statements.push(c.env.DB.prepare(
        `INSERT INTO financial_operation_guards (operation_id, guard_name, passed, created_at) VALUES (?, 'REWARD_RESERVATION_APPLIED', CASE WHEN EXISTS (SELECT 1 FROM referral_rewards WHERE id = ? AND organization_id = ? AND customer_id = ? AND status = 'RESERVED' AND reserved_for_wash_job_id = ? AND active_reservation_transaction_id = ? AND active_reservation_amount_minor = ? AND remaining_amount_minor = ? AND version = ?) THEN 1 ELSE 0 END, ?)`
      ).bind(operationId, newReward.id, auth.organizationId, job.customer_id, job.id, rewardTxnId, newReward.amountMinor, newBalance, newReward.version + 1, now));
    }

    // 15. Payment INSERT (only if total > 0)
    let paymentRecord: Record<string, unknown> | null = null;
    if (bill.totalAmountMinor > 0) {
      const paymentId = crypto.randomUUID();
      statements.push(c.env.DB.prepare(
        `INSERT INTO payments (id, organization_id, branch_id, wash_job_id, transaction_type, amount_minor, tip_minor, payment_method, status, external_transaction_reference, paid_at, received_by_user_id, notes, idempotency_key, created_at) VALUES (?, ?, ?, ?, 'PAYMENT', ?, ?, ?, 'SUCCESS', ?, ?, ?, ?, ?, ?)`
      ).bind(paymentId, auth.organizationId, job.branch_id, job.id, parsed.data.amountMinor, parsed.data.tipMinor, parsed.data.method, parsed.data.transactionReference ?? null, now, auth.userId, parsed.data.notes ?? null, parsed.data.idempotencyKey, now));
      paymentRecord = { id: paymentId, amount_minor: parsed.data.amountMinor, tip_minor: parsed.data.tipMinor };
    }

    // 16. Consolidated wash_jobs UPDATE
    statements.push(c.env.DB.prepare(
      `UPDATE wash_jobs SET coupon_discount_minor = ?, referral_discount_minor = ?, reward_discount_minor = ?, manual_discount_minor = ?, manual_discount_reason = ?, total_discount_minor = ?, taxable_amount_minor = ?, tax_minor = ?, rounding_minor = ?, total_amount_minor = ?, paid_amount_minor = ?, refunded_amount_minor = ?, balance_minor = ?, payment_status = ?, billing_locked_at = COALESCE(billing_locked_at, ?), updated_by_user_id = ?, updated_at = ?, version = version + 1 WHERE id = ? AND organization_id = ? AND version = ?`
    ).bind(bill.couponDiscountMinor, bill.referralDiscountMinor, bill.rewardDiscountMinor, bill.manualDiscountMinor, benefits.manualDiscountReason ?? null, bill.totalDiscountMinor, bill.taxableAmountMinor, bill.taxMinor, bill.roundingMinor, bill.totalAmountMinor, newPaid, job.refunded_amount_minor, newBalance, paymentStatus, now, auth.userId, now, job.id, auth.organizationId, job.version));

    // 17. FINAL_JOB_UPDATE guard
    statements.push(c.env.DB.prepare(
      `INSERT INTO financial_operation_guards (operation_id, guard_name, passed, created_at) VALUES (?, 'FINAL_JOB_UPDATE', CASE WHEN EXISTS (SELECT 1 FROM wash_jobs WHERE id = ? AND organization_id = ? AND version = ? AND billing_locked_at IS NOT NULL AND total_amount_minor = ? AND paid_amount_minor = ? AND payment_status = ?) THEN 1 ELSE 0 END, ?)`
    ).bind(operationId, job.id, auth.organizationId, job.version + 1, bill.totalAmountMinor, newPaid, paymentStatus, now));

    // 18. Referral qualification (if PAID + COMPLETED + effective referral exists)
    if (effectiveReferralId && paymentStatus === "PAID" && job.status === "COMPLETED") {
      // Guard: referral is still PENDING
      statements.push(c.env.DB.prepare(
        "INSERT INTO financial_operation_guards (operation_id, guard_name, passed, created_at) VALUES (?, 'REFERRAL_QUALIFICATION_ELIGIBLE', CASE WHEN EXISTS (SELECT 1 FROM referral_redemptions WHERE id = ? AND referred_wash_job_id = ? AND status = 'PENDING') THEN 1 ELSE 0 END, ?)"
      ).bind(operationId, effectiveReferralId, job.id, now));

      // PENDING → QUALIFIED
      statements.push(c.env.DB.prepare(
        "UPDATE referral_redemptions SET status = 'QUALIFIED', qualified_at = ? WHERE id = ? AND referred_wash_job_id = ? AND status = 'PENDING'"
      ).bind(now, effectiveReferralId, job.id));

      // REFERRAL_QUALIFICATION_APPLIED guard
      statements.push(c.env.DB.prepare(
        "INSERT INTO financial_operation_guards (operation_id, guard_name, passed, created_at) VALUES (?, 'REFERRAL_QUALIFICATION_APPLIED', CASE WHEN EXISTS (SELECT 1 FROM referral_redemptions WHERE id = ? AND referred_wash_job_id = ? AND status = 'QUALIFIED' AND qualified_at = ?) THEN 1 ELSE 0 END, ?)"
      ).bind(operationId, effectiveReferralId, job.id, now, now));

      // Create referral reward
      const rewardId = crypto.randomUUID();
      const rewardType = stringSetting(settings, "referral.reward_type", "FIXED") as "FIXED" | "PERCENTAGE";
      const rewardValue = integerSetting(settings, "referral.reward_value", 0);
      const maximum = integerSetting(settings, "referral.reward_maximum_minor", 0);
      const expiryDays = Math.max(1, integerSetting(settings, "referral.reward_expiry_days", 90));
      const expiresAt = new Date(Date.parse(now) + expiryDays * 86400000).toISOString();

      const calculated = rewardType === "FIXED" ? rewardValue : Math.floor((job.total_amount_minor * rewardValue + 5000) / 10000);
      const rewardAmount = maximum > 0 ? Math.min(calculated, maximum) : calculated;

      statements.push(
        c.env.DB.prepare(
          "INSERT INTO referral_rewards (id, organization_id, customer_id, referral_redemption_id, status, original_amount_minor, remaining_amount_minor, earned_at, available_from, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'AVAILABLE', ?, ?, ?, ?, ?, ?, ?)"
        ).bind(rewardId, auth.organizationId, existingReferral!.customer_id, effectiveReferralId, rewardAmount, rewardAmount, now, now, expiresAt, now, now),
        c.env.DB.prepare(
          "INSERT INTO referral_reward_transactions (id, referral_reward_id, customer_id, wash_job_id, transaction_type, amount_minor, balance_after_minor, performed_by_user_id, created_at) VALUES (?, ?, ?, ?, 'EARN', ?, ?, ?, ?)"
        ).bind(crypto.randomUUID(), rewardId, existingReferral!.customer_id, job.id, rewardAmount, rewardAmount, auth.userId, now),
        c.env.DB.prepare(
          "UPDATE referral_codes SET successful_referrals_cached = successful_referrals_cached + 1, updated_at = ? WHERE customer_id = ? AND organization_id = ?"
        ).bind(now, existingReferral!.customer_id, auth.organizationId),
      );

      // REFERRAL_REWARD_CREATED guard
      statements.push(c.env.DB.prepare(
        `INSERT INTO financial_operation_guards (operation_id, guard_name, passed, created_at)
         VALUES (?, 'REFERRAL_REWARD_CREATED',
           CASE WHEN EXISTS (SELECT 1 FROM referral_rewards WHERE id = ? AND organization_id = ? AND customer_id = ? AND referral_redemption_id = ? AND status = 'AVAILABLE' AND original_amount_minor = ?) THEN 1 ELSE 0 END, ?)`
      ).bind(operationId, rewardId, auth.organizationId, existingReferral!.customer_id, effectiveReferralId, rewardAmount, now));

      // REFERRAL_EARN_TRANSACTION_CREATED guard
      statements.push(c.env.DB.prepare(
        `INSERT INTO financial_operation_guards (operation_id, guard_name, passed, created_at)
         VALUES (?, 'REFERRAL_EARN_TRANSACTION_CREATED',
           CASE WHEN EXISTS (SELECT 1 FROM referral_reward_transactions WHERE referral_reward_id = ? AND wash_job_id = ? AND transaction_type = 'EARN' AND amount_minor = ?) THEN 1 ELSE 0 END, ?)`
      ).bind(operationId, rewardId, job.id, rewardAmount, now));

      // REFERRAL_COUNT_INCREMENT_APPLIED guard
      statements.push(c.env.DB.prepare(
        "INSERT INTO financial_operation_guards (operation_id, guard_name, passed, created_at) VALUES (?, 'REFERRAL_COUNT_INCREMENT_APPLIED', CASE WHEN EXISTS (SELECT 1 FROM referral_codes WHERE customer_id = ? AND organization_id = ? AND successful_referrals_cached = ?) THEN 1 ELSE 0 END, ?)"
      ).bind(operationId, existingReferral!.customer_id, auth.organizationId, prevReferralCount + 1, now));
    }

    // 19. Audit records (release before application)
    if (couponChanged && existingCoupon)
      statements.push(auditStatement(c.env, { action: "COUPON_RELEASED", auth, previous: { couponId: existingCoupon.coupon_id, code: existingCoupon.code, discountMinor: existingCoupon.discountMinor }, recordId: job.id, recordType: "WASH_JOB", requestId: c.get("requestId"), severity: "INFO" }));
    if (couponChanged && newCoupon)
      statements.push(auditStatement(c.env, { action: "COUPON_APPLIED", auth, next: { couponId: newCoupon.id, code: newCoupon.code, discountMinor: bill.couponDiscountMinor }, recordId: job.id, recordType: "WASH_JOB", requestId: c.get("requestId"), severity: "INFO" }));
    if (referralChanged && existingReferral)
      statements.push(auditStatement(c.env, { action: "REFERRAL_BENEFIT_CANCELLED", auth, previous: { redemptionId: existingReferral.redemptionId, code: existingReferral.code, discountMinor: existingReferral.discountMinor }, recordId: job.id, recordType: "WASH_JOB", requestId: c.get("requestId"), severity: "INFO" }));
    if (referralChanged && newReferral)
      statements.push(auditStatement(c.env, { action: "REFERRAL_BENEFIT_APPLIED", auth, next: { code: newReferral.code, discountMinor: bill.referralDiscountMinor }, recordId: job.id, recordType: "WASH_JOB", requestId: c.get("requestId"), severity: "INFO" }));
    if (rewardChanged && existingReward) {
      statements.push(auditStatement(c.env, {
        action: "REWARD_RESERVATION_RELEASED", auth,
        previous: { rewardId: existingReward.id, amountMinor: existingReward.active_reservation_amount_minor ?? existingReward.remaining_amount_minor ?? 0 },
        recordId: job.id, recordType: "WASH_JOB", requestId: c.get("requestId"), severity: "INFO",
      }));
    }
    if (rewardChanged && newReward) {
      statements.push(auditStatement(c.env, {
        action: "REWARD_APPLIED", auth,
        next: { rewardId: newReward.id, amountMinor: bill.rewardDiscountMinor },
        recordId: job.id, recordType: "WASH_JOB", requestId: c.get("requestId"), severity: "INFO",
      }));
    }
    if (manualDiscountChanged) {
      if (job.manual_discount_minor > 0 && bill.manualDiscountMinor === 0) {
        statements.push(auditStatement(c.env, {
          action: "MANUAL_DISCOUNT_REMOVED", auth,
          previous: { amountMinor: job.manual_discount_minor, reason: job.manual_discount_reason ?? "" },
          recordId: job.id, recordType: "WASH_JOB", requestId: c.get("requestId"), severity: "INFO",
        }));
      } else if (job.manual_discount_minor === 0 && bill.manualDiscountMinor > 0) {
        statements.push(auditStatement(c.env, {
          action: "MANUAL_DISCOUNT_APPLIED", auth,
          next: { amountMinor: bill.manualDiscountMinor, reason: benefits.manualDiscountReason ?? "" },
          reason: benefits.manualDiscountReason ?? null,
          recordId: job.id, recordType: "WASH_JOB", requestId: c.get("requestId"), severity: "WARNING",
        }));
      } else if (job.manual_discount_minor > 0 && bill.manualDiscountMinor > 0) {
        statements.push(auditStatement(c.env, {
          action: "MANUAL_DISCOUNT_UPDATED", auth,
          previous: { amountMinor: job.manual_discount_minor, reason: job.manual_discount_reason ?? "" },
          next: { amountMinor: bill.manualDiscountMinor, reason: benefits.manualDiscountReason ?? "" },
          reason: benefits.manualDiscountReason ?? null,
          recordId: job.id, recordType: "WASH_JOB", requestId: c.get("requestId"), severity: "WARNING",
        }));
      }
    }
    if (bill.totalAmountMinor > 0)
      statements.push(auditStatement(c.env, { action: "PAYMENT_RECORDED", auth, next: { amountMinor: parsed.data.amountMinor, tipMinor: parsed.data.tipMinor, totalCollectedMinor: parsed.data.amountMinor + parsed.data.tipMinor, method: parsed.data.method, paymentId: paymentRecord?.id ?? "unknown" }, recordId: (paymentRecord?.id ?? job.id) as string, recordType: "PAYMENT", requestId: c.get("requestId") }));
    else
      statements.push(auditStatement(c.env, { action: "FULLY_DISCOUNTED_COMPLETION", auth, next: { bill: { totalAmountMinor: bill.totalAmountMinor, totalDiscountMinor: bill.totalDiscountMinor } }, recordId: job.id, recordType: "WASH_JOB", requestId: c.get("requestId"), severity: "INFO" }));

    // 20. Cleanup + idempotency complete
    statements.push(c.env.DB.prepare("DELETE FROM financial_operation_guards WHERE operation_id = ?").bind(operationId));
    const respBody = JSON.stringify({
      payment: paymentRecord,
      revisedBilling: { subtotalMinor: job.subtotal_minor, couponDiscountMinor: bill.couponDiscountMinor, referralDiscountMinor: bill.referralDiscountMinor, rewardDiscountMinor: bill.rewardDiscountMinor, manualDiscountMinor: bill.manualDiscountMinor, totalDiscountMinor: bill.totalDiscountMinor, taxableAmountMinor: bill.taxableAmountMinor, taxMinor: bill.taxMinor, roundingMinor: bill.roundingMinor, totalAmountMinor: bill.totalAmountMinor, paidAmountMinor: newPaid, balanceMinor: newBalance, paymentStatus, version: job.version + 1, billingLockedAt: now },
      appliedBenefits: { coupon: newCoupon ? { id: newCoupon.id, code: newCoupon.code, discountMinor: bill.couponDiscountMinor } : null, referral: newReferral ? { redemptionId: "new", code: newReferral.code, discountMinor: bill.referralDiscountMinor } : null, reward: newReward ? { id: newReward.id, amountMinor: bill.rewardDiscountMinor } : null, manualDiscount: bill.manualDiscountMinor > 0 ? { amountMinor: bill.manualDiscountMinor, reason: benefits.manualDiscountReason ?? "" } : null },
      fullyDiscounted: bill.totalAmountMinor === 0,
    });
    statements.push(c.env.DB.prepare("UPDATE idempotency_keys SET state = 'COMPLETED', response_status = 201, response_body_json = ?, completed_at = ? WHERE id = ? AND state = 'PROCESSING'").bind(respBody, now, idemRecordId));

    // Execute batch
    try {
      await c.env.DB.batch(statements);
    } catch (err) {
      if (err instanceof Error && err.message.includes("UNIQUE")) {
        const existing = await c.env.DB.prepare(
          "SELECT * FROM idempotency_keys WHERE organization_id = ? AND operation_type = 'FIRST_PAYMENT_WITH_BENEFITS' AND idempotency_key = ?"
        ).bind(auth.organizationId, parsed.data.idempotencyKey).first<{ state: string; request_hash: string; response_status: number | null; response_body_json: string | null }>();
        if (existing) {
          if (existing.state === "COMPLETED" && existing.request_hash === requestHash)
            return c.json(JSON.parse(existing.response_body_json!), 201);
          if (existing.request_hash !== requestHash) throw new ApiError(409, "IDEMPOTENCY_MISMATCH" as never, "Same key, different payload.");
          throw new ApiError(409, "IDEMPOTENCY_CONFLICT" as never, "Previous request still processing.");
        }
      }
      throw err;
    }

    combinedResponseData = JSON.parse(respBody) as Record<string, unknown>;
  }

  // ---- End benefits branch ----

  if (combinedResponseData) {
    return c.json({ data: combinedResponseData, success: true }, 201);
  }

  // ---- Payment-only path (not benefits) ----
  let summary: ReturnType<typeof derivePaymentSummary>;
  try {
    summary = derivePaymentSummary(
      revisedTotal ?? job.total_amount_minor,
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
      `INSERT INTO payments (id, organization_id, branch_id, wash_job_id, transaction_type, amount_minor, tip_minor, payment_method, status, external_transaction_reference, paid_at, received_by_user_id, notes, idempotency_key, created_at) VALUES (?, ?, ?, ?, 'PAYMENT', ?, ?, ?, 'SUCCESS', ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      auth.organizationId,
      job.branch_id,
      job.id,
      parsed.data.amountMinor,
      parsed.data.tipMinor,
      parsed.data.method,
      parsed.data.transactionReference ?? null,
      now,
      auth.userId,
      parsed.data.notes ?? null,
      parsed.data.idempotencyKey,
      now,
    ),
    c.env.DB.prepare(
      "UPDATE wash_jobs SET paid_amount_minor = ?, refunded_amount_minor = ?, balance_minor = ?, payment_status = ?, billing_locked_at = COALESCE(billing_locked_at, ?), updated_by_user_id = ?, updated_at = ?, version = version + 1 WHERE id = ? AND organization_id = ? AND paid_amount_minor = ? AND refunded_amount_minor = ?",
    ).bind(
      summary.paidMinor,
      summary.refundedMinor,
      summary.balanceMinor,
      summary.status,
      now,
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
        tipMinor: parsed.data.tipMinor,
        totalCollectedMinor:
          parsed.data.amountMinor + parsed.data.tipMinor,
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
    const settings = await loadSettings(c.env, auth.organizationId, null);
    if (!booleanSetting(settings, "payment.allow_refunds", false))
      throw new ApiError(403, "REFUNDS_DISABLED", "Payment refunds are disabled in Business Settings.");
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
  const paymentRow = await c.env.DB.prepare("SELECT * FROM payments WHERE id = ?")
    .bind(id)
    .first<Record<string, unknown>>();
  return c.json(
    { data: paymentResponse(paymentRow ?? { id }, summary), success: true },
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
