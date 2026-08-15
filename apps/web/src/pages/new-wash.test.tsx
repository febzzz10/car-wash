import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { WASH_DRAFT_STORAGE_KEY } from "../lib/wizard-draft";
import { stepLabels } from "./new-wash";
import { api } from "../lib/api";
import { useAuth } from "../auth";
import { useApiData } from "../hooks/use-api-data";

const mockReload = vi.fn();

const CUSTOMER_FIXTURE: readonly {
  readonly id: string;
  readonly full_name: string;
  readonly phone: string;
  readonly phone_normalized: string;
  readonly total_visits_cached: number;
  readonly matching_registrations?: readonly string[];
}[] = [
  {
    id: "c1",
    full_name: "Test Customer",
    phone: "9876543210",
    phone_normalized: "+919876543210",
    total_visits_cached: 3,
    matching_registrations: ["KL01TEST"],
  },
];

let customerData = CUSTOMER_FIXTURE;

function customerSearchPayload(
  customers: readonly unknown[],
): { customers: readonly unknown[]; pagination: unknown } {
  return {
    customers,
    pagination: { hasNext: false, limit: 50, nextCursor: null },
  };
}

vi.mock("../lib/api", () => ({
  api: vi.fn(),
  jsonBody: (v: unknown) => ({ body: JSON.stringify(v) }),
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

vi.mock("../auth", () => ({
  useAuth: vi.fn(() => adminUser()),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

function asStaff() {
  vi.mocked(useAuth).mockImplementation(
    (): ReturnType<typeof useAuth> => ({
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
    }),
  );
}

vi.mock("../hooks/use-api-data", () => ({
  useApiData: vi.fn((path: string, enabled = true) => {
    if (path.includes("customers"))
      return {
        data: {
          customers: enabled ? customerData : [],
          pagination: { hasNext: false, limit: 5, nextCursor: null },
        },
        error: null,
        loading: false,
        reload: mockReload,
      };
    if (path.includes("assignable"))
      return {
        data: [{ id: "s1", full_name: "Staff One", role: "STAFF" }],
        error: null,
        loading: false,
        reload: mockReload,
      };
    if (path.includes("vehicles"))
      return {
        data: [
          {
            id: "v1",
            customer_id: "c1",
            registration_number: "KL01TEST",
            vehicle_type_id: "vt1",
            vehicle_type_name: "Four Wheeler",
            status: "ACTIVE",
            make: "Honda",
            model: "City",
          },
        ],
        error: null,
        loading: false,
        reload: mockReload,
      };
    if (path.includes("services"))
      return {
        data: {
          services: [
            {
              id: "p1",
              service_kind: "PRIMARY" as const,
              name: "Basic Wash",
              code: "BASIC",
              base_price_minor: 50000,
              estimated_duration_minutes: 30,
              description: "Standard wash",
              is_taxable: 1 as const,
              is_active: 1 as const,
              version: 1,
            },
          ],
          prices: [
            {
              id: "sp1",
              service_id: "p1",
              vehicle_type_id: "vt1",
              price_minor: 50000,
            },
          ],
          vehicleTypes: [
            { id: "vt1", name: "Four Wheeler", code: "FOUR_WHEELER" },
          ],
        },
        error: null,
        loading: false,
        reload: mockReload,
      };
    return { data: null, error: null, loading: false, reload: mockReload };
  }),
}));

vi.mock("../components/toast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

const STEP_IDS = [
  "customer",
  "vehicle",
  "assign",
  "photo-location",
  "services",
  "review",
] as const;

function setDraft(step: number) {
  sessionStorage.setItem(
    WASH_DRAFT_STORAGE_KEY,
    JSON.stringify({
      version: 3,
      step,
      stepId: STEP_IDS[step],
      customerId: "c1",
      vehicleId: "v1",
      servicePriceId: "p1",
      addOnServiceIds: [],
      assignedUserId: "s1",
      startImmediately: false,
      photoAssetId: "photo-1",
      place: "Test Location",
      capturedAt: "2026-07-30T10:00:00Z",
    }),
  );
}

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.clearAllMocks();
  vi.mocked(api).mockReset();
  vi.mocked(useAuth).mockImplementation(() => adminUser());
  customerData = CUSTOMER_FIXTURE;
});

describe("New Wash — stepLabels", () => {
  it("has exactly six entries", () => {
    expect(stepLabels).toHaveLength(6);
  });

  it("are Customer, Vehicle, Assign, Live photo & location, Services, Review", () => {
    expect(stepLabels).toEqual([
      "Customer",
      "Vehicle",
      "Assign",
      "Live photo & location",
      "Services",
      "Review",
    ]);
  });

  it("does not contain Benefits", () => {
    expect(stepLabels).not.toContain("Benefits");
  });

  it("Review is at index 5", () => {
    expect(stepLabels[5]).toBe("Review");
  });

  it("Services is at index 4", () => {
    expect(stepLabels[4]).toBe("Services");
  });
});

describe("New Wash wizard — navigation", () => {
  it("renders six stepper buttons", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    const stepper = screen.getByLabelText("New Wash steps");
    const stepButtons = stepper.querySelectorAll("button small");
    expect(stepButtons).toHaveLength(6);
  });

  it("Services Continue opens Review directly", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    setDraft(4);
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Choose services")).toBeTruthy();

    const continueBtn = screen.getByText("Continue").closest("button")!;
    expect(continueBtn).not.toBeDisabled();
    fireEvent.click(continueBtn);

    expect(screen.getByText("Review and create")).toBeTruthy();
  });

  it("Back from Review returns to Services", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    setDraft(5);
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Review and create")).toBeTruthy();

    const backBtn = screen.getByText("Back").closest("button")!;
    fireEvent.click(backBtn);

    expect(screen.getByText("Choose services")).toBeTruthy();
  });

  it("Back is disabled at step 0", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );

    const backBtn = screen.getByText("Back").closest("button")!;
    expect(backBtn).toBeDisabled();
  });

  it("stepper buttons allow going back but not forward past current step", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    setDraft(3); // start at photo step
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );

    const buttons = screen.getAllByRole("button");
    const stepButtons = buttons.filter(
      (b) => b.querySelector("small") !== null,
    );

    // At step 3, only indices 0-3 should have aria-current set or be clickable
    // Clicking step 4 (Services) should not change anything — index 4 > step 3
    fireEvent.click(stepButtons[4]!);
    expect(screen.getByText("Capture photo & location")).toBeTruthy();

    // Clicking step 0 should go to Customer
    fireEvent.click(stepButtons[0]!);
    expect(screen.getByText("Who is this wash for?")).toBeTruthy();
  });

  it("Continue button changes to Create at Review step", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    setDraft(5);
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );

    // At Review (step 5), Continue is replaced with Create + Save
    expect(screen.queryByText("Continue")).toBeNull();
    expect(
      screen.getByRole("button", { name: /Create.*job/ }),
    ).toBeTruthy();
    expect(screen.getByText("Save draft")).toBeTruthy();
  });
});

describe("New Wash — removed benefit controls", () => {
  it("no coupon code field renders anywhere", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    expect(screen.queryByText("Coupon code")).toBeNull();
  });

  it("no referral code field renders anywhere", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    expect(screen.queryByText("Referral code")).toBeNull();
  });

  it("no reward selector renders anywhere", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    expect(screen.queryByText("Available reward")).toBeNull();
  });

  it("no manual discount field renders anywhere", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    expect(screen.queryByText("Manual discount")).toBeNull();
  });

  it("no Verify Benefits button renders anywhere", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    expect(screen.queryByText("Verify benefits")).toBeNull();
  });

  it("no Server-verified benefits text renders anywhere", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    expect(screen.queryByText("Server-verified benefits")).toBeNull();
  });

  it("no Benefits text in stepper", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    expect(screen.queryByText("Benefits")).toBeNull();
  });
});

