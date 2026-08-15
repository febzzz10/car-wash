import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import CustomersPage from "./customers";
import { useAuth } from "../auth";
import type { CustomerRecord } from "../types";

const WIRE_CUSTOMERS: readonly CustomerRecord[] = Array.from(
  { length: 15 },
  (_, index) => ({
    id: `wire-${index + 1}`,
    full_name: `Wire Customer ${index + 1}`,
    phone: "9002005005",
    phone_normalized: "+919002005005",
    status: "ACTIVE",
    total_visits_cached: 0,
    total_spent_minor_cached: 0,
    last_visit_at: null,
    version: 1,
  }),
);

function wireEnvelope(
  customers: readonly CustomerRecord[],
  pagination: { hasNext: boolean; limit: number; nextCursor: string | null },
) {
  return {
    success: true as const,
    data: {
      customers,
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
    return wireEnvelope(WIRE_CUSTOMERS.slice(0, 3), {
      hasNext: false,
      limit: 15,
      nextCursor: null,
    });
  }
  if ((params.get("search") ?? "").length > 0) {
    return wireEnvelope(WIRE_CUSTOMERS.slice(0, 3), {
      hasNext: false,
      limit: 15,
      nextCursor: null,
    });
  }
  return wireEnvelope(WIRE_CUSTOMERS, {
    hasNext: true,
    limit: 15,
    nextCursor: "cursor2",
  });
}

vi.mock("../components/toast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

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
    <MemoryRouter initialEntries={["/customers"]}>
      <CustomersPage />
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

describe("Customers directory — real API envelope contract", () => {
  it("renders the first page when the API returns the wire envelope", async () => {
    renderPage();
    await screen.findByText("Wire Customer 1");
    expect(screen.getByText("Wire Customer 15")).toBeDefined();
    expect(screen.getByText("Showing 15 customers")).toBeDefined();
    expect(screen.getByText("Page 1")).toBeDefined();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.queryByText("No customers found")).toBeNull();
  });

  it("requests the expected first page path", async () => {
    renderPage();
    await screen.findByText("Wire Customer 1");
    expect(fetchCalls[0]).toBe("/api/v1/customers?search=&status=ACTIVE&limit=15");
  });

  it("disables Next when the API reports no further pages", async () => {
    renderPage();
    await screen.findByText("Wire Customer 1");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Showing 3 customers");
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
    expect(await screen.findByText("No customers found")).toBeDefined();
    expect(document.querySelector("table")).toBeNull();
  });

  it("passes search terms to the API", async () => {
    renderPage();
    await screen.findByText("Wire Customer 1");
    const input = screen.getByPlaceholderText(
      "Search name, phone, or registration…",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Rohit" } });
    await waitFor(() =>
      expect(fetchCalls).toContain(
        "/api/v1/customers?search=Rohit&status=ACTIVE&limit=15",
      ),
    );
  });

  it("sends the cursor when Next is clicked", async () => {
    renderPage();
    await screen.findByText("Wire Customer 1");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(fetchCalls).toContain(
        "/api/v1/customers?search=&status=ACTIVE&limit=15&cursor=cursor2",
      ),
    );
    expect(await screen.findByText("Page 2")).toBeDefined();
  });
});
