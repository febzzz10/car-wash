import {
  BarChart3,
  Car,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  Gauge,
  Gift,
  Menu,
  Plus,
  ReceiptText,
  Settings,
  ShieldCheck,
  Sparkles,
  TicketPercent,
  Timer,
  Users,
  WalletCards,
  X,
  LogOut,
} from "lucide-react";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../auth";
import { navigationFor } from "../lib/navigation";

const icons: Record<string, ComponentType<{ readonly size?: number }>> = {
  car: Car,
  chart: BarChart3,
  expense: CircleDollarSign,
  gauge: Gauge,
  gift: Gift,
  plus: Plus,
  receipt: ReceiptText,
  settings: Settings,
  shield: ShieldCheck,
  sparkles: Sparkles,
  staff: ClipboardList,
  ticket: TicketPercent,
  timer: Timer,
  users: Users,
  wallet: WalletCards,
};

export function AppShell() {
  const { logout, user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const location = useLocation();
  const sections = useMemo(
    () => navigationFor(user?.role ?? "STAFF", user?.permissions ?? []),
    [user],
  );
  const mobileItems = sections
    .flatMap((section) => section.items)
    .filter((item) => item.mobile)
    .slice(0, 4);

  useEffect(() => setMenuOpen(false), [location.pathname]);
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
      <aside className={`sidebar ${menuOpen ? "sidebar--open" : ""}`}>
        <div className="brand">
          <span aria-hidden className="brand__mark">
            W
          </span>
          <div>
            <strong>WashPro</strong>
            <span>Car wash management</span>
          </div>
          <button
            aria-label="Close menu"
            className="sidebar__close icon-button"
            onClick={() => setMenuOpen(false)}
            type="button"
          >
            <X />
          </button>
        </div>
        <nav aria-label="Primary navigation" className="sidebar__nav">
          {sections.map((section) => (
            <div className="nav-section" key={section.label}>
              <p>{section.label}</p>
              {section.items.map((item) => {
                const Icon = icons[item.icon] ?? Gauge;
                return (
                  <NavLink
                    className={({ isActive }) =>
                      `nav-link ${isActive ? "nav-link--active" : ""}`
                    }
                    key={item.to}
                    to={item.to}
                  >
                    <Icon size={19} />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar__support">
          <strong>Need help?</strong>
          <span>Check setup and recovery guides</span>
        </div>
        <div className="sidebar__attribution">
          <span>Location data © OpenStreetMap contributors</span>
        </div>
      </aside>
      {menuOpen ? (
        <button
          aria-label="Close navigation"
          className="scrim"
          onClick={() => setMenuOpen(false)}
          type="button"
        />
      ) : null}
      <div className="app-main">
        <header className="topbar">
          <button
            aria-label="Open navigation"
            className="menu-button icon-button"
            onClick={() => setMenuOpen(true)}
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
            const Icon = icons[item.icon] ?? Gauge;
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
