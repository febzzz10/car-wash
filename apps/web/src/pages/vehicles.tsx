import { ArrowLeft, ArrowRight, ChevronRight, SearchX } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  SearchField,
  SkeletonRows,
  StatusBadge,
} from "../components/ui";
import { api } from "../lib/api";
import type { VehicleListPayload, VehicleRecord } from "../types";

const PAGE_SIZES = [15, 25, 50] as const;
const DEFAULT_PAGE_SIZE = 15;

function vehiclesPath(
  search: string,
  limit: number,
  cursor: string,
): string {
  return `/vehicles?search=${encodeURIComponent(search)}&limit=${limit}${cursor === "" ? "" : `&cursor=${encodeURIComponent(cursor)}`}`;
}

export default function VehiclesPage() {
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);
  const [cursorHistory, setCursorHistory] = useState<readonly string[]>([""]);
  const [vehicles, setVehicles] = useState<
    readonly VehicleRecord[] | null
  >(null);
  const [hasNext, setHasNext] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [paging, setPaging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);

  function resetPagination(nextLimit?: number) {
    setPage(1);
    setCursorHistory([""]);
    setHasNext(false);
    setNextCursor(null);
    if (nextLimit !== undefined) setLimit(nextLimit);
  }

  useEffect(() => {
    let active = true;
    const cursor = cursorHistory[page - 1] ?? "";
    if (cursor === "") {
      setLoading(true);
      setError(null);
    } else {
      setPaging(true);
    }
    void api<VehicleListPayload>(vehiclesPath(search, limit, cursor))
      .then((body) => {
        if (!active) return;
        setVehicles(body.vehicles);
        setHasNext(body.pagination.hasNext);
        setNextCursor(body.pagination.nextCursor);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(
          reason instanceof Error
            ? reason.message
            : "The vehicle list could not be loaded.",
        );
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
        setPaging(false);
      });
    return () => {
      active = false;
    };
  }, [cursorHistory, limit, page, revision, search]);

  const goNext = useCallback(() => {
    if (nextCursor === null || paging) return;
    setCursorHistory((prev) => [...prev, nextCursor]);
    setPage((prev) => prev + 1);
  }, [nextCursor, paging]);

  const goPrevious = useCallback(() => {
    if (page <= 1 || paging) return;
    setPage((prev) => prev - 1);
  }, [page, paging]);

  return (
    <>
      <PageHeader eyebrow="Directory" title="Vehicles" />
      <Card>
        <div className="toolbar">
          <SearchField
            onChange={(event) => {
              setSearch(event.target.value);
              resetPagination();
            }}
            placeholder="Search registration number…"
            value={search}
          />
        </div>
        {loading ? (
          <SkeletonRows />
        ) : error !== null ? (
          <ErrorState message={error} onRetry={reload} />
        ) : (vehicles?.length ?? 0) === 0 ? (
          <EmptyState
            icon={SearchX}
            message="Vehicle registrations are normalized before search."
            title="No vehicles found"
          />
        ) : (
          <>
            <div aria-busy={paging} className="table-wrap">
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
                  {vehicles?.map((vehicle) => (
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
            <div className="pagination-footer">
              <p className="pagination-summary">
                Showing {vehicles?.length ?? 0} vehicles
              </p>
              <label className="pagination-page-size">
                <span>Rows per page</span>
                <select
                  aria-label="Rows per page"
                  onChange={(event) =>
                    resetPagination(Number(event.target.value))
                  }
                  value={limit}
                >
                  {PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              <nav aria-label="Vehicle pages" className="pagination-controls">
                <Button
                  disabled={page === 1 || paging}
                  onClick={goPrevious}
                  tone="secondary"
                  type="button"
                >
                  <ArrowLeft size={15} /> Previous
                </Button>
                <span aria-live="polite" className="pagination-page">
                  Page {page}
                </span>
                <Button
                  disabled={!hasNext || paging}
                  onClick={goNext}
                  tone="secondary"
                  type="button"
                >
                  Next <ArrowRight size={15} />
                </Button>
              </nav>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
