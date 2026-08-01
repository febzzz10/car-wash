import { afterEach, describe, expect, it, vi } from "vitest";

import { unhandledErrorBody } from "../src/http/errors";

describe("error sanitization", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("never leaks raw internal error text to API responses", () => {
    const error = new Error(
      "Pbkdf2 failed: iteration counts above 100000 are not supported (requested 600000)",
    );
    const body = unhandledErrorBody(error, "req-sanitize-1");
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).toBe("An unexpected error occurred.");
    expect(body.error.requestId).toBe("req-sanitize-1");
    expect(body.error.message).not.toContain("Pbkdf2");
    expect(body.error.message).not.toContain("600000");
    expect(body.error.message).not.toContain("iteration");
  });

  it("logs the raw error server-side for diagnosis", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("boom");
    unhandledErrorBody(error, "req-sanitize-2");
    const log = JSON.parse(spy.mock.calls[0]?.[0] ?? "{}");
    expect(log.errorName).toBe("Error");
    expect(log.errorMessage).toBe("boom");
    expect(log.requestId).toBe("req-sanitize-2");
  });

  it("handles non-Error values safely", () => {
    const body = unhandledErrorBody("not an error", "req-sanitize-3");
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).toBe("An unexpected error occurred.");
  });
});
