import { type ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RouteErrorBoundary } from "./App";

function BrokenChild(): ReactNode {
  throw new Error("Test crash: database connection failed");
}

describe("RouteErrorBoundary", () => {
  it("shows friendly message and action buttons on error", () => {
    render(
      <RouteErrorBoundary>
        <BrokenChild />
      </RouteErrorBoundary>,
    );
    expect(screen.getAllByText("Something went wrong while loading this page.").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Reload").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Dashboard").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Login").length).toBeGreaterThanOrEqual(1);
  });

  it("shows error message in dev mode", () => {
    render(
      <RouteErrorBoundary>
        <BrokenChild />
      </RouteErrorBoundary>,
    );
    expect(screen.getAllByText("Test crash: database connection failed").length).toBeGreaterThanOrEqual(1);
  });
});
