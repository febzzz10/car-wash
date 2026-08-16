import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { api } from "../lib/api";
import { useAuth } from "../auth";
import { useApiData } from "../hooks/use-api-data";
import VehicleDetailPage, {
  ChangeVehicleStatusDialog,
} from "./vehicle-detail";

vi.mock("../lib/api", () => ({
  api: vi.fn(),
  jsonBody: (value: unknown) => ({ body: JSON.stringify(value) }),
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

const vehicleFixture = {
  id: "vehicle-1",
  customer_id: "c1",
  customer_name: "Test Customer",
  customer_phone: "9002005005",
  registration_number: "KL01TEST",
  vehicle_type_id: "vt1",
  vehicle_type_name: "Four Wheeler",
  status: "ACTIVE",
  make: "Honda",
  model: "City",
  colour: null,
  fuel_type: null,
  manufacturing_year: null,
  notes: null,
  last_wash_at: null,
};

function renderDetailPage(overrides: Partial<typeof vehicleFixture> = {}) {
  vi.mocked(useApiData).mockImplementation((path: string) => {
    if (path === "/vehicles/vehicle-1") {
      return {
        data: { ...vehicleFixture, ...overrides },
        error: null,
        loading: false,
        reload: vi.fn(),
      };
    }
    if (path === "/vehicles/vehicle-1/history") {
      return {
        data: { invoices: [], locations: [], photos: [], washJobs: [] },
        error: null,
        loading: false,
        reload: vi.fn(),
      };
    }
    return { data: null, error: null, loading: true, reload: vi.fn() };
  });
  return render(
    <MemoryRouter initialEntries={["/vehicles/vehicle-1"]}>
      <Routes>
        <Route element={<VehicleDetailPage />} path="/vehicles/:id" />
      </Routes>
    </MemoryRouter>,
  );
}

const onClose = vi.fn();
const onDone = vi.fn();
const defaultProps = {
  id: "vehicle-1",
  onClose,
  onDone,
  open: true,
  status: "ACTIVE",
  version: 1,
};

function reasonInput() {
  return screen.getByRole("textbox", { name: /reason/i });
}

function form() {
  return screen.getByRole("dialog").querySelector("form")!;
}

describe("ChangeVehicleStatusDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders when open", () => {
    render(<ChangeVehicleStatusDialog {...defaultProps} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(<ChangeVehicleStatusDialog {...defaultProps} open={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("displays deactivate content for ACTIVE status", () => {
    render(<ChangeVehicleStatusDialog {...defaultProps} />);
    expect(
      screen.getByText("Deactivate vehicle"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Deactivation hides this vehicle from selection/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /deactivate/i }),
    ).toBeInTheDocument();
  });

  it("displays reactivate content for INACTIVE status", () => {
    render(
      <ChangeVehicleStatusDialog {...defaultProps} status="INACTIVE" />,
    );
    expect(
      screen.getByText("Reactivate vehicle"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Reactivation makes this vehicle available/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /reactivate/i }),
    ).toBeInTheDocument();
  });

  it("calls onClose when Cancel is clicked", async () => {
    const user = userEvent.setup();
    render(<ChangeVehicleStatusDialog {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the close X is clicked", async () => {
    const user = userEvent.setup();
    render(<ChangeVehicleStatusDialog {...defaultProps} />);
    await user.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("has HTML validation attributes on the reason field", () => {
    render(<ChangeVehicleStatusDialog {...defaultProps} />);
    const textarea = reasonInput();
    expect(textarea).toHaveAttribute("minLength", "3");
    expect(textarea).toHaveAttribute("required");
  });

  it("sends valid trimmed reason to the API", async () => {
    vi.mocked(api).mockResolvedValue({ status: "INACTIVE" });
    render(<ChangeVehicleStatusDialog {...defaultProps} />);
    const textarea = reasonInput();
    fireEvent.change(textarea, { target: { value: "  Not needed  " } });
    fireEvent.submit(form());
    await waitFor(() => {
      expect(api).toHaveBeenCalledWith("/vehicles/vehicle-1/deactivate", {
        body: JSON.stringify({ reason: "  Not needed  ", version: 1 }),
        method: "POST",
      });
    });
  });

  it("calls the reactivate endpoint when status is INACTIVE", async () => {
    vi.mocked(api).mockResolvedValue({ status: "ACTIVE" });
    render(
      <ChangeVehicleStatusDialog {...defaultProps} status="INACTIVE" />,
    );
    const textarea = reasonInput();
    fireEvent.change(textarea, { target: { value: "Bring it back" } });
    fireEvent.submit(form());
    await waitFor(() => {
      expect(api).toHaveBeenCalledWith("/vehicles/vehicle-1/reactivate", {
        body: JSON.stringify({ reason: "Bring it back", version: 1 }),
        method: "POST",
      });
    });
  });

  it("shows API error message on failure", async () => {
    vi.mocked(api).mockRejectedValue(new Error("Server error"));
    render(<ChangeVehicleStatusDialog {...defaultProps} />);
    const textarea = reasonInput();
    fireEvent.change(textarea, { target: { value: "Vehicle sold" } });
    fireEvent.submit(form());
    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeInTheDocument();
    });
  });

  it("disables the button while busy", async () => {
    let resolvePromise!: () => void;
    vi.mocked(api).mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = () => resolve({ status: "INACTIVE" });
      }),
    );
    render(<ChangeVehicleStatusDialog {...defaultProps} />);
    const textarea = reasonInput();
    fireEvent.change(textarea, { target: { value: "Vehicle sold" } });
    fireEvent.submit(form());
    await waitFor(() => {
      const btn = screen.getByRole("button", { name: /deactivate/i });
      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute("aria-busy", "true");
    });
    resolvePromise();
  });

  it("calls onDone on successful submission", async () => {
    vi.mocked(api).mockResolvedValue({ status: "INACTIVE" });
    render(<ChangeVehicleStatusDialog {...defaultProps} />);
    const textarea = reasonInput();
    fireEvent.change(textarea, { target: { value: "Vehicle sold" } });
    fireEvent.submit(form());
    await waitFor(() => {
      expect(onDone).toHaveBeenCalledTimes(1);
    });
  });

  it("prevents duplicate submissions via disabled button", async () => {
    let resolvePromise!: () => void;
    let callCount = 0;
    vi.mocked(api).mockImplementation(
      () =>
        new Promise((resolve) => {
          callCount++;
          resolvePromise = () => resolve({ status: "INACTIVE" });
        }),
    );
    render(<ChangeVehicleStatusDialog {...defaultProps} />);
    const textarea = reasonInput();
    fireEvent.change(textarea, { target: { value: "Vehicle sold" } });
    fireEvent.submit(form());
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /deactivate/i })).toBeDisabled();
    });
    expect(callCount).toBe(1);
    resolvePromise!();
  });
});

