import { describe, expect, it } from "vitest";

import {
  fileMetadataSchema,
  moneyMinorSchema,
  paginationSchema,
  washJobStatusSchema,
} from "./schemas";

describe("shared contract schemas", () => {
  it("accepts every documented wash job status", () => {
    const statuses = [
      "DRAFT",
      "WAITING",
      "IN_PROGRESS",
      "PAUSED",
      "COMPLETED",
      "CANCELLED",
    ];

    expect(statuses.map((status) => washJobStatusSchema.parse(status))).toEqual(
      statuses,
    );
  });

  it("rejects fractional and negative minor-unit money", () => {
    expect(moneyMinorSchema.safeParse(1050).success).toBe(true);
    expect(moneyMinorSchema.safeParse(10.5).success).toBe(false);
    expect(moneyMinorSchema.safeParse(-1).success).toBe(false);
  });

  it("normalizes pagination defaults and caps page size", () => {
    expect(paginationSchema.parse({})).toEqual({ page: 1, pageSize: 25 });
    expect(paginationSchema.safeParse({ page: 1, pageSize: 101 }).success).toBe(
      false,
    );
  });

  it("rejects unsafe file metadata", () => {
    expect(
      fileMetadataSchema.safeParse({
        mimeType: "application/x-msdownload",
        sizeBytes: 10,
        checksumSha256: "a".repeat(64),
      }).success,
    ).toBe(false);
    expect(
      fileMetadataSchema.safeParse({
        mimeType: "image/jpeg",
        sizeBytes: 0,
        checksumSha256: "not-a-checksum",
      }).success,
    ).toBe(false);
  });
});
