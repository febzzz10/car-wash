import { lazy, Suspense, type ReactNode } from "react";
import {
  Navigate,
  Outlet,
  createBrowserRouter,
  RouterProvider,
  useLocation,
} from "react-router-dom";

import { useAuth } from "./auth";
import { AppShell } from "./components/app-shell";
import { ErrorState, SkeletonRows } from "./components/ui";

const Login = lazy(() => import("./pages/login"));
const Dashboard = lazy(() => import("./pages/dashboard"));
const WashJobs = lazy(() => import("./pages/wash-jobs"));
const NewWash = lazy(() => import("./pages/new-wash"));
const WashJobDetail = lazy(() => import("./pages/wash-job-detail"));
const Customers = lazy(() => import("./pages/customers"));
const CustomerDetail = lazy(() => import("./pages/customer-detail"));
const Vehicles = lazy(() => import("./pages/vehicles"));
const VehicleDetail = lazy(() => import("./pages/vehicle-detail"));
const Payments = lazy(() => import("./pages/payments"));
const Invoices = lazy(() => import("./pages/invoices"));
const InvoiceDetail = lazy(() => import("./pages/invoice-detail"));
const Expenses = lazy(() => import("./pages/expenses"));
const Reports = lazy(() => import("./pages/reports"));
const Staff = lazy(() => import("./pages/staff"));
const Services = lazy(() => import("./pages/services"));
const Coupons = lazy(() => import("./pages/coupons"));
const Referrals = lazy(() => import("./pages/referrals"));
const Settings = lazy(() => import("./pages/settings"));
const Audit = lazy(() => import("./pages/audit"));
const Account = lazy(() => import("./pages/account"));

function LoadingPage() {
  return (
    <div className="route-loading">
      <SkeletonRows count={5} />
    </div>
  );
}
function Suspended({ children }: { readonly children: ReactNode }) {
  return <Suspense fallback={<LoadingPage />}>{children}</Suspense>;
}
function Protected() {
  const { loading, user } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingPage />;
  if (user === null)
    return <Navigate replace state={{ from: location.pathname }} to="/login" />;
  return <Outlet />;
}
function AdminOnly() {
  const { user } = useAuth();
  return user?.role === "ADMIN" ? (
    <Outlet />
  ) : (
    <ErrorState message="This area is available only to Administrators." />
  );
}
function NotFound() {
  return (
    <div className="not-found">
      <strong>404</strong>
      <h1>Page not found</h1>
      <p>The requested WashPro screen does not exist.</p>
      <a className="button button--primary" href="/dashboard">
        Return to dashboard
      </a>
    </div>
  );
}

const router = createBrowserRouter([
  {
    path: "/login",
    element: (
      <Suspended>
        <Login />
      </Suspended>
    ),
  },
  {
    element: <Protected />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate replace to="/dashboard" /> },
          {
            path: "dashboard",
            element: (
              <Suspended>
                <Dashboard />
              </Suspended>
            ),
          },
          {
            path: "wash-jobs",
            element: (
              <Suspended>
                <WashJobs />
              </Suspended>
            ),
          },
          {
            path: "wash-jobs/new",
            element: (
              <Suspended>
                <NewWash />
              </Suspended>
            ),
          },
          {
            path: "wash-jobs/:id",
            element: (
              <Suspended>
                <WashJobDetail />
              </Suspended>
            ),
          },
          {
            path: "customers",
            element: (
              <Suspended>
                <Customers />
              </Suspended>
            ),
          },
          {
            path: "customers/:id",
            element: (
              <Suspended>
                <CustomerDetail />
              </Suspended>
            ),
          },
          {
            path: "vehicles",
            element: (
              <Suspended>
                <Vehicles />
              </Suspended>
            ),
          },
          {
            path: "vehicles/:id",
            element: (
              <Suspended>
                <VehicleDetail />
              </Suspended>
            ),
          },
          {
            path: "payments",
            element: (
              <Suspended>
                <Payments />
              </Suspended>
            ),
          },
          {
            path: "invoices",
            element: (
              <Suspended>
                <Invoices />
              </Suspended>
            ),
          },
          {
            path: "invoices/:id",
            element: (
              <Suspended>
                <InvoiceDetail />
              </Suspended>
            ),
          },
          {
            path: "account",
            element: (
              <Suspended>
                <Account />
              </Suspended>
            ),
          },
          {
            element: <AdminOnly />,
            children: [
              {
                path: "expenses",
                element: (
                  <Suspended>
                    <Expenses />
                  </Suspended>
                ),
              },
              {
                path: "reports",
                element: (
                  <Suspended>
                    <Reports />
                  </Suspended>
                ),
              },
              {
                path: "staff",
                element: (
                  <Suspended>
                    <Staff />
                  </Suspended>
                ),
              },
              {
                path: "services",
                element: (
                  <Suspended>
                    <Services />
                  </Suspended>
                ),
              },
              {
                path: "coupons",
                element: (
                  <Suspended>
                    <Coupons />
                  </Suspended>
                ),
              },
              {
                path: "referrals",
                element: (
                  <Suspended>
                    <Referrals />
                  </Suspended>
                ),
              },
              {
                path: "settings",
                element: (
                  <Suspended>
                    <Settings />
                  </Suspended>
                ),
              },
              {
                path: "audit",
                element: (
                  <Suspended>
                    <Audit />
                  </Suspended>
                ),
              },
            ],
          },
          { path: "*", element: <NotFound /> },
        ],
      },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
