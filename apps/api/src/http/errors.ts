import type { ApiFailure, ErrorCode } from "@washpro/contracts";

export class ApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly fields?: Readonly<Record<string, string>>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function unhandledErrorBody(
  error: unknown,
  requestId: string,
): ApiFailure {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(
    JSON.stringify({
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: msg,
      requestId,
    }),
  );
  return {
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred.",
      requestId,
    },
    success: false,
  };
}
