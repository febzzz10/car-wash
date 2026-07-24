import type { ApiFailure } from "@washpro/contracts";
import { Hono } from "hono";

import { ApiError } from "./http/errors";
import { requireAdmin, requireSession } from "./middleware/auth";
import { auditRoutes } from "./routes/audit";
import { protectedAuthRoutes, publicAuthRoutes } from "./routes/auth";
import { bootstrapRoutes } from "./routes/bootstrap";
import { customerRoutes } from "./routes/customers";
import { couponRoutes } from "./routes/coupons";
import { dashboardRoutes, reportRoutes } from "./routes/reports";
import { expenseCategoryRoutes, expenseRoutes } from "./routes/expenses";
import {
  invoiceJobRoutes,
  invoiceRoutes,
  publicInvoiceRoutes,
} from "./routes/invoices";
import { paymentRoutes } from "./routes/payments";
import { referralRoutes } from "./routes/referrals";
import { servicePriceRoutes, serviceRoutes } from "./routes/services";
import { settingRoutes } from "./routes/settings";
import { uploadRoutes } from "./routes/uploads";
import { userRoutes } from "./routes/users";
import { vehicleRoutes } from "./routes/vehicles";
import { washJobRoutes } from "./routes/wash-jobs";
import type { AppBindings } from "./types";

export const app = new Hono<AppBindings>();

app.use("*", async (c, next) => {
  const requestId = c.req.header("cf-ray") ?? crypto.randomUUID();
  c.set("requestId", requestId);
  await next();
  c.header("cache-control", "no-store");
  c.header(
    "content-security-policy",
    "default-src 'none'; frame-ancestors 'none'",
  );
  c.header("cross-origin-resource-policy", "same-site");
  c.header("referrer-policy", "no-referrer");
  c.header("strict-transport-security", "max-age=31536000; includeSubDomains");
  c.header("x-content-type-options", "nosniff");
  c.header("x-frame-options", "DENY");
  c.header("x-request-id", requestId);
});

app.onError((error, c) => {
  const requestId = c.get("requestId") || crypto.randomUUID();
  if (error instanceof ApiError) {
    const body: ApiFailure = {
      error: {
        code: error.code,
        ...(error.fields === undefined ? {} : { fields: error.fields }),
        message: error.message,
        requestId,
      },
      success: false,
    };
    return c.json(body, error.status as 400);
  }

  console.error(
    JSON.stringify({
      errorName: error.name,
      message: "Unhandled API error",
      requestId,
    }),
  );
  const body: ApiFailure = {
    error: {
      code: "INTERNAL_ERROR",
      message: "The request could not be completed.",
      requestId,
    },
    success: false,
  };
  return c.json(body, 500);
});

app.notFound((c) =>
  c.json<ApiFailure>(
    {
      error: {
        code: "RESOURCE_NOT_FOUND",
        message: "The requested resource was not found.",
        requestId: c.get("requestId"),
      },
      success: false,
    },
    404,
  ),
);

app.get("/health", (c) =>
  c.json({ data: { service: "washpro-api", status: "ok" }, success: true }),
);
app.route("/invoice", publicInvoiceRoutes);
app.route("/api/v1/auth", publicAuthRoutes);
app.route("/api/v1/bootstrap", bootstrapRoutes);

const protectedApi = new Hono<AppBindings>();
protectedApi.use("*", requireSession);
protectedApi.route("/auth", protectedAuthRoutes);
protectedApi.route("/audit-logs", auditRoutes);
protectedApi.route("/customers", customerRoutes);
protectedApi.route("/coupons", couponRoutes);
protectedApi.route("/dashboard", dashboardRoutes);
protectedApi.route("/expense-categories", expenseCategoryRoutes);
protectedApi.route("/expenses", expenseRoutes);
protectedApi.route("/invoices", invoiceRoutes);
protectedApi.route("/payments", paymentRoutes);
protectedApi.route("/referrals", referralRoutes);
protectedApi.route("/reports", reportRoutes);
protectedApi.route("/services", serviceRoutes);
protectedApi.route("/settings", settingRoutes);
protectedApi.route("/service-prices", servicePriceRoutes);
protectedApi.route("/uploads", uploadRoutes);
protectedApi.route("/users", userRoutes);
protectedApi.route("/vehicles", vehicleRoutes);
protectedApi.route("/wash-jobs", washJobRoutes);
protectedApi.route("/wash-jobs", invoiceJobRoutes);

const adminRoutes = new Hono<AppBindings>();
adminRoutes.use("*", requireAdmin);
adminRoutes.get("/staff", async (c) => {
  const auth = c.get("auth");
  const result = await c.env.DB.prepare(
    `SELECT id, full_name, username, email, phone, role, status,
      permissions_json, last_login_at, created_at, updated_at, version
    FROM users
    WHERE organization_id = ?
    ORDER BY full_name`,
  )
    .bind(auth.organizationId)
    .all();
  return c.json({ data: result.results, success: true });
});
protectedApi.route("/admin", adminRoutes);

app.route("/api/v1", protectedApi);
