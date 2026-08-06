import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import PaymentsPage from "./payments";
import { useAuth } from "../auth";
import { useApiData } from "../hooks/use-api-data";

const mockReload = vi.fn();
let filteredQueryLoading = false;

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
  assignedStaff: [
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
        reload: mockReload,
      };
    }
    if (_path === "/payments/filter-options") {
      return {
        data: optionsFixture,
        error: null,
        loading: false,
        reload: mockReload,
      };
    }
    const assigned = (name: string, id: string) => ({
      amount_minor: 40000,
      assigned_user_id: "staff-1000020001",
      assigned_user_name_snapshot: name,
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
      version: 1,
    });
    return {
      data: [
        assigned("Rahul Nair", "pay-1"),
        assigned("Rahul Nair", "pay-2"),
        {
          ...assigned("", "pay-3"),
          amount_minor: 25000,
          assigned_user_id: "staff-1000020002",
          assigned_user_name_snapshot: null,
          customer_name_snapshot: "Meera Pillai",
          id: "pay-3",
          job_reference: "WP-0002",
          paid_at: "2026-07-11T09:00:00.000Z",
          payment_method: "CASH",
          tip_minor: 0,
          vehicle_registration_snapshot: "KL 08 CD 5678",
          wash_job_id: "job-2",
        },
        {
          ...assigned("", "pay-4"),
          amount_minor: 30000,
          assigned_user_id: "staff-1000020002",
          assigned_user_name_snapshot: "",
          customer_name_snapshot: "Suresh Menon",
          id: "pay-4",
          job_reference: "WP-0003",
          paid_at: "2026-07-12T10:00:00.000Z",
          payment_method: "PAYTM",
          tip_minor: 0,
          vehicle_registration_snapshot: "KL 09 EF 9012",
          wash_job_id: "job-3",
        },
        {
          ...assigned("", "pay-5"),
          amount_minor: 10000,
          assigned_user_id: "staff-1000020002",
          assigned_user_name_snapshot: "   ",
          customer_name_snapshot: "Lina Referred",
          id: "pay-5",
          job_reference: "WP-0004",
          paid_at: "2026-07-13T11:00:00.000Z",
          payment_method: "BANK_UPI",
          tip_minor: 0,
          vehicle_registration_snapshot: "KL 10 GH 3456",
          wash_job_id: "job-4",
        },
      ],
      error: null,
      loading: filteredQueryLoading && _path !== "/payments",
      reload: mockReload,
    };
  }),
}));

function renderPage(initialPath = "/payments") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <PaymentsPage />
    </MemoryRouter>,
  );
}

