import { type ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { RouteErrorBoundary } from "./App";

function BrokenChild(): ReactNode {
  throw new Error("Test crash: database connection failed");
}

let shouldFlake = true;
function FlakyChild(): ReactNode {
  if (shouldFlake) throw new Error("flaky boom");
  return <p>recovered-page</p>;
}

function renderBoundary(children: ReactNode) {
  return render(
    <MemoryRouter>
      <RouteErrorBoundary>{children}</RouteErrorBoundary>
    </MemoryRouter>,
  );
}

describe("RouteErrorBoundary", () => {
  beforeEach(() => {
    shouldFlake = true;
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders children normally when no error is thrown", () => {
    renderBoundary(
      <div>
        <p>healthy-page</p>
      </div>,
    );
    expect(screen.getByText("healthy-page")).toBeInTheDocument();
  });

  it("shows the friendly error page on a render error", () => {
    renderBoundary(<BrokenChild />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Something went wrong" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/We couldn’t load this page\. Try reloading it/),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("does not show the original oversized message or raw error details", () => {
    renderBoundary(<BrokenChild />);
    expect(
      screen.queryByText("Something went wrong while loading this page."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/database connection failed/),
    ).not.toBeInTheDocument();
  });

  it("renders recovery actions", () => {
    renderBoundary(<BrokenChild />);
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Go to dashboard" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to login" })).toBeInTheDocument();
  });

  it("renders without the main application layout", () => {
    renderBoundary(<BrokenChild />);
    expect(document.querySelector(".app-layout")).toBeNull();
    expect(document.querySelector(".sidebar")).toBeNull();
    expect(document.querySelector(".error-page")).not.toBeNull();
  });

  it("Try again resets the boundary and re-renders the children", async () => {
    const user = userEvent.setup();
    renderBoundary(<FlakyChild />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Something went wrong" }),
    ).toBeInTheDocument();
    shouldFlake = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("recovered-page")).toBeInTheDocument();
  });
});