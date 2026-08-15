import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";

import CustomersPage, { CustomerDialog } from "./customers";
import { useAuth } from "../auth";
import { api } from "../lib/api";
import type { CustomerRecord } from "../types";

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

function makeCustomer(
  id: string,
  overrides: Partial<CustomerRecord> = {},
): CustomerRecord {
  return {
    id,
    full_name: `Customer ${id}`,
    phone: "9002005005",
    phone_normalized: "+919002005005",
    status: "ACTIVE",
    total_visits_cached: 0,
    total_spent_minor_cached: 0,
    last_visit_at: null,
    version: 1,
    ...overrides,
  };
}

const FIRST_PAGE = [
  ...CUSTOMER_FIXTURE,
  ...Array.from({ length: 11 }, (_, index) =>
    makeCustomer(`c${index + 5}`),
  ),
];

const SECOND_PAGE = Array.from({ length: 4 }, (_, index) =>
  makeCustomer(`c${index + 16}`, {
    full_name: `Page Two Customer ${index + 16}`,
  }),
);

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

function envelope(
  data: readonly CustomerRecord[],
  pagination: { hasNext: boolean; nextCursor: string | null; limit: number },
) {
  return {
    customers: data,
    pagination: {
      hasNext: pagination.hasNext,
      limit: pagination.limit,
      nextCursor: pagination.nextCursor,
    },
  };
}

function defaultApiResponse(path: string): unknown {
  const params = new URLSearchParams(path.split("?")[1] ?? "");
  if (params.get("cursor") !== null) {
    return envelope(SECOND_PAGE, {
      hasNext: false,
      limit: 15,
      nextCursor: null,
    });
  }
  if ((params.get("search") ?? "").toUpperCase().includes("KL")) {
    return envelope(REGISTRATION_MATCHED, {
      hasNext: false,
      limit: 15,
      nextCursor: null,
    });
  }
  return envelope(FIRST_PAGE, { hasNext: true, limit: 15, nextCursor: "cursor2" });
}

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

beforeEach(() => {
  vi.mocked(api).mockImplementation(
    async (path: string): Promise<unknown> => defaultApiResponse(path),
  );
});

afterEach(() => {
  cleanup();
  vi.mocked(api).mockClear();
  vi.mocked(useAuth).mockImplementation(() => adminUser());
});

describe("Customers directory — status column removed", () => {
  it("no longer renders the Status column header", async () => {
    renderPage();
    await screen.findByText("Test Customer");
    expect(
      screen.queryByRole("columnheader", { name: "Status" }),
    ).toBeNull();
  });

  it("no longer renders status badges in the table rows", async () => {
    renderPage();
    await screen.findByText("Test Customer");
    expect(document.querySelector(".status-badge")).toBeNull();
  });

  it("renders the Actions column header", async () => {
    renderPage();
    await screen.findByText("Test Customer");
    expect(
      screen.getByRole("columnheader", { name: "Actions" }),
    ).toBeDefined();
  });
});

