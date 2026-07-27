import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../lib/api";
import { liveTimer, AssignDialog, TimerCorrectionDialog } from "./wash-job-detail";

vi.mock("../lib/api", () => ({
  api: vi.fn(),
  jsonBody: (value: unknown) => ({ body: JSON.stringify(value) }),
}));

describe("liveTimer", () => {
  it("returns zero elapsed when there are no events", () => {
    expect(liveTimer([], 0)).toEqual({ active: 0, paused: 0 });
  });

  it("returns active elapsed from a single START event", () => {
    const start = new Date("2025-01-01T10:00:00Z").getTime();
    const now = new Date("2025-01-01T10:05:30Z").getTime();
    expect(
      liveTimer(
        [{ event_type: "START", event_at: new Date(start).toISOString() }],
        now,
      ),
    ).toEqual({ active: 330, paused: 0 });
  });

  it("subtracts paused duration from active", () => {
    const start = new Date("2025-01-01T10:00:00Z").getTime();
    const pause = new Date("2025-01-01T10:10:00Z").getTime();
    const resume = new Date("2025-01-01T10:15:00Z").getTime();
    const now = new Date("2025-01-01T10:20:00Z").getTime();
    const result = liveTimer(
      [
        { event_type: "START", event_at: new Date(start).toISOString() },
        { event_type: "PAUSE", event_at: new Date(pause).toISOString() },
        { event_type: "RESUME", event_at: new Date(resume).toISOString() },
      ],
      now,
    );
    expect(result.active).toBe(900);
    expect(result.paused).toBe(0);
  });

  it("reports paused duration when currently paused", () => {
    const start = new Date("2025-01-01T10:00:00Z").getTime();
    const pause = new Date("2025-01-01T10:10:00Z").getTime();
    const now = new Date("2025-01-01T10:20:00Z").getTime();
    const result = liveTimer(
      [
        { event_type: "START", event_at: new Date(start).toISOString() },
        { event_type: "PAUSE", event_at: new Date(pause).toISOString() },
      ],
      now,
    );
    expect(result.active).toBe(600);
    expect(result.paused).toBe(600);
  });

  it("freezes at END event", () => {
    const start = new Date("2025-01-01T10:00:00Z").getTime();
    const end = new Date("2025-01-01T10:25:00Z").getTime();
    const now = new Date("2025-01-01T10:30:00Z").getTime();
    const result = liveTimer(
      [
        { event_type: "START", event_at: new Date(start).toISOString() },
        { event_type: "END", event_at: new Date(end).toISOString() },
      ],
      now,
    );
    expect(result.active).toBe(1500);
    expect(result.paused).toBe(0);
  });

  it("handles multiple pause-resume cycles", () => {
    const start = new Date("2025-01-01T10:00:00Z").getTime();
    const p1 = new Date("2025-01-01T10:10:00Z").getTime();
    const r1 = new Date("2025-01-01T10:15:00Z").getTime();
    const p2 = new Date("2025-01-01T10:20:00Z").getTime();
    const r2 = new Date("2025-01-01T10:25:00Z").getTime();
    const now = new Date("2025-01-01T10:30:00Z").getTime();
    const result = liveTimer(
      [
        { event_type: "START", event_at: new Date(start).toISOString() },
        { event_type: "PAUSE", event_at: new Date(p1).toISOString() },
        { event_type: "RESUME", event_at: new Date(r1).toISOString() },
        { event_type: "PAUSE", event_at: new Date(p2).toISOString() },
        { event_type: "RESUME", event_at: new Date(r2).toISOString() },
      ],
      now,
    );
    expect(result.active).toBe(1200);
    expect(result.paused).toBe(0);
  });
});