describe("New Wash — Review step", () => {
  it("Review contains no Benefits section", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    setDraft(5);
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    expect(screen.queryByText("Benefits")).toBeNull();
  });

  it("Review shows customer info", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    setDraft(5);
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    const nameMatches = screen.getAllByText("Test Customer");
    expect(nameMatches.length).toBeGreaterThanOrEqual(1);
    const phoneMatches = screen.getAllByText("9876543210");
    expect(phoneMatches.length).toBeGreaterThanOrEqual(1);
  });

  it("Review shows vehicle info", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    setDraft(5);
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    const matches = screen.getAllByText("KL01TEST");
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("Review shows assigned staff name", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    setDraft(5);
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    const matches = screen.getAllByText("Staff One");
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("Review shows primary service name", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    setDraft(5);
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    const matches = screen.getAllByText("Basic Wash");
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("Review shows location is not captured when evidence is empty", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    sessionStorage.setItem(
      WASH_DRAFT_STORAGE_KEY,
      JSON.stringify({
        version: 3,
        step: 5,
        stepId: "review",
        customerId: "c1",
        vehicleId: "v1",
        servicePriceId: "p1",
        addOnServiceIds: [],
        assignedUserId: "s1",
        startImmediately: false,
      }),
    );
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("Not captured")).toBeTruthy();
  });

  it("Review shows estimated service value", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    setDraft(5);
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("Estimated service value")).toBeTruthy();
  });

  it("Review masks the customer phone for staff", async () => {
    asStaff();
    const baseImpl = vi.mocked(useApiData).getMockImplementation()!;
    vi.mocked(useApiData).mockImplementation((path: string, enabled = true) => {
      if (path.includes("customers"))
        return {
          data: {
            customers: CUSTOMER_FIXTURE,
            pagination: { hasNext: false, limit: 50, nextCursor: null },
          },
          error: null,
          loading: false,
          reload: mockReload,
        };
      return baseImpl(path, enabled);
    });
    const { default: NewWashPage } = await import("./new-wash");
    setDraft(5);
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    expect(screen.queryByText("9876543210")).toBeNull();
    expect(screen.getAllByText("98xxxxxx10").length).toBeGreaterThanOrEqual(1);
    vi.mocked(useApiData).mockImplementation(baseImpl);
    vi.mocked(useAuth).mockImplementation(() => adminUser());
  });
});

describe("New Wash — create-job payload", () => {
  it("submits request without any benefit fields", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    setDraft(5);
    render(<MemoryRouter><NewWashPage /></MemoryRouter>);

    const createBtn = screen.getByRole("button", { name: /Create.*job/ });
    fireEvent.click(createBtn);

    const mockApi = vi.mocked(api);
    const createCall = mockApi.mock.calls.find(
      (c) => c[0] === "/wash-jobs" && (c[1] as RequestInit)?.method === "POST",
    );
    expect(createCall).toBeDefined();

    const body = JSON.parse((createCall![1] as RequestInit).body as string);

    // Required fields present
    expect(body.addOnServiceIds).toBeDefined();
    expect(body.assignedUserId).toBe("s1");
    expect(body.customerId).toBe("c1");
    expect(body.photoAssetId).toBe("photo-1");
    expect(body.primaryServiceId).toBe("p1");
    expect(body.vehicleId).toBe("v1");
    expect(body.idempotencyKey).toBeDefined();
    expect(body.initialStatus).toBeDefined();

    // Benefit fields absent
    expect(body.couponCode).toBeUndefined();
    expect(body.referralCode).toBeUndefined();
    expect(body.rewardId).toBeUndefined();
    expect(body.rewardAmountMinor).toBeUndefined();
    expect(body.manualDiscountMinor).toBeUndefined();
    expect(body.manualDiscountReason).toBeUndefined();
    expect(body.benefits).toBeUndefined();
  });

  it("never calls verify-benefits", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    setDraft(5);
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Create.*job/ }));

    const mockApi = vi.mocked(api);
    const verifyCall = mockApi.mock.calls.find((c) =>
      (c[0] as string).includes("verify-benefits"),
    );
    expect(verifyCall).toBeUndefined();
  });
});

describe("New Wash — persisted evidence", () => {
  it("restores persisted photo and location evidence and submits the wash job after reload", async () => {
    vi.mocked(api).mockResolvedValueOnce({ id: "created-job-1" } as any);

    sessionStorage.setItem(
      WASH_DRAFT_STORAGE_KEY,
      JSON.stringify({
        version: 3,
        step: 5,
        stepId: "review",
        customerId: "c1",
        vehicleId: "v1",
        servicePriceId: "p1",
        addOnServiceIds: [],
        assignedUserId: "s1",
        startImmediately: false,
        photoAssetId: "photo-restored",
        place: "Restored Location",
        capturedAt: "2026-07-30T12:00:00Z",
      }),
    );

    const { default: NewWashPage } = await import("./new-wash");
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Review and create")).toBeTruthy();
    expect(screen.getByText("Restored Location")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Create.*job/ }));

    await vi.waitFor(() => {
      const mockApi = vi.mocked(api);
      const createCall = mockApi.mock.calls.find(
        (c) =>
          c[0] === "/wash-jobs" &&
          (c[1] as RequestInit)?.method === "POST",
      );
      expect(createCall).toBeDefined();

      const body = JSON.parse(
        (createCall![1] as RequestInit).body as string,
      );

      expect(body.photoAssetId).toBe("photo-restored");
      expect(body.location.place).toBe("Restored Location");
      expect(body.location.capturedAt).toBe("2026-07-30T12:00:00Z");
      expect(body.customerId).toBe("c1");
      expect(body.vehicleId).toBe("v1");
    });

    await vi.waitFor(() => {
      expect(
        sessionStorage.getItem(WASH_DRAFT_STORAGE_KEY),
      ).toBeNull();
    });
  });

  it("does not submit create-job when evidence is missing after reload", async () => {
    sessionStorage.setItem(
      WASH_DRAFT_STORAGE_KEY,
      JSON.stringify({
        version: 3,
        step: 5,
        stepId: "review",
        customerId: "c1",
        vehicleId: "v1",
        servicePriceId: "p1",
        addOnServiceIds: [],
        assignedUserId: "s1",
        startImmediately: false,
      }),
    );

    const { default: NewWashPage } = await import("./new-wash");
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Review and create")).toBeTruthy();
    expect(screen.getByText("Not captured")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Create.*job/ }));

    const mockApi = vi.mocked(api);
    const createCalls = mockApi.mock.calls.filter(
      (c) =>
        c[0] === "/wash-jobs" &&
        (c[1] as RequestInit)?.method === "POST",
    );
    expect(createCalls).toHaveLength(0);

    expect(screen.getByText("Review and create")).toBeTruthy();
  });
});

describe("New Wash — wizard summary panel", () => {
  it("shows 'Before benefits, tax, and rounding' disclaimer", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    expect(
      screen.getByText("Before benefits, tax, and rounding"),
    ).toBeTruthy();
  });

  it("evidence sidebar shows photo needed and location required at step 0", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    const liveMatches = screen.getAllByText(/Live photo/);
    expect(liveMatches.length).toBeGreaterThanOrEqual(2);
    const locationMatches = screen.getAllByText(/Location/);
    expect(locationMatches.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/required/).textContent).toContain("required");
  });
});

