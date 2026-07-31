import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useApiData } from "../hooks/use-api-data";
import ReportsPage from "./reports";

vi.mock("../lib/api", () => ({
  apiBlob: vi.fn(),
  jsonBody: (value: unknown) => ({ body: JSON.stringify(value) }),
}));

vi.mock("../components/toast", () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn() }),
}));

const mockReload = vi.fn();

vi.mock("../hooks/use-api-data", () => ({
  useApiData: vi.fn((path: string) => {
    if (path.includes("reports/expenses"))
      return {
        data: [
          {
            amount_minor: 3000,
            category: "Chemicals",
            expense_date: "2026-07-23",
            expense_reference: "EXP-001",
            payment_method: "UPI",
            status: "ACTIVE",
            title: "Car shampoo",
          },
        ],
        error: null,
        loading: false,
        reload: mockReload,
      };
    return {
      data: {
        expensesMinor: 0,
        from: "2026-07-01",
        netProfitMinor: 695_000,
        revenueMinor: 695_000,
        to: "2026-07-31",
      },
      error: null,
      loading: false,
      reload: mockReload,
    };
  }),
}));

describe("ReportsPage", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders the profit summary with readable labels and formatted currency", async () => {
    render(<ReportsPage />);
    await waitFor(() => {
      expect(screen.getByText("Net profit")).toBeInTheDocument();
    });
    expect(screen.getAllByText("INR 6,950.00").length).toBe(2);
    expect(screen.getAllByText("INR 0.00").length).toBeGreaterThan(0);
    expect(screen.getByText("2026-07-01")).toBeInTheDocument();
    expect(screen.queryByText("695000")).not.toBeInTheDocument();
    expect(screen.queryByText("NetProfitMinor")).not.toBeInTheDocument();
  });

  it("renders the expenses report with formatted currency and raw text columns", async () => {
    render(<ReportsPage />);
    await waitFor(() => {
      expect(screen.getByText("Net profit")).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText("Report"), {
      target: { value: "expenses" },
    });
    await waitFor(() => {
      expect(screen.getByText("Amount")).toBeInTheDocument();
      expect(screen.getByText("INR 30.00")).toBeInTheDocument();
      expect(screen.getByText("Car shampoo")).toBeInTheDocument();
    });
    expect(screen.queryByText("3000")).not.toBeInTheDocument();
  });

  it("shows an empty state when there are no rows", async () => {
    vi.mocked(useApiData).mockImplementationOnce(() => ({
      data: [],
      error: null,
      loading: false,
      reload: mockReload,
    }));
    render(<ReportsPage />);
    await waitFor(() => {
      expect(screen.getByText("No report data")).toBeInTheDocument();
    });
  });
});