describe("AssignDialog", () => {
  const onClose = vi.fn();
  const onDone = vi.fn();
  const defaultProps = {
    assigneeId: "usr-2",
    assigneeName: "Bob Staff",
    id: "job-1",
    onClose,
    onDone,
    open: true,
    version: 5,
  };

  function reasonInput() {
    return screen.getByRole("textbox", { name: /reason/i });
  }

  function dialog() {
    return screen.getByRole("dialog");
  }

  function form() {
    return dialog().querySelector("form")!;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders when open", () => {
    render(<AssignDialog {...defaultProps} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /reassign job/i }),
    ).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(<AssignDialog {...defaultProps} open={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("displays the target assignee name", () => {
    render(<AssignDialog {...defaultProps} />);
    expect(screen.getByText(/bob staff/i)).toBeInTheDocument();
  });

  it("displays the reason field", () => {
    render(<AssignDialog {...defaultProps} />);
    expect(reasonInput()).toBeInTheDocument();
  });

  it("displays Cancel and Save buttons", () => {
    render(<AssignDialog {...defaultProps} />);
    expect(
      screen.getByRole("button", { name: /cancel/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /save assignment/i }),
    ).toBeInTheDocument();
  });

  it("calls onClose when Cancel is clicked", async () => {
    const user = userEvent.setup();
    render(<AssignDialog {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when close X is clicked", async () => {
    const user = userEvent.setup();
    render(<AssignDialog {...defaultProps} />);
    await user.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("sends no request for empty reason", () => {
    render(<AssignDialog {...defaultProps} />);
    fireEvent.submit(form());
    expect(api).not.toHaveBeenCalled();
  });

  it("sends no request for whitespace-only reason", () => {
    render(<AssignDialog {...defaultProps} />);
    const reason = reasonInput();
    fireEvent.change(reason, { target: { value: "     " } });
    fireEvent.submit(form());
    expect(api).not.toHaveBeenCalled();
  });

  it("rejects reason that is too short after trimming", () => {
    render(<AssignDialog {...defaultProps} />);
    const reason = reasonInput();
    fireEvent.change(reason, { target: { value: "  ab  " } });
    fireEvent.submit(form());
    expect(api).not.toHaveBeenCalled();
  });

  it("rejects reason that exceeds 500 characters", () => {
    render(<AssignDialog {...defaultProps} />);
    const reason = reasonInput();
    fireEvent.change(reason, { target: { value: "x".repeat(501) } });
    fireEvent.submit(form());
    expect(api).not.toHaveBeenCalled();
  });

  it("sends no API request for invalid input", () => {
    render(<AssignDialog {...defaultProps} />);
    fireEvent.submit(form());
    expect(api).not.toHaveBeenCalled();
  });

  it("sends trimmed reason and correct assignee ID on valid submission", async () => {
    vi.mocked(api).mockResolvedValue({ success: true, data: {} });
    render(<AssignDialog {...defaultProps} />);
    const reason = reasonInput();
    fireEvent.change(reason, {
      target: { value: "  Staff reassigned due to shift change  " },
    });
    fireEvent.submit(form());
    await waitFor(() => {
      expect(api).toHaveBeenCalledTimes(1);
      expect(api).toHaveBeenCalledWith("/wash-jobs/job-1/assignment", {
        body: JSON.stringify({
          assignedUserId: "usr-2",
          reason: "Staff reassigned due to shift change",
          version: 5,
        }),
        method: "PATCH",
      });
    });
  });

  it("includes the correct job version", async () => {
    vi.mocked(api).mockResolvedValue({ success: true, data: {} });
    render(<AssignDialog {...defaultProps} version={42} />);
    const reason = reasonInput();
    fireEvent.change(reason, { target: { value: "Shift change" } });
    fireEvent.submit(form());
    await waitFor(() => {
      const body = JSON.parse(vi.mocked(api).mock.calls[0]![1]!.body as string);
      expect(body.version).toBe(42);
    });
  });

  it("calls onDone and not onClose after successful submission", async () => {
    vi.mocked(api).mockResolvedValue({ success: true, data: {} });
    render(<AssignDialog {...defaultProps} />);
    const reason = reasonInput();
    fireEvent.change(reason, { target: { value: "Valid reassignment" } });
    fireEvent.submit(form());
    await waitFor(() => {
      expect(onDone).toHaveBeenCalledTimes(1);
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("prevents duplicate submissions via disabled button while busy", async () => {
    let resolvePromise!: () => void;
    let callCount = 0;
    vi.mocked(api).mockImplementation(
      () =>
        new Promise((resolve) => {
          callCount++;
          resolvePromise = () => resolve({ success: true, data: {} });
        }),
    );
    render(<AssignDialog {...defaultProps} />);
    const reason = reasonInput();
    fireEvent.change(reason, { target: { value: "Reassigning staff" } });
    fireEvent.submit(form());
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /save assignment/i }),
      ).toBeDisabled();
    });
    expect(callCount).toBe(1);
    resolvePromise!();
  });

  it("displays API error inside the dialog", async () => {
    vi.mocked(api).mockRejectedValue(new Error("Assignment conflict."));
    render(<AssignDialog {...defaultProps} />);
    const reason = reasonInput();
    fireEvent.change(reason, { target: { value: "Attempted reassign" } });
    fireEvent.submit(form());
    await waitFor(() => {
      expect(screen.getByText("Assignment conflict.")).toBeInTheDocument();
    });
  });

  it("remains open after API failure", async () => {
    vi.mocked(api).mockRejectedValue(new Error("Server error"));
    render(<AssignDialog {...defaultProps} />);
    const reason = reasonInput();
    fireEvent.change(reason, { target: { value: "Will fail" } });
    fireEvent.submit(form());
    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeInTheDocument();
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("clears error when resubmitting after failure", async () => {
    vi.mocked(api).mockRejectedValueOnce(new Error("First failure"));
    vi.mocked(api).mockResolvedValueOnce({ success: true, data: {} });
    render(<AssignDialog {...defaultProps} />);
    const reason = reasonInput();
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

  it("has minLength and maxLength on the reason field", () => {
    render(<AssignDialog {...defaultProps} />);
    const textarea = reasonInput();
    expect(textarea).toHaveAttribute("minLength", "5");
    expect(textarea).toHaveAttribute("maxLength", "500");
    expect(textarea).toHaveAttribute("required");
  });
});

describe("TimerCorrectionDialog", () => {
  const onClose = vi.fn();
  const onDone = vi.fn();
  const defaultProps = {
    currentActiveSeconds: 1500,
    id: "job-1",
    onClose,
    onDone,
    open: true,
    version: 7,
  };

  function durationInput() {
    return screen.getByRole("spinbutton", { name: /corrected active duration/i });
  }

  function reasonInput() {
    return screen.getByRole("textbox", { name: /correction reason/i });
  }

  function dialog() {
    return screen.getByRole("dialog");
  }

  function form() {
    return dialog().querySelector("form")!;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders when open", () => {
    render(<TimerCorrectionDialog {...defaultProps} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /correct timer/i }),
    ).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(<TimerCorrectionDialog {...defaultProps} open={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the current active duration", () => {
    render(<TimerCorrectionDialog {...defaultProps} />);
    expect(screen.getByText(/current active duration/i)).toBeInTheDocument();
  });

  it("displays corrected duration and reason fields", () => {
    render(<TimerCorrectionDialog {...defaultProps} />);
    expect(durationInput()).toBeInTheDocument();
    expect(reasonInput()).toBeInTheDocument();
  });

  it("displays Cancel and Record buttons", () => {
    render(<TimerCorrectionDialog {...defaultProps} />);
    expect(
      screen.getByRole("button", { name: /cancel/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /record correction/i }),
    ).toBeInTheDocument();
  });

  it("calls onClose when Cancel is clicked", async () => {
    const user = userEvent.setup();
    render(<TimerCorrectionDialog {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when close X is clicked", async () => {
    const user = userEvent.setup();
    render(<TimerCorrectionDialog {...defaultProps} />);
    await user.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("sends no request for empty duration", () => {
    render(<TimerCorrectionDialog {...defaultProps} />);
    fireEvent.submit(form());
    expect(api).not.toHaveBeenCalled();
  });

  it("sends no request for non-numeric duration", () => {
    render(<TimerCorrectionDialog {...defaultProps} />);
    const duration = durationInput();
    const reason = reasonInput();
    fireEvent.change(duration, { target: { value: "abc" } });
    fireEvent.change(reason, { target: { value: "Valid reason here" } });
    fireEvent.submit(form());
    expect(api).not.toHaveBeenCalled();
  });

  it("sends no request for negative duration", () => {
    render(<TimerCorrectionDialog {...defaultProps} />);
    const duration = durationInput();
    const reason = reasonInput();
    fireEvent.change(duration, { target: { value: "-1" } });
    fireEvent.change(reason, { target: { value: "Valid reason here" } });
    fireEvent.submit(form());
    expect(api).not.toHaveBeenCalled();
  });

  it("sends no request for decimal duration", () => {
    render(<TimerCorrectionDialog {...defaultProps} />);
    const duration = durationInput();
    const reason = reasonInput();
    fireEvent.change(duration, { target: { value: "10.5" } });
    fireEvent.change(reason, { target: { value: "Valid reason here" } });
    fireEvent.submit(form());
    expect(api).not.toHaveBeenCalled();
  });

  it("sends no request for Infinity duration", () => {
    render(<TimerCorrectionDialog {...defaultProps} />);
    const duration = durationInput();
    const reason = reasonInput();
    fireEvent.change(duration, { target: { value: "Infinity" } });
    fireEvent.change(reason, { target: { value: "Valid reason here" } });
    fireEvent.submit(form());
    expect(api).not.toHaveBeenCalled();
  });

  it("sends no request for NaN duration", () => {
    render(<TimerCorrectionDialog {...defaultProps} />);
    const duration = durationInput();
    const reason = reasonInput();
    fireEvent.change(duration, { target: { value: "NaN" } });
    fireEvent.change(reason, { target: { value: "Valid reason here" } });
    fireEvent.submit(form());
    expect(api).not.toHaveBeenCalled();
  });

  it("rejects duration exceeding 31,536,000 seconds", () => {
    render(<TimerCorrectionDialog {...defaultProps} />);
    const duration = durationInput();
    const reason = reasonInput();
    fireEvent.change(duration, { target: { value: "31536001" } });
    fireEvent.change(reason, { target: { value: "Valid reason here" } });
    fireEvent.submit(form());
    expect(api).not.toHaveBeenCalled();
  });

  it("sends no request for empty reason", () => {
    render(<TimerCorrectionDialog {...defaultProps} />);
    const duration = durationInput();
    fireEvent.change(duration, { target: { value: "1800" } });
    fireEvent.submit(form());
    expect(api).not.toHaveBeenCalled();
  });

  it("sends no request for whitespace-only reason", () => {
    render(<TimerCorrectionDialog {...defaultProps} />);
    const duration = durationInput();
    const reason = reasonInput();
    fireEvent.change(duration, { target: { value: "1800" } });
    fireEvent.change(reason, { target: { value: "   " } });
    fireEvent.submit(form());
    expect(api).not.toHaveBeenCalled();
  });

  it("rejects reason that is too short after trimming", () => {
    render(<TimerCorrectionDialog {...defaultProps} />);
    const duration = durationInput();
    const reason = reasonInput();
    fireEvent.change(duration, { target: { value: "1800" } });
    fireEvent.change(reason, { target: { value: " ab " } });
    fireEvent.submit(form());
    expect(api).not.toHaveBeenCalled();
  });

  it("rejects reason that exceeds 500 characters", () => {
    render(<TimerCorrectionDialog {...defaultProps} />);
    const duration = durationInput();
    const reason = reasonInput();
    fireEvent.change(duration, { target: { value: "1800" } });
    fireEvent.change(reason, { target: { value: "x".repeat(501) } });
    fireEvent.submit(form());
    expect(api).not.toHaveBeenCalled();
  });

  it("sends no API request for invalid input", () => {
    render(<TimerCorrectionDialog {...defaultProps} />);
    fireEvent.submit(form());
    expect(api).not.toHaveBeenCalled();
  });

  it("sends correct values on valid submission", async () => {
    vi.mocked(api).mockResolvedValue({ success: true, data: {} });
    render(<TimerCorrectionDialog {...defaultProps} />);
    const duration = durationInput();
    const reason = reasonInput();
    fireEvent.change(duration, { target: { value: "2000" } });
    fireEvent.change(reason, {
      target: { value: "  Timer was off by 500 seconds  " },
    });
    fireEvent.submit(form());
    await waitFor(() => {
      expect(api).toHaveBeenCalledTimes(1);
      expect(api).toHaveBeenCalledWith("/wash-jobs/job-1/timer-adjustments", {
        body: JSON.stringify({
          adjustmentType: "ACTIVE_DURATION_CORRECTION",
          newValue: "2000",
          reason: "Timer was off by 500 seconds",
          version: 7,
        }),
        method: "POST",
      });
    });
  });

  it("sends duration in seconds as a string", async () => {
    vi.mocked(api).mockResolvedValue({ success: true, data: {} });
    render(<TimerCorrectionDialog {...defaultProps} />);
    const duration = durationInput();
    const reason = reasonInput();
    fireEvent.change(duration, { target: { value: "0" } });
    fireEvent.change(reason, { target: { value: "Timer reset to zero" } });
    fireEvent.submit(form());
    await waitFor(() => {
      const body = JSON.parse(vi.mocked(api).mock.calls[0]![1]!.body as string);
      expect(body.newValue).toBe("0");
    });
  });

  it("includes the job version", async () => {
    vi.mocked(api).mockResolvedValue({ success: true, data: {} });
    render(<TimerCorrectionDialog {...defaultProps} version={99} />);
    const duration = durationInput();
    const reason = reasonInput();
    fireEvent.change(duration, { target: { value: "1800" } });
    fireEvent.change(reason, { target: { value: "Timer adjustment" } });
    fireEvent.submit(form());
    await waitFor(() => {
      const body = JSON.parse(vi.mocked(api).mock.calls[0]![1]!.body as string);
      expect(body.version).toBe(99);
    });
  });

  it("calls onDone and not onClose after successful submission", async () => {
    vi.mocked(api).mockResolvedValue({ success: true, data: {} });
    render(<TimerCorrectionDialog {...defaultProps} />);
    const duration = durationInput();
    const reason = reasonInput();
    fireEvent.change(duration, { target: { value: "1800" } });
    fireEvent.change(reason, { target: { value: "Valid correction" } });
    fireEvent.submit(form());
    await waitFor(() => {
      expect(onDone).toHaveBeenCalledTimes(1);
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("prevents duplicate submissions via disabled button while busy", async () => {
    let resolvePromise!: () => void;
    let callCount = 0;
    vi.mocked(api).mockImplementation(
      () =>
        new Promise((resolve) => {
          callCount++;
          resolvePromise = () => resolve({ success: true, data: {} });
        }),
    );
    render(<TimerCorrectionDialog {...defaultProps} />);
    const duration = durationInput();
    const reason = reasonInput();
    fireEvent.change(duration, { target: { value: "1800" } });
    fireEvent.change(reason, { target: { value: "Duplicate guard" } });
    fireEvent.submit(form());
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /record correction/i }),
      ).toBeDisabled();
    });
    expect(callCount).toBe(1);
    resolvePromise!();
  });

  it("displays API error inside the dialog", async () => {
    vi.mocked(api).mockRejectedValue(new Error("Timer conflict."));
    render(<TimerCorrectionDialog {...defaultProps} />);
    const duration = durationInput();
    const reason = reasonInput();
    fireEvent.change(duration, { target: { value: "1800" } });
    fireEvent.change(reason, { target: { value: "Attempted correction" } });
    fireEvent.submit(form());
    await waitFor(() => {
      expect(screen.getByText("Timer conflict.")).toBeInTheDocument();
    });
  });

  it("remains open after API failure", async () => {
    vi.mocked(api).mockRejectedValue(new Error("Server error"));
    render(<TimerCorrectionDialog {...defaultProps} />);
    const duration = durationInput();
    const reason = reasonInput();
    fireEvent.change(duration, { target: { value: "1800" } });
    fireEvent.change(reason, { target: { value: "Will fail" } });
    fireEvent.submit(form());
    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeInTheDocument();
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("clears error when resubmitting after failure", async () => {
    vi.mocked(api).mockRejectedValueOnce(new Error("First failure"));
    vi.mocked(api).mockResolvedValueOnce({ success: true, data: {} });
    render(<TimerCorrectionDialog {...defaultProps} />);
    const duration = durationInput();
    const reason = reasonInput();
    fireEvent.change(duration, { target: { value: "1800" } });
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

  it("has minLength and maxLength on the reason field", () => {
    render(<TimerCorrectionDialog {...defaultProps} />);
    const textarea = reasonInput();
    expect(textarea).toHaveAttribute("minLength", "5");
    expect(textarea).toHaveAttribute("maxLength", "500");
    expect(textarea).toHaveAttribute("required");
  });

  it("has step=1 on the duration input", () => {
    render(<TimerCorrectionDialog {...defaultProps} />);
    expect(durationInput()).toHaveAttribute("step", "1");
  });

  it("has min=0 on the duration input", () => {
    render(<TimerCorrectionDialog {...defaultProps} />);
    expect(durationInput()).toHaveAttribute("min", "0");
  });

  it("has required on the duration input", () => {
    render(<TimerCorrectionDialog {...defaultProps} />);
    expect(durationInput()).toHaveAttribute("required");
  });

  it("prefills duration input with current value", () => {
    render(<TimerCorrectionDialog {...defaultProps} currentActiveSeconds={2500} />);
    expect(durationInput()).toHaveValue(2500);
  });
});
