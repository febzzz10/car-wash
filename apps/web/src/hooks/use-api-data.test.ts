import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { api } from "../lib/api";
import { useApiData } from "./use-api-data";

vi.mock("../lib/api", () => ({
  api: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useApiData", () => {
  it("fetches data on mount and returns it", async () => {
    vi.mocked(api).mockResolvedValue("hello");

    const { result } = renderHook(() => useApiData<string>("/test"));

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.data).toBe("hello"));

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("handles fetch errors", async () => {
    vi.mocked(api).mockRejectedValue(new Error("not found"));

    const { result } = renderHook(() => useApiData<string>("/fail"));

    await waitFor(() =>
      expect(result.current.error).toBe("not found"),
    );

    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("deduplicates concurrent requests for the same path", async () => {
    let resolve!: (v: string) => void;
    const promise = new Promise<string>((r) => {
      resolve = r;
    });
    vi.mocked(api).mockReturnValue(promise);

    const { result: r1 } = renderHook(() => useApiData<string>("/same"));
    const { result: r2 } = renderHook(() => useApiData<string>("/same"));

    resolve("deduped");

    await waitFor(() => {
      expect(r1.current.data).toBe("deduped");
      expect(r2.current.data).toBe("deduped");
    });

    expect(vi.mocked(api)).toHaveBeenCalledTimes(1);
  });

  it("does not deduplicate requests for different paths", () => {
    vi.mocked(api).mockResolvedValue("ok");

    renderHook(() => useApiData<string>("/a"));
    renderHook(() => useApiData<string>("/b"));

    expect(vi.mocked(api)).toHaveBeenCalledTimes(2);
  });

  it("does not fetch when disabled", () => {
    renderHook(() => useApiData<string>("/disabled", false));

    expect(vi.mocked(api)).not.toHaveBeenCalled();
  });

  it("re-fetches when reload is called", async () => {
    vi.mocked(api).mockResolvedValueOnce("first").mockResolvedValueOnce("second");

    const { result } = renderHook(() => useApiData<string>("/reload"));

    await waitFor(() => expect(result.current.data).toBe("first"));

    result.current.reload();

    await waitFor(() => expect(result.current.data).toBe("second"));

    expect(vi.mocked(api)).toHaveBeenCalledTimes(2);
  });

  it("retries after a failed request", async () => {
    vi.mocked(api)
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce("retried");

    const { result } = renderHook(() => useApiData<string>("/retry"));

    await waitFor(() => expect(result.current.error).toBe("network error"));

    result.current.reload();

    await waitFor(() => expect(result.current.data).toBe("retried"));

    expect(vi.mocked(api)).toHaveBeenCalledTimes(2);
  });

  it("includes query parameters in the cache key", async () => {
    vi.mocked(api).mockResolvedValue("ok");

    renderHook(() => useApiData<string>("/items?page=1"));
    renderHook(() => useApiData<string>("/items?page=2"));

    expect(vi.mocked(api)).toHaveBeenCalledTimes(2);
  });

  it("does not share responses across different paths", async () => {
    vi.mocked(api).mockResolvedValueOnce("a").mockResolvedValueOnce("b");

    const { result: r1 } = renderHook(() => useApiData<string>("/a"));
    const { result: r2 } = renderHook(() => useApiData<string>("/b"));

    await waitFor(() => expect(r1.current.data).toBe("a"));
    await waitFor(() => expect(r2.current.data).toBe("b"));
  });

  it("dedup is cleaned up after error so retry creates a new request", async () => {
    let callCount = 0;
    vi.mocked(api).mockImplementation(() => {
      callCount++;
      return callCount === 1
        ? Promise.reject(new Error("fail"))
        : Promise.resolve("recovered");
    });

    const { result } = renderHook(() => useApiData<string>("/dedup-cleanup"));

    await waitFor(() => expect(result.current.error).toBe("fail"));

    result.current.reload();

    await waitFor(() => expect(result.current.data).toBe("recovered"));

    expect(callCount).toBe(2);
  });
});
