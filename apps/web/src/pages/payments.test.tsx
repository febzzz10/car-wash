import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import PaymentsPage from "./payments";
import { useAuth } from "../auth";
import { useApiData } from "../hooks/use-api-data";

const mockReload = vi.fn();

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

vi.mock("../hooks/use-api-data", () => ({
  useApiData: vi.fn((_path: string, _enabled?: boolean) => {
    if (_path === "/settings") {
      return {
        data: { settings: [] as readonly { setting_key: string; value_text: string }[] },
        error: null,
        loading: false,
        reload: mockReload,
      };
    }
    const assigned = (name: string, id: string) => ({
      amount_minor: 40000,
      assigned_user_id: "staff-9",
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
          assigned_user_id: null,
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
          assigned_user_id: null,
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
          assigned_user_id: null,
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
      loading: false,
      reload: mockReload,
    };
  }),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/payments"]}>
      <PaymentsPage />
    </MemoryRouter>,
  );
}

describe("Payments — Assigned staff column", () => {
  afterEach(() => {
    cleanup();
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
      expect(
        screen.getByRole("columnheader", { name }),
      ).toBeInTheDocument();
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

  it("does not display the staff user ID", () => {
    renderPage();
    expect(screen.queryByText("staff-9")).toBeNull();
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
    expect(
      within(unassignedRow).queryByText("₹50.00"),
    ).not.toBeInTheDocument();
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
