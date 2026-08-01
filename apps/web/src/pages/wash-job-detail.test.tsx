import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, ApiError } from "../lib/api";
import { liveTimer, PaymentDialog, TimerCorrectionDialog } from "./wash-job-detail";

vi.mock("../lib/api", () => {
  class ApiError extends Error {
    constructor(
      public readonly status: number,
      public readonly code: string,
      message: string,
      public readonly fields?: Readonly<Record<string, string>>,
    ) {
      super(message);
      this.name = "ApiError";
    }
  }
  return {
    api: vi.fn(),
    jsonBody: (value: unknown) => ({ body: JSON.stringify(value) }),
    ApiError,
  };
});

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

function mockJobData(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: "test-job-1",
    organization_id: "org-1",
    branch_id: "branch-1",
    job_reference: "WJ-2026-000001",
    customer_id: "customer-1",
    customer_name_snapshot: "Test Customer",
    customer_phone_snapshot: "+1234567890",
    vehicle_registration_snapshot: "ABC-123",
    primary_service_name_snapshot: "Full Wash",
    vehicle_id: "vehicle-1",
    assigned_user_id: "staff-1",
    assigned_user_name_snapshot: "Arun Kumar",
    assigned_user_full_name: "Arun Kumar",
    status: "WAITING",
    payment_status: "PENDING",
    subtotal_minor: 5000,
    total_amount_minor: 5000,
    paid_amount_minor: 0,
    balance_minor: 5000,
    tax_rate_basis_points: 0,
    total_active_seconds: 0,
    version: 1,
    created_at: "2026-07-28T10:00:00.000Z",
    items: [],
    locations: [],
    photos: [],
    ...overrides,
  };
}

function mockPageData(job: Record<string, unknown>) {
  vi.mocked(api).mockImplementation((path: string) => {
    if (path.startsWith("/wash-jobs/") && !path.includes("/timer")) {
      return Promise.resolve(job);
    }
    if (path.includes("/timer")) {
      return Promise.resolve({ events: [] });
    }
    if (path.includes("/payments/job")) {
      return Promise.resolve({ payments: [], refunds: [] });
    }
    return Promise.resolve([]);
  });
}

import WashJobDetailPage from "./wash-job-detail";

vi.mock("react-router-dom", () => ({
  useParams: () => ({ id: "test-job-1" }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

const { mockUseAuth } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(() => ({
    paymentDefaultMethod: "CASH",
    user: { id: "admin-1", role: "ADMIN", permissions: [] },
  })),
}));

vi.mock("../auth", () => ({
  useAuth: mockUseAuth,
}));

vi.mock("../components/toast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

describe("WashJobDetailPage — read-only assignment display", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders assigned staff name", async () => {
    mockPageData(mockJobData());
    render(<WashJobDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Arun Kumar")).toBeInTheDocument();
    });
  });

  it("displays 'Washed by' for completed jobs", async () => {
    mockPageData(mockJobData({ status: "COMPLETED" }));
    render(<WashJobDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Washed by")).toBeInTheDocument();
    });
  });

  it("displays 'Assigned staff' for waiting jobs", async () => {
    mockPageData(mockJobData({ status: "WAITING" }));
    render(<WashJobDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Assigned staff")).toBeInTheDocument();
    });
  });

  it("displays 'Assigned staff' for in-progress jobs", async () => {
    mockPageData(mockJobData({ status: "IN_PROGRESS" }));
    render(<WashJobDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Assigned staff")).toBeInTheDocument();
    });
  });

  it("displays 'Assigned staff' for paused jobs", async () => {
    mockPageData(mockJobData({ status: "PAUSED" }));
    render(<WashJobDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Assigned staff")).toBeInTheDocument();
    });
  });

  it("displays assigned staff for cancelled jobs", async () => {
    mockPageData(mockJobData({ status: "CANCELLED" }));
    render(<WashJobDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Assigned staff")).toBeInTheDocument();
    });
  });

  it("displays 'Assigned staff not recorded' when name is null", async () => {
    mockPageData(
      mockJobData({ assigned_user_full_name: null, assigned_user_id: null }),
    );
    render(<WashJobDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Assigned staff not recorded")).toBeInTheDocument();
    });
  });

  it("does not show 'Reassign to' label", async () => {
    mockPageData(mockJobData());
    render(<WashJobDetailPage />);
    await waitFor(() => {
      expect(screen.queryByText(/reassign/i)).not.toBeInTheDocument();
    });
  });

  it("does not show assignment dropdown", async () => {
    mockPageData(mockJobData());
    render(<WashJobDetailPage />);
    await waitFor(() => {
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    });
  });

  it("does not show 'Save assignment' button", async () => {
    mockPageData(mockJobData());
    render(<WashJobDetailPage />);
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /save assignment/i }),
      ).not.toBeInTheDocument();
    });
  });

  it("displays snapshot-based name from detail endpoint", async () => {
    mockPageData(
      mockJobData({
        assigned_user_name_snapshot: "Historical Name",
        assigned_user_full_name: "Historical Name",
      }),
    );
    render(<WashJobDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Historical Name")).toBeInTheDocument();
    });
  });
});

let uuidSeq = 0;

function defaultRecord(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: "job-123",
    balance_minor: 50000,
    paid_amount_minor: 0,
    payment_status: "PENDING",
    billing_locked_at: undefined,
    version: 1,
    customer_id: "customer-1",
    appliedBenefits: undefined,
    coupon_discount_minor: 0,
    referral_discount_minor: 0,
    reward_discount_minor: 0,
    manual_discount_minor: 0,
    total_amount_minor: 50000,
    subtotal_minor: 50000,
    tax_rate_basis_points: 0,
    job_reference: "WJ-001",
    customer_name_snapshot: "Test",
    customer_phone_snapshot: "",
    vehicle_registration_snapshot: "",
    primary_service_name_snapshot: "",
    status: "COMPLETED",
    total_active_seconds: 0,
    created_at: "2026-01-01T00:00:00Z",
    items: [],
    locations: [],
    photos: [],
    tax_minor: 0,
    rounding_minor: 0,
    ...overrides,
  };
}

