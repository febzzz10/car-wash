import { describe, expect, it } from "vitest";

import { hasPermission } from "./permissions";

describe("permission checks", () => {
  it("allows active Admin users and denies disabled users", () => {
    expect(
      hasPermission(
        { role: "ADMIN", status: "ACTIVE", permissions: [] },
        "payments.refund",
      ),
    ).toBe(true);
    expect(
      hasPermission(
        { role: "ADMIN", status: "DISABLED", permissions: [] },
        "payments.refund",
      ),
    ).toBe(false);
  });

  it("requires an explicit Staff permission", () => {
    expect(
      hasPermission(
        {
          role: "STAFF",
          status: "ACTIVE",
          permissions: ["payments.create"],
        },
        "payments.create",
      ),
    ).toBe(true);
    expect(
      hasPermission(
        {
          role: "STAFF",
          status: "ACTIVE",
          permissions: ["payments.create"],
        },
        "reports.profit",
      ),
    ).toBe(false);
  });
});
