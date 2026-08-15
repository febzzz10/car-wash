import { expect, test, type Page, type Route } from "@playwright/test";

const admin = {
  branchId: "branch-1",
  permissions: [],
  role: "ADMIN",
  userId: "admin-1",
  userName: "Anita Admin",
};
const staff = {
  branchId: "branch-1",
  permissions: [
    "customers.read",
    "customers.create",
    "vehicles.read",
    "vehicles.create",
    "wash_jobs.read",
    "wash_jobs.create",
    "wash_jobs.start",
    "wash_jobs.pause",
    "wash_jobs.resume",
    "wash_jobs.complete",
    "wash_jobs.cancel",
    "payments.create",
    "invoices.generate",
    "invoices.share",
  ],
  role: "STAFF",
  userId: "staff-1",
  userName: "Ravi Staff",
};

function success(data: unknown): string {
  return JSON.stringify({ data, success: true });
}

async function fulfill(
  route: Route,
  data: unknown,
  status = 200,
): Promise<void> {
  await route.fulfill({
    body: status >= 400 ? JSON.stringify(data) : success(data),
    contentType: "application/json",
    status,
  });
}

async function mockApplication(page: Page, user = admin): Promise<void> {
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path.endsWith("/auth/session"))
      return fulfill(route, { csrfToken: "csrf-test", user });
    if (path.endsWith("/dashboard/summary"))
      return fulfill(route, {
        averageWashDurationSeconds: 1400,
        carsWashed: 12,
        expensesMinor: 210000,
        inProgressJobs: 2,
        netProfitMinor: 690000,
        pausedJobs: 1,
        pendingPaymentsMinor: 25000,
        referralRewardsMinor: 10000,
        revenueMinor: 900000,
        waitingJobs: 3,
      });
    if (path.endsWith("/dashboard/activity"))
      return fulfill(route, [
        {
          action: "WASH_JOB_COMPLETED",
          created_at: "2026-07-23T10:30:00.000Z",
          record_type: "WASH_JOB",
          severity: "INFO",
        },
      ]);
    if (path.endsWith("/customers"))
      return fulfill(route, {
        customers: [
          {
            full_name: "Meera Shah",
            id: "customer-1",
            phone: "9876500000",
            status: "ACTIVE",
            total_spent_minor_cached: 120000,
            total_visits_cached: 4,
            version: 1,
          },
        ],
        pagination: { hasNext: false, limit: 15, nextCursor: null },
      });
    if (path.endsWith("/vehicles"))
      return fulfill(route, {
        pagination: { hasNext: false, limit: 15, nextCursor: null },
        vehicles: [
          {
            customer_id: "customer-1",
            customer_name: "Meera Shah",
            id: "vehicle-1",
            make: "Tata",
            model: "Nexon",
            registration_number: "KL 01 AA 1000",
            status: "ACTIVE",
            vehicle_type_id: "type-1",
            vehicle_type_name: "Four Wheeler",
            version: 1,
          },
        ],
      });
    if (path.endsWith("/invoices"))
      return fulfill(route, {
        pagination: { hasNext: false, limit: 15, nextCursor: null },
        invoices: [
          {
            balance_minor: 0,
            created_at: "2026-07-23T10:00:00.000Z",
            customer_name_snapshot: "Meera Shah",
            id: "invoice-1",
            invoice_number: "WP-2026-000001",
            invoice_status: "ISSUED",
            issued_at: "2026-07-23T10:00:00.000Z",
            payment_status_snapshot: "PAID",
            revision_number: 0,
            total_minor: 80000,
            vehicle_registration_snapshot: "KL 01 AA 1000",
          },
        ],
      });
    if (path.endsWith("/services"))
      return fulfill(route, {
        prices: [
          {
            id: "price-1",
            price_minor: 60000,
            service_id: "service-1",
            vehicle_type_id: "type-1",
          },
        ],
        services: [
          {
            base_price_minor: 60000,
            code: "PREMIUM",
            estimated_duration_minutes: 45,
            id: "service-1",
            is_active: 1,
            is_taxable: 1,
            name: "Premium Wash",
            service_kind: "PRIMARY",
            version: 1,
          },
          {
            base_price_minor: 10000,
            code: "WAX",
            estimated_duration_minutes: 10,
            id: "addon-1",
            is_active: 1,
            is_taxable: 1,
            name: "Wax Finish",
            service_kind: "ADD_ON",
            version: 1,
          },
        ],
        vehicleTypes: [{ code: "FOUR_WHEELER", id: "type-1", name: "Four Wheeler" }],
      });
    if (path.endsWith("/wash-jobs/assignable-users"))
      return fulfill(route, [
        { full_name: "Ravi Staff", id: "staff-1", role: "STAFF" },
      ]);
    if (path.endsWith("/uploads/photo-challenge"))
      return fulfill(
        route,
        { expiresAt: "2099-01-01T00:00:00.000Z", nonce: "capture-nonce" },
        201,
      );
    if (path.endsWith("/uploads/photo"))
      return fulfill(route, { id: "photo-asset-1" }, 201);
    if (path.endsWith("/wash-jobs") && request.method() === "POST")
      return fulfill(route, { id: "job-1" }, 201);
    if (path.endsWith("/wash-jobs")) return fulfill(route, []);
    if (path.endsWith("/wash-jobs/job-1/timer"))
      return fulfill(route, {
        adjustments: [],
        events: [],
        job: { id: "job-1", status: "WAITING" },
      });
    if (path.endsWith("/payments/job/job-1/all"))
      return fulfill(route, { payments: [], refunds: [] });
    if (path.endsWith("/wash-jobs/job-1"))
      return fulfill(route, {
        balance_minor: 70000,
        coupon_discount_minor: 0,
        created_at: "2026-07-23T10:00:00.000Z",
        customer_name_snapshot: "Meera Shah",
        customer_phone_snapshot: "9876500000",
        id: "job-1",
        items: [
          {
            id: "item-1",
            item_kind: "PRIMARY",
            line_total_minor: 70000,
            quantity: 1,
            service_name_snapshot: "Premium Wash",
            unit_price_minor: 70000,
          },
        ],
        job_reference: "WJ-2026-000001",
        locations: [
          {
            accuracy_meters: 12,
            captured_at: "2026-07-23T10:00:00.000Z",
            distance_from_branch_meters: 8,
            location_status: "AT_BUSINESS_LOCATION",
          },
        ],
        manual_discount_minor: 0,
        paid_amount_minor: 0,
        payment_status: "PENDING",
        photos: [
          {
            captured_at: "2026-07-23T10:00:00.000Z",
            id: "photo-1",
            mime_type: "image/jpeg",
            size_bytes: 1000,
          },
        ],
        primary_service_name_snapshot: "Premium Wash",
        referral_discount_minor: 0,
        reward_discount_minor: 0,
        rounding_minor: 0,
        started_at: null,
        status: "WAITING",
        subtotal_minor: 70000,
        tax_minor: 0,
        total_active_seconds: 0,
        total_amount_minor: 70000,
        vehicle_registration_snapshot: "KL 01 AA 1000",
        version: 1,
      });
    return fulfill(route, []);
  });
}

