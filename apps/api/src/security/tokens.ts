import {
  decodeBase64Url,
  encodeBase64Url,
  encodeUtf8,
  timingSafeEqual,
} from "./encoding";

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encodeUtf8(value).buffer,
  );
  return encodeBase64Url(new Uint8Array(digest));
}

export async function hashSessionToken(
  token: string,
  pepper: string,
): Promise<string> {
  return sha256(`${token}\u0000${pepper}`);
}

export async function createCsrfToken(
  sessionToken: string,
  secret: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encodeUtf8(secret).buffer,
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encodeUtf8(`washpro-csrf:${sessionToken}`).buffer,
  );
  return encodeBase64Url(new Uint8Array(signature));
}

export function equalTokens(left: string, right: string): boolean {
  return timingSafeEqual(encodeUtf8(left), encodeUtf8(right));
}

async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encodeUtf8(secret).buffer,
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encodeUtf8(value).buffer,
  );
  return encodeBase64Url(new Uint8Array(signature));
}

export async function createInvoiceAccessToken(
  invoiceId: string,
  expiresAt: string,
  secret: string,
): Promise<string> {
  const encodedId = encodeBase64Url(encodeUtf8(invoiceId));
  const expiry = Math.floor(Date.parse(expiresAt) / 1000);
  const payload = `${encodedId}.${expiry}`;
  return `${payload}.${await hmac(`washpro-invoice:${payload}`, secret)}`;
}

export function invoiceIdFromAccessToken(token: string): string | null {
  const [encodedId, expiry, signature] = token.split(".");
  if (
    encodedId === undefined ||
    expiry === undefined ||
    signature === undefined
  )
    return null;
  try {
    return new TextDecoder().decode(decodeBase64Url(encodedId));
  } catch {
    return null;
  }
}