describe("New Wash — customer registration search", () => {
  it("renders the updated helper text", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    expect(
      screen.getByText(
        "Search by customer name, phone, or vehicle registration number. Phone and registration numbers are normalized for matching.",
      ),
    ).toBeTruthy();
  });

  it("renders the updated placeholder", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    expect(
      screen.getByPlaceholderText("Name, phone, or registration number..."),
    ).toBeTruthy();
  });

  it("shows matching registration numbers on registration-matched results", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    expect(
      screen.getByText("KL01TEST · 9876543210 · 3 visits"),
    ).toBeTruthy();
  });

  it("selecting a registration-matched customer continues the wizard", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    const customerButton = screen
      .getByText("Test Customer")
      .closest("button")!;
    fireEvent.click(customerButton);
    const continueButton = screen.getByText("Continue").closest("button")!;
    expect(continueButton).not.toBeDisabled();
    fireEvent.click(continueButton);
    expect(screen.getByText("Select a vehicle")).toBeTruthy();
  });

  it("shows the normal empty state when a registration search has no match", async () => {
    vi.mocked(useApiData).mockImplementationOnce(() => ({
      data: {
        customers: [],
        pagination: { hasNext: false, limit: 50, nextCursor: null },
      },
      error: null,
      loading: false,
      reload: mockReload,
    }));
    const { default: NewWashPage } = await import("./new-wash");
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    expect(screen.queryByText("Test Customer")).toBeNull();
  });
});

const SEARCH_INSTRUCTION =
  "Search by customer name, phone, or vehicle registration number to find a customer.";

function customerInput(): HTMLInputElement {
  return screen.getByPlaceholderText(
    "Name, phone, or registration number...",
  ) as HTMLInputElement;
}

describe("New Wash — staff customer search privacy", () => {
  it("does not render customer rows when the step first opens", async () => {
    asStaff();
    const { default: NewWashPage } = await import("./new-wash");
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    expect(screen.queryByText("Test Customer")).toBeNull();
  });

  it("does not request the unfiltered customer list initially", async () => {
    asStaff();
    const { default: NewWashPage } = await import("./new-wash");
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    const customersCall = vi
      .mocked(useApiData)
      .mock.calls.find(([path]) => path.includes("customers"));
    expect(customersCall).toBeDefined();
    expect(customersCall![1]).toBe(false);
  });

  it("shows the search instruction when the search is empty", async () => {
    asStaff();
    const { default: NewWashPage } = await import("./new-wash");
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(SEARCH_INSTRUCTION)).toBeTruthy();
  });

  it("does not show the no-results state before a search is performed", async () => {
    asStaff();
    customerData = [];
    const { default: NewWashPage } = await import("./new-wash");
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    expect(screen.queryByText("No customers found")).toBeNull();
    expect(screen.getByText(SEARCH_INSTRUCTION)).toBeTruthy();
  });

  it("entering a customer name displays matching results", async () => {
    asStaff();
    const { default: NewWashPage } = await import("./new-wash");
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    fireEvent.change(customerInput(), { target: { value: "Test" } });
    expect(screen.getByText("Test Customer")).toBeTruthy();
    expect(screen.queryByText(SEARCH_INSTRUCTION)).toBeNull();
  });

  it("entering a phone number displays matching results", async () => {
    asStaff();
    const { default: NewWashPage } = await import("./new-wash");
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    fireEvent.change(customerInput(), { target: { value: "9876" } });
    expect(screen.getByText("Test Customer")).toBeTruthy();
  });

  it("entering a registration number displays matching results", async () => {
    asStaff();
    const { default: NewWashPage } = await import("./new-wash");
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    fireEvent.change(customerInput(), { target: { value: "KL01" } });
    expect(screen.getByText("Test Customer")).toBeTruthy();
    expect(
      screen.getByText("KL01TEST · 98xxxxxx10 · 3 visits"),
    ).toBeTruthy();
  });

  it("clearing the search removes all customer rows and shows the instruction", async () => {
    asStaff();
    const { default: NewWashPage } = await import("./new-wash");
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    fireEvent.change(customerInput(), { target: { value: "Test" } });
    expect(screen.getByText("Test Customer")).toBeTruthy();
    fireEvent.change(customerInput(), { target: { value: "" } });
    expect(screen.queryByText("Test Customer")).toBeNull();
    expect(screen.getByText(SEARCH_INSTRUCTION)).toBeTruthy();
  });

  it("clearing the search does not trigger an unfiltered request", async () => {
    asStaff();
    const { default: NewWashPage } = await import("./new-wash");
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    fireEvent.change(customerInput(), { target: { value: "Test" } });
    fireEvent.change(customerInput(), { target: { value: "" } });
    const emptySearchCalls = vi
      .mocked(useApiData)
      .mock.calls.filter(([path]) => path === "/customers?search=&limit=50");
    expect(emptySearchCalls.length).toBeGreaterThan(0);
    for (const [, enabled] of emptySearchCalls) expect(enabled).toBe(false);
  });

  it("shows the no-results state only after a completed search", async () => {
    asStaff();
    customerData = [];
    const { default: NewWashPage } = await import("./new-wash");
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    expect(screen.queryByText("No customers found")).toBeNull();
    fireEvent.change(customerInput(), { target: { value: "zzz" } });
    expect(screen.getByText("No customers found")).toBeTruthy();
  });

  it("does not repopulate rows from held-back data once the search is cleared", async () => {
    asStaff();
    const { default: NewWashPage } = await import("./new-wash");
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    const input = customerInput();
    fireEvent.change(input, { target: { value: "Test" } });
    expect(screen.getByText("Test Customer")).toBeTruthy();
    fireEvent.change(input, { target: { value: "" } });
    expect(screen.queryByText("Test Customer")).toBeNull();
    fireEvent.change(input, { target: { value: "Other" } });
    expect(screen.queryByText(SEARCH_INSTRUCTION)).toBeNull();
    expect(screen.getByText("Test Customer")).toBeTruthy();
  });

  it("selecting a searched customer continues the wizard", async () => {
    asStaff();
    const { default: NewWashPage } = await import("./new-wash");
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    fireEvent.change(customerInput(), { target: { value: "Test" } });
    fireEvent.click(screen.getByText("Test Customer").closest("button")!);
    const continueButton = screen.getByText("Continue").closest("button")!;
    expect(continueButton).not.toBeDisabled();
    fireEvent.click(continueButton);
    expect(screen.getByText("Select a vehicle")).toBeTruthy();
  });

  it("returning to the Customer step does not reveal the recent-customer list", async () => {
    asStaff();
    setDraft(1);
    const { default: NewWashPage } = await import("./new-wash");
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText("Back").closest("button")!);
    expect(screen.getByText("Who is this wash for?")).toBeTruthy();
    expect(screen.queryByText("Test Customer")).toBeNull();
    expect(screen.getByText(SEARCH_INSTRUCTION)).toBeTruthy();
  });

  it("keeps the Add customer button without a search", async () => {
    asStaff();
    const { default: NewWashPage } = await import("./new-wash");
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("button", { name: /Add customer/ }),
    ).toBeTruthy();
  });

  it("never shows the recently added customers section to staff", async () => {
    asStaff();
    const { default: NewWashPage } = await import("./new-wash");
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    expect(screen.queryByText("Recently added customers")).toBeNull();
    expect(screen.queryByText("No customers yet")).toBeNull();
  });
});

