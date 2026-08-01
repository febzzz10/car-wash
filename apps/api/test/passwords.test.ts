import { describe, expect, it } from "vitest";

import { decodeBase64Url } from "../src/security/encoding";
import {
  assertPbkdf2IterationCount,
  hashPassword,
  passwordPolicyError,
  PBKDF2_ITERATIONS,
  verifyPassword,
} from "../src/security/passwords";

const pepper = "test-session-pepper";

describe("password hashing", () => {
  it("uses exactly 100,000 iterations for new hashes", async () => {
    const encoded = await hashPassword("WashPro!234", pepper);
    const parts = encoded.split("$");
    expect(parts.length).toBe(4);
    expect(parts[0]).toBe("pbkdf2-sha256");
    expect(parts[1]).toBe(String(PBKDF2_ITERATIONS));
    expect(parts[1]).toBe("100000");
  });

  it("stores salt and derived hash metadata in the versioned format", async () => {
    const encoded = await hashPassword("WashPro!234", pepper);
    const parts = encoded.split("$");
    expect(parts[2]).toBeDefined();
    expect(parts[3]).toBeDefined();
    expect(decodeBase64Url(parts[2]!).length).toBe(16);
    expect(decodeBase64Url(parts[3]!).length).toBe(32);
  });

  it("verifies the same password successfully", async () => {
    const encoded = await hashPassword("WashPro!234", pepper);
    await expect(
      verifyPassword("WashPro!234", pepper, encoded),
    ).resolves.toBe(true);
  });

  it("rejects a wrong password", async () => {
    const encoded = await hashPassword("WashPro!234", pepper);
    await expect(
      verifyPassword("WrongPass!999", pepper, encoded),
    ).resolves.toBe(false);
  });

  it("produces a different salt and hash for each call", async () => {
    const first = await hashPassword("WashPro!234", pepper);
    const second = await hashPassword("WashPro!234", pepper);
    expect(first).not.toBe(second);
  });

  it("rejects iteration counts above 100,000 as an internal configuration error", () => {
    expect(() => assertPbkdf2IterationCount(600_000)).toThrow(
      "Internal configuration error",
    );
    expect(() => assertPbkdf2IterationCount(600_000)).toThrow(/100000/);
    expect(() => assertPbkdf2IterationCount(PBKDF2_ITERATIONS)).not.toThrow();
    expect(() => assertPbkdf2IterationCount(99_999)).not.toThrow();
  });

  it("fails safely on hashes whose stored iteration count exceeds 100,000", async () => {
    const unsupported =
      "pbkdf2-sha256$600000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    await expect(verifyPassword("anything", pepper, unsupported)).resolves.toBe(
      false,
    );
  });

  it("fails safely on malformed hashes", async () => {
    await expect(verifyPassword("WashPro!234", pepper, "")).resolves.toBe(
      false,
    );
    await expect(
      verifyPassword("WashPro!234", pepper, "not-a-hash"),
    ).resolves.toBe(false);
    await expect(
      verifyPassword(
        "WashPro!234",
        pepper,
        "scrypt-sha256$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      ),
    ).resolves.toBe(false);
    await expect(
      verifyPassword("WashPro!234", pepper, "pbkdf2-sha256$abc$salt$hash"),
    ).resolves.toBe(false);
    await expect(
      verifyPassword("WashPro!234", pepper, "pbkdf2-sha256$100000$salt$hash"),
    ).resolves.toBe(false);
    await expect(
      verifyPassword(
        "WashPro!234",
        pepper,
        "pbkdf2-sha256$100000$!!!not-base64-url!!!$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      ),
    ).resolves.toBe(false);
  });

  it("enforces the password policy for empty and invalid passwords", () => {
    expect(passwordPolicyError("")).toMatch(/12 to 256 characters/u);
    expect(passwordPolicyError("short")).toMatch(/12 to 256 characters/u);
    expect(passwordPolicyError("lowercaseonly123")).toMatch(/uppercase/u);
    expect(passwordPolicyError("UPPERCASEONLY123")).toMatch(/lowercase/u);
    expect(passwordPolicyError("NoDigitsHere!")).toMatch(/number/u);
    expect(passwordPolicyError("NoSymbols12345")).toMatch(/symbol/u);
    expect(passwordPolicyError("WashPro!23456")).toBeNull();
  });
});
