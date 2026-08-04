import { describe, expect, it } from "vitest";

import { navigationFor } from "./navigation";

describe("role navigation", () => {
  it("keeps administration screens out of Staff navigation", () => {
    const staffPaths = navigationFor("STAFF", [
      "wash_jobs.create",
      "wash_jobs.read",
      "payments.create",
      "customers.read",
      "vehicles.read",
      "invoices.generate",
    ]).flatMap((section) => section.items.map((item) => item.to));

    expect(staffPaths).toContain("/wash-jobs/new");
    expect(staffPaths).not.toContain("/settings");
    expect(staffPaths).not.toContain("/audit");
  });

  it("shows the full Admin navigation", () => {
    const adminPaths = navigationFor("ADMIN", []).flatMap((section) =>
      section.items.map((item) => item.to),
    );

    expect(adminPaths).toContain("/reports");
    expect(adminPaths).toContain("/settings");
    expect(adminPaths).toContain("/audit");
  });
});
