import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import InvoicesPage from "./invoices";
import { api } from "../lib/api";
import type { InvoiceRecord } from "../types";

function makeInvoice(
  id: string,
  overrides: Partial<InvoiceRecord> = {},
): InvoiceRecord {
  return {
    balance_minor: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    customer_name_snapshot: "Test Customer",
    id,
    invoice_number: `WP-2026-${id.replace("inv", "")}`,
    invoice_status: "ISSUED",
    issued_at: "2026-01-01T10:00:00.000Z",
    payment_status_snapshot: "PAID",
    revision_number: 0,
    total_minor: 80000,
    vehicle_registration_snapshot: `KL 10 ${id.replace("inv", "IV ")}`,
    ...overrides,
  };
}

const FIRST_PAGE = Array.from({ length: 15 }, (_, index) =>
  makeInvoice(`inv${String(index + 1).padStart(2, "0")}`),
);

const SECOND_PAGE = Array.from({ length: 4 }, (_, index) =>
  makeInvoice(`inv${String(index + 16).padStart(2, "0")}`, {
    invoice_number: `WP-2026-0${index + 16}`,
    vehicle_registration_snapshot: `KL 11 ${index + 16}`,
  }),
);

function envelope(
  data: readonly InvoiceRecord[],
  pagination: { hasNext: boolean; nextCursor: string | null; limit: number },
) {
  return {
    pagination: {
      hasNext: pagination.hasNext,
      limit: pagination.limit,
      nextCursor: pagination.nextCursor,
    },
    invoices: data,
  };
}

function defaultApiResponse(path: string): unknown {
  const params = new URLSearchParams(path.split("?")[1] ?? "");
  if (params.get("cursor") !== null) {
    return envelope(SECOND_PAGE, {
      hasNext: false,
      limit: 15,
      nextCursor: null,
    });
  }
  if ((params.get("search") ?? "").length > 0) {
    return envelope(
      [
        makeInvoice("inv99", {
          invoice_number: "WP-2026-000099",
          vehicle_registration_snapshot: "KL 99 IV 9999",
        }),
      ],
      {
        hasNext: false,
        limit: 15,
        nextCursor: null,
      },
    );
  }
  return envelope(FIRST_PAGE, {
    hasNext: true,
    limit: 15,
    nextCursor: "cursor2",
  });
}

vi.mock("../lib/api", () => ({
  api: vi.fn(),
}));

