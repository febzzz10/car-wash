import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../lib/api";
import { ChangeVehicleStatusDialog } from "./vehicle-detail";

vi.mock("../lib/api", () => ({
  api: vi.fn(),
  jsonBody: (value: unknown) => ({ body: JSON.stringify(value) }),
}));

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
