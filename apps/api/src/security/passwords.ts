import {
  decodeBase64Url,
  encodeBase64Url,
  encodeUtf8,
  timingSafeEqual,
} from "./encoding";

const algorithmName = "PBKDF2";
const digestName = "SHA-256";
const iterations = 600_000;
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

async function derive(
  password: string,
  pepper: string,
  salt: Uint8Array<ArrayBuffer>,
  rounds: number,
): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey(
    "raw",
    encodeUtf8(`${password}\u0000${pepper}`).buffer,
    algorithmName,
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
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
  crypto.getRandomValues(salt);
  const derived = await derive(password, pepper, salt, iterations);
  return [
    format,
    String(iterations),
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
    rounds < 100_000 ||
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
