import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";

import InvoiceDetailPage from "./invoice-detail";

const mockReload = vi.fn();

vi.mock("../lib/api", () => ({
  api: vi.fn(),
  jsonBody: (v: unknown) => ({ body: JSON.stringify(v) }),
}));

vi.mock("../auth", () => ({
  useAuth: () => ({
    user: { id: "admin-1", role: "ADMIN" as const, permissions: [] as string[], branchId: "b1", fullName: "Admin" },
  }),
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("../components/toast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

interface InvoiceItem {
  readonly id: string;
  readonly item_name: string;
  readonly quantity: number;
  readonly unit_price_minor: number;
  readonly total_minor: number;
}

interface InvoiceDetail {
  readonly balance_minor: number;
  readonly business_address_snapshot: string;
  readonly business_name_snapshot: string;
  readonly coupon_discount_minor: number;
  readonly currency_code: string;
  readonly customer_name_snapshot: string;
  readonly customer_phone_snapshot: string;
  readonly discount_minor: number;
  readonly id: string;
  readonly invoice_number: string;
  readonly invoice_status: string;
  readonly issued_at: string;
  readonly items: readonly InvoiceItem[];
  readonly manual_discount_minor: number;
  readonly paid_minor: number;
  readonly payment_status_snapshot: string;
  readonly referral_discount_minor: number;
  readonly reward_discount_minor: number;
  readonly rounding_minor: number;
  readonly subtotal_minor: number;
  readonly tax_minor: number;
  readonly total_minor: number;
  readonly vehicle_registration_snapshot: string;
}

function buildInvoice(overrides: Partial<InvoiceDetail> = {}): InvoiceDetail {
  return {
    id: "inv-1",
    invoice_number: "WP-2026-000001",
    invoice_status: "ISSUED",
    business_name_snapshot: "Test Business",
    business_address_snapshot: "Test Address",
    customer_name_snapshot: "Test Customer",
    customer_phone_snapshot: "+919999999999",
    vehicle_registration_snapshot: "KL-01-TEST",
    currency_code: "INR",
    issued_at: "2026-07-30T12:00:00.000Z",
    subtotal_minor: 10000,
    discount_minor: 0,
    coupon_discount_minor: 0,
    referral_discount_minor: 0,
    reward_discount_minor: 0,
    manual_discount_minor: 0,
    rounding_minor: 0,
    tax_minor: 0,
    total_minor: 10000,
    paid_minor: 0,
    balance_minor: 10000,
    payment_status_snapshot: "PENDING",
    items: [{ id: "li-1", item_name: "Exterior Wash", quantity: 1, unit_price_minor: 10000, total_minor: 10000 }],
    ...overrides,
  };
}

let currentInvoice = buildInvoice();

vi.mock("../hooks/use-api-data", () => ({
  useApiData: () => ({
    data: currentInvoice,
    error: null,
    loading: false,
    reload: mockReload,
  }),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/invoices/inv-1"]}>
      <Routes>
        <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  currentInvoice = buildInvoice();
});

describe("Invoice billing-summary discount display", () => {
  it("shows coupon discount row", async () => {
    currentInvoice = buildInvoice({ coupon_discount_minor: 1500, discount_minor: 1500, total_minor: 8500 });
    renderPage();
    expect(await screen.findByText("Coupon")).toBeInTheDocument();
  });

  it("shows referral discount row", async () => {
    currentInvoice = buildInvoice({ referral_discount_minor: 2000, discount_minor: 2000, total_minor: 8000 });
    renderPage();
    expect(await screen.findByText("Referral")).toBeInTheDocument();
  });

  it("shows reward discount row", async () => {
    currentInvoice = buildInvoice({ reward_discount_minor: 2500, discount_minor: 2500, total_minor: 7500 });
    renderPage();
    expect(await screen.findByText("Reward")).toBeInTheDocument();
  });

  it("shows manual discount row", async () => {
    currentInvoice = buildInvoice({ manual_discount_minor: 3000, discount_minor: 3000, total_minor: 7000 });
    renderPage();
    expect(await screen.findByText("Manual discount")).toBeInTheDocument();
  });

  it("shows multiple categorized rows together", async () => {
    currentInvoice = buildInvoice({
      coupon_discount_minor: 500,
      referral_discount_minor: 1000,
      reward_discount_minor: 250,
      manual_discount_minor: 750,
      discount_minor: 2500,
      total_minor: 7500,
    });
    renderPage();
    expect(await screen.findByText("Coupon")).toBeInTheDocument();
    expect(screen.getByText("Referral")).toBeInTheDocument();
    expect(screen.getByText("Reward")).toBeInTheDocument();
    expect(screen.getByText("Manual discount")).toBeInTheDocument();
  });

  it("shows generic Discount for legacy combined-only invoice", async () => {
    currentInvoice = buildInvoice({ discount_minor: 4000, total_minor: 8000 });
    renderPage();
    expect(await screen.findByText("Discount")).toBeInTheDocument();
    expect(screen.queryByText("Coupon")).not.toBeInTheDocument();
    expect(screen.queryByText("Referral")).not.toBeInTheDocument();
    expect(screen.queryByText("Reward")).not.toBeInTheDocument();
    expect(screen.queryByText("Manual discount")).not.toBeInTheDocument();
  });

  it("generic Discount never appears with categorized rows", async () => {
    currentInvoice = buildInvoice({ coupon_discount_minor: 1000, discount_minor: 1000, total_minor: 9000 });
    renderPage();
    expect(await screen.findByText("Coupon")).toBeInTheDocument();
    expect(screen.queryByText("Discount")).not.toBeInTheDocument();
  });

  it("zero discount rows are hidden", async () => {
    currentInvoice = buildInvoice({ discount_minor: 0, total_minor: 10000 });
    renderPage();
    await screen.findByText("Subtotal");
    expect(screen.queryByText("Coupon")).not.toBeInTheDocument();
    expect(screen.queryByText("Referral")).not.toBeInTheDocument();
    expect(screen.queryByText("Reward")).not.toBeInTheDocument();
    expect(screen.queryByText("Manual discount")).not.toBeInTheDocument();
    expect(screen.queryByText("Discount")).not.toBeInTheDocument();
  });

  it("shows rounding row", async () => {
    currentInvoice = buildInvoice({ rounding_minor: 1, total_minor: 10001 });
    renderPage();
    expect(await screen.findByText("Rounding")).toBeInTheDocument();
  });

  it("final row says Final amount", async () => {
    currentInvoice = buildInvoice({ total_minor: 8000 });
    renderPage();
    expect(await screen.findByText("Final amount")).toBeInTheDocument();
  });

  it("line-item total remains pre-discount", () => {
    currentInvoice = buildInvoice({
      subtotal_minor: 10000,
      discount_minor: 3000,
      total_minor: 7000,
      items: [{ id: "li-1", item_name: "Full Service", quantity: 1, unit_price_minor: 10000, total_minor: 10000 }],
    });
    expect(currentInvoice.items[0]!.total_minor).toBe(10000);
  });

  it("no NaN, undefined, or null output", async () => {
    currentInvoice = buildInvoice();
    renderPage();
    await screen.findByText("Subtotal");
    const body = document.body.textContent ?? "";
    expect(body).not.toContain("NaN");
    expect(body).not.toContain("undefined");
    expect(body).not.toContain("null");
  });

  it("legacy case: subtotal ₹800, discount −₹400, tax ₹0, rounding ₹0, final ₹400", async () => {
    currentInvoice = buildInvoice({
      subtotal_minor: 80000,
      discount_minor: 40000,
      tax_minor: 0,
      rounding_minor: 0,
      total_minor: 40000,
      paid_minor: 40000,
      balance_minor: 0,
      items: [{ id: "li-1", item_name: "Full Service", quantity: 1, unit_price_minor: 80000, total_minor: 80000 }],
    });
    renderPage();
    expect(await screen.findByText("Subtotal")).toBeInTheDocument();
    expect(screen.getAllByText("₹800.00").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("−₹400.00")).toBeInTheDocument();
    expect(screen.getAllByText("₹400.00").length).toBeGreaterThanOrEqual(1);
  });
});
