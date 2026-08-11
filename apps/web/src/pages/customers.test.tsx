import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";

import CustomersPage, { CustomerDialog } from "./customers";
import { useAuth } from "../auth";
import { useApiData } from "../hooks/use-api-data";
import { api } from "../lib/api";

const mockReload = vi.fn();

const CUSTOMER_FIXTURE = [
  {
    id: "c1",
    full_name: "Test Customer",
    phone: "9002005005",
    phone_normalized: "+919002005005",
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
    phone_normalized: "+919002005005",
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
    phone_normalized: "",
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
    phone_normalized: "",
    status: "ACTIVE",
    total_visits_cached: 0,
    total_spent_minor_cached: 0,
    last_visit_at: null,
    version: 1,
  },
];

const REGISTRATION_MATCHED = [
  {
    id: "c1",
    full_name: "Test Customer",
    phone: "9002005005",
    phone_normalized: "+919002005005",
    status: "ACTIVE",
    total_visits_cached: 3,
    total_spent_minor_cached: 1000,
    last_visit_at: "2026-07-01T10:00:00.000Z",
    version: 1,
    matching_registrations: ["KL 25 A 1234", "KL 26 B 5678"],
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
  useApiData: vi.fn((_path: string, _enabled: boolean) => {
    const query =
      new URLSearchParams(_path.split("?")[1] ?? "").get("search") ?? "";
    return {
      data: query.toUpperCase().includes("KL")
        ? REGISTRATION_MATCHED
        : CUSTOMER_FIXTURE,
      error: null,
      loading: false,
      reload: mockReload,
    };
  }),
}));

function searchInput(): HTMLInputElement {
  return screen.getByPlaceholderText(
    "Search name, phone, or registration…",
  ) as HTMLInputElement;
}

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
      true,
    );
    expect(
      screen.getByRole("button", { name: "Inactive" }).className,
    ).toContain("active");
  });

  it("renders the contact actions for staff users", () => {
    vi.mocked(useAuth).mockImplementation(() => staffUser());
    renderPage();
    fireEvent.change(searchInput(), { target: { value: "Test" } });
    expect(screen.getByLabelText("Call Test Customer")).toBeDefined();
    expect(
      screen.getByLabelText("Message Test Customer on WhatsApp"),
    ).toBeDefined();
    expect(screen.getByLabelText("Call No Phone")).toBeDisabled();
  });
});

