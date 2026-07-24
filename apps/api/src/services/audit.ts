import type { AuthContext } from "../types";

const sensitiveKeyPattern =
  /password|token|secret|authorization|cookie|card|pin/iu;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        sensitiveKeyPattern.test(key) ? "[REDACTED]" : redact(nested),
      ]),
    );
  }
  return value;
}

export interface AuditInput {
  readonly action: string;
  readonly auth: AuthContext;
  readonly deviceInformation?: string | null;
  readonly ipAddress?: string | null;
  readonly next?: unknown;
  readonly previous?: unknown;
  readonly reason?: string | null;
  readonly recordId?: string | null;
  readonly recordType: string;
  readonly requestId: string;
  readonly severity?: "INFO" | "WARNING" | "CRITICAL";
  readonly userAgent?: string | null;
}

export function auditStatement(
  env: Env,
  input: AuditInput,
): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO audit_logs (
      id, organization_id, branch_id, user_id, action, record_type,
      record_id, severity, previous_value_json, new_value_json, reason,
      request_id, ip_address, user_agent, device_information, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    crypto.randomUUID(),
    input.auth.organizationId,
    input.auth.branchId,
    input.auth.userId,
    input.action,
    input.recordType,
    input.recordId ?? null,
    input.severity ?? "INFO",
    input.previous === undefined
      ? null
      : JSON.stringify(redact(input.previous)),
    input.next === undefined ? null : JSON.stringify(redact(input.next)),
    input.reason ?? null,
    input.requestId,
    input.ipAddress ?? null,
    input.userAgent ?? null,
    input.deviceInformation ?? null,
    new Date().toISOString(),
  );
}
