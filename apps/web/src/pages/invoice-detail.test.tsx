import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useApiData } from "../hooks/use-api-data";
import { useAuth } from "../auth";
import { api } from "../lib/api";
import InvoiceDetailPage from "./invoice-detail";

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("../lib/api", () => ({
  api: vi.fn(),
  API_BASE: "",
  jsonBody: (value: unknown) => ({ body: JSON.stringify(value) }),
}));

vi.mock("../components/toast", () => ({
  useToast: () => toastMocks,
}));

vi.mock("../hooks/use-api-data", () => ({
  useApiData: vi.fn(),
}));

function adminUser(): ReturnType<typeof useAuth> {
  return {
    loading: false,
    manualDiscountEnabled: false,
    paymentDefaultMethod: "CASH",
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
    user: {
      id: "admin-1",
      role: "ADMIN",
      permissions: [] as string[],
      username: "admin",
      fullName: "Admin",
      branchId: "b1",
    },
  };
}

function staffUser(): ReturnType<typeof useAuth> {
  return {
    loading: false,
    manualDiscountEnabled: false,
    paymentDefaultMethod: "CASH",
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
    user: {
      id: "staff-1",
      role: "STAFF",
      permissions: [] as string[],
      username: "staff",
      fullName: "Staff",
      branchId: "b1",
    },
  };
}

vi.mock("../auth", () => ({
  useAuth: vi.fn(() => adminUser()),
}));

const invoiceFixture = {
  balance_minor: 0,
  business_address_snapshot: "123 Main St",
  business_name_snapshot: "Test Business",
  coupon_discount_minor: 0,
  currency_code: "INR",
  customer_email_snapshot: "john@example.com",
  customer_name_snapshot: "John Doe",
  customer_phone_snapshot: "9999999999",
  discount_minor: 0,
  id: "inv-1",
  invoice_number: "INV-001",
  invoice_status: "ISSUED",
  issued_at: "2026-08-01T10:00:00.000Z",
  items: [
    {
      id: "item-1",
      item_name: "Premium Wash",
      quantity: 1,
      total_minor: 50000,
      unit_price_minor: 50000,
    },
  ],
  manual_discount_minor: 0,
  paid_minor: 50000,
  payment_status_snapshot: "PAID",
  referral_discount_minor: 0,
  reward_discount_minor: 0,
  rounding_minor: 0,
  subtotal_minor: 50000,
  tax_minor: 0,
  total_minor: 50000,
  vehicle_registration_snapshot: "KL01AB1234",
};

function renderPage(data: Record<string, unknown> = invoiceFixture) {
  vi.mocked(useApiData).mockReturnValue({
    data,
    error: null,
    loading: false,
    reload: vi.fn(),
  });
  return render(
    <MemoryRouter initialEntries={["/invoices/inv-1"]}>
      <Routes>
        <Route element={<InvoiceDetailPage />} path="/invoices/:id" />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.mocked(useAuth).mockImplementation(() => adminUser());
  vi.mocked(api).mockReset();
  toastMocks.success.mockReset();
  toastMocks.error.mockReset();
});

describe("Invoice Detail page — actions", () => {
  it("does not display a Create correction button", () => {
    renderPage();
    expect(
      screen.queryByRole("button", { name: /create correction/i }),
    ).not.toBeInTheDocument();
  });

  it("still displays the PDF download button", () => {
    renderPage();
    const buttons = screen.getAllByRole("button", { name: /PDF/i });
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it("still displays the Print button", () => {
    renderPage();
    const buttons = screen.getAllByRole("button", { name: /Print/i });
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it("renders the invoice number in the header", () => {
    renderPage();
    const matches = screen.getAllByText(/INV-001/);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("renders line items and totals", () => {
    renderPage();
    const totals = screen.getAllByText(/Final amount/);
    expect(totals.length).toBeGreaterThanOrEqual(1);
    const items = screen.getAllByText("Premium Wash");
    expect(items.length).toBeGreaterThanOrEqual(1);
  });

  it("renders the payment status badge", () => {
    renderPage();
    const badges = screen.getAllByText(/paid/i);
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });
});

describe("Invoice Detail page — send invoice email", () => {
  it("displays the customer email on the send invoice card", () => {
    renderPage();
    expect(
      screen.getAllByText("john@example.com").length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("displays the Send Invoice PDF button", () => {
    renderPage();
    const buttons = screen.getAllByRole("button", {
      name: /Send Invoice PDF/i,
    });
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it("sends the invoice PDF when clicked", async () => {
    vi.mocked(api).mockResolvedValue({
      success: true,
      data: { invoiceId: "inv-1" },
    });
    renderPage();
    fireEvent.click(
      screen.getAllByRole("button", { name: /Send Invoice PDF/i })[0]!,
    );
    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/invoices/inv-1/send-email",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"idempotencyKey":"'),
      }),
    );
    await waitFor(() =>
      expect(toastMocks.success).toHaveBeenCalledWith(
        "Invoice PDF sent successfully.",
      ),
    );
    expect(toastMocks.error).not.toHaveBeenCalled();
  });

  it("shows an error toast when sending fails", async () => {
    vi.mocked(api).mockRejectedValue(new Error("The email service is busy."));
    renderPage();
    fireEvent.click(
      screen.getAllByRole("button", { name: /Send Invoice PDF/i })[0]!,
    );
    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith(
        "The email service is busy.",
      ),
    );
    expect(toastMocks.success).not.toHaveBeenCalled();
  });

  it("does not offer sending when the customer has no email", () => {
    renderPage({ ...invoiceFixture, customer_email_snapshot: null });
    const button = screen.queryByRole("button", { name: /Send Invoice PDF/i });
    expect(button).toBeInTheDocument();
    expect(button).toBeDisabled();
    expect(
      screen.getAllByText("No email address available for this customer.")
        .length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("prevents duplicate submissions while a send is in flight", () => {
    const pending = new Promise<never>(() => {});
    vi.mocked(api).mockResolvedValueOnce(pending as never);
    renderPage();
    const button = screen.getAllByRole("button", {
      name: /Send Invoice PDF/i,
    })[0]!;
    fireEvent.click(button);
    fireEvent.click(button);
    expect(vi.mocked(api)).toHaveBeenCalledTimes(1);
    expect(
      screen.getAllByRole("button", { name: /Sending…/i }).length,
    ).toBeGreaterThanOrEqual(1);
  });
});

describe("Invoice Detail page — phone masking", () => {
  afterEach(() => {
    vi.mocked(useAuth).mockImplementation(() => adminUser());
  });

  it("shows the full phone snapshot to admins", () => {
    renderPage();
    expect(screen.getAllByText("9999999999").length).toBeGreaterThanOrEqual(1);
  });

  it("masks the phone snapshot for staff", () => {
    vi.mocked(useAuth).mockImplementation(() => staffUser());
    renderPage();
    expect(screen.getAllByText("99xxxxxx99").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryAllByText("9999999999")).toHaveLength(0);
  });
});