describe("Customers directory — registration search", () => {
  afterEach(() => {
    cleanup();
    vi.mocked(useApiData).mockClear();
    vi.mocked(useAuth).mockImplementation(() => adminUser());
  });

  it("shows the registration-aware search placeholder", () => {
    renderPage();
    expect(searchInput()).toBeDefined();
  });

  it("still searches customers by name", () => {
    renderPage();
    fireEvent.change(searchInput(), { target: { value: "Kerala" } });
    expect(vi.mocked(useApiData)).toHaveBeenLastCalledWith(
      "/customers?search=Kerala&status=ACTIVE",
      true,
    );
  });

  it("still searches customers by phone number", () => {
    renderPage();
    fireEvent.change(searchInput(), { target: { value: "90020" } });
    expect(vi.mocked(useApiData)).toHaveBeenLastCalledWith(
      "/customers?search=90020&status=ACTIVE",
      true,
    );
  });

  it("returns the associated customer for a full normalized registration", () => {
    renderPage();
    fireEvent.change(searchInput(), { target: { value: "KL25A1234" } });
    expect(vi.mocked(useApiData)).toHaveBeenLastCalledWith(
      "/customers?search=KL25A1234&status=ACTIVE",
      true,
    );
    expect(
      screen.getByText("Matched vehicle: KL 25 A 1234, KL 26 B 5678"),
    ).toBeDefined();
  });

  it("returns the same customer for spaced or hyphenated registrations", () => {
    renderPage();
    fireEvent.change(searchInput(), { target: { value: "KL 25 A 1234" } });
    expect(vi.mocked(useApiData)).toHaveBeenLastCalledWith(
      "/customers?search=KL%2025%20A%201234&status=ACTIVE",
      true,
    );
    fireEvent.change(searchInput(), { target: { value: "kl-25-a-1234" } });
    expect(vi.mocked(useApiData)).toHaveBeenLastCalledWith(
      "/customers?search=kl-25-a-1234&status=ACTIVE",
      true,
    );
    expect(
      screen.getByText("Matched vehicle: KL 25 A 1234, KL 26 B 5678"),
    ).toBeDefined();
  });

  it("returns the same customer for lowercase registration input", () => {
    renderPage();
    fireEvent.change(searchInput(), { target: { value: "kl25a1234" } });
    expect(vi.mocked(useApiData)).toHaveBeenLastCalledWith(
      "/customers?search=kl25a1234&status=ACTIVE",
      true,
    );
    expect(
      screen.getByText("Matched vehicle: KL 25 A 1234, KL 26 B 5678"),
    ).toBeDefined();
  });

  it("passes short partial searches through to the server-side rule", () => {
    renderPage();
    fireEvent.change(searchInput(), { target: { value: "12" } });
    expect(vi.mocked(useApiData)).toHaveBeenLastCalledWith(
      "/customers?search=12&status=ACTIVE",
      true,
    );
    expect(screen.getByText("Kerala Driver")).toBeDefined();
  });

  it("shows a customer owning multiple matching vehicles only once", () => {
    renderPage();
    fireEvent.change(searchInput(), { target: { value: "KL25A1234" } });
    expect(screen.getAllByText("Test Customer")).toHaveLength(1);
    expect(screen.getAllByText(/Matched vehicle:/)).toHaveLength(1);
    expect(
      screen.getByText("Matched vehicle: KL 25 A 1234, KL 26 B 5678"),
    ).toBeDefined();
  });

  it("clearing the search restores the full customer list", () => {
    renderPage();
    fireEvent.change(searchInput(), { target: { value: "KL25A1234" } });
    fireEvent.change(searchInput(), { target: { value: "" } });
    expect(vi.mocked(useApiData)).toHaveBeenLastCalledWith(
      "/customers?search=&status=ACTIVE",
      true,
    );
    expect(screen.getByText("Kerala Driver")).toBeDefined();
  });

  it("treats whitespace-only input as an empty search", () => {
    renderPage();
    fireEvent.change(searchInput(), { target: { value: "   " } });
    expect(vi.mocked(useApiData)).toHaveBeenLastCalledWith(
      "/customers?search=%20%20%20&status=ACTIVE",
      true,
    );
    expect(screen.getByText("Kerala Driver")).toBeDefined();
  });

  it("keeps immediate per-keystroke requests unchanged", () => {
    renderPage();
    fireEvent.change(searchInput(), { target: { value: "K" } });
    fireEvent.change(searchInput(), { target: { value: "KL25A1234" } });
    const paths = vi
      .mocked(useApiData)
      .mock.calls.map(([path]) => path);
    expect(paths).toContain("/customers?search=K&status=ACTIVE");
    expect(paths).toContain("/customers?search=KL25A1234&status=ACTIVE");
  });

  it("lets admins search by registration", () => {
    renderPage();
    fireEvent.change(searchInput(), { target: { value: "KL25A1234" } });
    expect(
      screen.getByText("Matched vehicle: KL 25 A 1234, KL 26 B 5678"),
    ).toBeDefined();
  });

  it("lets staff search by registration", () => {
    vi.mocked(useAuth).mockImplementation(() => staffUser());
    renderPage();
    fireEvent.change(searchInput(), { target: { value: "KL25A1234" } });
    expect(
      screen.getByText("Matched vehicle: KL 25 A 1234, KL 26 B 5678"),
    ).toBeDefined();
  });
});

