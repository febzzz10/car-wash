import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  readonly total_visits_cached: number;
  readonly matching_registrations: readonly string[];
}[] = [
  {
    id: "c1",
    full_name: "Test Customer",
    phone: "9876543210",
    total_visits_cached: 3,
    matching_registrations: ["KL01TEST"],
  },
];

let customerData = CUSTOMER_FIXTURE;

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
        data: enabled ? customerData : [],
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

  it("evidence sidebar shows photo needed and place optional at step 0", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    const liveMatches = screen.getAllByText(/Live photo/);
    expect(liveMatches.length).toBeGreaterThanOrEqual(2);
    const placeMatches = screen.getAllByText(/Place/);
    expect(placeMatches.length).toBeGreaterThanOrEqual(1);
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
      data: [],
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
      screen.getByText("KL01TEST · 9876543210 · 3 visits"),
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
      .mock.calls.filter(([path]) => path === "/customers?search=");
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
});

describe("New Wash — admin customer list", () => {
  it("still shows the default/recent customer list when the search is empty", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("Test Customer")).toBeTruthy();
    expect(screen.queryByText(SEARCH_INSTRUCTION)).toBeNull();
  });

  it("keeps the default list visible after clearing a search", async () => {
    const { default: NewWashPage } = await import("./new-wash");
    render(
      <MemoryRouter>
        <NewWashPage />
      </MemoryRouter>,
    );
    fireEvent.change(customerInput(), { target: { value: "Test" } });
    expect(screen.getByText("Test Customer")).toBeTruthy();
    fireEvent.change(customerInput(), { target: { value: "" } });
    expect(screen.getByText("Test Customer")).toBeTruthy();
  });
});