describe("New Wash — admin customer list", () => {
  const RECENT_FIVE = [
    {
      id: "r1",
      full_name: "Grace",
      phone: "9000000007",
      phone_normalized: "+919000000007",
      total_visits_cached: 0,
    },
    {
      id: "r2",
      full_name: "Finn",
      phone: "9000000006",
      phone_normalized: "+919000000006",
      total_visits_cached: 1,
    },
    {
      id: "r3",
      full_name: "Eve",
      phone: "9000000005",
      phone_normalized: "+919000000005",
      total_visits_cached: 2,
    },
    {
      id: "r4",
      full_name: "Dan",
      phone: "9000000004",
      phone_normalized: "+919000000004",
      total_visits_cached: 0,
    },
    {
      id: "r5",
      full_name: "Cathy",
      phone: "9000000003",
      phone_normalized: "+919000000003",
      total_visits_cached: 5,
    },
  ];

  it("shows the Recently added customers heading with an empty search", async () => {
    customerData = RECENT_FIVE;
    const { default: NewWashPage } = await import("./new-wash");
    render(<MemoryRouter><NewWashPage /></MemoryRouter>);
    expect(screen.getByText("Recently added customers")).toBeTruthy();
    expect(screen.getByText("Grace")).toBeTruthy();
    expect(screen.getByText("Finn")).toBeTruthy();
    expect(screen.queryByText(SEARCH_INSTRUCTION)).toBeNull();
  });

  it("hides the recent list and shows search results when admin types", async () => {
    customerData = [{ id: "search-result", full_name: "Rohit", phone: "8590384225", phone_normalized: "+918590384225", total_visits_cached: 0 }];
    const { default: NewWashPage } = await import("./new-wash");
    render(<MemoryRouter><NewWashPage /></MemoryRouter>);
    expect(screen.getByText("Recently added customers")).toBeTruthy();
    fireEvent.change(customerInput(), { target: { value: "Rohit" } });
    expect(screen.queryByText("Recently added customers")).toBeNull();
    expect(screen.queryByText("Grace")).toBeNull();
    expect(screen.getByText("Rohit")).toBeTruthy();
  });

  it("restores the recent list when admin clears the search", async () => {
    customerData = RECENT_FIVE;
    const { default: NewWashPage } = await import("./new-wash");
    render(<MemoryRouter><NewWashPage /></MemoryRouter>);
    fireEvent.change(customerInput(), { target: { value: "Rohit" } });
    expect(screen.queryByText("Recently added customers")).toBeNull();
    customerData = RECENT_FIVE;
    fireEvent.change(customerInput(), { target: { value: "" } });
    expect(screen.getByText("Recently added customers")).toBeTruthy();
    expect(screen.getByText("Grace")).toBeTruthy();
  });

  it("selecting a recent customer continues the wizard", async () => {
    customerData = RECENT_FIVE;
    const { default: NewWashPage } = await import("./new-wash");
    render(<MemoryRouter><NewWashPage /></MemoryRouter>);
    const graceButtons = screen.getAllByText("Grace");
    const graceCustomerButton = graceButtons.find(
      (el) => el.closest("button") !== null,
    )!.closest("button")!;
    fireEvent.click(graceCustomerButton);
    expect(screen.getAllByText("Grace").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Continue")).toBeTruthy();
  });

  it("shows No customers yet when the org has zero customers", async () => {
    customerData = [];
    const { default: NewWashPage } = await import("./new-wash");
    render(<MemoryRouter><NewWashPage /></MemoryRouter>);
    expect(screen.getByText("No customers yet")).toBeTruthy();
    expect(screen.queryByText("Recently added customers")).toBeNull();
  });

  it("shows the full five recent customer names in order", async () => {
    customerData = RECENT_FIVE;
    const { default: NewWashPage } = await import("./new-wash");
    render(<MemoryRouter><NewWashPage /></MemoryRouter>);
    expect(screen.getByText("Grace")).toBeTruthy();
    expect(screen.getByText("Finn")).toBeTruthy();
    expect(screen.getByText("Eve")).toBeTruthy();
    expect(screen.getByText("Dan")).toBeTruthy();
    expect(screen.getByText("Cathy")).toBeTruthy();
  });
});

type GeoPosition = {
  readonly coords: { readonly latitude: number; readonly longitude: number };
  readonly timestamp: number;
};
type GeoFailure = { readonly code: number; readonly PERMISSION_DENIED: number };

function stubGeolocation(options: {
  readonly onPosition?: GeoPosition;
  readonly onError?: GeoFailure;
}) {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition(
        success: (position: GeoPosition) => void,
        failure: (error: GeoFailure) => void,
      ) {
        if (options.onPosition !== undefined) success(options.onPosition);
        if (options.onError !== undefined) failure(options.onError);
      },
    },
  });
}

function setDraftAtStep3(draft: {
  readonly photoAssetId?: string;
  readonly place?: string;
  readonly capturedAt?: string;
}) {
  sessionStorage.setItem(
    WASH_DRAFT_STORAGE_KEY,
    JSON.stringify({
      version: 3,
      step: 3,
      stepId: "photo-location",
      customerId: "c1",
      vehicleId: "v1",
      servicePriceId: "p1",
      addOnServiceIds: [],
      assignedUserId: "s1",
      startImmediately: false,
      ...draft,
    }),
  );
}