describe("Customers directory — staff must search first", () => {
  afterEach(() => {
    cleanup();
    vi.mocked(useApiData).mockClear();
    vi.mocked(useAuth).mockImplementation(() => adminUser());
  });

  it("does not load the customer list for staff with an empty search", () => {
    vi.mocked(useAuth).mockImplementation(() => staffUser());
    renderPage();
    expect(vi.mocked(useApiData)).toHaveBeenCalledWith(
      "/customers?search=&status=ACTIVE",
      false,
    );
    expect(screen.queryByText("Test Customer")).toBeNull();
    expect(screen.queryByText("Kerala Driver")).toBeNull();
  });

  it("shows a search prompt instead of the list for staff", () => {
    vi.mocked(useAuth).mockImplementation(() => staffUser());
    renderPage();
    expect(screen.getByText("Search for a customer")).toBeDefined();
    expect(
      screen.getByText(
        "Enter a customer name, phone number, or vehicle registration number to view results.",
      ),
    ).toBeDefined();
    expect(document.querySelector("table")).toBeNull();
    expect(document.querySelector(".skeleton-list")).toBeNull();
  });

  it("treats whitespace-only input as no search for staff", () => {
    vi.mocked(useAuth).mockImplementation(() => staffUser());
    renderPage();
    fireEvent.change(searchInput(), { target: { value: "   " } });
    expect(vi.mocked(useApiData)).toHaveBeenLastCalledWith(
      "/customers?search=%20%20%20&status=ACTIVE",
      false,
    );
    expect(screen.queryByText("Kerala Driver")).toBeNull();
  });

  it("loads customers for staff once a name search is entered", () => {
    vi.mocked(useAuth).mockImplementation(() => staffUser());
    renderPage();
    fireEvent.change(searchInput(), { target: { value: "Kerala" } });
    expect(vi.mocked(useApiData)).toHaveBeenLastCalledWith(
      "/customers?search=Kerala&status=ACTIVE",
      true,
    );
    expect(screen.getByText("Kerala Driver")).toBeDefined();
  });

  it("loads customers for staff once a phone search is entered", () => {
    vi.mocked(useAuth).mockImplementation(() => staffUser());
    renderPage();
    fireEvent.change(searchInput(), { target: { value: "90020" } });
    expect(vi.mocked(useApiData)).toHaveBeenLastCalledWith(
      "/customers?search=90020&status=ACTIVE",
      true,
    );
    expect(screen.getByText("Test Customer")).toBeDefined();
  });

  it("loads customers for staff once a registration search is entered", () => {
    vi.mocked(useAuth).mockImplementation(() => staffUser());
    renderPage();
    fireEvent.change(searchInput(), { target: { value: "KL25A1234" } });
    expect(vi.mocked(useApiData)).toHaveBeenLastCalledWith(
      "/customers?search=KL25A1234&status=ACTIVE",
      true,
    );
    expect(
      screen.getByText("Matched vehicle: KL 25 A 1234, KL 26 B 5678"),
    ).toBeDefined();
  });

  it("hides the list again when staff clears the search", () => {
    vi.mocked(useAuth).mockImplementation(() => staffUser());
    renderPage();
    fireEvent.change(searchInput(), { target: { value: "Kerala" } });
    expect(screen.getByText("Kerala Driver")).toBeDefined();
    fireEvent.change(searchInput(), { target: { value: "" } });
    expect(vi.mocked(useApiData)).toHaveBeenLastCalledWith(
      "/customers?search=&status=ACTIVE",
      false,
    );
    expect(screen.queryByText("Kerala Driver")).toBeNull();
    expect(screen.getByText("Search for a customer")).toBeDefined();
  });

  it("keeps the search prompt when staff switch tabs", () => {
    vi.mocked(useAuth).mockImplementation(() => staffUser());
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Inactive" }));
    expect(vi.mocked(useApiData)).toHaveBeenLastCalledWith(
      "/customers?search=&status=INACTIVE",
      false,
    );
    expect(screen.getByText("Search for a customer")).toBeDefined();
    expect(screen.queryByText("Kerala Driver")).toBeNull();
  });

  it("loads the full customer list for admins with an empty search", () => {
    renderPage();
    expect(vi.mocked(useApiData)).toHaveBeenCalledWith(
      "/customers?search=&status=ACTIVE",
      true,
    );
    expect(screen.getByText("Kerala Driver")).toBeDefined();
    expect(document.querySelector("table")).not.toBeNull();
    expect(screen.queryByText("Search for a customer")).toBeNull();
  });
});

