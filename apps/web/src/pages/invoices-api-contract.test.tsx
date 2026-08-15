import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import InvoicesPage from "./invoices";
import { useAuth } from "../auth";
import type { InvoiceRecord } from "../types";

const WIRE_INVOICES: readonly InvoiceRecord[] = Array.from(
  { length: 15 },
  (_, index) => ({
    id: `wire-inv${index + 1}`,
    balance_minor: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    customer_name_snapshot: "Wire Customer",
    invoice_number: `WP-2026-WIRE${index + 1}`,
    invoice_status: "ISSUED",
    issued_at: "2026-01-01T10:00:00.000Z",
    payment_status_snapshot: "PAID",
    revision_number: 0,
    total_minor: 80000,
    vehicle_registration_snapshot: `KL 10 WIRE ${index + 1}`,
  }),
);

function wireEnvelope(
  invoices: readonly InvoiceRecord[],
  pagination: { hasNext: boolean; limit: number; nextCursor: string | null },
) {
  return {
    success: true as const,
    data: {
      invoices,
      pagination: {
        hasNext: pagination.hasNext,
        limit: pagination.limit,
        nextCursor: pagination.nextCursor,
      },
    },
  };
}

function fetchResponse(envelope: unknown): {
  ok: true;
  status: 200;
  json: () => Promise<unknown>;
} {
  return { ok: true, status: 200, json: async () => envelope };
}

function routeEnvelope(path: string): unknown {
  const params = new URLSearchParams(path.split("?")[1] ?? "");
  if (params.get("cursor") !== null) {
    return wireEnvelope(WIRE_INVOICES.slice(0, 3), {
      hasNext: false,
      limit: 15,
      nextCursor: null,
    });
  }
  if ((params.get("search") ?? "").length > 0) {
    return wireEnvelope(WIRE_INVOICES.slice(0, 3), {
      hasNext: false,
      limit: 15,
      nextCursor: null,
    });
  }
  return wireEnvelope(WIRE_INVOICES, {
    hasNext: true,
    limit: 15,
    nextCursor: "cursor2",
  });
}

function adminUser(): ReturnType<typeof useAuth> {
  return {
    loading: false,
    manualDiscountEnabled: false,
    paymentDefaultMethod: "CASH",
    user: {
      id: "admin-1",
      role: "ADMIN",
      permissions: [] as string[],
      branchId: "b1",
      fullName: "Admin",
      username: "admin",
    },
    login: async () => undefined,
    logout: async () => undefined,
    refresh: async () => undefined,
  };
}

vi.mock("../auth", () => ({
  useAuth: vi.fn(() => adminUser()),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/invoices"]}>
      <InvoicesPage />
    </MemoryRouter>,
  );
}

let fetchCalls: string[];

beforeEach(() => {
  fetchCalls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL): Promise<unknown> => {
      const path = typeof input === "string" ? input : input.toString();
      fetchCalls.push(path);
      return fetchResponse(routeEnvelope(path));
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Invoices directory — real API envelope contract", () => {
  it("renders the first page when the API returns the wire envelope", async () => {
    renderPage();
    await screen.findByText("WP-2026-WIRE1");
    expect(screen.getByText("WP-2026-WIRE15")).toBeDefined();
    expect(screen.getByText("Showing 15 invoices")).toBeDefined();
    expect(screen.getByText("Page 1")).toBeDefined();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.queryByText("No invoices found")).toBeNull();
  });

  it("requests the expected first page path", async () => {
    renderPage();
    await screen.findByText("WP-2026-WIRE1");
    expect(fetchCalls[0]).toBe("/api/v1/invoices?search=&limit=15");
  });

  it("disables Next when the API reports no further pages", async () => {
    renderPage();
    await screen.findByText("WP-2026-WIRE1");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Showing 3 invoices");
    expect(screen.getByText("Page 2")).toBeDefined();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("shows the empty state for an empty page", async () => {
    vi.mocked(fetch).mockResolvedValue(
      fetchResponse(
        wireEnvelope([], { hasNext: false, limit: 15, nextCursor: null }),
      ) as unknown as Response,
    );
    renderPage();
    expect(await screen.findByText("No invoices found")).toBeDefined();
    expect(document.querySelector("table")).toBeNull();
  });

  it("passes search terms to the API", async () => {
    renderPage();
    await screen.findByText("WP-2026-WIRE1");
    const input = screen.getByPlaceholderText(
      "Invoice, phone, or vehicle…",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "WP-2026" } });
    await waitFor(() =>
      expect(fetchCalls).toContain("/api/v1/invoices?search=WP-2026&limit=15"),
    );
  });

  it("sends the cursor when Next is clicked", async () => {
    renderPage();
    await screen.findByText("WP-2026-WIRE1");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(fetchCalls).toContain(
        "/api/v1/invoices?search=&limit=15&cursor=cursor2",
      ),
    );
    expect(await screen.findByText("Page 2")).toBeDefined();
  });
});
