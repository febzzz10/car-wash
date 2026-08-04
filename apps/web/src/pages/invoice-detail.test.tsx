import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { useApiData } from "../hooks/use-api-data";
import InvoiceDetailPage from "./invoice-detail";

vi.mock("../lib/api", () => ({
  api: vi.fn(),
  API_BASE: "",
}));

vi.mock("../components/toast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

vi.mock("../hooks/use-api-data", () => ({
  useApiData: vi.fn(),
}));

const invoiceFixture = {
  balance_minor: 0,
  business_address_snapshot: "123 Main St",
  business_name_snapshot: "Test Business",
  coupon_discount_minor: 0,
  currency_code: "INR",
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

function renderPage() {
  vi.mocked(useApiData).mockReturnValue({
    data: invoiceFixture,
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

  it("displays the share invoice actions", () => {
    renderPage();
    const whatsapp = screen.getAllByRole("button", { name: /Open WhatsApp/i });
    expect(whatsapp.length).toBeGreaterThanOrEqual(1);
    const copyMsg = screen.getAllByRole("button", { name: /Copy message/i });
    expect(copyMsg.length).toBeGreaterThanOrEqual(1);
    const copyLink = screen.getAllByRole("button", { name: /Copy secure link/i });
    expect(copyLink.length).toBeGreaterThanOrEqual(1);
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
