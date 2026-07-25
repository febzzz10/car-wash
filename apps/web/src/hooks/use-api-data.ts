import { useCallback, useEffect, useState } from "react";

import { api } from "../lib/api";

const inflightRequests = new Map<string, Promise<unknown>>();

function dedupedApi<T>(path: string): Promise<T> {
  const existing = inflightRequests.get(path);
  if (existing) return existing as Promise<T>;
  const promise = api<T>(path).finally(() => {
    inflightRequests.delete(path);
  });
  inflightRequests.set(path, promise);
  return promise;
}

export interface ApiDataState<T> {
  readonly data: T | null;
  readonly error: string | null;
  readonly loading: boolean;
  readonly reload: () => void;
}

export function useApiData<T>(path: string, enabled = true): ApiDataState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    void dedupedApi<T>(path)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error ? reason.message : "Request failed.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [enabled, path, revision]);

  return { data, error, loading, reload };
}