function adminUser() {
  return {
    loading: false,
    manualDiscountEnabled: false,
    paymentDefaultMethod: "CASH",
    user: {
      id: "admin-1",
      role: "ADMIN" as const,
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

function searchInput(): HTMLInputElement {
  return screen.getByPlaceholderText(
    "Invoice, phone, or vehicle…",
  ) as HTMLInputElement;
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/invoices"]}>
      <Routes>
        <Route
          path="/invoices"
          element={
            <>
              <InvoicesPage />
              <LocationProbe />
            </>
          }
        />
        <Route
          path="/invoices/:id"
          element={
            <>
              <div>Invoice detail page</div>
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(api).mockImplementation(async (path: string): Promise<unknown> =>
    defaultApiResponse(path),
  );
});

afterEach(() => {
  cleanup();
  vi.mocked(api).mockClear();
});

describe("Invoices directory — server-side pagination", () => {
  it("requests only the first page of invoices on load", async () => {
    renderPage();
    await screen.findByText("WP-2026-01");
    expect(vi.mocked(api)).toHaveBeenCalledWith("/invoices?search=&limit=15");
    expect(screen.getByText("Showing 15 invoices")).toBeDefined();
    expect(screen.getByText("Page 1")).toBeDefined();
  });

  it("defaults to 15 rows per page", async () => {
    renderPage();
    await screen.findByText("WP-2026-01");
    expect(vi.mocked(api).mock.calls.map(([path]) => path)[0]).toBe(
      "/invoices?search=&limit=15",
    );
  });

  it("renders only the first page of invoices", async () => {
    renderPage();
    await screen.findByText("WP-2026-01");
    expect(screen.getByText("WP-2026-15")).toBeDefined();
    expect(screen.queryByText("WP-2026-016")).toBeNull();
  });

  it("renders the expected table columns", async () => {
    renderPage();
    await screen.findByText("WP-2026-01");
    for (const header of [
      "Invoice",
      "Customer & vehicle",
      "Issued",
      "Document",
      "Payment",
      "Total",
    ]) {
      expect(screen.getByRole("columnheader", { name: header })).toBeDefined();
    }
  });

  it("renders customer, vehicle, revision, and money details", async () => {
    renderPage();
    await screen.findByText("WP-2026-01");
    expect(screen.getAllByText("Test Customer")).toHaveLength(15);
    expect(screen.getAllByText("Original")).toHaveLength(15);
    expect(document.querySelectorAll(".status-badge--issued")).toHaveLength(15);
    expect(document.querySelectorAll(".status-badge--paid")).toHaveLength(15);
    expect(document.querySelector(".status-badge")).not.toBeNull();
  });

  it("loads the next page with the cursor when Next is clicked", async () => {
    renderPage();
    await screen.findByText("WP-2026-01");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("WP-2026-016");
    expect(vi.mocked(api)).toHaveBeenLastCalledWith(
      "/invoices?search=&limit=15&cursor=cursor2",
    );
    expect(screen.getByText("Page 2")).toBeDefined();
    expect(screen.getByText("Showing 4 invoices")).toBeDefined();
    expect(screen.queryByText("WP-2026-01")).toBeNull();
  });

  it("loads the previous page from the cursor history when Previous is clicked", async () => {
    renderPage();
    await screen.findByText("WP-2026-01");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("WP-2026-016");
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    await screen.findByText("WP-2026-01");
    expect(vi.mocked(api)).toHaveBeenLastCalledWith(
      "/invoices?search=&limit=15",
    );
    expect(screen.getByText("Page 1")).toBeDefined();
  });

  it("disables Previous on page 1", async () => {
    renderPage();
    await screen.findByText("WP-2026-01");
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  });

  it("disables Next when the API reports no further pages", async () => {
    renderPage();
    await screen.findByText("WP-2026-01");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("WP-2026-016");
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("resets to page 1 without a cursor when the search changes", async () => {
    renderPage();
    await screen.findByText("WP-2026-01");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("WP-2026-016");
    fireEvent.change(searchInput(), { target: { value: "WP-2026-000099" } });
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenLastCalledWith(
        "/invoices?search=WP-2026-000099&limit=15",
      ),
    );
    expect(screen.getByText("Page 1")).toBeDefined();
    expect(screen.getByText("Showing 1 invoices")).toBeDefined();
  });

  it("clearing the search resets to page 1", async () => {
    renderPage();
    await screen.findByText("WP-2026-01");
    fireEvent.change(searchInput(), { target: { value: "WP-2026-000099" } });
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenLastCalledWith(
        "/invoices?search=WP-2026-000099&limit=15",
      ),
    );
    fireEvent.change(searchInput(), { target: { value: "" } });
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenLastCalledWith(
        "/invoices?search=&limit=15",
      ),
    );
    expect(screen.getByText("Page 1")).toBeDefined();
    expect(screen.getByText("Showing 15 invoices")).toBeDefined();
  });

  it("shows the empty state for a search with no matches", async () => {
    vi.mocked(api).mockResolvedValue(
      envelope([], { hasNext: false, limit: 15, nextCursor: null }),
    );
    renderPage();
    expect(await screen.findByText("No invoices found")).toBeDefined();
    expect(document.querySelector("table")).toBeNull();
  });

  it("resets to page 1 and sends the new limit when the page size changes", async () => {
    renderPage();
    await screen.findByText("WP-2026-01");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("WP-2026-016");
    const select = screen.getByLabelText("Rows per page") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "25" } });
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenLastCalledWith(
        "/invoices?search=&limit=25",
      ),
    );
    expect(screen.getByText("Page 1")).toBeDefined();
  });

  it("offers exactly the 15, 25 and 50 page sizes", async () => {
    renderPage();
    await screen.findByText("WP-2026-01");
    const select = screen.getByLabelText("Rows per page") as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.value)).toEqual([
      "15",
      "25",
      "50",
    ]);
  });

  it("keeps the current page visible while the next page loads", async () => {
    const pending = new Map<string, { resolve: (value: unknown) => void }>();
    vi.mocked(api).mockImplementation(
      (path: string) =>
        new Promise((resolve) => {
          pending.set(path, { resolve });
        }),
    );
    renderPage();
    const initialPath = "/invoices?search=&limit=15";
    await waitFor(() => expect(pending.has(initialPath)).toBe(true));
    pending.get(initialPath)!.resolve(
      envelope(FIRST_PAGE, {
        hasNext: true,
        limit: 15,
        nextCursor: "cursor2",
      }),
    );
    await screen.findByText("WP-2026-01");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    const nextPath = "/invoices?search=&limit=15&cursor=cursor2";
    await waitFor(() => expect(pending.has(nextPath)).toBe(true));
    expect(screen.getByText("WP-2026-01")).toBeDefined();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(document.querySelector(".table-wrap")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    pending
      .get(nextPath)!
      .resolve(
        envelope(SECOND_PAGE, { hasNext: false, limit: 15, nextCursor: null }),
      );
    expect(await screen.findByText("WP-2026-016")).toBeDefined();
    expect(document.querySelector(".table-wrap")).toHaveAttribute(
      "aria-busy",
      "false",
    );
  });

  it("ignores stale responses that resolve after a newer request", async () => {
    const pending = new Map<string, { resolve: (value: unknown) => void }>();
    vi.mocked(api).mockImplementation(
      (path: string) =>
        new Promise((resolve) => {
          pending.set(path, { resolve });
        }),
    );
    renderPage();
    const initialPath = "/invoices?search=&limit=15";
    await waitFor(() => expect(pending.has(initialPath)).toBe(true));
    pending.get(initialPath)!.resolve(
      envelope(FIRST_PAGE, {
        hasNext: true,
        limit: 15,
        nextCursor: "cursor2",
      }),
    );
    await screen.findByText("WP-2026-01");

    fireEvent.change(searchInput(), { target: { value: "WP11" } });
    const firstSearchPath = "/invoices?search=WP11&limit=15";
    await waitFor(() => expect(pending.has(firstSearchPath)).toBe(true));

    fireEvent.change(searchInput(), { target: { value: "WP22" } });
    const secondSearchPath = "/invoices?search=WP22&limit=15";
    await waitFor(() => expect(pending.has(secondSearchPath)).toBe(true));

    pending.get(secondSearchPath)!.resolve(
      envelope([makeInvoice("inv22", { invoice_number: "WP-2026-000022" })], {
        hasNext: false,
        limit: 15,
        nextCursor: null,
      }),
    );
    expect(await screen.findByText("WP-2026-000022")).toBeDefined();

    pending.get(firstSearchPath)!.resolve(
      envelope([makeInvoice("inv11", { invoice_number: "WP-2026-000011" })], {
        hasNext: false,
        limit: 15,
        nextCursor: null,
      }),
    );
    await waitFor(() =>
      expect(screen.queryByText("WP-2026-000011")).toBeNull(),
    );
    expect(screen.getByText("WP-2026-000022")).toBeDefined();
  });

  it("announces the current page to assistive technology", async () => {
    renderPage();
    await screen.findByText("WP-2026-01");
    expect(screen.getByText("Page 1")).toHaveAttribute("aria-live", "polite");
  });

  it("navigates to the invoice detail page via the arrow link", async () => {
    renderPage();
    await screen.findByText("WP-2026-01");
    fireEvent.click(screen.getByLabelText("Open WP-2026-01"));
    expect(screen.getByText("Invoice detail page")).toBeDefined();
    expect(screen.getByTestId("location")).toHaveTextContent("/invoices/inv01");
  });

  it("shows the error state with a retry action", async () => {
    vi.mocked(api).mockRejectedValue(new Error("Network error"));
    renderPage();
    expect(await screen.findByText("Network error")).toBeDefined();
    expect(screen.getByRole("button", { name: "Try again" })).toBeDefined();
  });
});
