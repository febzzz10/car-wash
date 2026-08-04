import { ChevronRight, SearchX } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import {
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  SearchField,
  SkeletonRows,
  StatusBadge,
} from "../components/ui";
import { useApiData } from "../hooks/use-api-data";
import type { VehicleRecord } from "../types";

export default function VehiclesPage() {
  const [search, setSearch] = useState("");
  const state = useApiData<readonly VehicleRecord[]>(
    `/vehicles?search=${encodeURIComponent(search)}`,
  );
  return (
    <>
      <PageHeader eyebrow="Directory" title="Vehicles" />
      <Card>
        <div className="toolbar">
          <SearchField
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search registration number…"
            value={search}
          />
        </div>
        {state.loading ? (
          <SkeletonRows />
        ) : state.error !== null ? (
          <ErrorState message={state.error} onRetry={state.reload} />
        ) : (state.data?.length ?? 0) === 0 ? (
          <EmptyState
            icon={SearchX}
            message="Vehicle registrations are normalized before search."
            title="No vehicles found"
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Registration</th>
                  <th>Owner</th>
                  <th>Type</th>
                  <th>Vehicle</th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {state.data?.map((vehicle) => (
                  <tr key={vehicle.id}>
                    <td>
                      <strong className="identifier">
                        {vehicle.registration_number}
                      </strong>
                    </td>
                    <td>{vehicle.customer_name}</td>
                    <td>{vehicle.vehicle_type_name}</td>
                    <td>
                      {[vehicle.make, vehicle.model]
                        .filter(Boolean)
                        .join(" ") || "—"}
                    </td>
                    <td>
                      <StatusBadge value={vehicle.status} />
                    </td>
                    <td>
                      <Link
                        aria-label={`Open ${vehicle.registration_number}`}
                        className="row-link"
                        to={`/vehicles/${vehicle.id}`}
                      >
                        <ChevronRight />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
