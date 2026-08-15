import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import VehiclesPage from "./vehicles";
import { api } from "../lib/api";
import type { VehicleRecord } from "../types";

function makeVehicle(
  id: string,
  overrides: Partial<VehicleRecord> = {},
): VehicleRecord {
  return {
    id,
    customer_id: "c1",
    customer_name: "Test Owner",
    registration_number: `KL 05 VG ${id.replace("v", "")}`,
    vehicle_type_id: "vt1",
    vehicle_type_name: "Four Wheeler",
    vehicle_type_code: "FOUR_WHEELER",
    make: "Tata",
    model: "Nexon",
    status: "ACTIVE",
    version: 1,
    ...overrides,
  };
}

const FIRST_PAGE = Array.from({ length: 15 }, (_, index) =>
  makeVehicle(`v${index + 1}`),
);

const SECOND_PAGE = Array.from({ length: 4 }, (_, index) =>
  makeVehicle(`v${index + 16}`, {
    registration_number: `KL 06 VG ${index + 16}`,
  }),
);

function envelope(
  data: readonly VehicleRecord[],
  pagination: { hasNext: boolean; nextCursor: string | null; limit: number },
) {
  return {
    pagination: {
      hasNext: pagination.hasNext,
      limit: pagination.limit,
      nextCursor: pagination.nextCursor,
    },
    vehicles: data,
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
  if ((params.get("search") ?? "").length > 0) {
    return envelope(
      [makeVehicle("v99", { registration_number: "KL 99 VG 9999" })],
      {
        hasNext: false,
        limit: 15,
        nextCursor: null,
      },
    );
  }
  return envelope(FIRST_PAGE, {
    hasNext: true,
    limit: 15,
    nextCursor: "cursor2",
  });
}

vi.mock("../lib/api", () => ({
  api: vi.fn(),
}));

function adminUser() {
  return {
    loading: false,
    manualDiscountEnabled: false,
    paymentDefaultMethod: "CASH",
    user: {
      id: "admin-1",
      role: "ADMIN" as const,
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
}));

function searchInput(): HTMLInputElement {
  return screen.getByPlaceholderText(
    "Search registration number…",
  ) as HTMLInputElement;
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/vehicles"]}>
      <Routes>
        <Route
          path="/vehicles"
          element={
            <>
              <VehiclesPage />
              <LocationProbe />
            </>
          }
        />
        <Route
          path="/vehicles/:id"
          element={
            <>
              <div>Vehicle detail page</div>
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(api).mockImplementation(async (path: string): Promise<unknown> =>
    defaultApiResponse(path),
  );
});

afterEach(() => {
  cleanup();
  vi.mocked(api).mockClear();
});

describe("Vehicles directory — server-side pagination", () => {
  it("requests only the first page of vehicles on load", async () => {
    renderPage();
    await screen.findByText("KL 05 VG 1");
    expect(vi.mocked(api)).toHaveBeenCalledWith("/vehicles?search=&limit=15");
    expect(screen.getByText("Showing 15 vehicles")).toBeDefined();
    expect(screen.getByText("Page 1")).toBeDefined();
  });

  it("defaults to 15 rows per page", async () => {
    renderPage();
    await screen.findByText("KL 05 VG 1");
    expect(vi.mocked(api).mock.calls.map(([path]) => path)[0]).toBe(
      "/vehicles?search=&limit=15",
    );
  });

  it("renders only the first page of vehicles", async () => {
    renderPage();
    await screen.findByText("KL 05 VG 1");
    expect(screen.getByText("KL 05 VG 15")).toBeDefined();
    expect(screen.queryByText("KL 06 VG 16")).toBeNull();
  });

  it("renders the expected table columns", async () => {
    renderPage();
    await screen.findByText("KL 05 VG 1");
    for (const header of [
      "Registration",
      "Owner",
      "Type",
      "Vehicle",
      "Status",
    ]) {
      expect(screen.getByRole("columnheader", { name: header })).toBeDefined();
    }
  });

  it("renders owner, type, and make/model details", async () => {
    renderPage();
    await screen.findByText("KL 05 VG 1");
    expect(screen.getAllByText("Test Owner")).toHaveLength(15);
    expect(screen.getAllByText("Four Wheeler")).toHaveLength(15);
    expect(screen.getAllByText("Tata Nexon")).toHaveLength(15);
    expect(document.querySelector(".status-badge")).not.toBeNull();
  });

  it("loads the next page with the cursor when Next is clicked", async () => {
    renderPage();
    await screen.findByText("KL 05 VG 1");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("KL 06 VG 16");
    expect(vi.mocked(api)).toHaveBeenLastCalledWith(
      "/vehicles?search=&limit=15&cursor=cursor2",
    );
    expect(screen.getByText("Page 2")).toBeDefined();
    expect(screen.getByText("Showing 4 vehicles")).toBeDefined();
    expect(screen.queryByText("KL 05 VG 1")).toBeNull();
  });

  it("loads the previous page from the cursor history when Previous is clicked", async () => {
    renderPage();
    await screen.findByText("KL 05 VG 1");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("KL 06 VG 16");
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    await screen.findByText("KL 05 VG 1");
    expect(vi.mocked(api)).toHaveBeenLastCalledWith(
      "/vehicles?search=&limit=15",
    );
    expect(screen.getByText("Page 1")).toBeDefined();
  });

  it("disables Previous on page 1", async () => {
    renderPage();
    await screen.findByText("KL 05 VG 1");
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  });

  it("disables Next when the API reports no further pages", async () => {
    renderPage();
    await screen.findByText("KL 05 VG 1");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("KL 06 VG 16");
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("resets to page 1 without a cursor when the search changes", async () => {
    renderPage();
    await screen.findByText("KL 05 VG 1");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("KL 06 VG 16");
    fireEvent.change(searchInput(), { target: { value: "KL99" } });
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenLastCalledWith(
        "/vehicles?search=KL99&limit=15",
      ),
    );
    expect(screen.getByText("Page 1")).toBeDefined();
    expect(screen.getByText("Showing 1 vehicles")).toBeDefined();
  });

  it("clearing the search resets to page 1", async () => {
    renderPage();
    await screen.findByText("KL 05 VG 1");
    fireEvent.change(searchInput(), { target: { value: "KL99" } });
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenLastCalledWith(
        "/vehicles?search=KL99&limit=15",
      ),
    );
    fireEvent.change(searchInput(), { target: { value: "" } });
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenLastCalledWith(
        "/vehicles?search=&limit=15",
      ),
    );
    expect(screen.getByText("Page 1")).toBeDefined();
    expect(screen.getByText("Showing 15 vehicles")).toBeDefined();
  });

  it("shows the empty state for a search with no matches", async () => {
    vi.mocked(api).mockResolvedValue(
      envelope([], { hasNext: false, limit: 15, nextCursor: null }),
    );
    renderPage();
    expect(await screen.findByText("No vehicles found")).toBeDefined();
    expect(document.querySelector("table")).toBeNull();
  });

  it("resets to page 1 and sends the new limit when the page size changes", async () => {
    renderPage();
    await screen.findByText("KL 05 VG 1");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("KL 06 VG 16");
    const select = screen.getByLabelText("Rows per page") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "25" } });
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenLastCalledWith(
        "/vehicles?search=&limit=25",
      ),
    );
    expect(screen.getByText("Page 1")).toBeDefined();
  });

  it("offers exactly the 15, 25 and 50 page sizes", async () => {
    renderPage();
    await screen.findByText("KL 05 VG 1");
    const select = screen.getByLabelText("Rows per page") as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.value)).toEqual([
      "15",
      "25",
      "50",
    ]);
  });

  it("keeps the current page visible while the next page loads", async () => {
    const pending = new Map<string, { resolve: (value: unknown) => void }>();
    vi.mocked(api).mockImplementation(
      (path: string) =>
        new Promise((resolve) => {
          pending.set(path, { resolve });
        }),
    );
    renderPage();
    const initialPath = "/vehicles?search=&limit=15";
    await waitFor(() => expect(pending.has(initialPath)).toBe(true));
    pending.get(initialPath)!.resolve(
      envelope(FIRST_PAGE, {
        hasNext: true,
        limit: 15,
        nextCursor: "cursor2",
      }),
    );
    await screen.findByText("KL 05 VG 1");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    const nextPath = "/vehicles?search=&limit=15&cursor=cursor2";
    await waitFor(() => expect(pending.has(nextPath)).toBe(true));
    expect(screen.getByText("KL 05 VG 1")).toBeDefined();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(document.querySelector(".table-wrap")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    pending
      .get(nextPath)!
      .resolve(
        envelope(SECOND_PAGE, { hasNext: false, limit: 15, nextCursor: null }),
      );
    expect(await screen.findByText("KL 06 VG 16")).toBeDefined();
    expect(document.querySelector(".table-wrap")).toHaveAttribute(
      "aria-busy",
      "false",
    );
  });

  it("ignores stale responses that resolve after a newer request", async () => {
    const pending = new Map<string, { resolve: (value: unknown) => void }>();
    vi.mocked(api).mockImplementation(
      (path: string) =>
        new Promise((resolve) => {
          pending.set(path, { resolve });
        }),
    );
    renderPage();
    const initialPath = "/vehicles?search=&limit=15";
    await waitFor(() => expect(pending.has(initialPath)).toBe(true));
    pending.get(initialPath)!.resolve(
      envelope(FIRST_PAGE, {
        hasNext: true,
        limit: 15,
        nextCursor: "cursor2",
      }),
    );
    await screen.findByText("KL 05 VG 1");

    fireEvent.change(searchInput(), { target: { value: "KL11" } });
    const firstSearchPath = "/vehicles?search=KL11&limit=15";
    await waitFor(() => expect(pending.has(firstSearchPath)).toBe(true));

    fireEvent.change(searchInput(), { target: { value: "KL22" } });
    const secondSearchPath = "/vehicles?search=KL22&limit=15";
    await waitFor(() => expect(pending.has(secondSearchPath)).toBe(true));

    pending.get(secondSearchPath)!.resolve(
      envelope([makeVehicle("v22", { registration_number: "KL 22 VG 2222" })], {
        hasNext: false,
        limit: 15,
        nextCursor: null,
      }),
    );
    expect(await screen.findByText("KL 22 VG 2222")).toBeDefined();

    pending.get(firstSearchPath)!.resolve(
      envelope([makeVehicle("v11", { registration_number: "KL 11 VG 1111" })], {
        hasNext: false,
        limit: 15,
        nextCursor: null,
      }),
    );
    await waitFor(() => expect(screen.queryByText("KL 11 VG 1111")).toBeNull());
    expect(screen.getByText("KL 22 VG 2222")).toBeDefined();
  });

  it("announces the current page to assistive technology", async () => {
    renderPage();
    await screen.findByText("KL 05 VG 1");
    expect(screen.getByText("Page 1")).toHaveAttribute("aria-live", "polite");
  });

  it("navigates to the vehicle detail page via the arrow link", async () => {
    renderPage();
    await screen.findByText("KL 05 VG 1");
    fireEvent.click(screen.getByLabelText("Open KL 05 VG 1"));
    expect(screen.getByText("Vehicle detail page")).toBeDefined();
    expect(screen.getByTestId("location")).toHaveTextContent("/vehicles/v1");
  });

  it("shows the error state with a retry action", async () => {
    vi.mocked(api).mockRejectedValue(new Error("Network error"));
    renderPage();
    expect(await screen.findByText("Network error")).toBeDefined();
    expect(screen.getByRole("button", { name: "Try again" })).toBeDefined();
  });
});
