import {
  BarChart3,
  CarFront,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  Gift,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  ReceiptText,
  ScrollText,
  Settings,
  TicketPercent,
  UserCog,
  Users,
  WalletCards,
  Wrench,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type FocusEvent,
  type MouseEvent,
} from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../auth";
import { navigationFor } from "../lib/navigation";

const icons: Record<string, ComponentType<{ readonly size?: number }>> = {
  audit: ScrollText,
  coupons: TicketPercent,
  customers: Users,
  dashboard: LayoutDashboard,
  expenses: CircleDollarSign,
  invoices: ReceiptText,
  newWash: Plus,
  payments: WalletCards,
  queue: ClipboardList,
  referrals: Gift,
  reports: BarChart3,
  services: Wrench,
  settings: Settings,
  staff: UserCog,
  vehicles: CarFront,
};

function useHoverDevice(): boolean {
  const [hoverable, setHoverable] = useState(() =>
    typeof window.matchMedia === "function"
      ? window.matchMedia("(hover: hover) and (pointer: fine)").matches
      : true,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(hover: hover) and (pointer: fine)");
    const onChange = () => setHoverable(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return hoverable;
}

export function AppShell() {
  const { logout, user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const location = useLocation();
  const hoverable = useHoverDevice();
  const sidebarRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const mouseInsideRef = useRef(false);
  const wasOpenRef = useRef(false);

  const sections = useMemo(
    () => navigationFor(user?.role ?? "STAFF", user?.permissions ?? []),
    [user],
  );
  const mobileItems = sections
    .flatMap((section) => section.items)
    .filter((item) => item.mobile)
    .slice(0, 4);

  const openMobile = useCallback(() => setMobileOpen(true), []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  useEffect(() => {
    closeMobile();
  }, [closeMobile, location.pathname]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    if (wasOpenRef.current && !mobileOpen) triggerRef.current?.focus();
    wasOpenRef.current = mobileOpen;
  }, [mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMobile();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeMobile, mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    const drawer = sidebarRef.current;
    if (drawer === null) return;
    const focusables = () =>
      Array.from(
        drawer.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
    focusables()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    drawer.addEventListener("keydown", onKeyDown);
    return () => drawer.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  const handleMouseOver = () => {
    if (hoverable) setExpanded(true);
  };
  const handleMouseOut = (event: MouseEvent<HTMLElement>) => {
    mouseInsideRef.current = false;
    if (!hoverable) return;
    const next = event.relatedTarget;
    if (next instanceof Node && sidebarRef.current?.contains(next)) return;
    if (sidebarRef.current?.contains(document.activeElement)) return;
    setExpanded(false);
  };
  const handleFocus = () => {
    if (hoverable) setExpanded(true);
  };
  const handleBlur = (event: FocusEvent<HTMLElement>) => {
    if (!hoverable || mouseInsideRef.current) return;
    const next = event.relatedTarget;
    if (next instanceof Node && sidebarRef.current?.contains(next)) return;
    setExpanded(false);
  };

  const desktopExpanded = hoverable ? expanded : true;
  const sidebarClass = [
    "app-sidebar",
    desktopExpanded ? "app-sidebar--expanded" : "app-sidebar--collapsed",
    mobileOpen ? "app-sidebar--open" : "",
  ].join(" ");

  return (
    <div className="app-layout">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {online ? null : (
        <div className="offline-banner" role="status">
          You’re offline. Saved information will stay on this screen until
          connection returns.
        </div>
      )}
      <aside
        aria-label={mobileOpen ? "Navigation menu" : undefined}
        aria-modal={mobileOpen ? true : undefined}
        className={sidebarClass}
        id="app-sidebar"
        onBlur={handleBlur}
        onFocus={handleFocus}
        onMouseOut={handleMouseOut}
        onMouseOver={handleMouseOver}
        ref={sidebarRef}
        role={mobileOpen ? "dialog" : undefined}
      >
        <div className="app-sidebar__business" data-tooltip="WashPro">
          <span aria-hidden className="brand__mark">
            W
          </span>
          <div className="app-sidebar__business-text">
            <strong>WashPro</strong>
            <span>Car wash management</span>
          </div>
          <button
            aria-label="Close menu"
            className="app-sidebar__mobile-close icon-button"
            onClick={closeMobile}
            type="button"
          >
            <X />
          </button>
        </div>
        <nav aria-label="Primary navigation" className="app-sidebar__navigation">
          {sections.map((section) => (
            <div className="app-sidebar__group" key={section.label}>
              <p className="app-sidebar__group-label">{section.label}</p>
              {section.items.map((item) => {
                const Icon = icons[item.icon] ?? LayoutDashboard;
                return (
                  <NavLink
                    className={({ isActive }) =>
                      `app-sidebar__link${isActive ? " app-sidebar__link--active" : ""}`
                    }
                    data-tooltip={item.label}
                    key={item.to}
                    to={item.to}
                  >
                    <span aria-hidden className="app-sidebar__icon">
                      <Icon size={18} />
                    </span>
                    <span className="app-sidebar__label">{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="app-sidebar__footer">
          <div className="app-sidebar__account" data-tooltip={user?.fullName}>
            <span aria-hidden className="avatar app-sidebar__avatar">
              {user?.fullName.slice(0, 1).toUpperCase()}
            </span>
            <span className="app-sidebar__account-text">
              <strong>{user?.fullName}</strong>
              <small>
                {user?.role === "ADMIN" ? "Administrator" : "Staff member"}
              </small>
            </span>
          </div>
          <button
            className="app-sidebar__action"
            data-tooltip="Sign out"
            onClick={() => void logout()}
            type="button"
          >
            <span aria-hidden className="app-sidebar__icon">
              <LogOut size={18} />
            </span>
            <span className="app-sidebar__label">Sign out</span>
          </button>
          <p className="app-sidebar__attribution">
            Location data © OpenStreetMap contributors
          </p>
        </div>
      </aside>
      {mobileOpen ? (
        <button
          aria-label="Close navigation"
          className="app-sidebar__mobile-backdrop"
          onClick={closeMobile}
          tabIndex={-1}
          type="button"
        />
      ) : null}
      <div className="app-main">
        <header className="topbar">
          <button
            aria-controls="app-sidebar"
            aria-expanded={mobileOpen}
            aria-label="Open navigation"
            className="menu-button icon-button"
            onClick={openMobile}
            ref={triggerRef}
            type="button"
          >
            <Menu />
          </button>
          <div className="topbar__context">
            <span className="live-dot" /> <span>Operations live</span>
          </div>
          <div className="profile-wrap">
            <button
              aria-expanded={profileOpen}
              className="profile-button"
              onClick={() => setProfileOpen((value) => !value)}
              type="button"
            >
              <span className="avatar">
                {user?.fullName.slice(0, 1).toUpperCase()}
              </span>
              <span className="profile-button__text">
                <strong>{user?.fullName}</strong>
                <small>
                  {user?.role === "ADMIN" ? "Administrator" : "Staff member"}
                </small>
              </span>
              <ChevronDown size={16} />
            </button>
            {profileOpen ? (
              <div className="profile-menu">
                <NavLink to="/account">Account & password</NavLink>
                <button onClick={() => void logout()} type="button">
                  <LogOut size={17} /> Sign out
                </button>
              </div>
            ) : null}
          </div>
        </header>
        <main className="page" id="main-content">
          <Outlet />
        </main>
        <nav aria-label="Mobile navigation" className="bottom-nav">
          {mobileItems.map((item) => {
            const Icon = icons[item.icon] ?? LayoutDashboard;
            return (
              <NavLink
                className={({ isActive }) => (isActive ? "active" : "")}
                key={item.to}
                to={item.to}
              >
                <Icon size={21} />
                <span>{item.label.replace("Wash queue", "Queue")}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