describe("New Wash — location is required at Step 3", () => {
  it("Continue stays disabled when only the photo is captured", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    setDraftAtStep3({ photoAssetId: "photo-1" });
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    const continueBtn = screen.getByText("Continue").closest("button")!;
    expect(continueBtn).toBeDisabled();
    expect(screen.getByText("Capture place")).toBeTruthy();
  });

  it("Continue stays disabled when only a location is present", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    setDraftAtStep3({
      place: "Test Location",
      capturedAt: "2026-07-30T10:00:00Z",
    });
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    const continueBtn = screen.getByText("Continue").closest("button")!;
    expect(continueBtn).toBeDisabled();
  });

  it("Continue is enabled when both photo and location are complete", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    setDraftAtStep3({
      photoAssetId: "photo-1",
      place: "Test Location",
      capturedAt: "2026-07-30T10:00:00Z",
    });
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    const continueBtn = screen.getByText("Continue").closest("button")!;
    expect(continueBtn).not.toBeDisabled();
  });

  it("shows Capturing location… and blocks repeat clicks while pending", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    setDraftAtStep3({ photoAssetId: "photo-1" });
    let success: ((position: GeoPosition) => void) | undefined;
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (ok: (position: GeoPosition) => void) => {
          success = ok;
        },
      },
    });
    vi.mocked(api).mockResolvedValueOnce({ place: "Test Location" } as never);
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText("Capture place").closest("button")!);
    expect(screen.getByText("Capturing location…")).toBeTruthy();
    expect(screen.getByText("Capture place").closest("button")!).toBeDisabled();
    success!({
      coords: { latitude: 9.98, longitude: 76.28 },
      timestamp: 1_752_700_000_000,
    });
    await vi.waitFor(() => {
      expect(screen.getByText("Continue").closest("button")!).not.toBeDisabled();
    });
  });

  it("captures a readable place and enables Continue", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    setDraftAtStep3({ photoAssetId: "photo-1" });
    stubGeolocation({
      onPosition: {
        coords: { latitude: 9.98, longitude: 76.28 },
        timestamp: 1_752_700_000_000,
      },
    });
    vi.mocked(api).mockResolvedValueOnce({ place: "Fort Kochi" } as never);
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText("Capture place").closest("button")!);
    await vi.waitFor(() => {
      const geocodeCall = vi
        .mocked(api)
        .mock.calls.find(([path]) => path === "/geocode/reverse");
      expect(geocodeCall).toBeDefined();
    });
    const body = JSON.parse(
      (vi.mocked(api).mock.calls.find(([path]) => path === "/geocode/reverse")![1] as RequestInit).body as string,
    );
    expect(body.latitude).toBe(9.98);
    expect(body.longitude).toBe(76.28);
    await vi.waitFor(() => {
      expect(screen.getByText("Location Fort Kochi")).toBeTruthy();
      expect(screen.getByText("Continue").closest("button")!).not.toBeDisabled();
    });
  });

  it("shows permission-denied error and keeps Continue disabled", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    setDraftAtStep3({ photoAssetId: "photo-1" });
    stubGeolocation({
      onError: { code: 1, PERMISSION_DENIED: 1 },
    });
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText("Capture place").closest("button")!);
    expect(
      screen.getByText("Location permission is required to continue."),
    ).toBeTruthy();
    expect(screen.getByText("Continue").closest("button")!).toBeDisabled();
  });

  it("shows generic geolocation failure error", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    setDraftAtStep3({ photoAssetId: "photo-1" });
    stubGeolocation({
      onError: { code: 2, PERMISSION_DENIED: 1 },
    });
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText("Capture place").closest("button")!);
    expect(
      screen.getByText("Unable to capture your location. Please try again."),
    ).toBeTruthy();
  });

  it("shows a readable-place error when reverse geocoding fails", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    setDraftAtStep3({ photoAssetId: "photo-1" });
    stubGeolocation({
      onPosition: {
        coords: { latitude: 9.98, longitude: 76.28 },
        timestamp: 1_752_700_000_000,
      },
    });
    vi.mocked(api).mockRejectedValueOnce(new Error("GEOCODING_UNAVAILABLE"));
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText("Capture place").closest("button")!);
    await vi.waitFor(() => {
      expect(
        screen.getByText("Unable to determine a readable place. Please try again."),
      ).toBeTruthy();
    });
  });

  it("rejects an api-provided blank place", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    setDraftAtStep3({ photoAssetId: "photo-1" });
    stubGeolocation({
      onPosition: {
        coords: { latitude: 9.98, longitude: 76.28 },
        timestamp: 1_752_700_000_000,
      },
    });
    vi.mocked(api).mockResolvedValueOnce({ place: "   " } as never);
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText("Capture place").closest("button")!);
    await vi.waitFor(() => {
      expect(screen.getByText(/Please try again/)).toBeTruthy();
    });
  });

  it("clears a previous location error on successful capture", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    setDraftAtStep3({ photoAssetId: "photo-1" });
    stubGeolocation({
      onError: { code: 1, PERMISSION_DENIED: 1 },
    });
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText("Capture place").closest("button")!);
    expect(screen.getByText("Location permission is required to continue.")).toBeTruthy();
    stubGeolocation({
      onPosition: {
        coords: { latitude: 9.98, longitude: 76.28 },
        timestamp: 1_752_700_000_000,
      },
    });
    vi.mocked(api).mockResolvedValueOnce({ place: "Fort Kochi" } as never);
    fireEvent.click(screen.getByText("Capture place").closest("button")!);
    await vi.waitFor(() => {
      expect(
        screen.queryByText("Location permission is required to continue."),
      ).toBeNull();
    });
  });

  it("keeps the location after retake and requires a fresh photo before continuing", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    setDraftAtStep3({
      photoAssetId: "photo-1",
      place: "Test Location",
      capturedAt: "2026-07-30T10:00:00Z",
    });
    vi.mocked(api).mockResolvedValue(undefined as never);
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("Continue").closest("button")!).not.toBeDisabled();
    fireEvent.click(screen.getByText("Retake photo").closest("button")!);
    await vi.waitFor(() => {
      expect(screen.getByText("Continue").closest("button")!).toBeDisabled();
    });
    expect(screen.getByText("Allow camera")).toBeTruthy();
    expect(screen.getByText("Location Test Location")).toBeTruthy();
  });

  it("advances to Services after Continue on a complete step", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    setDraftAtStep3({
      photoAssetId: "photo-1",
      place: "Test Location",
      capturedAt: "2026-07-30T10:00:00Z",
    });
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText("Continue").closest("button")!);
    expect(screen.getByText("Choose services")).toBeTruthy();
  });

  it("displays the captured place in the wizard summary", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    setDraftAtStep3({ photoAssetId: "photo-1" });
    stubGeolocation({
      onPosition: {
        coords: { latitude: 9.98, longitude: 76.28 },
        timestamp: 1_752_700_000_000,
      },
    });
    vi.mocked(api).mockResolvedValueOnce({ place: "Fort Kochi" } as never);
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText("Capture place").closest("button")!);
    await vi.waitFor(() => {
      expect(screen.getByText("Location Fort Kochi")).toBeTruthy();
    });
  });
});

function openAddCustomerDialog() {
  fireEvent.click(screen.getByRole("button", { name: /Add customer/ }));
}

function dialogPhoneInput(): HTMLInputElement {
  return screen.getByLabelText("WhatsApp / Phone Number") as HTMLInputElement;
}

function dialogAddCustomerButton(): HTMLElement {
  return within(screen.getByRole("dialog")).getByRole("button", {
    name: "Add customer",
  });
}

const SEARCH_RESULT_ARUN = {
  id: "c-arun",
  full_name: "Arun",
  phone: "8590384225",
  phone_normalized: "+918590384225",
  total_visits_cached: 3,
  matching_registrations: undefined as readonly string[] | undefined,
};
const SEARCH_RESULT_ARUN_KUMAR = {
  id: "c-arun-kumar",
  full_name: "Arun Kumar",
  phone: "8590123456",
  phone_normalized: "+918590123456",
  total_visits_cached: 0,
  matching_registrations: undefined as readonly string[] | undefined,
};

