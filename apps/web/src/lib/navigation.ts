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

const staffSections: readonly NavigationSection[] = [
  {
    label: "Operations",
    items: [
      { icon: "gauge", label: "Today", mobile: true, to: "/dashboard" },
      {
        icon: "plus",
        label: "New wash",
        mobile: true,
        permission: "wash_jobs.create",
        to: "/wash-jobs/new",
      },
      {
        icon: "timer",
        label: "Wash queue",
        mobile: true,
        permission: "wash_jobs.read",
        to: "/wash-jobs",
      },
      {
        icon: "wallet",
        label: "Payments",
        mobile: true,
        permission: "payments.create",
        to: "/payments",
      },
    ],
  },
  {
    label: "Directory",
    items: [
      {
        icon: "users",
        label: "Customers",
        permission: "customers.read",
        to: "/customers",
      },
      {
        icon: "car",
        label: "Vehicles",
        permission: "vehicles.read",
        to: "/vehicles",
      },
      {
        icon: "receipt",
        label: "Invoices",
        permission: "invoices.generate",
        to: "/invoices",
      },
    ],
  },
];

const adminSections: readonly NavigationSection[] = [
  ...staffSections,
  {
    label: "Management",
    items: [
      { icon: "chart", label: "Reports", to: "/reports" },
      { icon: "expense", label: "Expenses", to: "/expenses" },
      { icon: "staff", label: "Staff", to: "/staff" },
      { icon: "sparkles", label: "Services & pricing", to: "/services" },
      { icon: "ticket", label: "Coupons", to: "/coupons" },
      { icon: "gift", label: "Referrals", to: "/referrals" },
    ],
  },
  {
    label: "System",
    items: [
      { icon: "settings", label: "Business settings", to: "/settings" },
      { icon: "shield", label: "Audit log", to: "/audit" },
    ],
  },
];

export function navigationFor(
  role: UserRole,
  permissions: readonly string[],
): readonly NavigationSection[] {
  const sections = role === "ADMIN" ? adminSections : staffSections;
  if (role === "ADMIN") return sections;
  const allowed = new Set(permissions);
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => item.permission === undefined || allowed.has(item.permission),
      ),
    }))
    .filter((section) => section.items.length > 0);
}
