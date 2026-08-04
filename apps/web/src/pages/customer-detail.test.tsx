import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { useAuth } from "../auth";
import { useApiData } from "../hooks/use-api-data";
import CustomerDetailPage from "./customer-detail";

vi.mock("../lib/api", () => ({
  api: vi.fn(() => Promise.resolve({ jobs: [], hasMore: false, nextCursor: null })),
  jsonBody: (v: unknown) => ({ body: JSON.stringify(v) }),
}));

vi.mock("../components/toast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

const profileFixture = {
  id: "c1",
  full_name: "Test Customer",
  phone: "9002005005",
  status: "ACTIVE",
  total_visits_cached: 3,
  total_spent_minor_cached: 1000,
  last_visit_at: "2026-07-01T10:00:00.000Z",
  version: 1,
  rewardBalance: { balance_minor: 500 },
  vehicles: [
    {
      id: "v1",
      registration_number: "KL02GD2009",
      vehicle_type_name: "Four Wheeler",
      make: "Bajaj Auto",
      status: "ACTIVE",
    },
    {
      id: "v2",
      registration_number: "KL01AB1234",
      vehicle_type_name: "Four Wheeler",
      make: "Suzuki",
      model: "WagonR",
      status: "ACTIVE",
    },
  ],
};

function photoFixture(overrides: Record<string, unknown> = {}) {
  return {
    captured_at: "2026-08-03T09:16:00.000Z",
    id: "photo-1",
    job_reference: "WP-2026-000011",
    location_place: null,
    make: "Bajaj Auto",
    model: null,
    photo_type: "LIVE_BEFORE_WASH",
    registration_number: "KL02GD2009",
    size_bytes: 1258291,
    ...overrides,
  };
}

function historyFixture(overrides: Record<string, unknown> = {}) {
  return {
    coupons: [],
    invoices: [],
    locations: [],
    payments: [],
    photos: [],
    referrals: [],
    ...overrides,
  };
}

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
      branchId: "branch-1",
    },
  };
}

vi.mock("../auth", () => ({
  useAuth: vi.fn(() => adminUser()),
}));

vi.mock("../hooks/use-api-data", () => ({
  useApiData: vi.fn(),
}));

function renderPage(history: Record<string, unknown>, loading = false, error: string | null = null) {
  vi.mocked(useApiData).mockImplementation((path: string) => {
    if (path === "/customers/c1") {
      return { data: profileFixture, error: null, loading: false, reload: vi.fn() };
    }
    if (path === "/customers/c1/history") {
      return { data: history, error, loading, reload: vi.fn() };
    }
    return { data: null, error: null, loading: true, reload: vi.fn() };
  });
  return render(
    <MemoryRouter initialEntries={["/customers/c1"]}>
      <Routes>
        <Route element={<CustomerDetailPage />} path="/customers/:id" />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.mocked(useApiData).mockClear();
  vi.mocked(useAuth).mockImplementation(() => adminUser());
});

