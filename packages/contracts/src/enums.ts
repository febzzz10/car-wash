export const USER_ROLES = ["ADMIN", "STAFF"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ["ACTIVE", "DISABLED", "LOCKED"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const WASH_JOB_STATUSES = [
  "DRAFT",
  "WAITING",
  "IN_PROGRESS",
  "PAUSED",
  "COMPLETED",
  "CANCELLED",
] as const;
export type WashJobStatus = (typeof WASH_JOB_STATUSES)[number];

export const PAYMENT_STATUSES = [
  "PENDING",
  "PARTIALLY_PAID",
  "PAID",
  "REFUNDED",
  "CANCELLED",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = [
  "CASH",
  "UPI",
  "BANK_UPI",
  "PAYTM",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const LEGACY_PAYMENT_METHODS = [
  "CARD",
  "BANK_TRANSFER",
  "OTHER",
] as const;
export type LegacyPaymentMethod = (typeof LEGACY_PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<
  PaymentMethod | LegacyPaymentMethod,
  string
> = {
  BANK_UPI: "Bank UPI",
  BANK_TRANSFER: "Bank transfer",
  CARD: "Card",
  CASH: "Cash",
  OTHER: "Other",
  PAYTM: "Paytm",
  UPI: "UPI",
};

export const TIMER_EVENTS = ["START", "PAUSE", "RESUME", "END"] as const;
export type TimerEventType = (typeof TIMER_EVENTS)[number];

export const DISCOUNT_TYPES = ["FIXED", "PERCENTAGE"] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export const SERVICE_KINDS = ["PRIMARY", "ADD_ON"] as const;
export type ServiceKind = (typeof SERVICE_KINDS)[number];

export const PERMISSIONS = [
  "customers.read",
  "customers.create",
  "customers.update",
  "customers.deactivate",
  "vehicles.read",
  "vehicles.create",
  "vehicles.update",
  "vehicles.deactivate",
  "wash_jobs.read",
  "wash_jobs.create",
  "wash_jobs.assign",
  "wash_jobs.start",
  "wash_jobs.pause",
  "wash_jobs.resume",
  "wash_jobs.complete",
  "wash_jobs.cancel",
  "wash_jobs.adjust",
  "services.manage",
  "pricing.manage",
  "coupons.manage",
  "referrals.manage",
  "payments.create",
  "payments.refund",
  "payments.adjust",
  "invoices.generate",
  "invoices.share",
  "invoices.adjust",
  "expenses.read",
  "expenses.create",
  "expenses.update",
  "expenses.cancel",
  "reports.revenue",
  "reports.profit",
  "reports.staff",
  "users.manage",
  "settings.manage",
  "audit.read",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const VEHICLE_TYPES = [
  "TWO_WHEELER",
  "THREE_WHEELER",
  "FOUR_WHEELER",
] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const ERROR_CODES = [
  "AUTH_INVALID_CREDENTIALS",
  "AUTH_ACCOUNT_DISABLED",
  "AUTH_ACCOUNT_LOCKED",
  "AUTH_SESSION_EXPIRED",
  "AUTH_PERMISSION_DENIED",
  "AUTH_RATE_LIMITED",
  "STATIC_ADMIN_PASSWORD_MANAGED_EXTERNALLY",
  "ASSIGNMENT_LOCKED",
  "CSRF_REJECTED",
  "VALIDATION_ERROR",
  "RESOURCE_NOT_FOUND",
  "RESOURCE_CONFLICT",
  "DUPLICATE_CUSTOMER",
  "DUPLICATE_VEHICLE",
  "CAMERA_CAPTURE_REQUIRED",
  "LOCATION_CAPTURE_REQUIRED",
  "LOCATION_ACCURACY_LOW",
  "LOCATION_OUTSIDE_ALLOWED_RADIUS",
  "SERVICE_NOT_AVAILABLE",
  "PRICE_NOT_CONFIGURED",
  "INVALID_JOB_STATUS",
  "INVALID_TIMER_TRANSITION",
  "TIMER_ALREADY_RUNNING",
  "COUPON_INVALID",
  "COUPON_EXPIRED",
  "COUPON_DISABLED",
  "COUPON_LIMIT_REACHED",
  "COUPON_NOT_ELIGIBLE",
  "REFERRAL_INVALID",
  "REFERRAL_SELF_USE",
  "REFERRAL_ALREADY_USED",
  "REFERRAL_REWARD_UNAVAILABLE",
  "PAYMENT_AMOUNT_INVALID",
  "PAYMENT_DUPLICATE",
  "REFUNDS_DISABLED",
  "REFUND_NOT_ALLOWED",
  "INVOICE_GENERATION_FAILED",
  "INVOICE_ALREADY_EXISTS",
  "INVOICE_TOKEN_EXPIRED",
  "UPLOAD_INVALID_TYPE",
  "UPLOAD_TOO_LARGE",
  "UPLOAD_FAILED",
  "RATE_LIMITED",
  "GEOCODE_RATE_LIMITED",
  "GEOCODING_UNAVAILABLE",
  "BENEFITS_LOCKED",
  "STALE_VERSION",
  "ROUNDING_MODE_UNKNOWN",
  "REFERRAL_STACKING_NOT_ALLOWED",
  "REWARD_NOT_FOUND",
  "REWARD_UNAVAILABLE",
  "REWARD_INSUFFICIENT",
  "MANUAL_DISCOUNT_REASON_REQUIRED",
  "MANUAL_DISCOUNT_EXCEEDS_TOTAL",
  "MANUAL_DISCOUNT_DISABLED",
  "IDEMPOTENCY_MISMATCH",
  "IDEMPOTENCY_CONFLICT",
  "FINANCIAL_STATE_CONFLICT",
  "DISCOUNT_RECONCILIATION_FAILED",
  "INTERNAL_ERROR",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
