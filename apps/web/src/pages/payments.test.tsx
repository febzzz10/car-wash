import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import PaymentsPage from "./payments";
import { useAuth } from "../auth";
import { useApiData } from "../hooks/use-api-data";
import { api } from "../lib/api";
import type { PaymentRecord } from "../types";

vi.mock("../auth", () => ({
  useAuth: vi.fn(() => ({
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
  })),
}));

vi.mock("../lib/api", () => ({
  api: vi.fn(),
  jsonBody: (value: unknown) => ({ body: JSON.stringify(value) }),
}));

vi.mock("../components/toast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

const optionsFixture = {
  staff: [
    { active: true, id: "staff-1000020001", name: "Rahul Nair" },
    { active: false, id: "staff-1000020002", name: "Arun Pillai" },
  ],
};

vi.mock("../hooks/use-api-data", () => ({
  useApiData: vi.fn((_path: string, _enabled?: boolean) => {
    if (_path === "/settings") {
      return {
        data: {
          settings: [] as readonly {
            setting_key: string;
            value_text: string;
          }[],
        },
        error: null,
        loading: false,
        reload: vi.fn(),
      };
    }
    if (_path === "/payments/filter-options") {
      return {
        data: optionsFixture,
        error: null,
        loading: false,
        reload: vi.fn(),
      };
    }
    return { data: null, error: null, loading: false, reload: vi.fn() };
  }),
}));

function makePayment(
  name: string,
  id: string,
  overrides: Partial<PaymentRecord> = {},
): PaymentRecord {
  return {
    amount_minor: 40000,
    collected_by_name_snapshot: name,
    created_at: "2026-07-10T07:30:00.000Z",
    customer_name_snapshot: "Arun Kumar",
    external_transaction_reference: null,
    id,
    job_reference: "WP-0001",
    paid_at: "2026-07-10T08:00:00.000Z",
    payment_method: "UPI",
    payment_status: "PAID",
    status: "SUCCESS",
    tip_minor: 5000,
    vehicle_registration_snapshot: "KL 07 AB 1234",
    wash_job_id: "job-1",
    ...overrides,
  };
}

const FIRST_PAGE: readonly PaymentRecord[] = [
  makePayment("Rahul Nair", "pay-1"),
  makePayment("Rahul Nair", "pay-2"),
  makePayment("", "pay-3", {
    amount_minor: 25000,
    collected_by_name_snapshot: null,
    customer_name_snapshot: "Meera Pillai",
    job_reference: "WP-0002",
    paid_at: "2026-07-11T09:00:00.000Z",
    payment_method: "CASH",
    tip_minor: 0,
    vehicle_registration_snapshot: "KL 08 CD 5678",
    wash_job_id: "job-2",
  }),
  makePayment("", "pay-4", {
    amount_minor: 30000,
    collected_by_name_snapshot: "",
    customer_name_snapshot: "Suresh Menon",
    job_reference: "WP-0003",
    paid_at: "2026-07-12T10:00:00.000Z",
    payment_method: "PAYTM",
    tip_minor: 0,
    vehicle_registration_snapshot: "KL 09 EF 9012",
    wash_job_id: "job-3",
  }),
  makePayment("", "pay-5", {
    amount_minor: 10000,
    collected_by_name_snapshot: "   ",
    customer_name_snapshot: "Lina Referred",
    job_reference: "WP-0004",
    paid_at: "2026-07-13T11:00:00.000Z",
    payment_method: "BANK_UPI",
    tip_minor: 0,
    vehicle_registration_snapshot: "KL 10 GH 3456",
    wash_job_id: "job-4",
  }),
];

const SECOND_PAGE: readonly PaymentRecord[] = [
  makePayment("Arun Pillai", "pay-6", {
    customer_name_snapshot: "Deepa Nair",
    job_reference: "WP-0005",
    paid_at: "2026-07-14T09:00:00.000Z",
    tip_minor: 0,
    vehicle_registration_snapshot: "KL 11 IJ 7890",
    wash_job_id: "job-5",
  }),
  makePayment("Arun Pillai", "pay-7", {
    customer_name_snapshot: "Kiran Das",
    job_reference: "WP-0006",
    paid_at: "2026-07-15T10:00:00.000Z",
    tip_minor: 0,
    vehicle_registration_snapshot: "KL 12 KL 1122",
    wash_job_id: "job-6",
  }),
];

function envelope(
  data: readonly PaymentRecord[],
  pagination: { hasNext: boolean; nextCursor: string | null; limit: number },
) {
  return {
    pagination: {
      hasNext: pagination.hasNext,
      limit: pagination.limit,
      nextCursor: pagination.nextCursor,
    },
    payments: data,
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
  return envelope(FIRST_PAGE, {
    hasNext: true,
    limit: 15,
    nextCursor: "cursor2",
  });
}

function renderPage(initialPath = "/payments") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <PaymentsPage />
    </MemoryRouter>,
  );
}

