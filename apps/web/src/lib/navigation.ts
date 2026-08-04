export type UserRole = "ADMIN" | "STAFF";

export interface NavigationItem {
  readonly icon: string;
  readonly label: string;
  readonly mobile?: boolean;
  readonly permission?: string;
  readonly to: string;
}

export interface NavigationSection {
  readonly label: string;
  readonly items: readonly NavigationItem[];
}

const sharedSections: readonly NavigationSection[] = [
  {
    label: "Primary",
    items: [
      { icon: "dashboard", label: "Today", mobile: true, to: "/dashboard" },
      {
        icon: "newWash",
        label: "New wash",
        mobile: true,
        permission: "wash_jobs.create",
        to: "/wash-jobs/new",
      },
      {
        icon: "queue",
        label: "Wash queue",
        mobile: true,
        permission: "wash_jobs.read",
        to: "/wash-jobs",
      },
    ],
  },
  {
    label: "Directory",
    items: [
      {
        icon: "customers",
        label: "Customers",
        permission: "customers.read",
        to: "/customers",
      },
      {
        icon: "vehicles",
        label: "Vehicles",
        permission: "vehicles.read",
        to: "/vehicles",
      },
    ],
  },
  {
    label: "Finance",
    items: [
      {
        icon: "payments",
        label: "Payments",
        mobile: true,
        permission: "payments.create",
        to: "/payments",
      },
      {
        icon: "invoices",
        label: "Invoices",
        permission: "invoices.generate",
        to: "/invoices",
      },
    ],
  },
];

const adminOnlySections: readonly NavigationSection[] = [
  {
    label: "Directory",
    items: [{ icon: "services", label: "Services & pricing", to: "/services" }],
  },
  {
    label: "Finance",
    items: [{ icon: "expenses", label: "Expenses", to: "/expenses" }],
  },
  {
    label: "Benefits",
    items: [
      { icon: "coupons", label: "Coupons", to: "/coupons" },
      { icon: "referrals", label: "Referrals", to: "/referrals" },
    ],
  },
  {
    label: "Administration",
    items: [
      { icon: "reports", label: "Reports", to: "/reports" },
      { icon: "staff", label: "Staff", to: "/staff" },
      { icon: "audit", label: "Audit log", to: "/audit" },
      { icon: "settings", label: "Business settings", to: "/settings" },
    ],
  },
];

interface MutableSection {
  label: string;
  items: NavigationItem[];
}

export function navigationFor(
  role: UserRole,
  permissions: readonly string[],
): readonly NavigationSection[] {
  const sources =
    role === "ADMIN" ? [...sharedSections, ...adminOnlySections] : sharedSections;
  const allowed = new Set(permissions);
  const merged: MutableSection[] = [];
  for (const section of sources) {
    const items = section.items.filter(
      (item) => item.permission === undefined || allowed.has(item.permission),
    );
    if (items.length === 0) continue;
    const existing = merged.find((group) => group.label === section.label);
    if (existing !== undefined) existing.items.push(...items);
    else merged.push({ label: section.label, items });
  }
  return merged;
}
