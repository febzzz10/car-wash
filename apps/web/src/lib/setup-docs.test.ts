import { describe, expect, it } from "vitest";

import setupGuide from "../../../../docs/setup.md?raw";

describe("local bootstrap documentation", () => {
  it("uses the mounted API v1 route and Windows PowerShell 5.1-compatible password conversion", () => {
    expect(setupGuide).toContain("http://127.0.0.1:8787/api/v1/bootstrap");
    expect(setupGuide).toContain("System.Net.NetworkCredential");
    expect(setupGuide).not.toContain(
      "ConvertFrom-SecureString $securePassword -AsPlainText",
    );
  });
});