async function loadPage(initialPath = "/payments") {
  renderPage(initialPath);
  await screen.findAllByText("WP-0001");
}

beforeEach(() => {
  vi.mocked(api).mockImplementation(async (path: string): Promise<unknown> =>
    defaultApiResponse(path),
  );
});

afterEach(() => {
  cleanup();
  vi.mocked(api).mockClear();
  vi.mocked(useApiData).mockClear();
  vi.mocked(useAuth).mockClear();
});

describe("Payments — Assigned staff column", () => {
  it("shows the Collected by column header", async () => {
    await loadPage();
    expect(
      screen.getByRole("columnheader", { name: /collected by/i }),
    ).toBeInTheDocument();
  });

  it("keeps the existing column headers", async () => {
    await loadPage();
    for (const name of [
      "Job",
      "Customer & vehicle",
      "Method",
      "Paid at",
      "Status",
      "Amount",
      "Tip",
    ]) {
      expect(screen.getByRole("columnheader", { name })).toBeInTheDocument();
    }
  });

  it("shows the assigned staff snapshot name for an assigned payment", async () => {
    await loadPage();
    const row = screen.getAllByRole("row", { name: /WP-0001/ })[0]!;
    expect(within(row).getByText("Rahul Nair")).toBeInTheDocument();
  });

  it("shows Not recorded for a payment with a null snapshot", async () => {
    await loadPage();
    const row = screen.getByRole("row", { name: /WP-0002/ });
    expect(within(row).getByText("Not recorded")).toBeInTheDocument();
  });

  it("shows Not recorded for a payment with an empty snapshot", async () => {
    await loadPage();
    const row = screen.getByRole("row", { name: /WP-0003/ });
    expect(within(row).getByText("Not recorded")).toBeInTheDocument();
  });

  it("shows Not recorded for a payment with a whitespace-only snapshot", async () => {
    await loadPage();
    const row = screen.getByRole("row", { name: /WP-0004/ });
    expect(within(row).getByText("Not recorded")).toBeInTheDocument();
  });

  it("does not expose the staff ID in the table", async () => {
    await loadPage();
    expect(screen.queryByText("staff-1000020001")).toBeNull();
  });

  it("shows the same snapshot name on every payment of one wash job", async () => {
    await loadPage();
    const rows = screen.getAllByRole("row", { name: /WP-0001/ });
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(within(row).getByText("Rahul Nair")).toBeInTheDocument();
    }
  });

  it("renders the job number and links to the wash job", async () => {
    await loadPage();
    const links = screen.getAllByRole("link", { name: /WP-0001/ });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/wash-jobs/job-1");
    }
  });

  it("still renders customer and vehicle", async () => {
    await loadPage();
    expect(screen.getAllByText("KL 07 AB 1234")).toHaveLength(2);
    expect(screen.getAllByText("Arun Kumar")).toHaveLength(2);
  });

  it("still renders the payment method", async () => {
    await loadPage();
    expect(screen.getAllByText("UPI").length).toBeGreaterThan(0);
    expect(screen.getByText("Cash")).toBeInTheDocument();
    expect(screen.getByText("Paytm")).toBeInTheDocument();
    expect(screen.getByText("Bank UPI")).toBeInTheDocument();
  });

  it("still renders the paid-at date and time", async () => {
    await loadPage();
    expect(screen.getAllByText(/10 Jul 2026/i).length).toBeGreaterThan(0);
  });

  it("still renders the status badge", async () => {
    await loadPage();
    expect(screen.getAllByText("Success").length).toBeGreaterThan(0);
  });

  it("still renders the amount", async () => {
    await loadPage();
    expect(screen.getAllByText("₹400.00")).toHaveLength(2);
    expect(screen.getByText("₹250.00")).toBeInTheDocument();
    expect(screen.getByText("₹300.00")).toBeInTheDocument();
    expect(screen.getByText("₹100.00")).toBeInTheDocument();
  });

  it("still renders the tip and leaves it blank when zero", async () => {
    await loadPage();
    expect(screen.getAllByText("₹50.00")).toHaveLength(2);
    const unassignedRow = screen.getByRole("row", { name: /WP-0002/ });
    expect(within(unassignedRow).queryByText("₹50.00")).not.toBeInTheDocument();
  });

  it("keeps the empty state when no payments exist", async () => {
    vi.mocked(api).mockResolvedValue(
      envelope([], { hasNext: false, limit: 15, nextCursor: null }),
    );
    renderPage();
    expect(await screen.findByText("No payments recorded")).toBeInTheDocument();
  });
});