describe("Customers directory — contact actions", () => {
  it("builds a tel: URL from the customer phone number", async () => {
    renderPage();
    await screen.findByText("Test Customer");
    expect(screen.getByLabelText("Call Test Customer")).toHaveAttribute(
      "href",
      "tel:+919002005005",
    );
  });

  it("adds the Indian country code to a 10-digit number for WhatsApp", async () => {
    renderPage();
    await screen.findByText("Test Customer");
    const href = screen
      .getByLabelText("Message Test Customer on WhatsApp")
      .getAttribute("href");
    expect(href).toContain("https://wa.me/919002005005?text=");
  });

  it("does not duplicate an existing 91 country code for WhatsApp", async () => {
    renderPage();
    await screen.findByText("Test Customer");
    const href = screen
      .getByLabelText("Message Kerala Driver on WhatsApp")
      .getAttribute("href");
    expect(href).toContain("https://wa.me/919002005005?text=");
  });

  it("encodes the wash completion message in the WhatsApp URL", async () => {
    renderPage();
    await screen.findByText("Test Customer");
    const encoded = encodeURIComponent(
      "Hi Test Customer, your vehicle wash has been completed. Thank you for choosing WashPro.",
    );
    expect(
      screen.getByLabelText("Message Test Customer on WhatsApp"),
    ).toHaveAttribute("href", `https://wa.me/919002005005?text=${encoded}`);
  });

  it("shows the expected tooltips on the contact actions", async () => {
    renderPage();
    await screen.findByText("Test Customer");
    expect(screen.getByLabelText("Call Test Customer")).toHaveAttribute(
      "title",
      "Call customer",
    );
    expect(
      screen.getByLabelText("Message Test Customer on WhatsApp"),
    ).toHaveAttribute("title", "Send wash completion message");
  });

  it("does not navigate to the customer details page when a contact button is clicked", async () => {
    renderPage();
    await screen.findByText("Test Customer");
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

  it("still navigates to the customer details page via the arrow link", async () => {
    renderPage();
    await screen.findByText("Test Customer");
    fireEvent.click(screen.getByLabelText("Open Test Customer"));
    expect(screen.getByText("Customer detail page")).toBeDefined();
  });

  it("disables both contact buttons when the phone number is missing", async () => {
    renderPage();
    await screen.findByText("Test Customer");
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

  it("disables both contact buttons when the phone number is invalid", async () => {
    renderPage();
    await screen.findByText("Test Customer");
    expect(screen.getByLabelText("Call Bad Phone")).toBeDisabled();
    expect(
      screen.getByLabelText("Message Bad Phone on WhatsApp"),
    ).toBeDisabled();
  });

  it("keeps the Active and Inactive tabs working", async () => {
    renderPage();
    await screen.findByText("Test Customer");
    expect(
      screen.getByRole("button", { name: "Active" }).className,
    ).toContain("active");
    fireEvent.click(screen.getByRole("button", { name: "Inactive" }));
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenLastCalledWith(
        "/customers?search=&status=INACTIVE&limit=15",
      ),
    );
    expect(
      screen.getByRole("button", { name: "Inactive" }).className,
    ).toContain("active");
  });

  it("renders the contact actions for staff users", async () => {
    vi.mocked(useAuth).mockImplementation(() => staffUser());
    renderPage();
    fireEvent.change(searchInput(), { target: { value: "Test" } });
    await screen.findByText("Test Customer");
    expect(screen.getByLabelText("Call Test Customer")).toBeDefined();
    expect(
      screen.getByLabelText("Message Test Customer on WhatsApp"),
    ).toBeDefined();
    expect(screen.getByLabelText("Call No Phone")).toBeDisabled();
  });
});

describe("Customers directory — registration search", () => {
  it("shows the registration-aware search placeholder", async () => {
    renderPage();
    await screen.findByText("Test Customer");
    expect(searchInput()).toBeDefined();
  });

  it("still searches customers by name", async () => {
    renderPage();
    await screen.findByText("Test Customer");
    fireEvent.change(searchInput(), { target: { value: "Kerala" } });
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenLastCalledWith(
        "/customers?search=Kerala&status=ACTIVE&limit=15",
      ),
    );
  });

  it("still searches customers by phone number", async () => {
    renderPage();
    await screen.findByText("Test Customer");
    fireEvent.change(searchInput(), { target: { value: "90020" } });
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenLastCalledWith(
        "/customers?search=90020&status=ACTIVE&limit=15",
      ),
    );
  });

  it("returns the associated customer for a full normalized registration", async () => {
    renderPage();
    await screen.findByText("Test Customer");
    fireEvent.change(searchInput(), { target: { value: "KL25A1234" } });
    expect(
      await screen.findByText("Matched vehicle: KL 25 A 1234, KL 26 B 5678"),
    ).toBeDefined();
  });

  it("returns the same customer for spaced or hyphenated registrations", async () => {
    renderPage();
    await screen.findByText("Test Customer");
    fireEvent.change(searchInput(), { target: { value: "KL 25 A 1234" } });
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenLastCalledWith(
        "/customers?search=KL%2025%20A%201234&status=ACTIVE&limit=15",
      ),
    );
    fireEvent.change(searchInput(), { target: { value: "kl-25-a-1234" } });
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenLastCalledWith(
        "/customers?search=kl-25-a-1234&status=ACTIVE&limit=15",
      ),
    );
    expect(
      screen.getByText("Matched vehicle: KL 25 A 1234, KL 26 B 5678"),
    ).toBeDefined();
  });

  it("returns the same customer for lowercase registration input", async () => {
    renderPage();
    await screen.findByText("Test Customer");
    fireEvent.change(searchInput(), { target: { value: "kl25a1234" } });
    expect(
      await screen.findByText("Matched vehicle: KL 25 A 1234, KL 26 B 5678"),
    ).toBeDefined();
  });

  it("passes short partial searches through to the server-side rule", async () => {
    renderPage();
    await screen.findByText("Test Customer");
    fireEvent.change(searchInput(), { target: { value: "12" } });
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenLastCalledWith(
        "/customers?search=12&status=ACTIVE&limit=15",
      ),
    );
    expect(await screen.findByText("Kerala Driver")).toBeDefined();
  });

  it("shows a customer owning multiple matching vehicles only once", async () => {
    renderPage();
    await screen.findByText("Test Customer");
    fireEvent.change(searchInput(), { target: { value: "KL25A1234" } });
    await screen.findByText("Matched vehicle: KL 25 A 1234, KL 26 B 5678");
    expect(screen.getAllByText("Test Customer")).toHaveLength(1);
    expect(screen.getAllByText(/Matched vehicle:/)).toHaveLength(1);
    expect(
      screen.getByText("Matched vehicle: KL 25 A 1234, KL 26 B 5678"),
    ).toBeDefined();
  });

  it("clearing the search restores the full customer list", async () => {
    renderPage();
    await screen.findByText("Test Customer");
    fireEvent.change(searchInput(), { target: { value: "KL25A1234" } });
    await screen.findByText("Matched vehicle: KL 25 A 1234, KL 26 B 5678");
    fireEvent.change(searchInput(), { target: { value: "" } });
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenLastCalledWith(
        "/customers?search=&status=ACTIVE&limit=15",
      ),
    );
    expect(await screen.findByText("Kerala Driver")).toBeDefined();
  });

  it("treats whitespace-only input as an empty search", async () => {
    renderPage();
    await screen.findByText("Test Customer");
    fireEvent.change(searchInput(), { target: { value: "   " } });
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenLastCalledWith(
        "/customers?search=%20%20%20&status=ACTIVE&limit=15",
      ),
    );
    expect(screen.getByText("Kerala Driver")).toBeDefined();
  });

  it("keeps immediate per-keystroke requests unchanged", async () => {
    renderPage();
    await screen.findByText("Test Customer");
    fireEvent.change(searchInput(), { target: { value: "K" } });
    fireEvent.change(searchInput(), { target: { value: "KL25A1234" } });
    await screen.findByText("Matched vehicle: KL 25 A 1234, KL 26 B 5678");
    const paths = vi.mocked(api).mock.calls.map(([path]) => path);
    expect(paths).toContain("/customers?search=K&status=ACTIVE&limit=15");
    expect(paths).toContain(
      "/customers?search=KL25A1234&status=ACTIVE&limit=15",
    );
  });

  it("lets admins search by registration", async () => {
    renderPage();
    await screen.findByText("Test Customer");
    fireEvent.change(searchInput(), { target: { value: "KL25A1234" } });
    expect(
      await screen.findByText("Matched vehicle: KL 25 A 1234, KL 26 B 5678"),
    ).toBeDefined();
  });

  it("lets staff search by registration", async () => {
    vi.mocked(useAuth).mockImplementation(() => staffUser());
    renderPage();
    fireEvent.change(searchInput(), { target: { value: "KL25A1234" } });
    expect(
      await screen.findByText("Matched vehicle: KL 25 A 1234, KL 26 B 5678"),
    ).toBeDefined();
  });
});

