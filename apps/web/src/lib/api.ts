export interface ApiFailureBody {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly fields?: Readonly<Record<string, string>>;
  };
}

export class ApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Readonly<Record<string, string>>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ApiEnvelope<T> {
  readonly data: T;
  readonly success: true;
}

let csrfToken = "";

export function setCsrfToken(value: string): void {
  csrfToken = value;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(path, init);
  if (response.status === 204) return undefined as T;
  return ((await response.json()) as ApiEnvelope<T>).data;
}

export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

async function apiFetch(path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  const method = (init.method ?? "GET").toUpperCase();
  if (init.body !== undefined && !(init.body instanceof FormData)) {
    headers.set("content-type", "application/json");
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && csrfToken !== "") {
    headers.set("x-csrf-token", csrfToken);
  }
  const response = await fetch(`${API_BASE}/api/v1${path}`, {
    ...init,
    credentials: "include",
    headers,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiFailureBody;
    throw new ApiError(
      response.status,
      body.error?.code ?? "REQUEST_FAILED",
      body.error?.message ?? "The request could not be completed.",
      (body.error as { fields?: Record<string, string> } | undefined)?.fields,
    );
  }
  return response;
}

export async function apiBlob(
  path: string,
  init: RequestInit = {},
): Promise<Blob> {
  return (await apiFetch(path, init)).blob();
}

export function jsonBody(value: unknown): Pick<RequestInit, "body"> {
  return { body: JSON.stringify(value) };
}

export function queryString(
  values: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "") params.set(key, value);
  }
  const query = params.toString();
  return query === "" ? "" : `?${query}`;
}
