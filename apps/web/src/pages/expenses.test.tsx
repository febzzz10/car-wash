import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../lib/api";
import { CancelExpenseDialog } from "./expenses";

vi.mock("../lib/api", () => ({
  api: vi.fn(),
  jsonBody: (value: unknown) => ({ body: JSON.stringify(value) }),
}));

const onClose = vi.fn();
const onDone = vi.fn();
const expense = {
  amount_minor: 5000,
  category_id: "cat-1",
  category_name: "Supplies",
  created_at: "2026-07-01T00:00:00Z",
  description: null,
  expense_date: "2026-07-01",
  expense_reference: "EXP-001",
  id: "exp-1",
  payment_method: null,
  recorded_by_name: "Admin",
  status: "ACTIVE",
  title: "Soap",
  version: 3,
};
const defaultProps = {
  expense,
  onClose,
  onDone,
  open: true,
};

function reasonInput() {
  return screen.getByRole("textbox", { name: /reason/i });
}

function form() {
  return screen.getByRole("dialog").querySelector("form")!;
}

describe("CancelExpenseDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders when open", () => {
    render(<CancelExpenseDialog {...defaultProps} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Cancel expense")).toBeInTheDocument();
    expect(
      screen.getByText(/removes it from active expense totals/i),
    ).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(<CancelExpenseDialog {...defaultProps} open={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("displays Cancel Expense and Keep Expense buttons", () => {
    render(<CancelExpenseDialog {...defaultProps} />);
    expect(
      screen.getByRole("button", { name: /cancel expense/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /keep expense/i }),
    ).toBeInTheDocument();
  });

  it("calls onClose when Keep Expense is clicked", async () => {
    const user = userEvent.setup();
    render(<CancelExpenseDialog {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: /keep expense/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the close X is clicked", async () => {
    const user = userEvent.setup();
    render(<CancelExpenseDialog {...defaultProps} />);
    await user.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("has minLength=5 and required on the reason field", () => {
    render(<CancelExpenseDialog {...defaultProps} />);
    const textarea = reasonInput();
    expect(textarea).toHaveAttribute("minLength", "5");
    expect(textarea).toHaveAttribute("required");
  });

  it("rejects empty trimmed reason (JS guard)", async () => {
    render(<CancelExpenseDialog {...defaultProps} />);
    const textarea = reasonInput();
    fireEvent.change(textarea, { target: { value: "   " } });
    fireEvent.submit(form());
    // Should not call the API
    expect(api).not.toHaveBeenCalled();
  });

  it("rejects reason that becomes too short after trimming", async () => {
    render(<CancelExpenseDialog {...defaultProps} />);
    const textarea = reasonInput();
    fireEvent.change(textarea, { target: { value: " ab " } });
    fireEvent.submit(form());
    expect(api).not.toHaveBeenCalled();
  });

  it("sends valid trimmed reason to the cancel endpoint", async () => {
    vi.mocked(api).mockResolvedValue({ status: "CANCELLED" });
    render(<CancelExpenseDialog {...defaultProps} />);
    const textarea = reasonInput();
    fireEvent.change(textarea, { target: { value: "  No longer needed  " } });
    fireEvent.submit(form());
    await waitFor(() => {
      expect(api).toHaveBeenCalledTimes(1);
      expect(api).toHaveBeenCalledWith("/expenses/exp-1/cancel", {
        body: JSON.stringify({ reason: "No longer needed", version: 3 }),
        method: "POST",
      });
    });
  });

  it("calls onDone and not onClose on successful submission", async () => {
    vi.mocked(api).mockResolvedValue({ status: "CANCELLED" });
    render(<CancelExpenseDialog {...defaultProps} />);
    const textarea = reasonInput();
    fireEvent.change(textarea, { target: { value: "Budget cut" } });
    fireEvent.submit(form());
    await waitFor(() => {
      expect(onDone).toHaveBeenCalledTimes(1);
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows API error inside the dialog", async () => {
    vi.mocked(api).mockRejectedValue(new Error("Conflict: version mismatch"));
    render(<CancelExpenseDialog {...defaultProps} />);
    const textarea = reasonInput();
    fireEvent.change(textarea, { target: { value: "Duplicate entry" } });
    fireEvent.submit(form());
    await waitFor(() => {
      expect(
        screen.getByText("Conflict: version mismatch"),
      ).toBeInTheDocument();
    });
  });

  it("prevents duplicate submissions via disabled button", async () => {
    let resolvePromise!: () => void;
    let callCount = 0;
    vi.mocked(api).mockImplementation(
      () =>
        new Promise((resolve) => {
          callCount++;
          resolvePromise = () => resolve({ status: "CANCELLED" });
        }),
    );
    render(<CancelExpenseDialog {...defaultProps} />);
    const textarea = reasonInput();
    fireEvent.change(textarea, { target: { value: "Obsolete" } });
    fireEvent.submit(form());
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /cancel expense/i }),
      ).toBeDisabled();
    });
    expect(callCount).toBe(1);
    resolvePromise!();
  });

  it("clears error when resubmitting after failure", async () => {
    vi.mocked(api).mockRejectedValueOnce(new Error("First failure"));
    vi.mocked(api).mockResolvedValueOnce({ status: "CANCELLED" });
    render(<CancelExpenseDialog {...defaultProps} />);
    const textarea = reasonInput();
    fireEvent.change(textarea, { target: { value: "Correct reason" } });
    fireEvent.submit(form());
    await waitFor(() => {
      expect(screen.getByText("First failure")).toBeInTheDocument();
    });
    fireEvent.submit(form());
    await waitFor(() => {
      expect(
        screen.queryByText("First failure"),
      ).not.toBeInTheDocument();
    });
  });
});
