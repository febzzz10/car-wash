import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../lib/api";
import { RewardAdjustmentDialog } from "./referrals";

vi.mock("../lib/api", () => ({
  api: vi.fn(),
  jsonBody: (value: unknown) => ({ body: JSON.stringify(value) }),
}));

vi.mock("../components/toast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

const onClose = vi.fn();
const onDone = vi.fn();
const reward = {
  customer_name: "Alice Smith",
  earned_at: "2026-06-15T00:00:00Z",
  expires_at: "2026-09-15T00:00:00Z",
  id: "rw-1",
  original_amount_minor: 2000,
  remaining_amount_minor: 1500,
  status: "AVAILABLE",
};
const defaultProps = {
  reward,
  onClose,
  onDone,
  open: true,
};

function amountInput() {
  return screen.getByRole("spinbutton", { name: /adjustment amount/i });
}

function reasonInput() {
  return screen.getByRole("textbox", { name: /reason/i });
}

function form() {
  return screen.getByRole("dialog").querySelector("form")!;
}

describe("RewardAdjustmentDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders when open", () => {
    render(<RewardAdjustmentDialog {...defaultProps} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /adjust referral reward/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/change the referral reward balance/i),
    ).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(<RewardAdjustmentDialog {...defaultProps} open={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not use window.prompt", () => {
    const promptSpy = vi.spyOn(window, "prompt");
    render(<RewardAdjustmentDialog {...defaultProps} />);
    expect(promptSpy).not.toHaveBeenCalled();
    promptSpy.mockRestore();
  });

  it("displays amount and reason fields", () => {
    render(<RewardAdjustmentDialog {...defaultProps} />);
    expect(amountInput()).toBeInTheDocument();
    expect(reasonInput()).toBeInTheDocument();
  });

  it("displays Apply Adjustment and Cancel buttons", () => {
    render(<RewardAdjustmentDialog {...defaultProps} />);
    expect(
      screen.getByRole("button", { name: /apply adjustment/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /cancel/i }),
    ).toBeInTheDocument();
  });

  it("calls onClose when Cancel is clicked", async () => {
    const user = userEvent.setup();
    render(<RewardAdjustmentDialog {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the close X is clicked", async () => {
    const user = userEvent.setup();
    render(<RewardAdjustmentDialog {...defaultProps} />);
    await user.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("rejects empty amount", async () => {
    render(<RewardAdjustmentDialog {...defaultProps} />);
    const reason = reasonInput();
    fireEvent.change(reason, { target: { value: "Valid reason text" } });
    fireEvent.submit(form());
    expect(api).not.toHaveBeenCalled();
  });

  it("rejects non-numeric amount", async () => {
    render(<RewardAdjustmentDialog {...defaultProps} />);
    const amount = amountInput();
    const reason = reasonInput();
    fireEvent.change(amount, { target: { value: "abc" } });
    fireEvent.change(reason, { target: { value: "Valid reason text" } });
    fireEvent.submit(form());
    expect(api).not.toHaveBeenCalled();
  });

  it("rejects zero amount", async () => {
    render(<RewardAdjustmentDialog {...defaultProps} />);
    const amount = amountInput();
    const reason = reasonInput();
    fireEvent.change(amount, { target: { value: "0" } });
    fireEvent.change(reason, { target: { value: "Valid reason text" } });
    fireEvent.submit(form());
    expect(api).not.toHaveBeenCalled();
  });

  it("rejects negative amount", async () => {
    render(<RewardAdjustmentDialog {...defaultProps} />);
    const amount = amountInput();
    const reason = reasonInput();
    fireEvent.change(amount, { target: { value: "-10" } });
    fireEvent.change(reason, { target: { value: "Valid reason text" } });
    fireEvent.submit(form());
    expect(api).not.toHaveBeenCalled();
  });

  it("rejects amount with more than two decimal places", async () => {
    render(<RewardAdjustmentDialog {...defaultProps} />);
    const amount = amountInput();
    const reason = reasonInput();
    fireEvent.change(amount, { target: { value: "0.001" } });
    fireEvent.change(reason, { target: { value: "Valid reason text" } });
    fireEvent.submit(form());
    expect(api).not.toHaveBeenCalled();
    expect(
      screen.getByText("Adjustment amount can have at most two decimal places."),
    ).toBeInTheDocument();
  });

  it("rejects 1.005 (three decimal places)", async () => {
    render(<RewardAdjustmentDialog {...defaultProps} />);
    const amount = amountInput();
    const reason = reasonInput();
    fireEvent.change(amount, { target: { value: "1.005" } });
    fireEvent.change(reason, { target: { value: "Valid reason text" } });
    fireEvent.submit(form());
    expect(api).not.toHaveBeenCalled();
  });

  it("rejects 10.999 (three decimal places)", async () => {
    render(<RewardAdjustmentDialog {...defaultProps} />);
    const amount = amountInput();
    const reason = reasonInput();
    fireEvent.change(amount, { target: { value: "10.999" } });
    fireEvent.change(reason, { target: { value: "Valid reason text" } });
    fireEvent.submit(form());
    expect(api).not.toHaveBeenCalled();
  });

  it("accepts 0.01 and sends as 1 minor unit", async () => {
    vi.mocked(api).mockResolvedValue({ success: true, data: {} });
    render(<RewardAdjustmentDialog {...defaultProps} />);
    const amount = amountInput();
    const reason = reasonInput();
    fireEvent.change(amount, { target: { value: "0.01" } });
    fireEvent.change(reason, { target: { value: "Minimum adjustment" } });
    fireEvent.submit(form());
    await waitFor(() => {
      expect(api).toHaveBeenCalledTimes(1);
      expect(api).toHaveBeenCalledWith("/referrals/rewards/rw-1/adjust", {
        body: JSON.stringify({ amountMinor: 1, reason: "Minimum adjustment" }),
        method: "POST",
      });
    });
  });

  it("accepts 1 and sends as 100 minor units", async () => {
    vi.mocked(api).mockResolvedValue({ success: true, data: {} });
    render(<RewardAdjustmentDialog {...defaultProps} />);
    const amount = amountInput();
    const reason = reasonInput();
    fireEvent.change(amount, { target: { value: "1" } });
    fireEvent.change(reason, { target: { value: "Whole number adjustment" } });
    fireEvent.submit(form());
    await waitFor(() => {
      expect(api).toHaveBeenCalledTimes(1);
      expect(api).toHaveBeenCalledWith("/referrals/rewards/rw-1/adjust", {
        body: JSON.stringify({ amountMinor: 100, reason: "Whole number adjustment" }),
        method: "POST",
      });
    });
  });

  it("accepts 1.5 and sends as 150 minor units", async () => {
    vi.mocked(api).mockResolvedValue({ success: true, data: {} });
    render(<RewardAdjustmentDialog {...defaultProps} />);
    const amount = amountInput();
    const reason = reasonInput();
    fireEvent.change(amount, { target: { value: "1.5" } });
    fireEvent.change(reason, { target: { value: "One decimal place" } });
    fireEvent.submit(form());
    await waitFor(() => {
      expect(api).toHaveBeenCalledTimes(1);
      expect(api).toHaveBeenCalledWith("/referrals/rewards/rw-1/adjust", {
        body: JSON.stringify({ amountMinor: 150, reason: "One decimal place" }),
        method: "POST",
      });
    });
  });

  it("accepts 1.50 and sends as 150 minor units", async () => {
    vi.mocked(api).mockResolvedValue({ success: true, data: {} });
    render(<RewardAdjustmentDialog {...defaultProps} />);
    const amount = amountInput();
    const reason = reasonInput();
    fireEvent.change(amount, { target: { value: "1.50" } });
    fireEvent.change(reason, { target: { value: "Two decimal places" } });
    fireEvent.submit(form());
    await waitFor(() => {
      expect(api).toHaveBeenCalledTimes(1);
      expect(api).toHaveBeenCalledWith("/referrals/rewards/rw-1/adjust", {
        body: JSON.stringify({ amountMinor: 150, reason: "Two decimal places" }),
        method: "POST",
      });
    });
  });

  it("accepts 10.99 and sends as 1099 minor units", async () => {
    vi.mocked(api).mockResolvedValue({ success: true, data: {} });
    render(<RewardAdjustmentDialog {...defaultProps} />);
    const amount = amountInput();
    const reason = reasonInput();
    fireEvent.change(amount, { target: { value: "10.99" } });
    fireEvent.change(reason, { target: { value: "High precision valid" } });
    fireEvent.submit(form());
    await waitFor(() => {
      expect(api).toHaveBeenCalledTimes(1);
      expect(api).toHaveBeenCalledWith("/referrals/rewards/rw-1/adjust", {
        body: JSON.stringify({ amountMinor: 1099, reason: "High precision valid" }),
        method: "POST",
      });
    });
  });

  it("invalid precision sends no API request", async () => {
    render(<RewardAdjustmentDialog {...defaultProps} />);
    const amount = amountInput();
    const reason = reasonInput();
    fireEvent.change(amount, { target: { value: "1.999" } });
    fireEvent.change(reason, { target: { value: "Should be blocked" } });
    fireEvent.submit(form());
    expect(api).not.toHaveBeenCalled();
  });

  it("rejects empty reason", async () => {
    render(<RewardAdjustmentDialog {...defaultProps} />);
    const amount = amountInput();
    fireEvent.change(amount, { target: { value: "25" } });
    fireEvent.submit(form());
    expect(api).not.toHaveBeenCalled();
  });

  it("rejects whitespace-only reason", async () => {
    render(<RewardAdjustmentDialog {...defaultProps} />);
    const amount = amountInput();
    const reason = reasonInput();
    fireEvent.change(amount, { target: { value: "25" } });
    fireEvent.change(reason, { target: { value: "   " } });
    fireEvent.submit(form());
    expect(api).not.toHaveBeenCalled();
  });

  it("rejects reason that becomes too short after trimming", async () => {
    render(<RewardAdjustmentDialog {...defaultProps} />);
    const amount = amountInput();
    const reason = reasonInput();
    fireEvent.change(amount, { target: { value: "25" } });
    fireEvent.change(reason, { target: { value: " ab " } });
    fireEvent.submit(form());
    expect(api).not.toHaveBeenCalled();
  });

  it("rejects reason that exceeds maximum length", async () => {
    render(<RewardAdjustmentDialog {...defaultProps} />);
    const amount = amountInput();
    const reason = reasonInput();
    fireEvent.change(amount, { target: { value: "25" } });
    fireEvent.change(reason, { target: { value: "x".repeat(501) } });
    fireEvent.submit(form());
    expect(api).not.toHaveBeenCalled();
  });

  it("sends no API request for invalid input", async () => {
    render(<RewardAdjustmentDialog {...defaultProps} />);
    fireEvent.submit(form());
    expect(api).not.toHaveBeenCalled();
  });

  it("has minLength=5 and required on the reason field", () => {
    render(<RewardAdjustmentDialog {...defaultProps} />);
    const textarea = reasonInput();
    expect(textarea).toHaveAttribute("minLength", "5");
    expect(textarea).toHaveAttribute("required");
  });

  it("has step=0.01 on the amount field", () => {
    render(<RewardAdjustmentDialog {...defaultProps} />);
    expect(amountInput()).toHaveAttribute("step", "0.01");
  });

  it("has min=0.01 on the amount field", () => {
    render(<RewardAdjustmentDialog {...defaultProps} />);
    expect(amountInput()).toHaveAttribute("min", "0.01");
  });

  it("has required on the amount field", () => {
    render(<RewardAdjustmentDialog {...defaultProps} />);
    expect(amountInput()).toHaveAttribute("required");
  });

  it("sends valid amount and trimmed reason to the correct endpoint", async () => {
    vi.mocked(api).mockResolvedValue({ success: true, data: {} });
    render(<RewardAdjustmentDialog {...defaultProps} />);
    const amount = amountInput();
    const reason = reasonInput();
    fireEvent.change(amount, { target: { value: "25.50" } });
    fireEvent.change(reason, { target: { value: "  Performance bonus  " } });
    fireEvent.submit(form());
    await waitFor(() => {
      expect(api).toHaveBeenCalledTimes(1);
      expect(api).toHaveBeenCalledWith("/referrals/rewards/rw-1/adjust", {
        body: JSON.stringify({
          amountMinor: 2550,
          reason: "Performance bonus",
        }),
        method: "POST",
      });
    });
  });

  it("submits positive adjustment correctly", async () => {
    vi.mocked(api).mockResolvedValue({ success: true, data: {} });
    render(<RewardAdjustmentDialog {...defaultProps} />);
    const amount = amountInput();
    const reason = reasonInput();
    fireEvent.change(amount, { target: { value: "10" } });
    fireEvent.change(reason, { target: { value: "Extra reward" } });
    fireEvent.submit(form());
    await waitFor(() => {
      expect(api).toHaveBeenCalledTimes(1);
      expect(api).toHaveBeenCalledWith("/referrals/rewards/rw-1/adjust", {
        body: JSON.stringify({
          amountMinor: 1000,
          reason: "Extra reward",
        }),
        method: "POST",
      });
    });
  });

  it("does not submit negative adjustments (rejected by JS guard)", async () => {
    render(<RewardAdjustmentDialog {...defaultProps} />);
    const amount = amountInput();
    const reason = reasonInput();
    fireEvent.change(amount, { target: { value: "-5" } });
    fireEvent.change(reason, { target: { value: "Penalty" } });
    fireEvent.submit(form());
    expect(api).not.toHaveBeenCalled();
  });

  it("calls onDone and not onClose on successful submission", async () => {
    vi.mocked(api).mockResolvedValue({ success: true, data: {} });
    render(<RewardAdjustmentDialog {...defaultProps} />);
    const amount = amountInput();
    const reason = reasonInput();
    fireEvent.change(amount, { target: { value: "15" } });
    fireEvent.change(reason, { target: { value: "Good performance" } });
    fireEvent.submit(form());
    await waitFor(() => {
      expect(onDone).toHaveBeenCalledTimes(1);
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("prevents duplicate submissions via disabled button", async () => {
    let resolvePromise!: () => void;
    let callCount = 0;
    vi.mocked(api).mockImplementation(
      () =>
        new Promise((resolve) => {
          callCount++;
          resolvePromise = () => resolve({ success: true, data: {} });
        }),
    );
    render(<RewardAdjustmentDialog {...defaultProps} />);
    const amount = amountInput();
    const reason = reasonInput();
    fireEvent.change(amount, { target: { value: "20" } });
    fireEvent.change(reason, { target: { value: "Duplicate guard" } });
    fireEvent.submit(form());
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /apply adjustment/i }),
      ).toBeDisabled();
    });
    expect(callCount).toBe(1);
    resolvePromise!();
  });

  it("shows API error inside the dialog", async () => {
    vi.mocked(api).mockRejectedValue(
      new Error("Only unreserved rewards can be adjusted."),
    );
    render(<RewardAdjustmentDialog {...defaultProps} />);
    const amount = amountInput();
    const reason = reasonInput();
    fireEvent.change(amount, { target: { value: "30" } });
    fireEvent.change(reason, { target: { value: "Attempted adjustment" } });
    fireEvent.submit(form());
    await waitFor(() => {
      expect(
        screen.getByText("Only unreserved rewards can be adjusted."),
      ).toBeInTheDocument();
    });
  });

  it("remains open after API failure", async () => {
    vi.mocked(api).mockRejectedValue(new Error("API failure"));
    render(<RewardAdjustmentDialog {...defaultProps} />);
    const amount = amountInput();
    const reason = reasonInput();
    fireEvent.change(amount, { target: { value: "40" } });
    fireEvent.change(reason, { target: { value: "Will fail" } });
    fireEvent.submit(form());
    await waitFor(() => {
      expect(screen.getByText("API failure")).toBeInTheDocument();
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("clears error when resubmitting after failure", async () => {
    vi.mocked(api).mockRejectedValueOnce(new Error("First failure"));
    vi.mocked(api).mockResolvedValueOnce({ success: true, data: {} });
    render(<RewardAdjustmentDialog {...defaultProps} />);
    const amount = amountInput();
    const reason = reasonInput();
    fireEvent.change(amount, { target: { value: "50" } });
    fireEvent.change(reason, { target: { value: "Retry reason" } });
    fireEvent.submit(form());
    await waitFor(() => {
      expect(screen.getByText("First failure")).toBeInTheDocument();
    });
    fireEvent.submit(form());
    await waitFor(() => {
      expect(screen.queryByText("First failure")).not.toBeInTheDocument();
    });
  });
});