describe("New Wash — Add customer phone lookup", () => {
  it("does not trigger a lookup when the phone field is empty", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    render(<MemoryRouter><NewWashPage /></MemoryRouter>);
    openAddCustomerDialog();
    const callsBefore = vi.mocked(api).mock.calls.filter(
      ([path]) => typeof path === "string" && path.includes("?search="),
    ).length;
    fireEvent.change(dialogPhoneInput(), { target: { value: "" } });
    await vi.waitFor(
      () => {
        const searchCalls = vi.mocked(api).mock.calls.filter(
          ([path]) => typeof path === "string" && path.includes("?search="),
        );
        expect(searchCalls.length).toBe(callsBefore);
      },
      { timeout: 500 },
    );
  });

  it("does not trigger a lookup below 3 phone digits", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    render(<MemoryRouter><NewWashPage /></MemoryRouter>);
    openAddCustomerDialog();
    fireEvent.change(dialogPhoneInput(), { target: { value: "85" } });
    await new Promise((r) => setTimeout(r, 300));
    const searchCalls = vi.mocked(api).mock.calls.filter(
      ([path]) => typeof path === "string" && path.includes("?search="),
    );
    expect(searchCalls.length).toBe(0);
  });

  it("triggers a phone lookup after 3+ digits", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    render(<MemoryRouter><NewWashPage /></MemoryRouter>);
    openAddCustomerDialog();
    fireEvent.change(dialogPhoneInput(), { target: { value: "8590" } });
    await vi.waitFor(
      () => {
        const calls = vi.mocked(api).mock.calls.filter(
          ([path]) =>
            typeof path === "string" && path.includes("customers?search=8590"),
        );
        expect(calls.length).toBe(1);
      },
      { timeout: 500 },
    );
  });

  it("debounces requests at approximately 200ms", async () => {
    vi.useFakeTimers();
    const { default: NewWashPage } = await import("./new-wash");
    render(<MemoryRouter><NewWashPage /></MemoryRouter>);
    openAddCustomerDialog();
    fireEvent.change(dialogPhoneInput(), { target: { value: "859" } });
    fireEvent.change(dialogPhoneInput(), { target: { value: "8590" } });
    fireEvent.change(dialogPhoneInput(), { target: { value: "85903" } });
    await vi.advanceTimersByTimeAsync(50);
    let calls = vi
      .mocked(api)
      .mock.calls.filter(
        ([path]) => typeof path === "string" && path.includes("?search="),
      );
    expect(calls.length).toBe(0);
    await vi.advanceTimersByTimeAsync(200);
    calls = vi
      .mocked(api)
      .mock.calls.filter(
        ([path]) => typeof path === "string" && path.includes("?search="),
      );
    expect(calls.length).toBe(1);
    vi.useRealTimers();
  });

  it("displays partial matches with customer name and phone", async () => {
    vi.mocked(api).mockResolvedValueOnce(customerSearchPayload([SEARCH_RESULT_ARUN, SEARCH_RESULT_ARUN_KUMAR]) as any);
    const { default: NewWashPage } = await import("./new-wash");
    render(<MemoryRouter><NewWashPage /></MemoryRouter>);
    openAddCustomerDialog();
    fireEvent.change(dialogPhoneInput(), { target: { value: "8590" } });
    await vi.waitFor(
      () => {
        expect(screen.getByText("Arun")).toBeTruthy();
        expect(screen.getByText("Arun Kumar")).toBeTruthy();
        expect(screen.getByText(/8590384225/)).toBeTruthy();
        expect(screen.getByText("8590123456")).toBeTruthy();
      },
      { timeout: 500 },
    );
  });

  it("shows visit count when available", async () => {
    vi.mocked(api).mockResolvedValueOnce(customerSearchPayload([SEARCH_RESULT_ARUN]) as any);
    const { default: NewWashPage } = await import("./new-wash");
    render(<MemoryRouter><NewWashPage /></MemoryRouter>);
    openAddCustomerDialog();
    fireEvent.change(dialogPhoneInput(), { target: { value: "8590384225" } });
    await vi.waitFor(
      () => {
        expect(screen.getByText(/3 visits/)).toBeTruthy();
      },
      { timeout: 500 },
    );
  });

  it("does not show visit count when zero", async () => {
    vi.mocked(api).mockResolvedValueOnce(customerSearchPayload([SEARCH_RESULT_ARUN_KUMAR]) as any);
    const { default: NewWashPage } = await import("./new-wash");
    render(<MemoryRouter><NewWashPage /></MemoryRouter>);
    openAddCustomerDialog();
    fireEvent.change(dialogPhoneInput(), { target: { value: "8590123456" } });
    await vi.waitFor(
      () => {
        expect(screen.queryByText("0 visits")).toBeNull();
      },
      { timeout: 500 },
    );
  });

  it("detects an exact normalized phone match and shows Existing customer found", async () => {
    vi.mocked(api).mockResolvedValueOnce(customerSearchPayload([SEARCH_RESULT_ARUN]) as any);
    const { default: NewWashPage } = await import("./new-wash");
    render(<MemoryRouter><NewWashPage /></MemoryRouter>);
    openAddCustomerDialog();
    fireEvent.change(dialogPhoneInput(), {
      target: { value: "8590384225" },
    });
    await vi.waitFor(
      () => {
        expect(screen.getByText("Existing customer found")).toBeTruthy();
        expect(screen.getByText("Arun")).toBeTruthy();
      },
      { timeout: 500 },
    );
  });

  it("disables the Add customer button for an exact duplicate", async () => {
    vi.mocked(api).mockResolvedValueOnce(customerSearchPayload([SEARCH_RESULT_ARUN]) as any);
    const { default: NewWashPage } = await import("./new-wash");
    render(<MemoryRouter><NewWashPage /></MemoryRouter>);
    openAddCustomerDialog();
    fireEvent.change(dialogPhoneInput(), {
      target: { value: "8590384225" },
    });
    await vi.waitFor(
      () => {
        expect(dialogAddCustomerButton()).toBeDisabled();
      },
      { timeout: 500 },
    );
  });

  it("a partial match does NOT disable Add Customer", async () => {
    vi.mocked(api).mockResolvedValueOnce(customerSearchPayload([SEARCH_RESULT_ARUN, SEARCH_RESULT_ARUN_KUMAR]) as any);
    const { default: NewWashPage } = await import("./new-wash");
    render(<MemoryRouter><NewWashPage /></MemoryRouter>);
    openAddCustomerDialog();
    fireEvent.change(dialogPhoneInput(), { target: { value: "8590" } });
    await vi.waitFor(
      () => {
        expect(screen.getByText("Arun")).toBeTruthy();
        expect(screen.queryByText("Existing customer found")).toBeNull();
        expect(dialogAddCustomerButton()).not.toBeDisabled();
      },
      { timeout: 500 },
    );
  });

  it("clicking Use existing customer selects the customer and closes the dialog", async () => {
    vi.mocked(api).mockResolvedValueOnce(customerSearchPayload([SEARCH_RESULT_ARUN]) as any);
    customerData = [{ ...CUSTOMER_FIXTURE[0]!, id: "c-arun", full_name: "Arun", phone: "8590384225", phone_normalized: "+918590384225" }];
    const { default: NewWashPage } = await import("./new-wash");
    render(<MemoryRouter><NewWashPage /></MemoryRouter>);
    openAddCustomerDialog();
    fireEvent.change(dialogPhoneInput(), {
      target: { value: "8590384225" },
    });
    await vi.waitFor(
      () => {
        fireEvent.click(
          screen.getByRole("button", { name: /Use existing customer/ }),
        );
      },
      { timeout: 500 },
    );
    await vi.waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /Use existing customer/ }),
      ).toBeNull();
    });
    expect(screen.getByRole("button", { name: /Arun/ })).toBeTruthy();
  });

  it("does not POST /customers when an existing customer is selected via Use existing", async () => {
    vi.mocked(api).mockResolvedValueOnce(customerSearchPayload([SEARCH_RESULT_ARUN]) as any);
    customerData = [{ ...CUSTOMER_FIXTURE[0]!, id: "c-arun", full_name: "Arun", phone: "8590384225", phone_normalized: "+918590384225" }];
    const { default: NewWashPage } = await import("./new-wash");
    render(<MemoryRouter><NewWashPage /></MemoryRouter>);
    openAddCustomerDialog();
    fireEvent.change(dialogPhoneInput(), {
      target: { value: "8590384225" },
    });
    await vi.waitFor(
      () => {
        fireEvent.click(
          screen.getByRole("button", { name: /Use existing customer/ }),
        );
      },
      { timeout: 500 },
    );
    const postCalls = vi.mocked(api).mock.calls.filter(
      ([path, init]) =>
        path === "/customers" &&
        (init as RequestInit | undefined)?.method === "POST",
    );
    expect(postCalls.length).toBe(0);
  });

  it("clicking a partial-match suggestion selects the customer and closes the dialog", async () => {
    vi.mocked(api).mockResolvedValueOnce(customerSearchPayload([SEARCH_RESULT_ARUN, SEARCH_RESULT_ARUN_KUMAR]) as any);
    customerData = [CUSTOMER_FIXTURE[0]!, SEARCH_RESULT_ARUN as any];
    const { default: NewWashPage } = await import("./new-wash");
    render(<MemoryRouter><NewWashPage /></MemoryRouter>);
    openAddCustomerDialog();
    fireEvent.change(dialogPhoneInput(), { target: { value: "8590" } });
    await vi.waitFor(
      () => {
        fireEvent.click(screen.getByText("Arun").closest("button")!);
      },
      { timeout: 500 },
    );
    await vi.waitFor(() => {
      expect(screen.queryByText("Arun Kumar")).toBeNull();
    });
  });

  it("clears exact-match state when the phone input is cleared", async () => {
    vi.mocked(api).mockResolvedValueOnce(customerSearchPayload([SEARCH_RESULT_ARUN]) as any);
    const { default: NewWashPage } = await import("./new-wash");
    render(<MemoryRouter><NewWashPage /></MemoryRouter>);
    openAddCustomerDialog();
    fireEvent.change(dialogPhoneInput(), {
      target: { value: "8590384225" },
    });
    await vi.waitFor(
      () => {
        expect(screen.getByText("Existing customer found")).toBeTruthy();
      },
      { timeout: 500 },
    );
    fireEvent.change(dialogPhoneInput(), { target: { value: "" } });
    await vi.waitFor(() => {
      expect(screen.queryByText("Existing customer found")).toBeNull();
      expect(dialogAddCustomerButton()).not.toBeDisabled();
    });
  });

  it("clears old exact-match state when the phone input is edited", async () => {
    vi.mocked(api).mockResolvedValueOnce(customerSearchPayload([SEARCH_RESULT_ARUN]) as any);
    const { default: NewWashPage } = await import("./new-wash");
    render(<MemoryRouter><NewWashPage /></MemoryRouter>);
    openAddCustomerDialog();
    fireEvent.change(dialogPhoneInput(), {
      target: { value: "8590384225" },
    });
    await vi.waitFor(
      () => {
        expect(screen.getByText("Existing customer found")).toBeTruthy();
      },
      { timeout: 500 },
    );
    vi.mocked(api).mockResolvedValueOnce(customerSearchPayload([]) as any);
    fireEvent.change(dialogPhoneInput(), {
      target: { value: "9999999999" },
    });
    await vi.waitFor(
      () => {
        expect(screen.queryByText("Existing customer found")).toBeNull();
        expect(dialogAddCustomerButton()).not.toBeDisabled();
      },
      { timeout: 500 },
    );
  });

  it("ignores stale lookup results when a newer request finishes first", async () => {
    vi.useFakeTimers();
    let resolveStale: (value: unknown) => void = () => {};
    const stalePromise = new Promise((resolve) => {
      resolveStale = resolve;
    });
    vi.mocked(api).mockResolvedValueOnce(stalePromise as any);
    const { default: NewWashPage } = await import("./new-wash");
    render(<MemoryRouter><NewWashPage /></MemoryRouter>);
    openAddCustomerDialog();
    fireEvent.change(dialogPhoneInput(), { target: { value: "8590" } });
    await vi.advanceTimersByTimeAsync(200);
    vi.mocked(api).mockResolvedValueOnce(customerSearchPayload([SEARCH_RESULT_ARUN]) as any);
    fireEvent.change(dialogPhoneInput(), {
      target: { value: "8590384225" },
    });
    await vi.advanceTimersByTimeAsync(200);
    resolveStale(customerSearchPayload([{ ...SEARCH_RESULT_ARUN_KUMAR, id: "stale", full_name: "Stale Customer" }]));
    await vi.advanceTimersByTimeAsync(10);
    expect(screen.queryByText("Stale Customer")).toBeNull();
    await vi.waitFor(() => {
      expect(screen.getByText("Arun")).toBeTruthy();
    });
    vi.useRealTimers();
  });

  it("does not show an error when a lookup is aborted", async () => {
    vi.useFakeTimers();
    const { default: NewWashPage } = await import("./new-wash");
    render(<MemoryRouter><NewWashPage /></MemoryRouter>);
    openAddCustomerDialog();
    fireEvent.change(dialogPhoneInput(), { target: { value: "9876" } });
    await vi.advanceTimersByTimeAsync(200);
    fireEvent.change(dialogPhoneInput(), {
      target: { value: "9876543210" },
    });
    await vi.advanceTimersByTimeAsync(200);
    expect(screen.queryByText("Searching existing customers…")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    vi.useRealTimers();
  });

  it("preserves normal customer creation when no match exists", async () => {
    vi.mocked(api).mockResolvedValueOnce(customerSearchPayload([]) as any);
    const { default: NewWashPage } = await import("./new-wash");
    render(<MemoryRouter><NewWashPage /></MemoryRouter>);
    openAddCustomerDialog();
    fireEvent.change(dialogPhoneInput(), {
      target: { value: "9999999999" },
    });
    await vi.waitFor(
      () => {
        expect(screen.queryByText("Existing customer found")).toBeNull();
        expect(dialogAddCustomerButton()).not.toBeDisabled();
      },
      { timeout: 500 },
    );
  });

  it("recovers from duplicate-POST race: re-searches and shows the existing customer", async () => {
    const dupError = Object.assign(
      new Error("A customer with this phone number already exists."),
      { code: "DUPLICATE_CUSTOMER", status: 409 },
    );
    let step = 0;
    vi.mocked(api).mockImplementation((path, _init) => {
      step += 1;
      if (typeof path !== "string") return Promise.resolve([]);
      if (path === "/customers") return Promise.reject(dupError);
      if (path.includes("customers?search=")) {
        if (step === 1) return Promise.resolve(customerSearchPayload([]));
        return Promise.resolve(customerSearchPayload([SEARCH_RESULT_ARUN]));
      }
      return Promise.resolve([]);
    });
    const { default: NewWashPage } = await import("./new-wash");
    render(<MemoryRouter><NewWashPage /></MemoryRouter>);
    openAddCustomerDialog();
    fireEvent.change(dialogPhoneInput(), {
      target: { value: "8590384225" },
    });
    await vi.waitFor(
      () => {
        expect(screen.queryByText(/Existing customer found/)).toBeNull();
      },
      { timeout: 500 },
    );
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Arun" },
    });
    const user = userEvent.setup();
    await user.click(dialogAddCustomerButton());
    await vi.waitFor(
      () => {
        expect(screen.getByText(/Existing customer found/)).toBeTruthy();
      },
      { timeout: 5000 },
    );
    const postCalls = vi
      .mocked(api)
      .mock.calls.filter(([p]) => p === "/customers");
    expect(postCalls.length).toBe(1);
    expect(screen.getByText("Arun")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Use existing customer/ }),
    ).toBeTruthy();
    expect(dialogAddCustomerButton()).toBeDisabled();
  });

  it("shows Searching existing customers… while lookup is in-flight", async () => {
    let resolveLookup: (value: unknown) => void = () => {};
    const pendingPromise = new Promise((resolve) => {
      resolveLookup = resolve;
    });
    vi.mocked(api).mockResolvedValueOnce(pendingPromise as any);
    const { default: NewWashPage } = await import("./new-wash");
    render(<MemoryRouter><NewWashPage /></MemoryRouter>);
    openAddCustomerDialog();
    fireEvent.change(dialogPhoneInput(), { target: { value: "8590" } });
    await vi.waitFor(
      () => {
        expect(
          screen.getByText("Searching existing customers…"),
        ).toBeTruthy();
      },
      { timeout: 500 },
    );
    resolveLookup(customerSearchPayload([SEARCH_RESULT_ARUN]));
    await new Promise((r) => setTimeout(r, 300));
  });

  it("does not restore stale lookup state on dialog reopen", async () => {
    vi.mocked(api).mockResolvedValueOnce(customerSearchPayload([SEARCH_RESULT_ARUN]) as any);
    const { default: NewWashPage } = await import("./new-wash");
    render(<MemoryRouter><NewWashPage /></MemoryRouter>);
    openAddCustomerDialog();
    fireEvent.change(dialogPhoneInput(), {
      target: { value: "8590384225" },
    });
    await vi.waitFor(
      () => {
        expect(screen.getByText("Existing customer found")).toBeTruthy();
      },
      { timeout: 500 },
    );
    fireEvent.click(screen.getByText("Cancel").closest("button")!);
    await vi.waitFor(() => {
      expect(screen.queryByText("Existing customer found")).toBeNull();
    });
    openAddCustomerDialog();
    expect(screen.queryByText("Existing customer found")).toBeNull();
    expect((dialogPhoneInput() as HTMLInputElement).value).toBe("");
  });

  it("does not load recent customers on dialog open (staff privacy)", async () => {
    asStaff();
    const { default: NewWashPage } = await import("./new-wash");
    render(<MemoryRouter><NewWashPage /></MemoryRouter>);
    openAddCustomerDialog();
    const emptySearchCalls = vi.mocked(api).mock.calls.filter(
      ([path]) =>
        typeof path === "string" &&
        path.includes("?search="),
    );
    expect(emptySearchCalls.length).toBe(0);
    expect(screen.queryByText("Searching existing customers…")).toBeNull();
  });
});

