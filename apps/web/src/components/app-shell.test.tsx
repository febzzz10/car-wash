import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "./app-shell";

const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }));

vi.mock("../auth", () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: useAuthMock,
}));

const sharedPermissions = [
  "wash_jobs.create",
  "wash_jobs.read",
  "payments.create",
  "customers.read",
  "vehicles.read",
  "invoices.generate",
] as const;

type TestUser = {
  readonly branchId: string;
  readonly fullName: string;
  readonly id: string;
  readonly permissions: readonly string[];
  readonly role: "ADMIN" | "STAFF";
  readonly username: string;
};

const adminUser: TestUser = {
  branchId: "b1",
  fullName: "Febin Baiju",
  id: "u1",
  permissions: [...sharedPermissions],
  role: "ADMIN",
  username: "febin",
};

const staffUser: TestUser = {
  ...adminUser,
  permissions: [...sharedPermissions],
  role: "STAFF",
};

const logout = vi.fn();

afterEach(() => cleanup());

function renderShell(path: string, user: TestUser = adminUser) {
  useAuthMock.mockReturnValue({
    loading: false,
    logout,
    refresh: vi.fn(),
    user,
  });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppShell />} path="*" />
      </Routes>
    </MemoryRouter>,
  );
}

function sidebar(): HTMLElement {
  const element = document.querySelector(".app-sidebar");
  if (element === null) throw new Error("Sidebar not rendered");
  return element as HTMLElement;
}

function navigation(): HTMLElement {
  const element = document.querySelector(".app-sidebar__navigation");
  if (element === null) throw new Error("Sidebar navigation not rendered");
  return element as HTMLElement;
}

function linkInSidebar(name: string): HTMLElement {
  return within(navigation()).getByRole("link", { name });
}

beforeEach(() => {
  logout.mockClear();
  document.body.style.overflow = "";
});

describe("AppShell navigation items", () => {
  it("shows the full Admin navigation", () => {
    renderShell("/dashboard");
    expect(
      within(navigation()).getByRole("link", { name: "Business settings" }),
    ).toBeInTheDocument();
    expect(
      within(navigation()).getByRole("link", { name: "Audit log" }),
    ).toBeInTheDocument();
    expect(
      within(navigation()).getByRole("link", { name: "Services & pricing" }),
    ).toBeInTheDocument();
    expect(
      within(navigation()).getByRole("link", { name: "Today" }),
    ).toBeInTheDocument();
  });

  it("hides admin-only navigation items for Staff", () => {
    renderShell("/dashboard", staffUser);
    expect(
      within(navigation()).queryByRole("link", { name: "Business settings" }),
    ).not.toBeInTheDocument();
    expect(
      within(navigation()).queryByRole("link", { name: "Audit log" }),
    ).not.toBeInTheDocument();
    expect(
      within(navigation()).queryByRole("link", { name: "Services & pricing" }),
    ).not.toBeInTheDocument();
    expect(
      within(navigation()).queryByRole("link", { name: "Staff" }),
    ).not.toBeInTheDocument();
    expect(
      within(navigation()).getByRole("link", { name: "Today" }),
    ).toBeInTheDocument();
    expect(
      within(navigation()).getByRole("link", { name: "Wash queue" }),
    ).toBeInTheDocument();
  });

  it("uses the existing route labels and URLs", () => {
    renderShell("/dashboard", staffUser);
    expect(linkInSidebar("Customers")).toHaveAttribute("href", "/customers");
    expect(linkInSidebar("New wash")).toHaveAttribute("href", "/wash-jobs/new");
    expect(linkInSidebar("Payments")).toHaveAttribute("href", "/payments");
    expect(linkInSidebar("Invoices")).toHaveAttribute("href", "/invoices");
  });
});

describe("AppShell active route highlighting", () => {
  it("marks the active link for a top-level route", () => {
    renderShell("/payments");
    expect(linkInSidebar("Payments")).toHaveAttribute("aria-current", "page");
  });

  it("keeps Customers active on a customer detail route", () => {
    renderShell("/customers/c-1");
    expect(linkInSidebar("Customers")).toHaveAttribute("aria-current", "page");
    expect(linkInSidebar("Vehicles")).not.toHaveAttribute("aria-current");
  });

  it("keeps Vehicles active on a vehicle detail route", () => {
    renderShell("/vehicles/v-1");
    expect(linkInSidebar("Vehicles")).toHaveAttribute("aria-current", "page");
  });

  it("keeps Wash queue active on a wash job detail route", () => {
    renderShell("/wash-jobs/wj-1");
    expect(linkInSidebar("Wash queue")).toHaveAttribute("aria-current", "page");
  });

  it("does not mark an unrelated route containing similar text", () => {
    renderShell("/dashboard");
    expect(linkInSidebar("Payments")).not.toHaveAttribute("aria-current");
  });
});