test("responsive Admin shell has no horizontal overflow", async ({
  page,
}, testInfo) => {
  await mockApplication(page);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: /Good/ })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(overflow).toBe(false);
  if (
    testInfo.project.name === "chromium-desktop" ||
    testInfo.project.name === "firefox-desktop"
  ) {
    await expect(
      page.getByRole("navigation", { name: "Primary navigation" }),
    ).toBeVisible();
  } else {
    await expect(
      page.getByRole("navigation", { name: "Mobile navigation" }),
    ).toBeVisible();
  }
});

test("Staff cannot reach or navigate to Admin settings", async ({ page }) => {
  await mockApplication(page, staff);
  await page.goto("/settings");
  await expect(
    page.getByText("This area is available only to Administrators."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Business settings" }),
  ).toHaveCount(0);
});

test("invalid login gives a recoverable error", async ({ page }) => {
  await page.route("**/api/v1/auth/session", (route) =>
    fulfill(
      route,
      {
        error: {
          code: "AUTH_SESSION_EXPIRED",
          message: "Sign in to continue.",
        },
        success: false,
      },
      401,
    ),
  );
  await page.route("**/api/v1/auth/login", (route) =>
    fulfill(
      route,
      {
        error: {
          code: "AUTH_INVALID_CREDENTIALS",
          message: "The username or password is incorrect.",
        },
        success: false,
      },
      401,
    ),
  );
  await page.goto("/login");
  await page.getByLabel("Username, email, or phone").fill("unknown");
  await page.getByLabel("Password", { exact: true }).fill("Incorrect!234");
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page.getByRole("alert")).toContainText("incorrect");
  await expect(page.getByLabel("Username, email, or phone")).toHaveValue(
    "unknown",
  );
});

test("complete New Wash wizard captures camera and GPS and preserves prior choices", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium-desktop",
    "Full media workflow runs once in Chromium desktop; responsive smoke covers every project.",
  );
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          const canvas = document.createElement("canvas");
          canvas.width = 640;
          canvas.height = 480;
          const context = canvas.getContext("2d");
          if (context !== null) {
            context.fillStyle = "#1597e5";
            context.fillRect(0, 0, 640, 480);
          }
          return canvas.captureStream(5);
        },
      },
    });
  });
  await page
    .context()
    .grantPermissions(["geolocation"], { origin: "http://127.0.0.1:4173" });
  await page
    .context()
    .setGeolocation({ accuracy: 12, latitude: 9.9816, longitude: 76.2999 });
  await mockApplication(page, staff);
  await page.goto("/wash-jobs/new");
  await page.getByRole("button", { name: /Meera Shah/ }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("button", { name: /KL 01 AA 1000/ }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("button", { name: /Allow camera/ }).click();
  await page.getByRole("button", { name: /Capture live photo/ }).click();
  await expect(page.getByAltText("Live vehicle capture preview")).toBeVisible();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("button", { name: /Capture precise location/ }).click();
  await expect(
    page.locator(".location-panel").getByText("GPS captured", { exact: true }),
  ).toBeVisible();
  for (let index = 0; index < 3; index += 1)
    await page.getByRole("button", { name: /Back/ }).click();
  await expect(
    page.getByRole("button", { name: /Meera Shah/ }),
  ).toHaveAttribute("aria-pressed", "true");
  for (let index = 0; index < 4; index += 1)
    await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("button", { name: /Premium Wash/ }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.locator(".choice-card").filter({ hasText: "Ravi Staff" }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("button", { name: /Create waiting job/ }).click();
  await expect(page).toHaveURL(/\/wash-jobs\/job-1$/);
  await expect(page.getByText("WJ-2026-000001")).toBeVisible();
});
