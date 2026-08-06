import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { classifyRouteError, ErrorPage } from "./error-page";

const { reloadMock } = vi.hoisted(() => ({ reloadMock: vi.fn() }));
vi.mock("../lib/reload", () => ({ reloadCurrentPage: reloadMock }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    get: () => true,
  });
});

function renderErrorPage(
  error: Error | null,
  onRetry?: () => void,
  initialPath = "/cashier",
) {
  const page =
    onRetry === undefined ? (
      <ErrorPage error={error} />
    ) : (
      <ErrorPage error={error} onRetry={onRetry} />
    );
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={page} path={initialPath} />
        <Route element={<p>dashboard-page</p>} path="/dashboard" />
        <Route element={<p>login-page</p>} path="/login" />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ErrorPage", () => {
  it("renders the friendly heading and supporting text", () => {
    renderErrorPage(new Error("boom"));
    expect(
      screen.getByRole("heading", { level: 1, name: "Something went wrong" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/We couldn’t load this page\. Try reloading it/),
    ).toBeInTheDocument();
    expect(screen.getByText("We hit a problem")).toBeInTheDocument();
  });

  it("does not render the original oversized message", () => {
    renderErrorPage(new Error("boom"));
    expect(
      screen.queryByText("Something went wrong while loading this page."),
    ).not.toBeInTheDocument();
    expect(document.querySelector(".route-error")).toBeNull();
  });

  it("renders all three recovery actions", () => {
    renderErrorPage(new Error("boom"));
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Go to dashboard" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to login" })).toBeInTheDocument();
  });

  it("does not render duplicate recovery buttons", () => {
    renderErrorPage(new Error("boom"));
    expect(screen.getAllByRole("button", { name: "Try again" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Go to dashboard" })).toHaveLength(
      1,
    );
    expect(screen.getAllByRole("button", { name: "Go to login" })).toHaveLength(1);
  });

  it("invokes the retry callback without reloading for generic errors", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderErrorPage(new Error("boom"), onRetry);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it("reloads the page when no retry callback is provided", async () => {
    const user = userEvent.setup();
    renderErrorPage(new Error("boom"));
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it("navigates to the dashboard route", async () => {
    const user = userEvent.setup();
    renderErrorPage(new Error("boom"));
    await user.click(screen.getByRole("button", { name: "Go to dashboard" }));
    expect(screen.getByText("dashboard-page")).toBeInTheDocument();
  });

  it("navigates to the login route", async () => {
    const user = userEvent.setup();
    renderErrorPage(new Error("boom"));
    await user.click(screen.getByRole("button", { name: "Go to login" }));
    expect(screen.getByText("login-page")).toBeInTheDocument();
  });

  it("does not display sensitive error details or stack traces", () => {
    const crash = new Error("database connection failed at run.js:42:17");
    renderErrorPage(crash);
    expect(screen.queryByText(/database connection failed/)).not.toBeInTheDocument();
    expect(screen.queryByText(/run\.js/)).not.toBeInTheDocument();
    expect(screen.queryByText(/at /)).not.toBeInTheDocument();
  });

  it("renders without the main application layout", () => {
    renderErrorPage(new Error("boom"));
    expect(document.querySelector(".error-page")).not.toBeNull();
    expect(document.querySelector(".app-layout")).toBeNull();
    expect(document.querySelector(".sidebar")).toBeNull();
  });

  it("renders when no error object is supplied", () => {
    renderErrorPage(null);
    expect(
      screen.getByRole("heading", { level: 1, name: "Something went wrong" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/We couldn’t load this page\. Try reloading it/),
    ).toBeInTheDocument();
  });

  it("shows the chunk-loading message for a stale lazy chunk", () => {
    const chunk = new Error(
      "Failed to fetch dynamically imported module: /assets/payments-abc.js",
    );
    chunk.name = "TypeError";
    renderErrorPage(chunk);
    expect(
      screen.getByText(
        "A newer version of WashPro may be available. Reload the page to continue.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the offline message when disconnected", () => {
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      get: () => false,
    });
    renderErrorPage(new Error("boom"));
    expect(
      screen.getByText("You appear to be offline. Check your connection and try again."),
    ).toBeInTheDocument();
  });

  it("reloads the page for a chunk-loading error even when a retry callback exists", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const chunk = new Error("Importing a module script failed.");
    renderErrorPage(chunk, onRetry);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(reloadMock).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("announces the error and moves focus to the alert container", () => {
    renderErrorPage(new Error("boom"));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("tabindex", "-1");
    expect(alert).toHaveFocus();
    expect(alert).toHaveTextContent("Something went wrong");
  });

  it("marks the error icon and brand as decorative", () => {
    renderErrorPage(new Error("boom"));
    const card = document.querySelector(".error-page__card");
    expect(card?.querySelector(".error-page__mark")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(card?.querySelector(".brand__mark")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});

describe("classifyRouteError", () => {
  it("classifies webpack-style chunk errors", () => {
    const error = new Error("Loading chunk 12 failed.");
    error.name = "ChunkLoadError";
    expect(classifyRouteError(error)).toBe("chunk");
  });

  it("classifies vite-style dynamic import failures", () => {
    expect(
      classifyRouteError(
        new Error("Failed to fetch dynamically imported module: /assets/x.js"),
      ),
    ).toBe("chunk");
  });

  it("falls back to generic when online", () => {
    expect(classifyRouteError(new Error("something broke"))).toBe("generic");
  });

  it("falls back to generic when no error object is supplied", () => {
    expect(classifyRouteError(null)).toBe("generic");
  });
});