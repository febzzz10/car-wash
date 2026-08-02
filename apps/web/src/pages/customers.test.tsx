import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";

import CustomersPage from "./customers";
import { useAuth } from "../auth";
import { useApiData } from "../hooks/use-api-data";

const mockReload = vi.fn();

const CUSTOMER_FIXTURE = [
  {
    id: "c1",
    full_name: "Test Customer",
    phone: "9002005005",
    status: "ACTIVE",
    total_visits_cached: 3,
    total_spent_minor_cached: 1000,
    last_visit_at: "2026-07-01T10:00:00.000Z",
    version: 1,
  },
  {
    id: "c2",
    full_name: "Kerala Driver",
    phone: "+91 90020 05005",
    status: "INACTIVE",
    total_visits_cached: 1,
    total_spent_minor_cached: 500,
    last_visit_at: "2026-06-01T10:00:00.000Z",
    version: 1,
  },
  {
    id: "c3",
    full_name: "No Phone",
    phone: "",
    status: "ACTIVE",
    total_visits_cached: 0,
    total_spent_minor_cached: 0,
    last_visit_at: null,
    version: 1,
  },
  {
    id: "c4",
    full_name: "Bad Phone",
    phone: "123",
    status: "ACTIVE",
    total_visits_cached: 0,
    total_spent_minor_cached: 0,
    last_visit_at: null,
    version: 1,
  },
];

vi.mock("../lib/api", () => ({
  api: vi.fn(),
  jsonBody: (v: unknown) => ({ body: JSON.stringify(v) }),
}));

vi.mock("../components/toast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

function adminUser(): ReturnType<typeof useAuth> {
  return {
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
  };
}

function staffUser(): ReturnType<typeof useAuth> {
  return {
    loading: false,
    manualDiscountEnabled: false,
    paymentDefaultMethod: "CASH",
    user: {
      id: "staff-1",
      role: "STAFF",
      permissions: [] as string[],
      branchId: "b1",
      fullName: "Staff",
      username: "staff",
    },
    login: async () => undefined,
    logout: async () => undefined,
    refresh: async () => undefined,
  };
}

vi.mock("../auth", () => ({
  useAuth: vi.fn(() => adminUser()),
}));

vi.mock("../hooks/use-api-data", () => ({
  useApiData: vi.fn((_path: string) => ({
    data: CUSTOMER_FIXTURE,
    error: null,
    loading: false,
    reload: mockReload,
  })),
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/customers"]}>
      <Routes>
        <Route
          path="/customers"
          element={
            <>
              <CustomersPage />
              <LocationProbe />
            </>
          }
        />
        <Route
          path="/customers/:id"
          element={
            <>
              <div>Customer detail page</div>
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Customers directory — status column removed", () => {
  afterEach(() => {
    cleanup();
    vi.mocked(useApiData).mockClear();
    vi.mocked(useAuth).mockImplementation(() => adminUser());
  });

  it("no longer renders the Status column header", () => {
    renderPage();
    expect(
      screen.queryByRole("columnheader", { name: "Status" }),
    ).toBeNull();
  });

  it("no longer renders status badges in the table rows", () => {
    renderPage();
    expect(document.querySelector(".status-badge")).toBeNull();
  });

  it("renders the Actions column header", () => {
    renderPage();
    expect(
      screen.getByRole("columnheader", { name: "Actions" }),
    ).toBeDefined();
  });
});

describe("Customers directory — contact actions", () => {
  afterEach(() => {
    cleanup();
    vi.mocked(useApiData).mockClear();
    vi.mocked(useAuth).mockImplementation(() => adminUser());
  });

  it("builds a tel: URL from the customer phone number", () => {
    renderPage();
    expect(screen.getByLabelText("Call Test Customer")).toHaveAttribute(
      "href",
      "tel:+919002005005",
    );
  });

  it("adds the Indian country code to a 10-digit number for WhatsApp", () => {
    renderPage();
    const href = screen
      .getByLabelText("Message Test Customer on WhatsApp")
      .getAttribute("href");
    expect(href).toContain("https://wa.me/919002005005?text=");
  });

  it("does not duplicate an existing 91 country code for WhatsApp", () => {
    renderPage();
    const href = screen
      .getByLabelText("Message Kerala Driver on WhatsApp")
      .getAttribute("href");
    expect(href).toContain("https://wa.me/919002005005?text=");
  });

  it("encodes the wash completion message in the WhatsApp URL", () => {
    renderPage();
    const encoded = encodeURIComponent(
      "Hi Test Customer, your vehicle wash has been completed. Thank you for choosing WashPro.",
    );
    expect(
      screen.getByLabelText("Message Test Customer on WhatsApp"),
    ).toHaveAttribute("href", `https://wa.me/919002005005?text=${encoded}`);
  });

  it("shows the expected tooltips on the contact actions", () => {
    renderPage();
    expect(screen.getByLabelText("Call Test Customer")).toHaveAttribute(
      "title",
      "Call customer",
    );
    expect(
      screen.getByLabelText("Message Test Customer on WhatsApp"),
    ).toHaveAttribute("title", "Send wash completion message");
  });

  it("does not navigate to the customer details page when a contact button is clicked", () => {
    renderPage();
    const guard = (event: MouseEvent) => event.preventDefault();
    document.addEventListener("click", guard, { capture: true });
    try {
      fireEvent.click(screen.getByLabelText("Call Test Customer"));
      fireEvent.click(
        screen.getByLabelText("Message Test Customer on WhatsApp"),
      );
    } finally {
      document.removeEventListener("click", guard, { capture: true });
    }
    expect(screen.queryByText("Customer detail page")).toBeNull();
    expect(screen.getByTestId("location")).toHaveTextContent("/customers");
  });

  it("still navigates to the customer details page via the arrow link", () => {
    renderPage();
    fireEvent.click(screen.getByLabelText("Open Test Customer"));
    expect(screen.getByText("Customer detail page")).toBeDefined();
  });

  it("disables both contact buttons when the phone number is missing", () => {
    renderPage();
    expect(screen.getByLabelText("Call No Phone")).toBeDisabled();
    expect(screen.getByLabelText("Message No Phone on WhatsApp")).toBeDisabled();
    expect(screen.getByLabelText("Call No Phone")).toHaveAttribute(
      "title",
      "Phone number unavailable",
    );
    expect(
      screen.getByLabelText("Message No Phone on WhatsApp"),
    ).toHaveAttribute("title", "Phone number unavailable");
  });

  it("disables both contact buttons when the phone number is invalid", () => {
    renderPage();
    expect(screen.getByLabelText("Call Bad Phone")).toBeDisabled();
    expect(
      screen.getByLabelText("Message Bad Phone on WhatsApp"),
    ).toBeDisabled();
  });

  it("keeps the Active and Inactive tabs working", () => {
    renderPage();
    expect(
      screen.getByRole("button", { name: "Active" }).className,
    ).toContain("active");
    fireEvent.click(screen.getByRole("button", { name: "Inactive" }));
    expect(vi.mocked(useApiData)).toHaveBeenLastCalledWith(
      "/customers?search=&status=INACTIVE",
    );
    expect(
      screen.getByRole("button", { name: "Inactive" }).className,
    ).toContain("active");
  });

  it("renders the contact actions for staff users", () => {
    vi.mocked(useAuth).mockImplementation(() => staffUser());
    renderPage();
    expect(screen.getByLabelText("Call Test Customer")).toBeDefined();
    expect(
      screen.getByLabelText("Message Test Customer on WhatsApp"),
    ).toBeDefined();
    expect(screen.getByLabelText("Call No Phone")).toBeDisabled();
  });
});