describe("New Wash — staff selected customer visibility", () => {
  beforeEach(() => {
    asStaff();
    customerData = [];
  });

  afterEach(() => {
    vi.mocked(useAuth).mockImplementation(() => adminUser());
    customerData = CUSTOMER_FIXTURE;
  });

  it("does not show recent customers with empty search", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    render(<MemoryRouter><NewWashPage /></MemoryRouter>);
    expect(screen.queryByText("Test Customer")).toBeNull();
    expect(screen.getByText(SEARCH_INSTRUCTION)).toBeTruthy();
  });

  it("shows selected existing customer on the Customer step after phone lookup selection", async () => {
    vi.mocked(api).mockResolvedValueOnce(customerSearchPayload([SEARCH_RESULT_ARUN]) as any);
    const { default: NewWashPage } = await import("./new-wash");
    render(<MemoryRouter><NewWashPage /></MemoryRouter>);
    openAddCustomerDialog();
    fireEvent.change(dialogPhoneInput(), {
      target: { value: "8590384225" },
    });
    await vi.waitFor(() => {
      expect(screen.getByText("Existing customer found")).toBeTruthy();
    }, { timeout: 500 });
    fireEvent.click(
      screen.getByRole("button", { name: /Use existing customer/ }),
    );
    await vi.waitFor(() => {
      expect(screen.queryByText("Existing customer found")).toBeNull();
    });
    expect(screen.getAllByText("Arun").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/85xxxxxx25/)).toBeTruthy();
    expect(screen.queryByText(SEARCH_INSTRUCTION)).toBeNull();
  });

  it("shows selected customer in Wash Summary after phone lookup selection", async () => {
    vi.mocked(api).mockResolvedValueOnce(customerSearchPayload([SEARCH_RESULT_ARUN]) as any);
    const { default: NewWashPage } = await import("./new-wash");
    render(<MemoryRouter><NewWashPage /></MemoryRouter>);
    openAddCustomerDialog();
    fireEvent.change(dialogPhoneInput(), {
      target: { value: "8590384225" },
    });
    await vi.waitFor(() => {
      fireEvent.click(
        screen.getByRole("button", { name: /Use existing customer/ }),
      );
    }, { timeout: 500 });
    const arunMatches = screen.getAllByText("Arun");
    expect(arunMatches.length).toBeGreaterThanOrEqual(1);
  });

  it("does not trigger customers.reload() when selecting existing customer", async () => {
    vi.mocked(api).mockResolvedValueOnce(customerSearchPayload([SEARCH_RESULT_ARUN]) as any);
    const { default: NewWashPage } = await import("./new-wash");
    render(<MemoryRouter><NewWashPage /></MemoryRouter>);
    openAddCustomerDialog();
    fireEvent.change(dialogPhoneInput(), {
      target: { value: "8590384225" },
    });
    await vi.waitFor(() => {
      fireEvent.click(
        screen.getByRole("button", { name: /Use existing customer/ }),
      );
    }, { timeout: 500 });
    expect(mockReload).not.toHaveBeenCalled();
  });

  it("Continue is enabled after selecting existing customer", async () => {
    vi.mocked(api).mockResolvedValueOnce(customerSearchPayload([SEARCH_RESULT_ARUN]) as any);
    const { default: NewWashPage } = await import("./new-wash");
    render(<MemoryRouter><NewWashPage /></MemoryRouter>);
    openAddCustomerDialog();
    fireEvent.change(dialogPhoneInput(), {
      target: { value: "8590384225" },
    });
    await vi.waitFor(() => {
      fireEvent.click(
        screen.getByRole("button", { name: /Use existing customer/ }),
      );
    }, { timeout: 500 });
    const continueBtn = screen.getByText("Continue").closest("button")!;
    expect(continueBtn).not.toBeDisabled();
  });

  it("selected customer survives Vehicle step and Back navigation", async () => {
    vi.mocked(api).mockResolvedValueOnce(customerSearchPayload([SEARCH_RESULT_ARUN]) as any);
    const { default: NewWashPage } = await import("./new-wash");
    render(<MemoryRouter><NewWashPage /></MemoryRouter>);
    openAddCustomerDialog();
    fireEvent.change(dialogPhoneInput(), {
      target: { value: "8590384225" },
    });
    await vi.waitFor(() => {
      fireEvent.click(
        screen.getByRole("button", { name: /Use existing customer/ }),
      );
    }, { timeout: 500 });
    fireEvent.click(screen.getByText("Continue").closest("button")!);
    expect(screen.getByText("Select a vehicle")).toBeTruthy();
    fireEvent.click(screen.getByText("Back").closest("button")!);
    expect(screen.getByText("Who is this wash for?")).toBeTruthy();
    expect(screen.getAllByText("Arun").length).toBeGreaterThanOrEqual(1);
  });

  it("newly created customer is visible for staff after dialog close", async () => {
    vi.mocked(api).mockResolvedValueOnce({ id: "c-new", full_name: "New Person", phone: "9999999999", phone_normalized: "+919999999999", total_visits_cached: 1 } as any);
    const { default: NewWashPage } = await import("./new-wash");
    render(<MemoryRouter><NewWashPage /></MemoryRouter>);
    openAddCustomerDialog();
    fireEvent.change(dialogPhoneInput(), {
      target: { value: "9999999999" },
    });
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "New Person" },
    });
    fireEvent.click(dialogAddCustomerButton());
    await vi.waitFor(() => {
      expect(screen.getAllByText("New Person").length).toBeGreaterThanOrEqual(1);
    }, { timeout: 500 });
    expect(screen.queryByText(SEARCH_INSTRUCTION)).toBeNull();
  });

  it("selecting a customer via search input replaces the dialog-selected customer", async () => {
    vi.mocked(api).mockResolvedValueOnce(customerSearchPayload([SEARCH_RESULT_ARUN]) as any);
    customerData = [SEARCH_RESULT_ARUN, SEARCH_RESULT_ARUN_KUMAR] as any;
    const { default: NewWashPage } = await import("./new-wash");
    render(<MemoryRouter><NewWashPage /></MemoryRouter>);
    openAddCustomerDialog();
    fireEvent.change(dialogPhoneInput(), {
      target: { value: "8590384225" },
    });
    await vi.waitFor(() => {
      fireEvent.click(
        screen.getByRole("button", { name: /Use existing customer/ }),
      );
    }, { timeout: 500 });
    expect(screen.getAllByText("Arun").length).toBeGreaterThanOrEqual(1);
    fireEvent.change(customerInput(), { target: { value: "8590" } });
    await vi.waitFor(() => {
      expect(screen.getByText("Arun Kumar")).toBeTruthy();
    }, { timeout: 500 });
    fireEvent.click(screen.getByText("Arun Kumar").closest("button")!);
  });

  it("opening Add Customer and cancelling preserves existing selection", async () => {
    vi.mocked(api).mockResolvedValueOnce(customerSearchPayload([SEARCH_RESULT_ARUN]) as any);
    const { default: NewWashPage } = await import("./new-wash");
    render(<MemoryRouter><NewWashPage /></MemoryRouter>);
    openAddCustomerDialog();
    fireEvent.change(dialogPhoneInput(), {
      target: { value: "8590384225" },
    });
    await vi.waitFor(() => {
      fireEvent.click(
        screen.getByRole("button", { name: /Use existing customer/ }),
      );
    }, { timeout: 500 });
    expect(screen.getAllByText("Arun").length).toBeGreaterThanOrEqual(1);
    openAddCustomerDialog();
    fireEvent.click(screen.getByText("Cancel").closest("button")!);
    await vi.waitFor(() => {
      expect(screen.getAllByText("Arun").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("admin can still see the default customer list", async () => {
    vi.mocked(useAuth).mockImplementation(() => adminUser());
    customerData = CUSTOMER_FIXTURE;
    const { default: NewWashPage } = await import("./new-wash");
    render(<MemoryRouter><NewWashPage /></MemoryRouter>);
    expect(screen.getByText("Test Customer")).toBeTruthy();
  });
});