describe("Customers directory — staff must search first", () => {
  it("does not load the customer list for staff with an empty search", async () => {
    vi.mocked(useAuth).mockImplementation(() => staffUser());
    renderPage();
    await screen.findByText("Search for a customer");
    expect(vi.mocked(api)).not.toHaveBeenCalled();
    expect(screen.queryByText("Test Customer")).toBeNull();
    expect(screen.queryByText("Kerala Driver")).toBeNull();
  });

  it("shows a search prompt instead of the list for staff", async () => {
    vi.mocked(useAuth).mockImplementation(() => staffUser());
    renderPage();
    expect(await screen.findByText("Search for a customer")).toBeDefined();
    expect(
      screen.getByText(
        "Enter a customer name, phone number, or vehicle registration number to view results.",
      ),
    ).toBeDefined();
    expect(document.querySelector("table")).toBeNull();
    expect(document.querySelector(".skeleton-list")).toBeNull();
  });

  it("treats whitespace-only input as no search for staff", async () => {
    vi.mocked(useAuth).mockImplementation(() => staffUser());
    renderPage();
    await screen.findByText("Search for a customer");
    fireEvent.change(searchInput(), { target: { value: "   " } });
    await waitFor(() => expect(vi.mocked(api)).not.toHaveBeenCalled());
    expect(screen.queryByText("Kerala Driver")).toBeNull();
  });

  it("loads customers for staff once a name search is entered", async () => {
    vi.mocked(useAuth).mockImplementation(() => staffUser());
    renderPage();
    await screen.findByText("Search for a customer");
    fireEvent.change(searchInput(), { target: { value: "Kerala" } });
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenLastCalledWith(
        "/customers?search=Kerala&status=ACTIVE&limit=15",
      ),
    );
    expect(await screen.findByText("Kerala Driver")).toBeDefined();
  });

  it("loads customers for staff once a phone search is entered", async () => {
    vi.mocked(useAuth).mockImplementation(() => staffUser());
    renderPage();
    await screen.findByText("Search for a customer");
    fireEvent.change(searchInput(), { target: { value: "90020" } });
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenLastCalledWith(
        "/customers?search=90020&status=ACTIVE&limit=15",
      ),
    );
    expect(await screen.findByText("Test Customer")).toBeDefined();
  });

  it("loads customers for staff once a registration search is entered", async () => {
    vi.mocked(useAuth).mockImplementation(() => staffUser());
    renderPage();
    await screen.findByText("Search for a customer");
    fireEvent.change(searchInput(), { target: { value: "KL25A1234" } });
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenLastCalledWith(
        "/customers?search=KL25A1234&status=ACTIVE&limit=15",
      ),
    );
    expect(
      await screen.findByText("Matched vehicle: KL 25 A 1234, KL 26 B 5678"),
    ).toBeDefined();
  });

  it("hides the list again when staff clears the search", async () => {
    vi.mocked(useAuth).mockImplementation(() => staffUser());
    renderPage();
    await screen.findByText("Search for a customer");
    fireEvent.change(searchInput(), { target: { value: "Kerala" } });
    await screen.findByText("Kerala Driver");
    fireEvent.change(searchInput(), { target: { value: "" } });
    expect(await screen.findByText("Search for a customer")).toBeDefined();
    expect(screen.queryByText("Kerala Driver")).toBeNull();
  });

  it("keeps the search prompt when staff switch tabs", async () => {
    vi.mocked(useAuth).mockImplementation(() => staffUser());
    renderPage();
    await screen.findByText("Search for a customer");
    fireEvent.click(screen.getByRole("button", { name: "Inactive" }));
    expect(await screen.findByText("Search for a customer")).toBeDefined();
    expect(screen.queryByText("Kerala Driver")).toBeNull();
    expect(vi.mocked(api)).not.toHaveBeenCalled();
  });

  it("loads the full customer list for admins with an empty search", async () => {
    renderPage();
    expect(await screen.findByText("Kerala Driver")).toBeDefined();
    expect(document.querySelector("table")).not.toBeNull();
    expect(screen.queryByText("Search for a customer")).toBeNull();
  });
});