describe("PaymentDialog", () => {
  function renderDialog(recordOverrides: Partial<Record<string, unknown>> = {}) {
    const onClose = vi.fn();
    const onDone = vi.fn();
    const record = defaultRecord(recordOverrides);
    render(<PaymentDialog
      record={record as any}
      onClose={onClose}
      onDone={onDone}
      open={recordOverrides.open !== false}
    />);
    return { onClose, onDone, record };
  }

  function dialogEl() { return screen.getByRole("dialog"); }
  function formEl() { return dialogEl().querySelector("form")!; }
  function amountInput() { return formEl().querySelector('input[name="amount"]') as HTMLInputElement; }

  beforeEach(() => {
    vi.clearAllMocks();
    uuidSeq = 0;
    vi.mocked(api).mockImplementation((path: string) => {
      if (typeof path === "string" && path.includes("/rewards")) return Promise.resolve([]);
      return Promise.resolve({ success: true, data: {} });
    });
    try { vi.spyOn(crypto, "randomUUID").mockImplementation(() => `00000000-0000-0000-0000-${String(++uuidSeq).padStart(12, "0")}` as `${string}-${string}-${string}-${string}-${string}`); } catch { /* ignore */ }
  });

  afterEach(() => { cleanup(); });

  it("renders with Record payment title", () => {
    renderDialog();
    expect(screen.getByRole("heading", { name: "Record payment" })).toBeInTheDocument();
  });

  it("displays the balance as money", () => {
    renderDialog({ balance_minor: 12345 });
    expect(screen.getByText("Remaining balance")).toBeInTheDocument();
  });

  it("sets amount input max to balance / 100", () => {
    renderDialog({ balance_minor: 50000 });
    expect(amountInput()).toHaveAttribute("max", "500.00");
  });

  it("renders method cards for all canonical methods", () => {
    renderDialog();
    expect(screen.getByRole("radio", { name: "Cash" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "UPI" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Bank UPI" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Paytm" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /method/i })).not.toBeInTheDocument();
  });

  it("renders transaction reference input", () => {
    renderDialog();
    expect(screen.getByRole("textbox", { name: /transaction reference/i })).toBeInTheDocument();
  });

  it("renders notes textarea", () => {
    renderDialog();
    expect(screen.getByRole("textbox", { name: /notes/i })).toBeInTheDocument();
  });

  it("renders Cancel and Record payment buttons", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /record payment/i })).toBeInTheDocument();
  });

  it("calls onClose when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when scrim is clicked", () => {
    const { onClose } = renderDialog();
    fireEvent.click(screen.getByLabelText("Close dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when X is clicked", () => {
    const { onClose } = renderDialog();
    fireEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not render when closed", () => {
    renderDialog({ open: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("submits correct payment payload", async () => {
    vi.mocked(api).mockImplementation((path: string) => {
      if (typeof path === "string" && path.includes("/rewards")) return Promise.resolve([]);
      return Promise.resolve({ success: true, data: {} });
    });
    renderDialog({ balance_minor: 50000, id: "job-abc" });
    fireEvent.change(amountInput(), { target: { value: "200" } });
    fireEvent.submit(formEl());
    await waitFor(() => { expect(api).toHaveBeenCalled(); });
    const calls = vi.mocked(api).mock.calls;
    const payCall = calls.find(c => c[0] === "/payments");
    expect(payCall).toBeDefined();
    const body = JSON.parse(payCall![1]!.body as string);
    expect(body.amountMinor).toBe(20000);
    expect(body.washJobId).toBe("job-abc");
    expect(body.method).toBe("CASH");
    expect(body.idempotencyKey).toBeDefined();
  });

  it("sends selected method", async () => {
    vi.mocked(api).mockImplementation((path: string) => {
      if (typeof path === "string" && path.includes("/rewards")) return Promise.resolve([]);
      return Promise.resolve({ success: true, data: {} });
    });
    renderDialog();
    fireEvent.change(amountInput(), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("radio", { name: "UPI" }));
    fireEvent.submit(formEl());
    await waitFor(() => { expect(api).toHaveBeenCalled(); });
    const calls = vi.mocked(api).mock.calls;
    const payCall = calls.find(c => c[0] === "/payments");
    expect(payCall).toBeDefined();
    expect(JSON.parse(payCall![1]!.body as string).method).toBe("UPI");
  });

  it("preselects the auth default payment method", () => {
    vi.mocked(mockUseAuth).mockReturnValue({
      paymentDefaultMethod: "PAYTM",
      user: { id: "admin-1", role: "ADMIN", permissions: [] },
    });
    renderDialog();
    expect(screen.getByRole("radio", { name: "Paytm" })).toBeChecked();
    vi.mocked(mockUseAuth).mockReturnValue({
      paymentDefaultMethod: "CASH",
      user: { id: "admin-1", role: "ADMIN", permissions: [] },
    });
  });

  it("falls back to Cash when the auth default is a legacy method", () => {
    vi.mocked(mockUseAuth).mockReturnValue({
      paymentDefaultMethod: "CARD",
      user: { id: "admin-1", role: "ADMIN", permissions: [] },
    });
    renderDialog();
    expect(screen.getByRole("radio", { name: "Cash" })).toBeChecked();
    vi.mocked(mockUseAuth).mockReturnValue({
      paymentDefaultMethod: "CASH",
      user: { id: "admin-1", role: "ADMIN", permissions: [] },
    });
  });

  it("sends transaction reference", async () => {
    vi.mocked(api).mockImplementation((path: string) => {
      if (typeof path === "string" && path.includes("/rewards")) return Promise.resolve([]);
      return Promise.resolve({ success: true, data: {} });
    });
    renderDialog();
    fireEvent.change(amountInput(), { target: { value: "100" } });
    fireEvent.change(screen.getByRole("textbox", { name: /transaction reference/i }), { target: { value: "TXN-001" } });
    fireEvent.submit(formEl());
    await waitFor(() => { expect(api).toHaveBeenCalled(); });
    const calls = vi.mocked(api).mock.calls;
    const payCall = calls.find(c => c[0] === "/payments");
    expect(payCall).toBeDefined();
    expect(JSON.parse(payCall![1]!.body as string).transactionReference).toBe("TXN-001");
  });

  it("sends notes", async () => {
    vi.mocked(api).mockImplementation((path: string) => {
      if (typeof path === "string" && path.includes("/rewards")) return Promise.resolve([]);
      return Promise.resolve({ success: true, data: {} });
    });
    renderDialog();
    fireEvent.change(amountInput(), { target: { value: "100" } });
    fireEvent.change(screen.getByRole("textbox", { name: /notes/i }), { target: { value: "Test note" } });
    fireEvent.submit(formEl());
    await waitFor(() => { expect(api).toHaveBeenCalled(); });
    const calls = vi.mocked(api).mock.calls;
    const payCall = calls.find(c => c[0] === "/payments");
    expect(payCall).toBeDefined();
    expect(JSON.parse(payCall![1]!.body as string).notes).toBe("Test note");
  });

  it("omits notes when empty", async () => {
    vi.mocked(api).mockImplementation((path: string) => {
      if (typeof path === "string" && path.includes("/rewards")) return Promise.resolve([]);
      return Promise.resolve({ success: true, data: {} });
    });
    renderDialog();
    fireEvent.change(amountInput(), { target: { value: "100" } });
    fireEvent.submit(formEl());
    await waitFor(() => { expect(api).toHaveBeenCalled(); });
    const calls = vi.mocked(api).mock.calls;
    const payCall = calls.find(c => c[0] === "/payments");
    expect(payCall).toBeDefined();
    expect(JSON.parse(payCall![1]!.body as string).notes).toBeUndefined();
  });

  it("calls onDone on successful submission", async () => {
    vi.mocked(api).mockImplementation((path: string) => {
      if (typeof path === "string" && path.includes("/rewards")) return Promise.resolve([]);
      return Promise.resolve({ success: true, data: {} });
    });
    const { onDone } = renderDialog();
    fireEvent.change(amountInput(), { target: { value: "100" } });
    fireEvent.submit(formEl());
    await waitFor(() => { expect(onDone).toHaveBeenCalledTimes(1); });
  });

  it("shows error on API failure", async () => {
    vi.mocked(api).mockImplementation((path: string) => {
      if (typeof path === "string" && path.includes("/rewards")) return Promise.resolve([]);
      return Promise.reject(new Error("Insufficient balance"));
    });
    renderDialog();
    fireEvent.change(amountInput(), { target: { value: "100" } });
    fireEvent.submit(formEl());
    await waitFor(() => { expect(screen.getByText("Insufficient balance")).toBeInTheDocument(); });
  });

  it("does not call onDone on API failure", async () => {
    vi.mocked(api).mockImplementation((path: string) => {
      if (typeof path === "string" && path.includes("/rewards")) return Promise.resolve([]);
      return Promise.reject(new Error("Server error"));
    });
    const { onDone, onClose } = renderDialog();
    fireEvent.change(amountInput(), { target: { value: "100" } });
    fireEvent.submit(formEl());
    await waitFor(() => { expect(screen.getByText(/Server error/)).toBeInTheDocument(); });
    expect(onDone).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("disables submit button while busy", async () => {
    let resolve!: () => void;
    vi.mocked(api).mockImplementation((path: string) => {
      if (typeof path === "string" && path.includes("/rewards")) return Promise.resolve([]);
      return new Promise(r => { resolve = () => r({ success: true, data: {} }); });
    });
    renderDialog();
    fireEvent.change(amountInput(), { target: { value: "100" } });
    fireEvent.submit(formEl());
    await waitFor(() => { expect(screen.getByRole("button", { name: /record payment/i })).toBeDisabled(); });
    resolve!();
  });

  it("idempotency key uses crypto.randomUUID", async () => {
    vi.mocked(api).mockImplementation((path: string) => {
      if (typeof path === "string" && path.includes("/rewards")) return Promise.resolve([]);
      return Promise.resolve({ success: true, data: {} });
    });
    renderDialog();
    fireEvent.change(amountInput(), { target: { value: "100" } });
    fireEvent.submit(formEl());
    await waitFor(() => { expect(api).toHaveBeenCalled(); });
    const calls = vi.mocked(api).mock.calls;
    const payCall = calls.find(c => c[0] === "/payments");
    expect(payCall).toBeDefined();
    expect(JSON.parse(payCall![1]!.body as string).idempotencyKey).toBeDefined();
  });

  it("reuses idempotency key for identical payload", async () => {
    vi.mocked(api).mockImplementation((path: string) => {
      if (typeof path === "string" && path.includes("/rewards")) return Promise.resolve([]);
      return Promise.reject(new Error("Conflict"));
    });
    const { onDone } = renderDialog();
    fireEvent.change(amountInput(), { target: { value: "100" } });
    fireEvent.submit(formEl());
    await waitFor(() => { expect(screen.getByText("Conflict")).toBeInTheDocument(); });
    const calls1 = vi.mocked(api).mock.calls;
    const payCall1 = calls1.find(c => c[0] === "/payments");
    expect(payCall1).toBeDefined();
    const firstKey = JSON.parse(payCall1![1]!.body as string).idempotencyKey;
    vi.mocked(api).mockImplementation((path: string) => {
      if (typeof path === "string" && path.includes("/rewards")) return Promise.resolve([]);
      return Promise.resolve({ success: true, data: {} });
    });
    fireEvent.submit(formEl());
    await waitFor(() => { expect(onDone).toHaveBeenCalled(); });
    const calls2 = vi.mocked(api).mock.calls;
    const payCall2 = calls2.slice().reverse().find(c => c[0] === "/payments");
    expect(payCall2).toBeDefined();
    const secondKey = JSON.parse(payCall2![1]!.body as string).idempotencyKey;
    expect(firstKey).toBe(secondKey);
  });

  it("clears error on resubmit", async () => {
    let called = 0;
    vi.mocked(api).mockImplementation((path: string) => {
      if (typeof path === "string" && path.includes("/rewards")) return Promise.resolve([]);
      called++;
      if (called === 1) return Promise.reject(new Error("First error"));
      return Promise.resolve({ success: true, data: {} });
    });
    renderDialog();
    fireEvent.change(amountInput(), { target: { value: "100" } });
    fireEvent.submit(formEl());
    await waitFor(() => { expect(screen.getByText("First error")).toBeInTheDocument(); });
    fireEvent.submit(formEl());
    await waitFor(() => { expect(screen.queryByText("First error")).not.toBeInTheDocument(); });
  });

  it("amount input defaults to balance", () => {
    renderDialog({ balance_minor: 50000 });
    expect(amountInput()).toHaveValue(500);
  });

  it("submits with amount 0 when input is empty", async () => {
    vi.mocked(api).mockImplementation((path: string) => {
      if (typeof path === "string" && path.includes("/rewards")) return Promise.resolve([]);
      return Promise.resolve({ success: true, data: {} });
    });
    renderDialog();
    fireEvent.change(amountInput(), { target: { value: "" } });
    fireEvent.submit(formEl());
    await waitFor(() => { expect(api).toHaveBeenCalled(); });
    const calls = vi.mocked(api).mock.calls;
    const payCall = calls.find(c => c[0] === "/payments");
    expect(payCall).toBeDefined();
      expect(JSON.parse(payCall![1]!.body as string).amountMinor).toBe(0);
  });
});

describe("PaymentDialog — benefits regression", () => {
  const unlockedRecord = {
    id: "job-1",
    job_reference: "WJ-001",
    customer_name_snapshot: "Test",
    customer_phone_snapshot: "123",
    vehicle_registration_snapshot: "KL01",
    primary_service_name_snapshot: "Wash",
    status: "COMPLETED",
    payment_status: "PENDING",
    total_amount_minor: 50000,
    paid_amount_minor: 0,
    balance_minor: 50000,
    total_active_seconds: 0,
    version: 1,
    created_at: new Date().toISOString(),
    subtotal_minor: 50000,
    coupon_discount_minor: 0,
    referral_discount_minor: 0,
    reward_discount_minor: 0,
    manual_discount_minor: 0,
    manual_discount_reason: null,
    tax_minor: 0,
    rounding_minor: 0,
    billing_locked_at: null,
    customer_id: "c1",
    appliedBenefits: {
      coupon: null,
      referral: null,
      reward: null,
      manualDiscount: null,
    },
    items: [],
    locations: [],
    photos: [],
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api).mockImplementation((path: string) => {
      if (typeof path === "string" && path.includes("/rewards")) return Promise.resolve([]);
      return Promise.resolve({ success: true, data: {} });
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders Benefits and rewards section when billing is unlocked", async () => {
    render(
      <PaymentDialog
        record={unlockedRecord}
        onClose={vi.fn()}
        onDone={vi.fn()}
        open={true}
      />,
    );
    expect(screen.getByText("Benefits and rewards")).toBeTruthy();
  });

  it("renders coupon code field when unlocked", async () => {
    render(
      <PaymentDialog
        record={unlockedRecord}
        onClose={vi.fn()}
        onDone={vi.fn()}
        open={true}
      />,
    );
    expect(screen.getByText("Coupon code")).toBeTruthy();
  });

  it("renders referral code field when unlocked", async () => {
    render(
      <PaymentDialog
        record={unlockedRecord}
        onClose={vi.fn()}
        onDone={vi.fn()}
        open={true}
      />,
    );
    expect(screen.getByText("Referral code")).toBeTruthy();
  });

  it("renders reward selector when unlocked", async () => {
    render(
      <PaymentDialog
        record={unlockedRecord}
        onClose={vi.fn()}
        onDone={vi.fn()}
        open={true}
      />,
    );
    expect(screen.getByText("Available reward")).toBeTruthy();
  });

  it("both coupon and referral fields can be filled simultaneously", async () => {
    render(
      <PaymentDialog
        record={unlockedRecord}
        onClose={vi.fn()}
        onDone={vi.fn()}
        open={true}
      />,
    );
    const couponInput = screen.getAllByPlaceholderText("Optional")[0] as HTMLInputElement;
    const referralInput = screen.getAllByPlaceholderText("Optional")[1] as HTMLInputElement;
    await userEvent.setup().type(couponInput, "WELCOME10");
    await userEvent.setup().type(referralInput, "RAVI500");
    expect(couponInput).toHaveValue("WELCOME10");
    expect(referralInput).toHaveValue("RAVI500");
  });

  it("no stacking-disabled warning rendered", async () => {
    render(
      <PaymentDialog
        record={unlockedRecord}
        onClose={vi.fn()}
        onDone={vi.fn()}
        open={true}
      />,
    );
    expect(screen.queryByText("Coupon and referral stacking is disabled.")).toBeNull();
  });

  it("verify benefits sends both codes", async () => {
    let verifyPayload: unknown = null;
    vi.mocked(api).mockImplementation((path: string, _init?: RequestInit) => {
      if (typeof path === "string" && path.includes("/verify-benefits")) {
        verifyPayload = _init?.body ? JSON.parse(_init.body as string) : null;
        return Promise.resolve({
          requested: { couponCode: "WELCOME10", referralCode: "RAVI500", manualDiscountMinor: 0 },
          revised: { couponDiscountMinor: 1000, referralDiscountMinor: 1000, totalDiscountMinor: 2000, totalAmountMinor: 48000, revisedRemainingBalanceMinor: 48000 },
          applied: { coupon: { code: "WELCOME10", discountMinor: 1000 }, referral: { code: "RAVI500", discountMinor: 1000 }, reward: null, manualDiscount: null },
          original: {},
          normalizedBenefits: { couponCode: "WELCOME10", referralCode: "RAVI500", manualDiscountMinor: 0 },
        } as any);
      }
      if (typeof path === "string" && path.includes("/rewards")) return Promise.resolve([]);
      return Promise.resolve({ success: true, data: {} });
    });
    render(
      <PaymentDialog
        record={unlockedRecord}
        onClose={vi.fn()}
        onDone={vi.fn()}
        open={true}
      />,
    );
    const couponInput = screen.getAllByPlaceholderText("Optional")[0] as HTMLInputElement;
    const referralInput = screen.getAllByPlaceholderText("Optional")[1] as HTMLInputElement;
    await userEvent.setup().type(couponInput, "WELCOME10");
    await userEvent.setup().type(referralInput, "RAVI500");
    const verifyBtn = screen.getByRole("button", { name: /verify benefits/i });
    await userEvent.setup().click(verifyBtn);
    await waitFor(() => {
      expect(verifyPayload).not.toBeNull();
    });
    const benefits = (verifyPayload as any).benefits;
    expect(benefits.couponCode).toBe("WELCOME10");
    expect(benefits.referralCode).toBe("RAVI500");
  });

  it("both verified discounts appear in preview", async () => {
    vi.mocked(api).mockImplementation((path: string, _init?: RequestInit) => {
      if (typeof path === "string" && path.includes("/verify-benefits")) {
        return Promise.resolve({
          requested: { couponCode: "WELCOME10", referralCode: "RAVI500", manualDiscountMinor: 0 },
          revised: { couponDiscountMinor: 1000, referralDiscountMinor: 1000, totalDiscountMinor: 2000, totalAmountMinor: 48000, revisedRemainingBalanceMinor: 48000 },
          applied: { coupon: { code: "WELCOME10", discountMinor: 1000 }, referral: { code: "RAVI500", discountMinor: 1000 }, reward: null, manualDiscount: null },
          original: {},
          normalizedBenefits: { couponCode: "WELCOME10", referralCode: "RAVI500", manualDiscountMinor: 0 },
        } as any);
      }
      if (typeof path === "string" && path.includes("/rewards")) return Promise.resolve([]);
      return Promise.resolve({ success: true, data: {} });
    });
    render(
      <PaymentDialog
        record={unlockedRecord}
        onClose={vi.fn()}
        onDone={vi.fn()}
        open={true}
      />,
    );
    const couponInput = screen.getAllByPlaceholderText("Optional")[0] as HTMLInputElement;
    const referralInput = screen.getAllByPlaceholderText("Optional")[1] as HTMLInputElement;
    await userEvent.setup().type(couponInput, "WELCOME10");
    await userEvent.setup().type(referralInput, "RAVI500");
    await userEvent.setup().click(screen.getByRole("button", { name: /verify benefits/i }));
    await waitFor(() => {
      expect(screen.getByText(/Coupon discount/i)).toBeTruthy();
      expect(screen.getByText(/Referral discount/i)).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.getByText(/Remaining balance/i).nextElementSibling?.textContent).toBe("₹480.00");
    });
  });

  it("editing either code marks verification stale", async () => {
    vi.mocked(api).mockImplementation((path: string, _init?: RequestInit) => {
      if (typeof path === "string" && path.includes("/verify-benefits")) {
        return Promise.resolve({
          requested: { couponCode: "WELCOME10", referralCode: "RAVI500", manualDiscountMinor: 0 },
          revised: { couponDiscountMinor: 1000, referralDiscountMinor: 1000, totalDiscountMinor: 2000, totalAmountMinor: 48000, revisedRemainingBalanceMinor: 48000 },
          applied: { coupon: { code: "WELCOME10", discountMinor: 1000 }, referral: { code: "RAVI500", discountMinor: 1000 }, reward: null, manualDiscount: null },
          original: {},
          normalizedBenefits: { couponCode: "WELCOME10", referralCode: "RAVI500", manualDiscountMinor: 0 },
        } as any);
      }
      if (typeof path === "string" && path.includes("/rewards")) return Promise.resolve([]);
      return Promise.resolve({ success: true, data: {} });
    });
    render(
      <PaymentDialog
        record={unlockedRecord}
        onClose={vi.fn()}
        onDone={vi.fn()}
        open={true}
      />,
    );
    const couponInput = screen.getAllByPlaceholderText("Optional")[0] as HTMLInputElement;
    const referralInput = screen.getAllByPlaceholderText("Optional")[1] as HTMLInputElement;
    // Verify both codes
    await userEvent.setup().type(couponInput, "WELCOME10");
    await userEvent.setup().type(referralInput, "RAVI500");
    await userEvent.setup().click(screen.getByRole("button", { name: /verify benefits/i }));
    await waitFor(() => {
      expect(screen.getByText(/coupon discount/i)).toBeTruthy();
    });
    // Edit coupon code
    await userEvent.setup().clear(couponInput);
    await userEvent.setup().type(couponInput, "NEWCODE");
    await waitFor(() => {
      expect(screen.getByText(/Changed — verify again/i)).toBeTruthy();
    });
  });

  it("coupon-only verification still succeeds", async () => {
    vi.mocked(api).mockImplementation((path: string, _init?: RequestInit) => {
      if (typeof path === "string" && path.includes("/verify-benefits")) {
        return Promise.resolve({
          requested: { couponCode: "WELCOME10", manualDiscountMinor: 0 },
          revised: { couponDiscountMinor: 1000, referralDiscountMinor: 0, totalDiscountMinor: 1000, totalAmountMinor: 49000, revisedRemainingBalanceMinor: 49000 },
          applied: { coupon: { code: "WELCOME10", discountMinor: 1000 }, referral: null, reward: null, manualDiscount: null },
          original: {},
          normalizedBenefits: { couponCode: "WELCOME10", manualDiscountMinor: 0 },
        } as any);
      }
      if (typeof path === "string" && path.includes("/rewards")) return Promise.resolve([]);
      return Promise.resolve({ success: true, data: {} });
    });
    render(
      <PaymentDialog
        record={unlockedRecord}
        onClose={vi.fn()}
        onDone={vi.fn()}
        open={true}
      />,
    );
    const couponInput = screen.getAllByPlaceholderText("Optional")[0] as HTMLInputElement;
    await userEvent.setup().type(couponInput, "WELCOME10");
    await userEvent.setup().click(screen.getByRole("button", { name: /verify benefits/i }));
    await waitFor(() => {
      expect(screen.getByText(/Coupon discount/i)).toBeTruthy();
    });
  });

  it("referral-only verification still succeeds", async () => {
    vi.mocked(api).mockImplementation((path: string, _init?: RequestInit) => {
      if (typeof path === "string" && path.includes("/verify-benefits")) {
        return Promise.resolve({
          requested: { referralCode: "RAVI500", manualDiscountMinor: 0 },
          revised: { couponDiscountMinor: 0, referralDiscountMinor: 1000, totalDiscountMinor: 1000, totalAmountMinor: 49000, revisedRemainingBalanceMinor: 49000 },
          applied: { coupon: null, referral: { code: "RAVI500", discountMinor: 1000 }, reward: null, manualDiscount: null },
          original: {},
          normalizedBenefits: { referralCode: "RAVI500", manualDiscountMinor: 0 },
        } as any);
      }
      if (typeof path === "string" && path.includes("/rewards")) return Promise.resolve([]);
      return Promise.resolve({ success: true, data: {} });
    });
    render(
      <PaymentDialog
        record={unlockedRecord}
        onClose={vi.fn()}
        onDone={vi.fn()}
        open={true}
      />,
    );
    const referralInput = screen.getAllByPlaceholderText("Optional")[1] as HTMLInputElement;
    await userEvent.setup().type(referralInput, "RAVI500");
    await userEvent.setup().click(screen.getByRole("button", { name: /verify benefits/i }));
    await waitFor(() => {
      expect(screen.getByText(/Referral discount/i)).toBeTruthy();
    });
  });

  it("field-specific coupon error renders", async () => {
    vi.mocked(api).mockImplementation((path: string, _init?: RequestInit) => {
      if (typeof path === "string" && path.includes("/verify-benefits")) {
        throw new ApiError(422, "COUPON_INVALID", "The coupon is not eligible.", { "benefits.couponCode": "The coupon code is invalid." });
      }
      if (typeof path === "string" && path.includes("/rewards")) return Promise.resolve([]);
      return Promise.resolve({ success: true, data: {} });
    });
    render(
      <PaymentDialog
        record={unlockedRecord}
        onClose={vi.fn()}
        onDone={vi.fn()}
        open={true}
      />,
    );
    const couponInput = screen.getAllByPlaceholderText("Optional")[0] as HTMLInputElement;
    await userEvent.setup().type(couponInput, "INVALID");
    await userEvent.setup().click(screen.getByRole("button", { name: /verify benefits/i }));
    await waitFor(() => {
      expect(screen.getByText(/The coupon code is invalid/)).toBeTruthy();
    });
  });

  it("field-specific referral error renders", async () => {
    vi.mocked(api).mockImplementation((path: string, _init?: RequestInit) => {
      if (typeof path === "string" && path.includes("/verify-benefits")) {
        throw new ApiError(422, "REFERRAL_INVALID", "The referral is not eligible.", { "benefits.referralCode": "The referral code is invalid." });
      }
      if (typeof path === "string" && path.includes("/rewards")) return Promise.resolve([]);
      return Promise.resolve({ success: true, data: {} });
    });
    render(
      <PaymentDialog
        record={unlockedRecord}
        onClose={vi.fn()}
        onDone={vi.fn()}
        open={true}
      />,
    );
    const referralInput = screen.getAllByPlaceholderText("Optional")[1] as HTMLInputElement;
    await userEvent.setup().type(referralInput, "INVALID");
    await userEvent.setup().click(screen.getByRole("button", { name: /verify benefits/i }));
    await waitFor(() => {
      expect(screen.getByText(/The referral code is invalid/)).toBeTruthy();
    });
  });

  it("verifying a coupon updates remaining balance and amount", async () => {
    vi.mocked(api).mockImplementation((path: string, _init?: RequestInit) => {
      if (typeof path === "string" && path.includes("/verify-benefits")) {
        return Promise.resolve({
          requested: { couponCode: "WELCOME10", manualDiscountMinor: 0 },
          revised: { couponDiscountMinor: 1000, referralDiscountMinor: 0, totalDiscountMinor: 1000, totalAmountMinor: 49000, revisedRemainingBalanceMinor: 49000 },
          applied: { coupon: { code: "WELCOME10", discountMinor: 1000 }, referral: null, reward: null, manualDiscount: null },
          original: {},
          normalizedBenefits: { couponCode: "WELCOME10", manualDiscountMinor: 0 },
        } as any);
      }
      if (typeof path === "string" && path.includes("/rewards")) return Promise.resolve([]);
      return Promise.resolve({ success: true, data: {} });
    });
    render(
      <PaymentDialog record={unlockedRecord} onClose={vi.fn()} onDone={vi.fn()} open={true} />,
    );
    const couponInput = screen.getAllByPlaceholderText("Optional")[0] as HTMLInputElement;
    expect(screen.getByText("₹500.00")).toBeInTheDocument();
    expect(document.querySelector('input[name="amount"]')).toHaveValue(500);
    await userEvent.setup().type(couponInput, "WELCOME10");
    await userEvent.setup().click(screen.getByRole("button", { name: /verify benefits/i }));
    await waitFor(() => {
      expect(document.querySelector('.payment-due')?.textContent).toContain("₹490.00");
      expect(document.querySelector('input[name="amount"]')).toHaveValue(490);
    });
  });

  it("amount greater than revised balance is rejected on submit", async () => {
    vi.mocked(api).mockImplementation((path: string, _init?: RequestInit) => {
      if (typeof path === "string" && path.includes("/verify-benefits")) {
        return Promise.resolve({
          requested: { couponCode: "WELCOME10", manualDiscountMinor: 0 },
          revised: { couponDiscountMinor: 1000, totalDiscountMinor: 1000, totalAmountMinor: 49000, revisedRemainingBalanceMinor: 49000 },
          applied: { coupon: { code: "WELCOME10", discountMinor: 1000 }, referral: null, reward: null, manualDiscount: null },
          original: {},
          normalizedBenefits: { couponCode: "WELCOME10", manualDiscountMinor: 0 },
        } as any);
      }
      if (typeof path === "string" && path.includes("/rewards")) return Promise.resolve([]);
      return Promise.resolve({ success: true, data: {} });
    });
    render(
      <PaymentDialog record={unlockedRecord} onClose={vi.fn()} onDone={vi.fn()} open={true} />,
    );
    const couponInput = screen.getAllByPlaceholderText("Optional")[0] as HTMLInputElement;
    await userEvent.setup().type(couponInput, "WELCOME10");
    await userEvent.setup().click(screen.getByRole("button", { name: /verify benefits/i }));
    await waitFor(() => {
      expect(document.querySelector('.payment-due')?.textContent).toContain("₹490.00");
    });
    const amountInp = document.querySelector('input[name="amount"]') as HTMLInputElement;
    await userEvent.setup().clear(amountInp);
    await userEvent.setup().type(amountInp, "500");
    const form = document.querySelector("form")!;
    fireEvent.submit(form);
    await waitFor(() => {
      expect(screen.getByText(/Amount cannot exceed ₹490\.00/)).toBeInTheDocument();
    });
  });

  it("changing coupon after verification restores original balance and invalidates", async () => {
    vi.mocked(api).mockImplementation((path: string, _init?: RequestInit) => {
      if (typeof path === "string" && path.includes("/verify-benefits")) {
        return Promise.resolve({
          requested: { couponCode: "WELCOME10", manualDiscountMinor: 0 },
          revised: { couponDiscountMinor: 1000, totalDiscountMinor: 1000, totalAmountMinor: 49000, revisedRemainingBalanceMinor: 49000 },
          applied: { coupon: { code: "WELCOME10", discountMinor: 1000 }, referral: null, reward: null, manualDiscount: null },
          original: {},
          normalizedBenefits: { couponCode: "WELCOME10", manualDiscountMinor: 0 },
        } as any);
      }
      if (typeof path === "string" && path.includes("/rewards")) return Promise.resolve([]);
      return Promise.resolve({ success: true, data: {} });
    });
    render(
      <PaymentDialog record={unlockedRecord} onClose={vi.fn()} onDone={vi.fn()} open={true} />,
    );
    const couponInput = screen.getAllByPlaceholderText("Optional")[0] as HTMLInputElement;
    await userEvent.setup().type(couponInput, "WELCOME10");
    await userEvent.setup().click(screen.getByRole("button", { name: /verify benefits/i }));
    await waitFor(() => {
      expect(document.querySelector('.payment-due')?.textContent).toContain("₹490.00");
    });
    await userEvent.setup().clear(couponInput);
    await userEvent.setup().type(couponInput, "NEWCODE");
    await waitFor(() => {
      expect(document.querySelector('.payment-due')?.textContent).toContain("₹500.00");
      expect(document.querySelector('input[name="amount"]')).toHaveValue(500);
      expect(screen.getByText(/Changed — verify again/i)).toBeTruthy();
    });
  });

  it("changing referral after verification invalidates and restores balance", async () => {
    vi.mocked(api).mockImplementation((path: string, _init?: RequestInit) => {
      if (typeof path === "string" && path.includes("/verify-benefits")) {
        return Promise.resolve({
          requested: { referralCode: "RAVI500", manualDiscountMinor: 0 },
          revised: { referralDiscountMinor: 1000, totalDiscountMinor: 1000, totalAmountMinor: 49000, revisedRemainingBalanceMinor: 49000 },
          applied: { coupon: null, referral: { code: "RAVI500", discountMinor: 1000 }, reward: null, manualDiscount: null },
          original: {},
          normalizedBenefits: { referralCode: "RAVI500", manualDiscountMinor: 0 },
        } as any);
      }
      if (typeof path === "string" && path.includes("/rewards")) return Promise.resolve([]);
      return Promise.resolve({ success: true, data: {} });
    });
    render(
      <PaymentDialog record={unlockedRecord} onClose={vi.fn()} onDone={vi.fn()} open={true} />,
    );
    const referralInput = screen.getAllByPlaceholderText("Optional")[1] as HTMLInputElement;
    await userEvent.setup().type(referralInput, "RAVI500");
    await userEvent.setup().click(screen.getByRole("button", { name: /verify benefits/i }));
    await waitFor(() => {
      expect(document.querySelector('.payment-due')?.textContent).toContain("₹490.00");
    });
    await userEvent.setup().clear(referralInput);
    await userEvent.setup().type(referralInput, "NEWREF");
    await waitFor(() => {
      expect(document.querySelector('.payment-due')?.textContent).toContain("₹500.00");
      expect(screen.getByText(/Changed — verify again/i)).toBeTruthy();
    });
  });

  it("stale benefits submission is blocked", async () => {
    vi.mocked(api).mockImplementation((path: string, _init?: RequestInit) => {
      if (typeof path === "string" && path.includes("/verify-benefits")) {
        return Promise.resolve({
          requested: { couponCode: "WELCOME10", manualDiscountMinor: 0 },
          revised: { couponDiscountMinor: 1000, totalDiscountMinor: 1000, totalAmountMinor: 49000, revisedRemainingBalanceMinor: 49000 },
          applied: { coupon: { code: "WELCOME10", discountMinor: 1000 }, referral: null, reward: null, manualDiscount: null },
          original: {},
          normalizedBenefits: { couponCode: "WELCOME10", manualDiscountMinor: 0 },
        } as any);
      }
      if (typeof path === "string" && path.includes("/rewards")) return Promise.resolve([]);
      return Promise.resolve({ success: true, data: {} });
    });
    render(
      <PaymentDialog record={unlockedRecord} onClose={vi.fn()} onDone={vi.fn()} open={true} />,
    );
    const couponInput = screen.getAllByPlaceholderText("Optional")[0] as HTMLInputElement;
    await userEvent.setup().type(couponInput, "WELCOME10");
    await userEvent.setup().click(screen.getByRole("button", { name: /verify benefits/i }));
    await waitFor(() => {
      expect(document.querySelector('.payment-due')?.textContent).toContain("₹490.00");
    });
    await userEvent.setup().clear(couponInput);
    await userEvent.setup().type(couponInput, "NEWCODE");
    const form = document.querySelector("form")!;
    fireEvent.submit(form);
    await waitFor(() => {
      expect(screen.getByText(/Benefits have changed/i)).toBeInTheDocument();
    });
  });

  it("re-verifying updates both fields with the new balance", async () => {
    let verifyCount = 0;
    vi.mocked(api).mockImplementation((path: string, _init?: RequestInit) => {
      if (typeof path === "string" && path.includes("/verify-benefits")) {
        verifyCount++;
        if (verifyCount === 1) {
          return Promise.resolve({
            requested: { couponCode: "WELCOME10", manualDiscountMinor: 0 },
            revised: { couponDiscountMinor: 1000, totalDiscountMinor: 1000, totalAmountMinor: 49000, revisedRemainingBalanceMinor: 49000 },
            applied: { coupon: { code: "WELCOME10", discountMinor: 1000 }, referral: null, reward: null, manualDiscount: null },
            original: {},
            normalizedBenefits: { couponCode: "WELCOME10", manualDiscountMinor: 0 },
          } as any);
        }
        return Promise.resolve({
          requested: { couponCode: "SUMMER20", manualDiscountMinor: 0 },
          revised: { couponDiscountMinor: 2000, totalDiscountMinor: 2000, totalAmountMinor: 48000, revisedRemainingBalanceMinor: 48000 },
          applied: { coupon: { code: "SUMMER20", discountMinor: 2000 }, referral: null, reward: null, manualDiscount: null },
          original: {},
          normalizedBenefits: { couponCode: "SUMMER20", manualDiscountMinor: 0 },
        } as any);
      }
      if (typeof path === "string" && path.includes("/rewards")) return Promise.resolve([]);
      return Promise.resolve({ success: true, data: {} });
    });
    render(
      <PaymentDialog record={unlockedRecord} onClose={vi.fn()} onDone={vi.fn()} open={true} />,
    );
    const couponInput = screen.getAllByPlaceholderText("Optional")[0] as HTMLInputElement;
    await userEvent.setup().type(couponInput, "WELCOME10");
    await userEvent.setup().click(screen.getByRole("button", { name: /verify benefits/i }));
    await waitFor(() => {
      expect(document.querySelector('.payment-due')?.textContent).toContain("₹490.00");
    });
    await userEvent.setup().clear(couponInput);
    await userEvent.setup().type(couponInput, "SUMMER20");
    await waitFor(() => {
      expect(document.querySelector('.payment-due')?.textContent).toContain("₹500.00");
    });
    await userEvent.setup().click(screen.getByRole("button", { name: /verify benefits/i }));
    await waitFor(() => {
      expect(document.querySelector('.payment-due')?.textContent).toContain("₹480.00");
      expect(document.querySelector('input[name="amount"]')).toHaveValue(480);
    });
  });

  it("payment request sends correct amountMinor after verification", async () => {
    let payPayload: unknown = null;
    vi.mocked(api).mockImplementation((path: string, _init?: RequestInit) => {
      if (typeof path === "string" && path.includes("/verify-benefits")) {
        return Promise.resolve({
          requested: { couponCode: "WELCOME10", manualDiscountMinor: 0 },
          revised: { couponDiscountMinor: 1000, totalDiscountMinor: 1000, totalAmountMinor: 49000, revisedRemainingBalanceMinor: 49000 },
          applied: { coupon: { code: "WELCOME10", discountMinor: 1000 }, referral: null, reward: null, manualDiscount: null },
          original: {},
          normalizedBenefits: { couponCode: "WELCOME10", manualDiscountMinor: 0 },
        } as any);
      }
      if (typeof path === "string" && path.includes("/payments")) {
        payPayload = _init?.body ? JSON.parse(_init.body as string) : null;
        return Promise.resolve({ success: true, data: {} });
      }
      if (typeof path === "string" && path.includes("/rewards")) return Promise.resolve([]);
      return Promise.resolve({ success: true, data: {} });
    });
    render(
      <PaymentDialog record={unlockedRecord} onClose={vi.fn()} onDone={vi.fn()} open={true} />,
    );
    const couponInput = screen.getAllByPlaceholderText("Optional")[0] as HTMLInputElement;
    await userEvent.setup().type(couponInput, "WELCOME10");
    await userEvent.setup().click(screen.getByRole("button", { name: /verify benefits/i }));
    await waitFor(() => {
      expect(document.querySelector('.payment-due')?.textContent).toContain("₹490.00");
    });
    const form = document.querySelector("form")!;
    fireEvent.submit(form);
    await waitFor(() => {
      expect(payPayload).not.toBeNull();
    });
    expect((payPayload as any).amountMinor).toBe(49000);
  });

  it("amount remains editable for partial payment after verification", async () => {
    let payPayload: unknown = null;
    vi.mocked(api).mockImplementation((path: string, _init?: RequestInit) => {
      if (typeof path === "string" && path.includes("/verify-benefits")) {
        return Promise.resolve({
          requested: { couponCode: "WELCOME10", manualDiscountMinor: 0 },
          revised: { couponDiscountMinor: 1000, totalDiscountMinor: 1000, totalAmountMinor: 49000, revisedRemainingBalanceMinor: 49000 },
          applied: { coupon: { code: "WELCOME10", discountMinor: 1000 }, referral: null, reward: null, manualDiscount: null },
          original: {},
          normalizedBenefits: { couponCode: "WELCOME10", manualDiscountMinor: 0 },
        } as any);
      }
      if (typeof path === "string" && path.includes("/payments")) {
        payPayload = _init?.body ? JSON.parse(_init.body as string) : null;
        return Promise.resolve({ success: true, data: {} });
      }
      if (typeof path === "string" && path.includes("/rewards")) return Promise.resolve([]);
      return Promise.resolve({ success: true, data: {} });
    });
    render(
      <PaymentDialog record={unlockedRecord} onClose={vi.fn()} onDone={vi.fn()} open={true} />,
    );
    const couponInput = screen.getAllByPlaceholderText("Optional")[0] as HTMLInputElement;
    await userEvent.setup().type(couponInput, "WELCOME10");
    await userEvent.setup().click(screen.getByRole("button", { name: /verify benefits/i }));
    await waitFor(() => {
      expect(document.querySelector('input[name="amount"]')).toHaveValue(490);
    });
    const amountInp = document.querySelector('input[name="amount"]') as HTMLInputElement;
    await userEvent.setup().clear(amountInp);
    await userEvent.setup().type(amountInp, "200");
    const form = document.querySelector("form")!;
    fireEvent.submit(form);
    await waitFor(() => {
      expect(payPayload).not.toBeNull();
    });
    expect((payPayload as any).amountMinor).toBe(20000);
  });
});