describe("VehicleDetailPage — phone masking", () => {
  afterEach(() => {
    cleanup();
    vi.mocked(useAuth).mockImplementation(() => adminUser());
  });

  it("shows the full owner phone to admins", () => {
    renderDetailPage();
    expect(screen.getByText("9002005005")).toBeInTheDocument();
  });

  it("masks the owner phone for staff", () => {
    vi.mocked(useAuth).mockImplementation(() => staffUser());
    renderDetailPage();
    expect(screen.getByText("90xxxxxx05")).toBeInTheDocument();
    expect(screen.queryByText("9002005005")).not.toBeInTheDocument();
  });
});

describe("VehicleDetailPage — activation authorization", () => {
  afterEach(() => {
    cleanup();
    vi.mocked(useAuth).mockImplementation(() => adminUser());
  });

  it("shows Deactivate to ADMIN for an active vehicle", () => {
    renderDetailPage();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /deactivate/i }),
    ).toBeInTheDocument();
  });

  it("shows Reactivate to ADMIN for an inactive vehicle", () => {
    renderDetailPage({ status: "INACTIVE" });
    expect(screen.getByText("Inactive")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /reactivate/i }),
    ).toBeInTheDocument();
  });

  it("does not render Deactivate for STAFF with an active vehicle", () => {
    vi.mocked(useAuth).mockImplementation(() => staffUser());
    renderDetailPage();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /deactivate/i }),
    ).not.toBeInTheDocument();
  });

  it("does not render Reactivate for STAFF with an inactive vehicle", () => {
    vi.mocked(useAuth).mockImplementation(() => staffUser());
    renderDetailPage({ status: "INACTIVE" });
    expect(screen.getByText("Inactive")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /reactivate/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps normal vehicle details visible for STAFF", () => {
    vi.mocked(useAuth).mockImplementation(() => staffUser());
    renderDetailPage();
    expect(screen.getByText("KL01TEST")).toBeInTheDocument();
    expect(screen.getByText("Test Customer")).toBeInTheDocument();
    expect(screen.getByText("Honda City")).toBeInTheDocument();
    expect(screen.getByText("Service history")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
  });
});
