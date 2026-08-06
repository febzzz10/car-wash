import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { reloadCurrentPage } from "../lib/reload";
import { Button } from "./ui";

export type RouteErrorKind = "chunk" | "offline" | "generic";

const CHUNK_ERROR_PATTERN =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|dynamically imported module/i;

export function classifyRouteError(error: Error | null): RouteErrorKind {
  if (error !== null) {
    const message = error.message ?? "";
    if (error.name === "ChunkLoadError" || CHUNK_ERROR_PATTERN.test(message)) {
      return "chunk";
    }
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "offline";
  }
  return "generic";
}

function messageFor(kind: RouteErrorKind): string {
  switch (kind) {
    case "chunk":
      return "A newer version of WashPro may be available. Reload the page to continue.";
    case "offline":
      return "You appear to be offline. Check your connection and try again.";
    default:
      return "We couldn’t load this page. Try reloading it, or return to the dashboard and continue working.";
  }
}

export function ErrorPage({
  error,
  onRetry,
}: {
  readonly error: Error | null;
  readonly onRetry?: () => void;
}) {
  const navigate = useNavigate();
  const cardRef = useRef<HTMLDivElement>(null);
  const [retrying, setRetrying] = useState(false);
  const kind = classifyRouteError(error);

  useEffect(() => {
    cardRef.current?.focus();
  }, []);

  function handleRetry() {
    if (kind === "chunk" || onRetry === undefined) {
      setRetrying(true);
      reloadCurrentPage();
      return;
    }
    onRetry();
  }

  return (
    <main className="error-page">
      <div
        aria-label="WashPro encountered a problem"
        className="error-page__card"
        ref={cardRef}
        role="alert"
        tabIndex={-1}
      >
        <div className="error-page__brand">
          <span aria-hidden className="brand__mark">
            W
          </span>
          <strong>WashPro</strong>
        </div>
        <span aria-hidden className="error-page__mark">
          !
        </span>
        <p className="eyebrow">We hit a problem</p>
        <h1>Something went wrong</h1>
        <p className="error-page__message">{messageFor(kind)}</p>
        <div className="error-page__actions">
          <Button busy={retrying} onClick={handleRetry} type="button">
            Try again
          </Button>
          <Button
            onClick={() => navigate("/dashboard")}
            tone="secondary"
            type="button"
          >
            Go to dashboard
          </Button>
        </div>
        <button
          className="error-page__login"
          onClick={() => navigate("/login")}
          type="button"
        >
          Go to login
        </button>
      </div>
    </main>
  );
}