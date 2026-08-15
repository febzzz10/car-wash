import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import PaymentsPage from "./payments";
import { useAuth } from "../auth";
import type { PaymentRecord } from "../types";

const WIRE_PAYMENTS: readonly PaymentRecord[] = Array.from(
  { length: 15 },
  (_, index) => ({
    id: `wire-pay${index + 1}`,
    amount_minor: 40000,
    collected_by_name_snapshot: "Rahul Nair",
    created_at: "2026-07-10T07:30:00.000Z",
    customer_name_snapshot: "Wire Customer",
    external_transaction_reference: null,
    job_reference: `WJ-2026-WIRE${index + 1}`,
    paid_at: "2026-07-10T08:00:00.000Z",
    payment_method: "UPI",
    payment_status: "PAID",
    status: "SUCCESS",
    tip_minor: 5000,
    vehicle_registration_snapshot: `KL 10 WIRE ${index + 1}`,
    wash_job_id: `job-wire-${index + 1}`,
  }),
);

function wireEnvelope(
  payments: readonly PaymentRecord[],
  pagination: { hasNext: boolean; limit: number; nextCursor: string | null },
) {
  return {
    success: true as const,
    data: {
      payments,
      pagination: {
        hasNext: pagination.hasNext,
        limit: pagination.limit,
        nextCursor: pagination.nextCursor,
      },
    },
  };
}

function successEnvelope(data: unknown) {
  return { success: true as const, data };
}

function fetchResponse(envelope: unknown): {
  ok: true;
  status: 200;
  json: () => Promise<unknown>;
} {
  return { ok: true, status: 200, json: async () => envelope };
}

function routeEnvelope(path: string): unknown {
  if (path.endsWith("/settings")) {
    return successEnvelope({ settings: [] });
  }
  if (path.endsWith("/payments/filter-options")) {
    return successEnvelope({
      staff: [{ active: true, id: "staff-1000020001", name: "Rahul Nair" }],
    });
  }
  const params = new URLSearchParams(path.split("?")[1] ?? "");
  if (params.get("cursor") !== null) {
    return wireEnvelope(WIRE_PAYMENTS.slice(0, 3), {
      hasNext: false,
      limit: 15,
      nextCursor: null,
    });
  }
  return wireEnvelope(WIRE_PAYMENTS, {
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

vi.mock("../components/toast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/payments"]}>
      <PaymentsPage />
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

describe("Payments directory — real API envelope contract", () => {
  it("renders the first page when the API returns the wire envelope", async () => {
    renderPage();
    await screen.findByText("WJ-2026-WIRE1");
    expect(screen.getByText("WJ-2026-WIRE15")).toBeDefined();
    expect(screen.getByText("Showing 15 payments")).toBeDefined();
    expect(screen.getByText("Page 1")).toBeDefined();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.queryByText("No payments recorded")).toBeNull();
  });

  it("requests the expected first page path", async () => {
    renderPage();
    await screen.findByText("WJ-2026-WIRE1");
    expect(fetchCalls).toContain("/api/v1/payments?limit=15");
  });

  it("disables Next when the API reports no further pages", async () => {
    renderPage();
    await screen.findByText("WJ-2026-WIRE1");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Showing 3 payments");
    expect(screen.getByText("Page 2")).toBeDefined();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("shows the empty state for an empty page", async () => {
    vi.mocked(fetch).mockImplementation(
      async (
        input: RequestInfo | URL,
        _init?: RequestInit,
      ): Promise<Response> => {
        const path = typeof input === "string" ? input : input.toString();
        fetchCalls.push(path);
        if (path.endsWith("/settings")) {
          return fetchResponse(
            successEnvelope({ settings: [] }),
          ) as unknown as Response;
        }
        if (path.endsWith("/payments/filter-options")) {
          return fetchResponse(
            successEnvelope({
              staff: [
                { active: true, id: "staff-1000020001", name: "Rahul Nair" },
              ],
            }),
          ) as unknown as Response;
        }
        return fetchResponse(
          wireEnvelope([], { hasNext: false, limit: 15, nextCursor: null }),
        ) as unknown as Response;
      },
    );
    renderPage();
    expect(await screen.findByText("No payments recorded")).toBeDefined();
    expect(document.querySelector("table")).toBeNull();
  });

  it("applies filters and requests the filtered path through the real api()", async () => {
    renderPage();
    await screen.findByText("WJ-2026-WIRE1");
    const input = screen.getByLabelText("From") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2026-07-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    await waitFor(() =>
      expect(fetchCalls).toContain("/api/v1/payments?from=2026-07-01&limit=15"),
    );
    expect(await screen.findByText("WJ-2026-WIRE1")).toBeDefined();
    expect(screen.getByText("Page 1")).toBeDefined();
  });

  it("sends the cursor when Next is clicked", async () => {
    renderPage();
    await screen.findByText("WJ-2026-WIRE1");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(fetchCalls).toContain("/api/v1/payments?limit=15&cursor=cursor2"),
    );
    expect(await screen.findByText("Page 2")).toBeDefined();
  });
});