describe("Payments — admin filter controls", () => {
  it("shows the filter controls for administrators", () => {
    renderPage();
    expect(screen.getByLabelText("From")).toBeInTheDocument();
    expect(screen.getByLabelText("To")).toBeInTheDocument();
    expect(screen.getByLabelText("Collected by")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Apply filters" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Clear filters" }),
    ).toBeInTheDocument();
  });

  it("starts with the unfiltered list and no date defaults", async () => {
    await loadPage();
    expect(screen.getByLabelText("From")).toHaveValue("");
    expect(screen.getByLabelText("To")).toHaveValue("");
    expect(vi.mocked(api)).toHaveBeenCalledWith("/payments?limit=15");
    expect(
      screen.getByRole("button", { name: "Clear filters" }),
    ).toBeDisabled();
  });

  it("hides the filter controls and uses the plain URL for staff", async () => {
    vi.mocked(useAuth).mockImplementation(() => ({
      loading: false,
      manualDiscountEnabled: false,
      paymentDefaultMethod: "CASH",
      user: {
        branchId: "b1",
        fullName: "Staff",
        id: "staff-1",
        permissions: ["payments.create"],
        role: "STAFF",
        username: "staff",
      },
      login: async () => undefined,
      logout: async () => undefined,
      refresh: async () => undefined,
    }));
    await loadPage();
    expect(screen.queryByLabelText("Collected by")).toBeNull();
    expect(screen.queryByRole("button", { name: "Apply filters" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
    expect(vi.mocked(api)).toHaveBeenCalledWith("/payments?limit=15");
    vi.mocked(useAuth).mockImplementation(() => ({
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
    }));
  });

  it("populates the staff select from the options endpoint", () => {
    renderPage();
    const select = screen.getByLabelText("Collected by") as HTMLSelectElement;
    expect(
      within(select).getByRole("option", { name: "All employees" }),
    ).toBeInTheDocument();
    expect(
      within(select).getByRole("option", { name: "Rahul Nair" }),
    ).toBeInTheDocument();
    expect(
      within(select).getByRole("option", { name: "Arun Pillai" }),
    ).toBeInTheDocument();
    expect(select.querySelectorAll("option")).toHaveLength(3);
  });

  it("does not refetch while filters are being edited", async () => {
    await loadPage();
    vi.mocked(api).mockClear();
    fireEvent.change(screen.getByLabelText("From"), {
      target: { value: "2026-07-01" },
    });
    fireEvent.change(screen.getByLabelText("To"), {
      target: { value: "2026-07-31" },
    });
    fireEvent.change(screen.getByLabelText("Collected by"), {
      target: { value: "staff-1000020001" },
    });
    expect(vi.mocked(api)).not.toHaveBeenCalledWith(
      expect.stringContaining("from="),
    );
  });

  it("applies the chosen date range only after Apply", async () => {
    await loadPage();
    fireEvent.change(screen.getByLabelText("From"), {
      target: { value: "2026-07-01" },
    });
    fireEvent.change(screen.getByLabelText("To"), {
      target: { value: "2026-07-31" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenCalledWith(
        "/payments?from=2026-07-01&to=2026-07-31&limit=15",
      ),
    );
  });

  it("applies the chosen staff member by stable ID after Apply", async () => {
    await loadPage();
    fireEvent.change(screen.getByLabelText("Collected by"), {
      target: { value: "staff-1000020001" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenCalledWith(
        "/payments?assignedUserId=staff-1000020001&limit=15",
      ),
    );
  });

  it("shows the applied filter summary", async () => {
    await loadPage();
    fireEvent.change(screen.getByLabelText("From"), {
      target: { value: "2026-07-01" },
    });
    fireEvent.change(screen.getByLabelText("To"), {
      target: { value: "2026-07-15" },
    });
    fireEvent.change(screen.getByLabelText("Collected by"), {
      target: { value: "staff-1000020001" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(
      await screen.findByText(
        /Showing payments from .*1 Jul 2026.* to .*15 Jul 2026.* collected by Rahul Nair/i,
      ),
    ).toBeInTheDocument();
  });

  it("does not show a summary before any filters are applied", async () => {
    await loadPage();
    expect(screen.queryByText(/Showing payments/i)).not.toBeInTheDocument();
  });

  it("rejects a reversed date range with an exact message and no request", async () => {
    await loadPage();
    fireEvent.change(screen.getByLabelText("From"), {
      target: { value: "2026-07-15" },
    });
    fireEvent.change(screen.getByLabelText("To"), {
      target: { value: "2026-07-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "From date cannot be later than To date.",
    );
    expect(vi.mocked(api)).not.toHaveBeenCalledWith(
      expect.stringContaining("from=2026-07-15"),
    );
  });

  it("rejects an impossible draft date without sending a request", async () => {
    renderPage("/payments?from=2026-02-30");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter a valid payment filter.",
    );
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenCalledWith("/payments?limit=15"),
    );
  });

  it("clears filters back to the unfiltered list", async () => {
    await loadPage();
    fireEvent.change(screen.getByLabelText("Collected by"), {
      target: { value: "staff-1000020001" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenCalledWith(
        "/payments?assignedUserId=staff-1000020001&limit=15",
      ),
    );
    const clearButton = screen.getByRole("button", { name: "Clear filters" });
    expect(clearButton).not.toBeDisabled();
    fireEvent.click(clearButton);
    expect(screen.getByLabelText("From")).toHaveValue("");
    expect(screen.getByLabelText("To")).toHaveValue("");
    expect(
      (screen.getByLabelText("Collected by") as HTMLSelectElement).value,
    ).toBe("");
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenCalledWith("/payments?limit=15"),
    );
    expect(screen.queryByText(/Showing payments/i)).not.toBeInTheDocument();
  });

  it("shows the Apply button busy while the filtered request is pending", async () => {
    const pending = new Map<string, { resolve: (value: unknown) => void }>();
    vi.mocked(api).mockImplementation(
      (path: string) =>
        new Promise((resolve) => {
          pending.set(path, { resolve });
        }),
    );
    renderPage();
    await waitFor(() => expect(pending.has("/payments?limit=15")).toBe(true));
    pending.get("/payments?limit=15")!.resolve(
      envelope(FIRST_PAGE, {
        hasNext: true,
        limit: 15,
        nextCursor: "cursor2",
      }),
    );
    await screen.findAllByText("WP-0001");
    fireEvent.change(screen.getByLabelText("Collected by"), {
      target: { value: "staff-1000020001" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    const filteredPath = "/payments?assignedUserId=staff-1000020001&limit=15";
    await waitFor(() => expect(pending.has(filteredPath)).toBe(true));
    const applyButton = screen.getByRole("button", { name: "Apply filters" });
    expect(applyButton).toBeDisabled();
    expect(applyButton).toHaveAttribute("aria-busy", "true");
    pending.get(filteredPath)!.resolve(
      envelope(FIRST_PAGE, {
        hasNext: true,
        limit: 15,
        nextCursor: "cursor2",
      }),
    );
    await waitFor(() => expect(applyButton).toBeEnabled());
  });

  it("restores active filters from the URL on load", async () => {
    renderPage(
      "/payments?from=2026-07-01&to=2026-07-15&assignedUserId=staff-1000020001",
    );
    await screen.findAllByText("WP-0001");
    expect(screen.getByLabelText("From")).toHaveValue("2026-07-01");
    expect(screen.getByLabelText("To")).toHaveValue("2026-07-15");
    expect(
      (screen.getByLabelText("Collected by") as HTMLSelectElement).value,
    ).toBe("staff-1000020001");
    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/payments?from=2026-07-01&to=2026-07-15&assignedUserId=staff-1000020001&limit=15",
    );
    expect(
      screen.getByText(
        /Showing payments from .* to .* collected by Rahul Nair/i,
      ),
    ).toBeInTheDocument();
  });

  it("falls back to the unfiltered list for an invalid URL without crashing", async () => {
    renderPage("/payments?from=not-a-date");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter a valid payment filter.",
    );
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenCalledWith("/payments?limit=15"),
    );
  });

  it("treats assignedUserId=UNASSIGNED as invalid and falls back", async () => {
    renderPage("/payments?assignedUserId=UNASSIGNED");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter a valid payment filter.",
    );
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenCalledWith("/payments?limit=15"),
    );
  });
});

describe("Payments — server-side pagination", () => {
  it("requests only the first page of payments on load", async () => {
    renderPage();
    await screen.findAllByText("WP-0001");
    expect(vi.mocked(api)).toHaveBeenCalledWith("/payments?limit=15");
    expect(screen.getByText("Showing 5 payments")).toBeDefined();
    expect(screen.getByText("Page 1")).toBeDefined();
  });

  it("renders only the first page of payments", async () => {
    renderPage();
    await screen.findAllByText("WP-0001");
    expect(screen.queryByText("WP-0005")).toBeNull();
  });

  it("loads the next page with the cursor when Next is clicked", async () => {
    renderPage();
    await screen.findAllByText("WP-0001");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("WP-0005");
    expect(vi.mocked(api)).toHaveBeenLastCalledWith(
      "/payments?limit=15&cursor=cursor2",
    );
    expect(screen.getByText("Page 2")).toBeDefined();
    expect(screen.getByText("Showing 2 payments")).toBeDefined();
    expect(screen.queryByText("WP-0001")).toBeNull();
  });

  it("loads the previous page from the cursor history when Previous is clicked", async () => {
    renderPage();
    await screen.findAllByText("WP-0001");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("WP-0005");
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    await screen.findAllByText("WP-0001");
    expect(vi.mocked(api)).toHaveBeenLastCalledWith("/payments?limit=15");
    expect(screen.getByText("Page 1")).toBeDefined();
  });

  it("disables Previous on page 1", async () => {
    renderPage();
    await screen.findAllByText("WP-0001");
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  });

  it("disables Next when the API reports no further pages", async () => {
    renderPage();
    await screen.findAllByText("WP-0001");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("WP-0005");
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("resets to page 1 and sends the new limit when the page size changes", async () => {
    renderPage();
    await screen.findAllByText("WP-0001");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("WP-0005");
    const select = screen.getByLabelText("Rows per page") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "25" } });
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenLastCalledWith("/payments?limit=25"),
    );
    expect(screen.getByText("Page 1")).toBeDefined();
  });

  it("offers exactly the 15, 25 and 50 page sizes", async () => {
    renderPage();
    await screen.findAllByText("WP-0001");
    const select = screen.getByLabelText("Rows per page") as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.value)).toEqual([
      "15",
      "25",
      "50",
    ]);
  });

  it("preserves applied filters when the page size changes", async () => {
    renderPage();
    await screen.findAllByText("WP-0001");
    fireEvent.change(screen.getByLabelText("From"), {
      target: { value: "2026-07-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenCalledWith(
        "/payments?from=2026-07-01&limit=15",
      ),
    );
    const select = screen.getByLabelText("Rows per page") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "50" } });
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenLastCalledWith(
        "/payments?from=2026-07-01&limit=50",
      ),
    );
    expect(screen.getByText("Page 1")).toBeDefined();
  });

  it("resets to page 1 when new filters are applied from a later page", async () => {
    renderPage();
    await screen.findAllByText("WP-0001");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("WP-0005");
    expect(screen.getByText("Page 2")).toBeDefined();
    fireEvent.change(screen.getByLabelText("From"), {
      target: { value: "2026-07-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenLastCalledWith(
        "/payments?from=2026-07-01&limit=15",
      ),
    );
    expect(screen.getByText("Page 1")).toBeDefined();
  });

  it("resets to page 1 when filters are cleared from a later page", async () => {
    renderPage("/payments?from=2026-07-01");
    await screen.findAllByText("WP-0001");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("WP-0005");
    expect(screen.getByText("Page 2")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenLastCalledWith("/payments?limit=15"),
    );
    expect(screen.getByText("Page 1")).toBeDefined();
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
    const initialPath = "/payments?limit=15";
    await waitFor(() => expect(pending.has(initialPath)).toBe(true));
    pending.get(initialPath)!.resolve(
      envelope(FIRST_PAGE, {
        hasNext: true,
        limit: 15,
        nextCursor: "cursor2",
      }),
    );
    await screen.findAllByText("WP-0001");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    const nextPath = "/payments?limit=15&cursor=cursor2";
    await waitFor(() => expect(pending.has(nextPath)).toBe(true));
    expect(screen.getAllByText("WP-0001").length).toBeGreaterThan(0);
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
    expect(await screen.findByText("WP-0005")).toBeDefined();
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
    const initialPath = "/payments?limit=15";
    await waitFor(() => expect(pending.has(initialPath)).toBe(true));
    pending.get(initialPath)!.resolve(
      envelope(FIRST_PAGE, {
        hasNext: true,
        limit: 15,
        nextCursor: "cursor2",
      }),
    );
    await screen.findAllByText("WP-0001");

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    const cursorPath = "/payments?limit=15&cursor=cursor2";
    await waitFor(() => expect(pending.has(cursorPath)).toBe(true));

    const select = screen.getByLabelText("Rows per page") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "25" } });
    const pageSizePath = "/payments?limit=25";
    await waitFor(() => expect(pending.has(pageSizePath)).toBe(true));

    pending.get(pageSizePath)!.resolve(
      envelope(
        [makePayment("Rahul Nair", "pay-22", { job_reference: "WP-0022" })],
        {
          hasNext: false,
          limit: 25,
          nextCursor: null,
        },
      ),
    );
    expect(await screen.findByText("WP-0022")).toBeDefined();

    pending
      .get(cursorPath)!
      .resolve(
        envelope(SECOND_PAGE, { hasNext: false, limit: 15, nextCursor: null }),
      );
    await waitFor(() => expect(screen.queryByText("WP-0005")).toBeNull());
    expect(screen.getByText("WP-0022")).toBeDefined();
    expect(screen.getByText("Page 1")).toBeDefined();
  });

  it("does not push a second cursor while a page transition is pending", async () => {
    const pending = new Map<string, { resolve: (value: unknown) => void }>();
    vi.mocked(api).mockImplementation(
      (path: string) =>
        new Promise((resolve) => {
          pending.set(path, { resolve });
        }),
    );
    renderPage();
    const initialPath = "/payments?limit=15";
    await waitFor(() => expect(pending.has(initialPath)).toBe(true));
    pending.get(initialPath)!.resolve(
      envelope(FIRST_PAGE, {
        hasNext: true,
        limit: 15,
        nextCursor: "cursor2",
      }),
    );
    await screen.findAllByText("WP-0001");
    const next = screen.getByRole("button", { name: "Next" });
    fireEvent.click(next);
    const nextPath = "/payments?limit=15&cursor=cursor2";
    await waitFor(() => expect(pending.has(nextPath)).toBe(true));
    expect(next).toBeDisabled();
    fireEvent.click(next);
    expect(
      [...pending.keys()].filter((key) => key.includes("cursor=cursor2")),
    ).toHaveLength(1);
    pending
      .get(nextPath)!
      .resolve(
        envelope(SECOND_PAGE, { hasNext: false, limit: 15, nextCursor: null }),
      );
    await screen.findByText("WP-0005");
    expect(screen.getByText("Page 2")).toBeDefined();
  });

  it("shows the filtered empty state when a filter matches nothing", async () => {
    vi.mocked(api).mockImplementation(
      async (path: string): Promise<unknown> => {
        if (path.includes("from=")) {
          return envelope([], { hasNext: false, limit: 15, nextCursor: null });
        }
        return defaultApiResponse(path);
      },
    );
    renderPage();
    await screen.findAllByText("WP-0001");
    fireEvent.change(screen.getByLabelText("From"), {
      target: { value: "2026-07-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(
      await screen.findByText("No payments match these filters"),
    ).toBeDefined();
    expect(document.querySelector("table")).toBeNull();
  });

  it("announces the current page to assistive technology", async () => {
    renderPage();
    await screen.findAllByText("WP-0001");
    expect(screen.getByText("Page 1")).toHaveAttribute("aria-live", "polite");
  });

  it("shows the error state with a retry action", async () => {
    vi.mocked(api).mockRejectedValue(new Error("Network error"));
    renderPage();
    expect(await screen.findByText("Network error")).toBeDefined();
    expect(screen.getByRole("button", { name: "Try again" })).toBeDefined();
  });
});