describe("Customers directory — staff phone masking", () => {
  afterEach(() => {
    cleanup();
    vi.mocked(useApiData).mockClear();
    vi.mocked(useAuth).mockImplementation(() => adminUser());
  });

  it("masks customer phone numbers in the table for staff", () => {
    vi.mocked(useAuth).mockImplementation(() => staffUser());
    renderPage();
    fireEvent.change(searchInput(), { target: { value: "90020" } });
    expect(screen.getByText("90xxxxxx05")).toBeDefined();
    expect(screen.getByText("+91 90xxxxxx05")).toBeDefined();
    expect(screen.queryByText("9002005005")).toBeNull();
  });

  it("keeps short or blank phone values readable for staff", () => {
    vi.mocked(useAuth).mockImplementation(() => staffUser());
    renderPage();
    fireEvent.change(searchInput(), { target: { value: "90020" } });
    expect(screen.getByRole("cell", { name: "123" })).toBeDefined();
    const noPhoneRow = screen.getByText("No Phone").closest("tr")!;
    expect(noPhoneRow.textContent).not.toContain("x");
  });

  it("keeps real phone numbers in call and WhatsApp actions for staff", () => {
    vi.mocked(useAuth).mockImplementation(() => staffUser());
    renderPage();
    fireEvent.change(searchInput(), { target: { value: "90020" } });
    expect(screen.getByLabelText("Call Test Customer")).toHaveAttribute(
      "href",
      "tel:+919002005005",
    );
    expect(
      screen.getByLabelText("Message Test Customer on WhatsApp"),
    ).toHaveAttribute("href", `https://wa.me/919002005005?text=${encodeURIComponent("Hi Test Customer, your vehicle wash has been completed. Thank you for choosing WashPro.")}`);
  });

  it("shows the full customer phone numbers to admins", () => {
    renderPage();
    expect(screen.getByText("9002005005")).toBeDefined();
    expect(screen.getByText("+91 90020 05005")).toBeDefined();
  });
});

describe("Customers directory — staff edit form phone integrity", () => {
  afterEach(() => {
    cleanup();
    vi.mocked(useAuth).mockImplementation(() => adminUser());
  });

  it("preloads the real phone into the edit form for staff", () => {
    vi.mocked(useAuth).mockImplementation(() => staffUser());
    render(
      <CustomerDialog
        customer={CUSTOMER_FIXTURE[0]!}
        onClose={() => undefined}
        onDone={() => undefined}
        open
      />,
    );
    const phoneInput = screen.getByLabelText("Phone") as HTMLInputElement;
    expect(phoneInput.value).toBe("9002005005");
  });

  it("submits the real phone unchanged when staff edits only the name", async () => {
    vi.mocked(useAuth).mockImplementation(() => staffUser());
    render(
      <CustomerDialog
        customer={CUSTOMER_FIXTURE[0]!}
        onClose={() => undefined}
        onDone={() => undefined}
        open
      />,
    );
    const fullNameInput = screen.getByLabelText("Full name") as HTMLInputElement;
    fireEvent.change(fullNameInput, { target: { value: "Test Customer Edited" } });
    fireEvent.submit(fullNameInput.closest("form")!);
    expect(api).toHaveBeenCalledWith("/customers/c1", {
      body: JSON.stringify({
        email: "",
        fullName: "Test Customer Edited",
        phone: "9002005005",
        version: 1,
      }),
      method: "PATCH",
    });
  });
});
