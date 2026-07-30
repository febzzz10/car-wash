import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { app } from "../src/app";

describe("one-time bootstrap", () => {
  it("creates the first organization, branch, Admin, and reference data once", async () => {
    const body = {
      adminFullName: "Initial Administrator",
      adminPassword: "SecureBootstrap!234",
      adminUsername: "admin",
      branchCode: "MAIN",
      branchName: "Main Branch",
      businessName: "Clean Cars",
      timezone: "Asia/Kolkata",
    };
    const response = await app.request(
      "/api/v1/bootstrap",
      {
        body: JSON.stringify(body),
        headers: {
          "content-type": "application/json",
          "x-washpro-bootstrap-token": env.BOOTSTRAP_TOKEN,
        },
        method: "POST",
      },
      env,
    );
    expect(response.status).toBe(201);
    const payload = await response.json<{
      data: { branchId: string; organizationId: string; userId: string };
    }>();
    expect(payload.data.organizationId).toBeTruthy();
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM vehicle_types WHERE organization_id = ?",
      )
        .bind(payload.data.organizationId)
        .first("count"),
    ).toBe(3);
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM expense_categories WHERE organization_id = ?",
      )
        .bind(payload.data.organizationId)
        .first("count"),
    ).toBe(10);
    expect(
      await env.DB.prepare(
        "SELECT value_text FROM business_settings WHERE organization_id = ? AND setting_key = 'tax.enabled'",
      )
        .bind(payload.data.organizationId)
        .first("value_text"),
    ).toBe("false");
    expect(
      await env.DB.prepare(
        "SELECT value_text FROM business_settings WHERE organization_id = ? AND setting_key = 'referral.enabled'",
      )
        .bind(payload.data.organizationId)
        .first("value_text"),
    ).toBe("false");

    const replay = await app.request(
      "/api/v1/bootstrap",
      {
        body: JSON.stringify(body),
        headers: {
          "content-type": "application/json",
          "x-washpro-bootstrap-token": env.BOOTSTRAP_TOKEN,
        },
        method: "POST",
      },
      env,
    );
    expect(replay.status).toBe(409);
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS count FROM users").first(
        "count",
      ),
    ).toBe(1);
  });
});