describe("Payments — Assigned staff column", () => {
  afterEach(() => {
    cleanup();
    filteredQueryLoading = false;
    vi.mocked(useApiData).mockClear();
    vi.mocked(useAuth).mockClear();
  });

  it("shows the Assigned staff column header", () => {
    renderPage();
    expect(
      screen.getByRole("columnheader", { name: /assigned staff/i }),
    ).toBeInTheDocument();
  });

  it("keeps the existing column headers", () => {
    renderPage();
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

  it("shows the assigned staff snapshot name for an assigned payment", () => {
    renderPage();
    const row = screen.getAllByRole("row", { name: /WP-0001/ })[0]!;
    expect(within(row).getByText("Rahul Nair")).toBeInTheDocument();
  });

  it("shows Unassigned for a payment with a null snapshot", () => {
    renderPage();
    const row = screen.getByRole("row", { name: /WP-0002/ });
    expect(within(row).getByText("Unassigned")).toBeInTheDocument();
  });

  it("shows Unassigned for a payment with an empty snapshot", () => {
    renderPage();
    const row = screen.getByRole("row", { name: /WP-0003/ });
    expect(within(row).getByText("Unassigned")).toBeInTheDocument();
  });

  it("shows Unassigned for a payment with a whitespace-only snapshot", () => {
    renderPage();
    const row = screen.getByRole("row", { name: /WP-0004/ });
    expect(within(row).getByText("Unassigned")).toBeInTheDocument();
  });

  it("does not expose the staff ID in the table", () => {
    renderPage();
    expect(screen.queryByText("staff-1000020001")).toBeNull();
  });

  it("shows the same snapshot name on every payment of one wash job", () => {
    renderPage();
    const rows = screen.getAllByRole("row", { name: /WP-0001/ });
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(within(row).getByText("Rahul Nair")).toBeInTheDocument();
    }
  });

  it("renders the job number and links to the wash job", () => {
    renderPage();
    const links = screen.getAllByRole("link", { name: /WP-0001/ });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/wash-jobs/job-1");
    }
  });

  it("still renders customer and vehicle", () => {
    renderPage();
    expect(screen.getAllByText("KL 07 AB 1234")).toHaveLength(2);
    expect(screen.getAllByText("Arun Kumar")).toHaveLength(2);
  });

  it("still renders the payment method", () => {
    renderPage();
    expect(screen.getAllByText("UPI").length).toBeGreaterThan(0);
    expect(screen.getByText("Cash")).toBeInTheDocument();
    expect(screen.getByText("Paytm")).toBeInTheDocument();
    expect(screen.getByText("Bank UPI")).toBeInTheDocument();
  });

  it("still renders the paid-at date and time", () => {
    renderPage();
    expect(screen.getAllByText(/10 Jul 2026/i).length).toBeGreaterThan(0);
  });

  it("still renders the status badge", () => {
    renderPage();
    expect(screen.getAllByText("Success").length).toBeGreaterThan(0);
  });

  it("still renders the amount", () => {
    renderPage();
    expect(screen.getAllByText("₹400.00")).toHaveLength(2);
    expect(screen.getByText("₹250.00")).toBeInTheDocument();
    expect(screen.getByText("₹300.00")).toBeInTheDocument();
    expect(screen.getByText("₹100.00")).toBeInTheDocument();
  });

  it("still renders the tip and leaves it blank when zero", () => {
    renderPage();
    expect(screen.getAllByText("₹50.00")).toHaveLength(2);
    const unassignedRow = screen.getByRole("row", { name: /WP-0002/ });
    expect(within(unassignedRow).queryByText("₹50.00")).not.toBeInTheDocument();
  });

  it("keeps the empty state when no payments exist", () => {
    vi.mocked(useApiData).mockImplementationOnce(() => ({
      data: [],
      error: null,
      loading: false,
      reload: mockReload,
    }));
    renderPage();
    expect(screen.getByText("No payments recorded")).toBeInTheDocument();
  });
});

