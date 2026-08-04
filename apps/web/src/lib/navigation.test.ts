import { describe, expect, it } from "vitest";

import { navigationFor } from "./navigation";

const fullPermissions = [
  "wash_jobs.create",
  "wash_jobs.read",
  "payments.create",
  "customers.read",
  "vehicles.read",
  "invoices.generate",
];

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
    expect(staffPaths).not.toContain("/expenses");
    expect(staffPaths).not.toContain("/services");
  });

  it("shows the full Admin navigation", () => {
    const adminPaths = navigationFor("ADMIN", fullPermissions).flatMap(
      (section) => section.items.map((item) => item.to),
    );

    expect(adminPaths).toContain("/reports");
    expect(adminPaths).toContain("/settings");
    expect(adminPaths).toContain("/audit");
  });

  it("filters shared items by permission for staff", () => {
    const sections = navigationFor("STAFF", ["wash_jobs.read"]);
    const paths = sections.flatMap((section) =>
      section.items.map((item) => item.to),
    );
    expect(paths).toEqual(["/dashboard", "/wash-jobs"]);
  });

  it("groups admin navigation into the expected sections", () => {
    const sections = navigationFor("ADMIN", fullPermissions);
    expect(sections.map((section) => section.label)).toEqual([
      "Primary",
      "Directory",
      "Finance",
      "Benefits",
      "Administration",
    ]);
    const directory = sections.find(
      (section) => section.label === "Directory",
    );
    expect(directory?.items.map((item) => item.label)).toEqual([
      "Customers",
      "Vehicles",
      "Services & pricing",
    ]);
    const finance = sections.find((section) => section.label === "Finance");
    expect(finance?.items.map((item) => item.label)).toEqual([
      "Payments",
      "Invoices",
      "Expenses",
    ]);
    const benefits = sections.find((section) => section.label === "Benefits");
    expect(benefits?.items.map((item) => item.label)).toEqual([
      "Coupons",
      "Referrals",
    ]);
    const administration = sections.find(
      (section) => section.label === "Administration",
    );
    expect(administration?.items.map((item) => item.label)).toEqual([
      "Reports",
      "Staff",
      "Audit log",
      "Business settings",
    ]);
  });

  it("keeps the four mobile shortcuts for staff and admin", () => {
    const staffMobile = navigationFor("STAFF", [
      "wash_jobs.create",
      "wash_jobs.read",
      "payments.create",
      "customers.read",
      "vehicles.read",
      "invoices.generate",
    ])
      .flatMap((section) => section.items)
      .filter((item) => item.mobile)
      .map((item) => item.to);
    expect(staffMobile).toEqual([
      "/dashboard",
      "/wash-jobs/new",
      "/wash-jobs",
      "/payments",
    ]);
    const adminMobile = navigationFor("ADMIN", fullPermissions)
      .flatMap((section) => section.items)
      .filter((item) => item.mobile)
      .map((item) => item.to);
    expect(adminMobile).toEqual(staffMobile);
  });
});
