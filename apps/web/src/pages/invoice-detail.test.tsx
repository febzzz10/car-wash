import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../lib/api";
import { InvoiceRevisionDialog } from "./invoice-detail";

vi.mock("../lib/api", () => ({
  api: vi.fn(),
  jsonBody: (value: unknown) => ({ body: JSON.stringify(value) }),
}));

vi.mock("../components/toast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

const onClose = vi.fn();
const defaultProps = {
  customerName: "John Doe",
  id: "inv-1",
  onClose,
  open: true,
};

function reasonInput() {
  return screen.getByRole("textbox", { name: /reason/i });
}

function nameInput() {
  return screen.getByRole("textbox", { name: /customer name/i });
}

function form() {
  return screen.getByRole("dialog").querySelector("form")!;
}

describe("InvoiceRevisionDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders when open", () => {
    render(<InvoiceRevisionDialog {...defaultProps} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /create correction/i })).toBeInTheDocument();
    expect(
      screen.getByText(/Invoice corrections create an immutable revision/i),
    ).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(<InvoiceRevisionDialog {...defaultProps} open={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("pre-fills customer name from the current invoice", () => {
    render(<InvoiceRevisionDialog {...defaultProps} />);
    expect(nameInput()).toHaveValue("John Doe");
  });

  it("has minLength=5 and required on reason field", () => {
    render(<InvoiceRevisionDialog {...defaultProps} />);
    const textarea = reasonInput();
    expect(textarea).toHaveAttribute("minLength", "5");
    expect(textarea).toHaveAttribute("required");
  });

  it("calls onClose when Cancel is clicked", async () => {
    const user = userEvent.setup();
    render(<InvoiceRevisionDialog {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the close X is clicked", async () => {
    const user = userEvent.setup();
    render(<InvoiceRevisionDialog {...defaultProps} />);
    await user.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("rejects empty trimmed reason (JS guard)", () => {
    render(<InvoiceRevisionDialog {...defaultProps} />);
    fireEvent.change(reasonInput(), { target: { value: "   " } });
    fireEvent.submit(form());
    expect(api).not.toHaveBeenCalled();
  });

  it("rejects reason that becomes too short after trimming", () => {
    render(<InvoiceRevisionDialog {...defaultProps} />);
    fireEvent.change(reasonInput(), { target: { value: " ab " } });
    fireEvent.submit(form());
    expect(api).not.toHaveBeenCalled();
  });

  it("sends valid trimmed reason and customer name to the revision endpoint", async () => {
    vi.mocked(api).mockResolvedValue({ id: "rev-1" });
    render(<InvoiceRevisionDialog {...defaultProps} />);
    fireEvent.change(reasonInput(), { target: { value: "  Typo in name  " } });
    fireEvent.change(nameInput(), { target: { value: "  Jane Doe  " } });
    fireEvent.submit(form());
    await waitFor(() => {
      expect(api).toHaveBeenCalledTimes(1);
      const callArgs = vi.mocked(api).mock.calls[0]!;
      expect(callArgs[0]).toBe("/invoices/inv-1/revisions");
      const body = JSON.parse(callArgs[1]!.body as string);
      expect(body.reason).toBe("Typo in name");
      expect(body.customerName).toBe("Jane Doe");
      expect(body.idempotencyKey).toBeDefined();
    });
  });

  it("omits customer name from body when cleared", async () => {
    vi.mocked(api).mockResolvedValue({ id: "rev-1" });
    render(<InvoiceRevisionDialog {...defaultProps} />);
    fireEvent.change(reasonInput(), { target: { value: "Correction needed" } });
    fireEvent.change(nameInput(), { target: { value: "" } });
    fireEvent.submit(form());
    await waitFor(() => {
      const callArgs = vi.mocked(api).mock.calls[0]!;
      const body = JSON.parse(callArgs[1]!.body as string);
      expect(body.customerName).toBeUndefined();
    });
  });

  it("navigates to the new revision on success", async () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      value: { assign },
      writable: true,
    });
    vi.mocked(api).mockResolvedValue({ id: "rev-2" });
    render(<InvoiceRevisionDialog {...defaultProps} />);
    fireEvent.change(reasonInput(), { target: { value: "Name correction" } });
    fireEvent.submit(form());
    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith("/invoices/rev-2");
    });
  });

  it("shows API error inside the dialog", async () => {
    vi.mocked(api).mockRejectedValue(
      new Error("Conflict: not the latest revision"),
    );
    render(<InvoiceRevisionDialog {...defaultProps} />);
    fireEvent.change(reasonInput(), { target: { value: "Fix address" } });
    fireEvent.submit(form());
    await waitFor(() => {
      expect(
        screen.getByText("Conflict: not the latest revision"),
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
          resolvePromise = () => resolve({ id: "rev-3" });
        }),
    );
    render(<InvoiceRevisionDialog {...defaultProps} />);
    fireEvent.change(reasonInput(), { target: { value: "Fix phone" } });
    fireEvent.submit(form());
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /create correction/i }),
      ).toBeDisabled();
    });
    expect(callCount).toBe(1);
    resolvePromise!();
  });

  it("clears error when resubmitting after failure", async () => {
    vi.mocked(api).mockRejectedValueOnce(new Error("First error"));
    vi.mocked(api).mockResolvedValueOnce({ id: "rev-4" });
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      value: { assign },
      writable: true,
    });
    render(<InvoiceRevisionDialog {...defaultProps} />);
    fireEvent.change(reasonInput(), { target: { value: "Retry after fix" } });
    fireEvent.submit(form());
    await waitFor(() => {
      expect(screen.getByText("First error")).toBeInTheDocument();
    });
    fireEvent.submit(form());
    await waitFor(() => {
      expect(screen.queryByText("First error")).not.toBeInTheDocument();
    });
  });
});