describe("Vehicle photos section", () => {
  it("renders the Vehicle photos heading with the unique photo count", () => {
    renderPage(
      historyFixture({
        photos: [
          photoFixture(),
          photoFixture({ id: "photo-2", captured_at: "2026-08-02T09:16:00.000Z" }),
          photoFixture({ id: "photo-1" }),
        ],
      }),
    );
    expect(
      screen.getByRole("heading", { name: "Vehicle photos (2)" }),
    ).toBeInTheDocument();
  });

  it("no longer renders Private photos wording", () => {
    renderPage(
      historyFixture({
        photos: [photoFixture(), photoFixture({ id: "photo-2" })],
      }),
    );
    expect(screen.queryByText(/Private photos/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/private/i)).not.toBeInTheDocument();
  });

  it("groups photos by vehicle and shows registration and make/model", () => {
    renderPage(
      historyFixture({
        photos: [
          photoFixture({ id: "photo-1", registration_number: "KL02GD2009", make: "Bajaj Auto", model: null }),
          photoFixture({ id: "photo-2", registration_number: "KL01AB1234", make: "Suzuki", model: "WagonR" }),
        ],
      }),
    );
    expect(screen.getAllByText("KL02GD2009").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("— Bajaj Auto")).toBeInTheDocument();
    expect(screen.getAllByText("KL01AB1234").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("— Suzuki WagonR")).toBeInTheDocument();
  });

  it("shows the job reference when available", () => {
    renderPage(historyFixture({ photos: [photoFixture()] }));
    expect(screen.getByText(/WP-2026-000011/)).toBeInTheDocument();
  });

  it("shows the newest photo first within a vehicle", () => {
    renderPage(
      historyFixture({
        photos: [
          photoFixture({ id: "new", captured_at: "2026-08-05T09:16:00.000Z" }),
          photoFixture({ id: "old", captured_at: "2026-08-01T09:16:00.000Z" }),
        ],
      }),
    );
    const cards = document.querySelectorAll(".vehicle-photo-card");
    expect(cards).toHaveLength(2);
    expect(cards[0]!.textContent).toContain("5 Aug 2026");
    expect(cards[1]!.textContent).toContain("1 Aug 2026");
  });

  it("shows the location place on photos that have one", () => {
    renderPage(
      historyFixture({
        photos: [photoFixture({ location_place: "Kottarakkara, Kollam" })],
      }),
    );
    expect(screen.getByText("Kottarakkara, Kollam")).toBeInTheDocument();
  });

  it("does not show a place section when location_place is null", () => {
    renderPage(historyFixture({ photos: [photoFixture()] }));
    expect(screen.queryByText("Kottarakkara, Kollam")).not.toBeInTheDocument();
  });

  it("renders a valid file size and omits invalid ones without NaN", () => {
    renderPage(
      historyFixture({
        photos: [
          photoFixture(),
          photoFixture({ id: "photo-2", size_bytes: null }),
        ],
      }),
    );
    expect(screen.getByText("1.2 MB")).toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });

  it("renders the empty state when the customer has no photos", () => {
    renderPage(historyFixture({ photos: [] }));
    expect(
      screen.getByText("No vehicle photos are available for this customer."),
    ).toBeInTheDocument();
  });

  it("renders the loading state", () => {
    renderPage(historyFixture({ photos: [] }), true);
    expect(screen.getByText("Loading vehicle photos…")).toBeInTheDocument();
  });

  it("renders the error state with a retry action", () => {
    const reload = vi.fn();
    vi.mocked(useApiData).mockImplementation((path: string) => {
      if (path === "/customers/c1") {
        return { data: profileFixture, error: null, loading: false, reload: vi.fn() };
      }
      if (path === "/customers/c1/history") {
        return { data: null, error: "boom", loading: false, reload };
      }
      return { data: null, error: null, loading: true, reload: vi.fn() };
    });
    render(
      <MemoryRouter initialEntries={["/customers/c1"]}>
        <Routes>
          <Route element={<CustomerDetailPage />} path="/customers/:id" />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("Vehicle photos could not be loaded.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("keeps other photos visible when one image fails to load", () => {
    renderPage(
      historyFixture({
        photos: [photoFixture(), photoFixture({ id: "photo-2" })],
      }),
    );
    const images = screen.getAllByRole("img");
    fireEvent.error(images[0]!);
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(document.querySelectorAll(".vehicle-photo-thumb--broken")).toHaveLength(1);
    expect(screen.getAllByText("Live vehicle capture")).toHaveLength(2);
  });

  it("keeps the location place visible after a thumbnail fails", () => {
    renderPage(
      historyFixture({
        photos: [
          photoFixture({
            id: "photo-broken",
            location_place: "Kottarakkara, Kollam",
          }),
          photoFixture({ id: "photo-ok", location_place: null }),
        ],
      }),
    );
    const images = screen.getAllByRole("img");
    const brokenImage = images.find(
      (img) => img.getAttribute("src") === "/api/v1/uploads/photos/photo-broken",
    )!;
    fireEvent.error(brokenImage);
    expect(screen.getByText("Kottarakkara, Kollam")).toBeInTheDocument();
    expect(document.querySelectorAll(".vehicle-photo-thumb--broken")).toHaveLength(1);
    expect(screen.getAllByText("Live vehicle capture")).toHaveLength(2);
    expect(screen.getAllByRole("img")).toHaveLength(1);
  });

  it("opens the preview dialog when a photo card is selected", () => {
    renderPage(historyFixture({ photos: [photoFixture()] }));
    fireEvent.click(screen.getByRole("button", { name: /live vehicle capture/i }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(
      within(dialog).getByRole("img", {
        name: "Live vehicle capture of vehicle KL02GD2009",
      }),
    ).toBeInTheDocument();
  });
});

describe("Customer profile preservation", () => {
  it("keeps the other ledger sections present", () => {
    renderPage(
      historyFixture({
        invoices: [
          {
            created_at: "2026-07-01T10:00:00.000Z",
            id: "inv-1",
            invoice_number: "INV-001",
            payment_status_snapshot: "PAID",
            total_amount_minor: 1000,
          },
        ],
      }),
    );
    expect(screen.getByRole("heading", { name: "Invoices (1)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Payments (0)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Coupons (0)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Referrals (0)" })).toBeInTheDocument();
    expect(screen.getByText("INV-001")).toBeInTheDocument();
  });
});