describe("Payments — admin filter controls", () => {
  afterEach(() => {
    cleanup();
    filteredQueryLoading = false;
    vi.mocked(useApiData).mockClear();
    vi.mocked(useAuth).mockClear();
  });

  it("shows the filter controls for administrators", () => {
    renderPage();
    expect(screen.getByLabelText("From")).toBeInTheDocument();
    expect(screen.getByLabelText("To")).toBeInTheDocument();
    expect(screen.getByLabelText("Assigned staff")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Apply filters" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Clear filters" }),
    ).toBeInTheDocument();
  });

  it("starts with the unfiltered list and no date defaults", () => {
    renderPage();
    expect(screen.getByLabelText("From")).toHaveValue("");
    expect(screen.getByLabelText("To")).toHaveValue("");
    expect(vi.mocked(useApiData)).toHaveBeenCalledWith("/payments");
    expect(
      screen.getByRole("button", { name: "Clear filters" }),
    ).toBeDisabled();
  });

  it("hides the filter controls and uses the plain URL for staff", () => {
    vi.mocked(useAuth).mockImplementationOnce(() => ({
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
    renderPage();
    expect(screen.queryByLabelText("Assigned staff")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Apply filters" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
    expect(vi.mocked(useApiData)).toHaveBeenCalledWith("/payments");
  });

  it("populates the staff select from the options endpoint", () => {
    renderPage();
    const select = screen.getByLabelText("Assigned staff") as HTMLSelectElement;
    expect(
      within(select).getByRole("option", { name: "All staff" }),
    ).toBeInTheDocument();
    expect(
      within(select).getByRole("option", { name: "Rahul Nair" }),
    ).toBeInTheDocument();
    expect(
      within(select).getByRole("option", { name: "Arun Pillai" }),
    ).toBeInTheDocument();
    expect(select.querySelectorAll("option")).toHaveLength(3);
  });

  it("does not refetch while filters are being edited", () => {
    renderPage();
    vi.mocked(useApiData).mockClear();
    fireEvent.change(screen.getByLabelText("From"), {
      target: { value: "2026-07-01" },
    });
    fireEvent.change(screen.getByLabelText("To"), {
      target: { value: "2026-07-31" },
    });
    fireEvent.change(screen.getByLabelText("Assigned staff"), {
      target: { value: "staff-1000020001" },
    });
    expect(vi.mocked(useApiData)).not.toHaveBeenCalledWith(
      expect.stringContaining("from="),
    );
  });

  it("applies the chosen date range only after Apply", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("From"), {
      target: { value: "2026-07-01" },
    });
    fireEvent.change(screen.getByLabelText("To"), {
      target: { value: "2026-07-31" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(vi.mocked(useApiData)).toHaveBeenCalledWith(
      "/payments?from=2026-07-01&to=2026-07-31",
    );
  });

  it("applies the chosen staff member by stable ID after Apply", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("Assigned staff"), {
      target: { value: "staff-1000020001" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(vi.mocked(useApiData)).toHaveBeenCalledWith(
      "/payments?assignedUserId=staff-1000020001",
    );
  });

  it("falls back to the unfiltered list for an invalid URL without crashing", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("From"), {
      target: { value: "2026-07-01" },
    });
    fireEvent.change(screen.getByLabelText("To"), {
      target: { value: "2026-07-15" },
    });
    fireEvent.change(screen.getByLabelText("Assigned staff"), {
      target: { value: "staff-1000020001" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(
      screen.getByText(
        /Showing payments from .*1 Jul 2026.* to .*15 Jul 2026.* assigned to Rahul Nair/i,
      ),
    ).toBeInTheDocument();
  });

  it("does not show a summary before any filters are applied", () => {
    renderPage();
    expect(
      screen.queryByText(/Showing payments/i),
    ).not.toBeInTheDocument();
  });

  it("rejects a reversed date range with an exact message and no request", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("From"), {
      target: { value: "2026-07-15" },
    });
    fireEvent.change(screen.getByLabelText("To"), {
      target: { value: "2026-07-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(
      screen.getByRole("alert"),
    ).toHaveTextContent("From date cannot be later than To date.");
    expect(vi.mocked(useApiData)).not.toHaveBeenCalledWith(
      expect.stringContaining("from=2026-07-15"),
    );
  });

  it("rejects an impossible draft date without sending a request", () => {
    renderPage("/payments?from=2026-02-30");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter a valid payment filter.",
    );
    expect(vi.mocked(useApiData)).toHaveBeenCalledWith("/payments");
  });

  it("clears filters back to the unfiltered list", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("Assigned staff"), {
      target: { value: "staff-1000020001" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    const clearButton = screen.getByRole("button", { name: "Clear filters" });
    expect(clearButton).not.toBeDisabled();
    fireEvent.click(clearButton);
    expect(screen.getByLabelText("From")).toHaveValue("");
    expect(screen.getByLabelText("To")).toHaveValue("");
    expect(
      (screen.getByLabelText("Assigned staff") as HTMLSelectElement).value,
    ).toBe("");
    expect(vi.mocked(useApiData)).toHaveBeenCalledWith("/payments");
    expect(
      screen.queryByText(/Showing payments/i),
    ).not.toBeInTheDocument();
  });

  it("shows the Apply button busy while the filtered request is pending", () => {
    renderPage();
    filteredQueryLoading = true;
    fireEvent.change(screen.getByLabelText("Assigned staff"), {
      target: { value: "staff-1000020001" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    const applyButton = screen.getByRole("button", { name: "Apply filters" });
    expect(applyButton).toBeDisabled();
    expect(applyButton).toHaveAttribute("aria-busy", "true");
  });

  it("restores active filters from the URL on load", () => {
    renderPage(
      "/payments?from=2026-07-01&to=2026-07-15&assignedUserId=staff-1000020001",
    );
    expect(screen.getByLabelText("From")).toHaveValue("2026-07-01");
    expect(screen.getByLabelText("To")).toHaveValue("2026-07-15");
    expect(
      (screen.getByLabelText("Assigned staff") as HTMLSelectElement).value,
    ).toBe("staff-1000020001");
    expect(vi.mocked(useApiData)).toHaveBeenCalledWith(
      "/payments?from=2026-07-01&to=2026-07-15&assignedUserId=staff-1000020001",
    );
    expect(
      screen.getByText(/Showing payments from .* to .* assigned to Rahul Nair/i),
    ).toBeInTheDocument();
  });

  it("falls back to the unfiltered list for an invalid URL without crashing", () => {
    renderPage("/payments?from=not-a-date");
    expect(vi.mocked(useApiData)).toHaveBeenCalledWith("/payments");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter a valid payment filter.",
    );
  });

  it("treats assignedUserId=UNASSIGNED as invalid and falls back", () => {
    renderPage("/payments?assignedUserId=UNASSIGNED");
    expect(vi.mocked(useApiData)).toHaveBeenCalledWith("/payments");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter a valid payment filter.",
    );
  });
});