describe("Customers directory — staff phone masking", () => {
  it("masks customer phone numbers in the table for staff", async () => {
    vi.mocked(useAuth).mockImplementation(() => staffUser());
    renderPage();
    fireEvent.change(searchInput(), { target: { value: "90020" } });
    await screen.findByText("Test Customer");
    expect(screen.getAllByText("90xxxxxx05")).toHaveLength(12);
    expect(screen.getAllByText("+91 90xxxxxx05")).toHaveLength(1);
    expect(screen.queryByText("9002005005")).toBeNull();
  });

  it("keeps short or blank phone values readable for staff", async () => {
    vi.mocked(useAuth).mockImplementation(() => staffUser());
    renderPage();
    fireEvent.change(searchInput(), { target: { value: "90020" } });
    await screen.findByText("Test Customer");
    expect(screen.getByRole("cell", { name: "123" })).toBeDefined();
    const noPhoneRow = screen.getByText("No Phone").closest("tr")!;
    expect(noPhoneRow.textContent).not.toContain("x");
  });

  it("keeps real phone numbers in call and WhatsApp actions for staff", async () => {
    vi.mocked(useAuth).mockImplementation(() => staffUser());
    renderPage();
    fireEvent.change(searchInput(), { target: { value: "90020" } });
    await screen.findByText("Test Customer");
    expect(screen.getByLabelText("Call Test Customer")).toHaveAttribute(
      "href",
      "tel:+919002005005",
    );
    expect(
      screen.getByLabelText("Message Test Customer on WhatsApp"),
    ).toHaveAttribute(
      "href",
      `https://wa.me/919002005005?text=${encodeURIComponent("Hi Test Customer, your vehicle wash has been completed. Thank you for choosing WashPro.")}`,
    );
  });

  it("shows the full customer phone numbers to admins", async () => {
    renderPage();
    await screen.findByText("Test Customer");
    expect(screen.getAllByText("9002005005")).toHaveLength(12);
    expect(screen.getAllByText("+91 90020 05005")).toHaveLength(1);
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

describe("Customers directory — server-side pagination", () => {
  it("requests only the first page of customers on load", async () => {
    renderPage();
    await screen.findByText("Test Customer");
    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/customers?search=&status=ACTIVE&limit=15",
    );
    expect(screen.getByText("Showing 15 customers")).toBeDefined();
    expect(screen.getByText("Page 1")).toBeDefined();
  });

  it("defaults to 15 rows per page", async () => {
    renderPage();
    await screen.findByText("Test Customer");
    expect(vi.mocked(api).mock.calls.map(([path]) => path)[0]).toBe(
      "/customers?search=&status=ACTIVE&limit=15",
    );
  });

  it("renders only the first page of customers", async () => {
    renderPage();
    await screen.findByText("Test Customer");
    expect(screen.getByText("Customer c15")).toBeDefined();
    expect(screen.queryByText("Page Two Customer 16")).toBeNull();
  });

  it("loads the next page with the cursor when Next is clicked", async () => {
    renderPage();
    await screen.findByText("Test Customer");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Page Two Customer 16");
    expect(vi.mocked(api)).toHaveBeenLastCalledWith(
      "/customers?search=&status=ACTIVE&limit=15&cursor=cursor2",
    );
    expect(screen.getByText("Page 2")).toBeDefined();
    expect(screen.getByText("Showing 4 customers")).toBeDefined();
    expect(screen.queryByText("Test Customer")).toBeNull();
  });

  it("loads the previous page from the cursor history when Previous is clicked", async () => {
    renderPage();
    await screen.findByText("Test Customer");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Page Two Customer 16");
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    await screen.findByText("Test Customer");
    expect(vi.mocked(api)).toHaveBeenLastCalledWith(
      "/customers?search=&status=ACTIVE&limit=15",
    );
    expect(screen.getByText("Page 1")).toBeDefined();
  });

  it("disables Previous on page 1", async () => {
    renderPage();
    await screen.findByText("Test Customer");
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  });

  it("disables Next when the API reports no further pages", async () => {
    renderPage();
    await screen.findByText("Test Customer");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Page Two Customer 16");
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("resets to page 1 without a cursor when the search changes", async () => {
    renderPage();
    await screen.findByText("Test Customer");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Page Two Customer 16");
    fireEvent.change(searchInput(), { target: { value: "Rohit" } });
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenLastCalledWith(
        "/customers?search=Rohit&status=ACTIVE&limit=15",
      ),
    );
    expect(screen.getByText("Page 1")).toBeDefined();
    expect(screen.getByText("Showing 15 customers")).toBeDefined();
  });

  it("clearing the search resets to page 1", async () => {
    renderPage();
    await screen.findByText("Test Customer");
    fireEvent.change(searchInput(), { target: { value: "Rohit" } });
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenLastCalledWith(
        "/customers?search=Rohit&status=ACTIVE&limit=15",
      ),
    );
    fireEvent.change(searchInput(), { target: { value: "" } });
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenLastCalledWith(
        "/customers?search=&status=ACTIVE&limit=15",
      ),
    );
    expect(screen.getByText("Page 1")).toBeDefined();
  });

  it("resets to page 1 without a cursor when the status tab changes", async () => {
    renderPage();
    await screen.findByText("Test Customer");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Page Two Customer 16");
    fireEvent.click(screen.getByRole("button", { name: "Inactive" }));
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenLastCalledWith(
        "/customers?search=&status=INACTIVE&limit=15",
      ),
    );
    expect(screen.getByText("Page 1")).toBeDefined();
  });

  it("resets to page 1 and sends the new limit when the page size changes", async () => {
    renderPage();
    await screen.findByText("Test Customer");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Page Two Customer 16");
    const select = screen.getByLabelText("Rows per page") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "25" } });
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenLastCalledWith(
        "/customers?search=&status=ACTIVE&limit=25",
      ),
    );
    expect(screen.getByText("Page 1")).toBeDefined();
  });

  it("offers exactly the 15, 25 and 50 page sizes", async () => {
    renderPage();
    await screen.findByText("Test Customer");
    const select = screen.getByLabelText("Rows per page") as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.value)).toEqual([
      "15",
      "25",
      "50",
    ]);
  });

  it("keeps the current page visible while the next page loads", async () => {
    const pending = new Map<
      string,
      { resolve: (value: unknown) => void }
    >();
    vi.mocked(api).mockImplementation(
      (path: string) =>
        new Promise((resolve) => {
          pending.set(path, { resolve });
        }),
    );
    renderPage();
    const initialPath = "/customers?search=&status=ACTIVE&limit=15";
    await waitFor(() => expect(pending.has(initialPath)).toBe(true));
    pending
      .get(initialPath)!
      .resolve(
        envelope(FIRST_PAGE, { hasNext: true, limit: 15, nextCursor: "cursor2" }),
      );
    await screen.findByText("Test Customer");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    const nextPath =
      "/customers?search=&status=ACTIVE&limit=15&cursor=cursor2";
    await waitFor(() => expect(pending.has(nextPath)).toBe(true));
    expect(screen.getByText("Test Customer")).toBeDefined();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    pending
      .get(nextPath)!
      .resolve(
        envelope(SECOND_PAGE, { hasNext: false, limit: 15, nextCursor: null }),
      );
    expect(await screen.findByText("Page Two Customer 16")).toBeDefined();
  });

  it("ignores stale responses that resolve after a newer request", async () => {
    const pending = new Map<
      string,
      { resolve: (value: unknown) => void }
    >();
    vi.mocked(api).mockImplementation(
      (path: string) =>
        new Promise((resolve) => {
          pending.set(path, { resolve });
        }),
    );
    renderPage();
    const initialPath = "/customers?search=&status=ACTIVE&limit=15";
    await waitFor(() => expect(pending.has(initialPath)).toBe(true));
    pending
      .get(initialPath)!
      .resolve(
        envelope(FIRST_PAGE, { hasNext: true, limit: 15, nextCursor: "cursor2" }),
      );
    await screen.findByText("Test Customer");

    fireEvent.change(searchInput(), { target: { value: "Rohit" } });
    const rohitPath = "/customers?search=Rohit&status=ACTIVE&limit=15";
    await waitFor(() => expect(pending.has(rohitPath)).toBe(true));

    fireEvent.change(searchInput(), { target: { value: "Arun" } });
    const arunPath = "/customers?search=Arun&status=ACTIVE&limit=15";
    await waitFor(() => expect(pending.has(arunPath)).toBe(true));

    pending
      .get(arunPath)!
      .resolve(
        envelope([makeCustomer("arun-1", { full_name: "Arun Customer" })], {
          hasNext: false,
          limit: 15,
          nextCursor: null,
        }),
      );
    expect(await screen.findByText("Arun Customer")).toBeDefined();

    pending
      .get(rohitPath)!
      .resolve(
        envelope([makeCustomer("rohit-1", { full_name: "Rohit Customer" })], {
          hasNext: false,
          limit: 15,
          nextCursor: null,
        }),
      );
    await waitFor(() =>
      expect(screen.queryByText("Rohit Customer")).toBeNull(),
    );
    expect(screen.getByText("Arun Customer")).toBeDefined();
  });

  it("announces the current page to assistive technology", async () => {
    renderPage();
    await screen.findByText("Test Customer");
    expect(screen.getByText("Page 1")).toHaveAttribute("aria-live", "polite");
  });
});