describe("AppShell desktop collapse and expansion", () => {
  it("renders collapsed by default on desktop", () => {
    renderShell("/dashboard");
    expect(sidebar().classList.contains("app-sidebar--collapsed")).toBe(true);
    expect(sidebar().classList.contains("app-sidebar--expanded")).toBe(false);
  });

  it("expands when the pointer enters and collapses when it leaves", () => {
    renderShell("/dashboard");
    fireEvent.mouseOver(sidebar());
    expect(sidebar().classList.contains("app-sidebar--expanded")).toBe(true);
    fireEvent.mouseOut(sidebar(), { relatedTarget: document.body });
    expect(sidebar().classList.contains("app-sidebar--collapsed")).toBe(true);
  });

  it("stays expanded while focus remains inside the sidebar", () => {
    renderShell("/dashboard");
    const link = linkInSidebar("Today");
    act(() => link.focus());
    expect(sidebar().classList.contains("app-sidebar--expanded")).toBe(true);
    fireEvent.mouseOut(sidebar(), { relatedTarget: document.body });
    expect(sidebar().classList.contains("app-sidebar--expanded")).toBe(true);
  });

  it("collapses when keyboard focus leaves the sidebar", () => {
    renderShell("/dashboard");
    const link = linkInSidebar("Today");
    act(() => link.focus());
    expect(sidebar().classList.contains("app-sidebar--expanded")).toBe(true);
    fireEvent.blur(sidebar(), { relatedTarget: document.body });
    expect(sidebar().classList.contains("app-sidebar--collapsed")).toBe(true);
  });

  it("keeps icons visible while collapsed", () => {
    renderShell("/dashboard");
    const link = linkInSidebar("Today");
    expect(link.querySelector(".app-sidebar__icon svg")).not.toBeNull();
    expect(link).toHaveAttribute("data-tooltip", "Today");
  });
});

describe("AppShell mobile drawer", () => {
  function openButton(): HTMLElement {
    return screen.getByRole("button", { name: "Open navigation" });
  }

  it("opens the drawer from the menu button", () => {
    renderShell("/dashboard");
    fireEvent.click(openButton());
    expect(sidebar().classList.contains("app-sidebar--open")).toBe(true);
  });

  it("closes the drawer with its close button", () => {
    renderShell("/dashboard");
    fireEvent.click(openButton());
    fireEvent.click(screen.getByRole("button", { name: "Close menu" }));
    expect(sidebar().classList.contains("app-sidebar--open")).toBe(false);
  });

  it("closes the drawer with the backdrop", () => {
    renderShell("/dashboard");
    fireEvent.click(openButton());
    fireEvent.click(screen.getByRole("button", { name: "Close navigation" }));
    expect(sidebar().classList.contains("app-sidebar--open")).toBe(false);
  });

  it("closes the drawer on Escape", () => {
    renderShell("/dashboard");
    fireEvent.click(openButton());
    fireEvent.keyDown(window, { key: "Escape" });
    expect(sidebar().classList.contains("app-sidebar--open")).toBe(false);
  });

  it("closes the drawer after selecting a navigation link", () => {
    renderShell("/dashboard");
    fireEvent.click(openButton());
    fireEvent.click(linkInSidebar("Customers"));
    expect(sidebar().classList.contains("app-sidebar--open")).toBe(false);
  });

  it("locks body scroll while the drawer is open", () => {
    renderShell("/dashboard");
    fireEvent.click(openButton());
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(screen.getByRole("button", { name: "Close menu" }));
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("restores focus to the menu trigger after closing", () => {
    renderShell("/dashboard");
    const trigger = openButton();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Close menu" }));
    expect(trigger).toHaveFocus();
  });

  it("keeps focus inside the drawer while it is open", () => {
    renderShell("/dashboard");
    fireEvent.click(openButton());
    const drawer = sidebar();
    const focusables = Array.from(
      drawer.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"),
    );
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    act(() => last.focus());
    fireEvent.keyDown(drawer, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(drawer, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});

describe("AppShell account section", () => {
  it("shows the authenticated user’s name and role", () => {
    renderShell("/dashboard");
    const footer = document.querySelector(".app-sidebar__footer");
    expect(footer).not.toBeNull();
    expect(within(footer as HTMLElement).getByText("Febin Baiju")).toBeInTheDocument();
    expect(within(footer as HTMLElement).getByText("Administrator")).toBeInTheDocument();
  });

  it("shows the staff role label for staff users", () => {
    renderShell("/dashboard", staffUser);
    const footer = document.querySelector(".app-sidebar__footer");
    expect(within(footer as HTMLElement).getByText("Staff member")).toBeInTheDocument();
  });

  it("signs out through the existing logout flow", () => {
    renderShell("/dashboard");
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it("renders the sidebar with accessibility semantics", () => {
    renderShell("/dashboard");
    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Mobile navigation" })).toBeInTheDocument();
    expect(
      screen.getByText("Location data © OpenStreetMap contributors"),
    ).toBeInTheDocument();
  });
});
