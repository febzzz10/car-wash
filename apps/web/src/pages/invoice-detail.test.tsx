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

const waMessage = [
  "Hi John Doe 👋",
  "Thank you for choosing WashPro! 🚗✨",
  "",
  "Your Premium Wash for vehicle KL01AB1234 is complete.",
  "Amount: ₹500.00",
  "Payment: PAID ✅",
  "Referral code: WP8A92B9E0",
  "",
  "Thanks for visiting WashPro. See you again! 😊",
].join("\n");

function waUrl(message: string): string {
  return `https://wa.me/919999999999?text=${encodeURIComponent(message)}`;
}

function renderPage(
  data: Record<string, unknown> = invoiceFixture,
  whatsapp: {
    readonly data?: { readonly whatsappUrl: string | null } | null;
    readonly error?: string | null;
    readonly loading?: boolean;
  } = { data: { whatsappUrl: waUrl(waMessage) }, error: null, loading: false },
) {
  vi.mocked(useApiData).mockImplementation((path: string) =>
    path.endsWith("/whatsapp-action")
      ? {
          data: whatsapp.data ?? null,
          error: whatsapp.error ?? null,
          loading: whatsapp.loading ?? false,
          reload: vi.fn(),
        }
      : { data, error: null, loading: false, reload: vi.fn() },
  );
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

describe("Invoice Detail page — WhatsApp customer message", () => {
  it("places the WhatsApp action above the email action", () => {
    renderPage();
    const whatsappLink = screen.getByRole("link", {
      name: /Open WhatsApp/i,
    });
    const emailButton = screen.getByRole("button", {
      name: /Send Invoice PDF/i,
    });
    expect(
      whatsappLink.compareDocumentPosition(emailButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("opens a WhatsApp click-to-chat link when activated", () => {
    renderPage();
    const link = screen.getByRole("link", { name: /Open WhatsApp/i });
    expect(link.getAttribute("href")).toMatch(/^https:\/\/wa\.me\//u);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("uses the customer's phone number in the WhatsApp URL", () => {
    renderPage();
    const link = screen.getByRole("link", { name: /Open WhatsApp/i });
    expect(link.getAttribute("href")).toContain("wa.me/919999999999?text=");
  });

  it("uses a digits-only phone in the WhatsApp URL", () => {
    renderPage();
    const link = screen.getByRole("link", { name: /Open WhatsApp/i });
    const href = link.getAttribute("href")!;
    expect(href).toMatch(/^https:\/\/wa\.me\/\d+\?text=/u);
    expect(href).not.toContain("+");
    expect(href).not.toContain(" ");
    expect(href).not.toContain("-");
  });

  it("pre-fills the message with the required format", () => {
    renderPage();
    const link = screen.getByRole("link", { name: /Open WhatsApp/i });
    const message = decodeURIComponent(
      link.getAttribute("href")!.split("?text=")[1]!,
    );
    expect(message).toBe(waMessage);
  });

  it("does not include any invoice link, token, or PDF reference in the message", () => {
    renderPage();
    const link = screen.getByRole("link", { name: /Open WhatsApp/i });
    const message = decodeURIComponent(
      link.getAttribute("href")!.split("?text=")[1]!,
    );
    expect(message).not.toContain("https://");
    expect(message).not.toContain("/invoice/");
    expect(message).not.toContain("secureLink");
    expect(message).not.toContain("copyLink");
    expect(message).not.toContain("token");
    expect(message.toLowerCase()).not.toContain("pdf");
  });

  it("omits the referral code line when the customer has no referral code", () => {
    const withoutReferral = waMessage.replace(
      "Referral code: WP8A92B9E0\n",
      "",
    );
    renderPage(invoiceFixture, {
      data: { whatsappUrl: waUrl(withoutReferral) },
      error: null,
      loading: false,
    });
    const link = screen.getByRole("link", { name: /Open WhatsApp/i });
    const message = decodeURIComponent(
      link.getAttribute("href")!.split("?text=")[1]!,
    );
    expect(message).not.toContain("Referral code:");
    expect(message).toContain("Thanks for visiting WashPro. See you again! 😊");
  });

  it("formats the amount with the ₹ symbol", () => {
    renderPage();
    const link = screen.getByRole("link", { name: /Open WhatsApp/i });
    const message = decodeURIComponent(
      link.getAttribute("href")!.split("?text=")[1]!,
    );
    expect(message).toContain("Amount: ₹500.00");
    expect(message).not.toContain("INR");
  });

  it("keeps WhatsApp available when the customer has no email", () => {
    renderPage({ ...invoiceFixture, customer_email_snapshot: null });
    const link = screen.getByRole("link", { name: /Open WhatsApp/i });
    expect(link).toBeInTheDocument();
    expect(link.getAttribute("href")).toContain("wa.me/");
    expect(
      screen.getByRole("button", { name: /Send Invoice PDF/i }),
    ).toBeDisabled();
  });

  it("does not offer WhatsApp when no phone number is available", () => {
    renderPage(invoiceFixture, {
      data: { whatsappUrl: null },
      error: null,
      loading: false,
    });
    expect(
      screen.queryByRole("link", { name: /Open WhatsApp/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Open WhatsApp/i }),
    ).toBeDisabled();
    expect(
      screen.getAllByText("No phone number available for this customer.")
        .length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("disables the WhatsApp action while it is loading", () => {
    renderPage(invoiceFixture, { data: null, error: null, loading: true });
    expect(
      screen.queryByRole("link", { name: /Open WhatsApp/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Open WhatsApp/i }),
    ).toBeDisabled();
    expect(
      screen.queryByText("No phone number available for this customer."),
    ).not.toBeInTheDocument();
  });

  it("stays stable under rapid clicks", () => {
    renderPage();
    const link = screen.getByRole("link", { name: /Open WhatsApp/i });
    const original = link.getAttribute("href");
    fireEvent.click(link);
    fireEvent.click(link);
    fireEvent.click(link);
    expect(link.getAttribute("href")).toBe(original);
    expect(toastMocks.error).not.toHaveBeenCalled();
    expect(toastMocks.success).not.toHaveBeenCalled();
  });
});
