import type { ErrorCode } from "@washpro/contracts";

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
