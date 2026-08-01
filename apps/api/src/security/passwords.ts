import {
  decodeBase64Url,
  encodeBase64Url,
  encodeUtf8,
  timingSafeEqual,
} from "./encoding";

const algorithmName = "PBKDF2";
const digestName = "SHA-256";
// Cloudflare Workers/workerd rejects PBKDF2 requests above 100,000 iterations
// ("Pbkdf2 failed: iteration counts above 100000 are not supported"), so
// 100,000 is both the work factor for new hashes and the platform maximum.
export const PBKDF2_ITERATIONS = 100_000;
const keyLengthBits = 256;
const format = "pbkdf2-sha256";

export function passwordPolicyError(password: string): string | null {
  if (password.length < 12 || password.length > 256)
    return "Use 12 to 256 characters.";
  if (!/[a-z]/u.test(password)) return "Add a lowercase letter.";
  if (!/[A-Z]/u.test(password)) return "Add an uppercase letter.";
  if (!/[0-9]/u.test(password)) return "Add a number.";
  if (!/[^A-Za-z0-9]/u.test(password)) return "Add a symbol.";
  return null;
}

export function assertPbkdf2IterationCount(rounds: number): void {
  if (!Number.isInteger(rounds) || rounds > PBKDF2_ITERATIONS) {
    throw new Error(
      `Internal configuration error: PBKDF2 iteration count must not exceed ${PBKDF2_ITERATIONS} in the Cloudflare Workers runtime.`,
    );
  }
}

async function derive(
  password: string,
  pepper: string,
  salt: Uint8Array<ArrayBuffer>,
  rounds: number,
): Promise<Uint8Array> {
  assertPbkdf2IterationCount(rounds);
  const material = await globalThis.crypto.subtle.importKey(
    "raw",
    encodeUtf8(`${password}\u0000${pepper}`).buffer,
    { name: algorithmName },
    false,
    ["deriveBits"],
  );
  const bits = await globalThis.crypto.subtle.deriveBits(
    {
      hash: digestName,
      iterations: rounds,
      name: algorithmName,
      salt: salt.buffer,
    },
    material,
    keyLengthBits,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(
  password: string,
  pepper: string,
): Promise<string> {
  const salt = new Uint8Array(new ArrayBuffer(16));
  globalThis.crypto.getRandomValues(salt);
  const derived = await derive(password, pepper, salt, PBKDF2_ITERATIONS);
  return [
    format,
    String(PBKDF2_ITERATIONS),
    encodeBase64Url(salt),
    encodeBase64Url(derived),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  pepper: string,
  encodedHash: string,
): Promise<boolean> {
  const [storedFormat, roundsText, saltText, hashText] = encodedHash.split("$");
  const rounds = Number(roundsText);
  if (
    storedFormat !== format ||
    !Number.isInteger(rounds) ||
    rounds < PBKDF2_ITERATIONS ||
    rounds > PBKDF2_ITERATIONS ||
    saltText === undefined ||
    hashText === undefined
  ) {
    return false;
  }
  try {
    const actual = await derive(
      password,
      pepper,
      decodeBase64Url(saltText),
      rounds,
    );
    return timingSafeEqual(actual, decodeBase64Url(hashText));
  } catch {
    return false;
  }
}
