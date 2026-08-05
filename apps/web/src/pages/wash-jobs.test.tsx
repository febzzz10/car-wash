import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";

import WashJobsPage from "./wash-jobs";
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

vi.mock("../hooks/use-api-data", () => ({
  useApiData: vi.fn((_path: string, _enabled?: boolean) => {
    const status =
      new URLSearchParams(_path.split("?")[1] ?? "").get("status") ?? "";
    const assignedJob = {
      assigned_user_id: "staff-9",
      assigned_user_name_snapshot: "Rahul Nair",
      balance_minor: 20000,
      created_at: "2026-07-01T09:30:00.000Z",
      customer_name_snapshot: "Arun Kumar",
      customer_phone_snapshot: "9002005005",
      id: "job-1",
      job_reference: "WP-0001",
      paid_amount_minor: 20000,
      payment_status: "PARTIAL",
      primary_service_name_snapshot: "Full Body Wash",
      started_at: "2026-07-01T10:00:00.000Z",
      status: "IN_PROGRESS",
      total_active_seconds: 3600,
      total_amount_minor: 40000,
      vehicle_registration_snapshot: "KL 07 AB 1234",
      version: 4,
    };
    const unassignedJob = {
      assigned_user_id: null,
      assigned_user_name_snapshot: null,
      balance_minor: 25000,
      created_at: "2026-07-01T11:00:00.000Z",
      customer_name_snapshot: "Meera Pillai",
      customer_phone_snapshot: "9002005006",
      id: "job-2",
      job_reference: "WP-0002",
      paid_amount_minor: 0,
      payment_status: "UNPAID",
      primary_service_name_snapshot: "Interior Cleaning",
      status: "WAITING",
      total_active_seconds: 0,
      total_amount_minor: 25000,
      vehicle_registration_snapshot: "KL 08 CD 5678",
      version: 1,
    };
    const blankSnapshotJob = {
      assigned_user_id: null,
      assigned_user_name_snapshot: "",
      balance_minor: 30000,
      created_at: "2026-07-02T08:00:00.000Z",
      customer_name_snapshot: "Suresh Menon",
      customer_phone_snapshot: "9002005007",
      id: "job-3",
      job_reference: "WP-0003",
      paid_amount_minor: 30000,
      payment_status: "PAID",
      primary_service_name_snapshot: "Polish",
      status: "COMPLETED",
      total_active_seconds: 1800,
      total_amount_minor: 30000,
      vehicle_registration_snapshot: "KL 09 EF 9012",
      version: 2,
    };
    return {
      data:
        status === "COMPLETED"
          ? [blankSnapshotJob]
          : [assignedJob, unassignedJob, blankSnapshotJob],
      error: null,
      loading: false,
      reload: mockReload,
    };
  }),
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/wash-jobs"]}>
      <Routes>
        <Route
          path="/wash-jobs"
          element={
            <>
              <WashJobsPage />
              <LocationProbe />
            </>
          }
        />
        <Route
          path="/wash-jobs/:id"
          element={
            <>
              <div>Job detail page</div>
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

function searchInput(): HTMLInputElement {
  return screen.getByPlaceholderText(
    "Search job, customer, vehicle…",
  ) as HTMLInputElement;
}

describe("Wash queue — Assigned staff column", () => {
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

  it("no longer shows a Service column header", () => {
    renderPage();
    expect(
      screen.queryByRole("columnheader", { name: /^service$/i }),
    ).toBeNull();
  });

  it("shows the assigned staff snapshot name for an assigned job", () => {
    renderPage();
    const row = screen.getByRole("row", { name: /WP-0001/ });
    expect(within(row).getByText("Rahul Nair")).toBeInTheDocument();
  });

  it("renders the snapshot name without any live user lookup", () => {
    renderPage();
    expect(screen.getByText("Rahul Nair")).toBeInTheDocument();
  });

  it("shows Unassigned for a job with no assigned staff", () => {
    renderPage();
    const row = screen.getByRole("row", { name: /WP-0002/ });
    expect(within(row).getByText("Unassigned")).toBeInTheDocument();
  });

  it("treats a blank snapshot as unassigned", () => {
    renderPage();
    const row = screen.getByRole("row", { name: /WP-0003/ });
    expect(within(row).getByText("Unassigned")).toBeInTheDocument();
  });

  it("does not display the staff user ID", () => {
    renderPage();
    expect(screen.queryByText("staff-9")).toBeNull();
  });

  it("still renders job, customer, vehicle, status, payment, and amount values", () => {
    renderPage();
    expect(screen.getByText("WP-0001")).toBeInTheDocument();
    expect(screen.getByText("KL 07 AB 1234")).toBeInTheDocument();
    expect(screen.getByText("Arun Kumar")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("Partial")).toBeInTheDocument();
    expect(screen.getByText("₹400.00")).toBeInTheDocument();
    expect(screen.getByText("₹200.00 due")).toBeInTheDocument();
  });

  it("filters rows as the search text changes", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(searchInput(), "Meera");
    expect(screen.queryByText("WP-0001")).toBeNull();
    expect(screen.getByText("WP-0002")).toBeInTheDocument();
  });

  it("requests the status-filtered endpoint when a tab is selected", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("tab", { name: "COMPLETED" }));
    expect(useApiData).toHaveBeenCalledWith("/wash-jobs?status=COMPLETED");
    expect(screen.getByText("WP-0003")).toBeInTheDocument();
  });

  it("reloads the queue when the refresh button is clicked", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /refresh queue/i }));
    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  it("navigates to the job detail page from the row link", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("link", { name: /open wp-0001/i }));
    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toBe(
        "/wash-jobs/job-1",
      );
    });
  });

  it("shows the empty state when no jobs match the search", () => {
    renderPage();
    fireEvent.change(searchInput(), { target: { value: "zzz-nomatch" } });
    expect(screen.getByText("Nothing in this queue")).toBeInTheDocument();
  });
});
