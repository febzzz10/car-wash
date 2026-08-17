import {
  encodeBase64Url,
  encodeUtf8,
  timingSafeEqual,
} from "./encoding";

export async function sha256(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
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
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    encodeUtf8(secret).buffer,
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    encodeUtf8(`washpro-csrf:${sessionToken}`).buffer,
  );
  return encodeBase64Url(new Uint8Array(signature));
}

export function equalTokens(left: string, right: string): boolean {
  return timingSafeEqual(encodeUtf8(left), encodeUtf8(right));
}
