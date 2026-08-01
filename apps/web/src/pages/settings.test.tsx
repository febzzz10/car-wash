import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SettingsPage from "./settings";

vi.mock("../lib/api", () => ({
  api: vi.fn(),
  jsonBody: (value: unknown) => ({ body: JSON.stringify(value) }),
}));

vi.mock("../auth", () => ({
  useAuth: () => ({ refresh: vi.fn().mockResolvedValue(undefined) }),
}));

vi.mock("../components/toast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

import { api } from "../lib/api";

function settingsPayload(rows: Array<{ setting_key: string; value_text: string; value_type: string }>) {
  return {
    branch: { id: "branch-1" },
    organization: { id: "org-1" },
    settings: rows,
  };
}

const baseRows = [
  { setting_key: "business.name", value_text: "WashPro", value_type: "STRING" },
  { setting_key: "payment.default_method", value_text: "CASH", value_type: "STRING" },
  { setting_key: "payment.allow_refunds", value_text: "true", value_type: "BOOLEAN" },
];

describe("SettingsPage — payment.manual_discount_enabled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api).mockImplementation((path: string, _init?: RequestInit) => {
      if (typeof path === "string" && path === "/settings") {
        return Promise.resolve(settingsPayload(baseRows));
      }
      return Promise.resolve({ success: true });
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the manual discount toggle with its description", async () => {
    vi.mocked(api).mockImplementation((path: string, _init?: RequestInit) => {
      if (typeof path === "string" && path === "/settings") {
        return Promise.resolve(
          settingsPayload([
            ...baseRows,
            { setting_key: "payment.manual_discount_enabled", value_text: "true", value_type: "BOOLEAN" },
          ]),
        );
      }
      return Promise.resolve({ success: true });
    });
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText("Allow manual discounts")).toBeInTheDocument();
    });
    expect(
      screen.getByText("Allow authorized users to apply a manual discount while recording a payment."),
    ).toBeInTheDocument();
  });

  it("checks the toggle when the stored value is true", async () => {
    vi.mocked(api).mockImplementation((path: string, _init?: RequestInit) => {
      if (typeof path === "string" && path === "/settings") {
        return Promise.resolve(
          settingsPayload([
            ...baseRows,
            { setting_key: "payment.manual_discount_enabled", value_text: "true", value_type: "BOOLEAN" },
          ]),
        );
      }
      return Promise.resolve({ success: true });
    });
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText("Allow manual discounts")).toBeInTheDocument();
    });
    const checkbox = screen.getByRole("checkbox", { name: /allow manual discounts/i });
    expect(checkbox).toBeChecked();
  });

  it("leaves the toggle unchecked when the stored value is false", async () => {
    vi.mocked(api).mockImplementation((path: string, _init?: RequestInit) => {
      if (typeof path === "string" && path === "/settings") {
        return Promise.resolve(
          settingsPayload([
            ...baseRows,
            { setting_key: "payment.manual_discount_enabled", value_text: "false", value_type: "BOOLEAN" },
          ]),
        );
      }
      return Promise.resolve({ success: true });
    });
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText("Allow manual discounts")).toBeInTheDocument();
    });
    const checkbox = screen.getByRole("checkbox", { name: /allow manual discounts/i });
    expect(checkbox).not.toBeChecked();
  });

  it("submits a boolean value when the toggle is changed", async () => {
    let patchBody: unknown = null;
    vi.mocked(api).mockImplementation((path: string, _init?: RequestInit) => {
      if (typeof path === "string" && path === "/settings") {
        return Promise.resolve(
          settingsPayload([
            ...baseRows,
            { setting_key: "payment.manual_discount_enabled", value_text: "true", value_type: "BOOLEAN" },
          ]),
        );
      }
      if (typeof path === "string" && path === "/settings/business") {
        patchBody = _init?.body ? JSON.parse(_init.body as string) : null;
        return Promise.resolve({ success: true });
      }
      return Promise.resolve({ success: true });
    });
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText("Allow manual discounts")).toBeInTheDocument();
    });
    const checkbox = screen.getByRole("checkbox", { name: /allow manual discounts/i });
    fireEvent.click(checkbox);
    const currencyInput = screen.getByPlaceholderText("INR") as HTMLInputElement;
    fireEvent.change(currencyInput, { target: { value: "INR" } });
    const form = document.querySelector("form")!;
    fireEvent.submit(form);
    await waitFor(() => {
      expect(patchBody).not.toBeNull();
    });
    const settings = (patchBody as any).settings as Record<string, unknown>;
    expect(settings["payment.manual_discount_enabled"]).toBe(false);
    expect(typeof settings["payment.manual_discount_enabled"]).toBe("boolean");
  });
});
