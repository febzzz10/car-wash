const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/u;
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_SEND_URL =
  "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

export interface InvoiceEmailInput {
  readonly attachmentBytes: Uint8Array;
  readonly businessName: string;
  readonly customerEmail: string;
  readonly customerName: string;
  readonly currencyCode: string;
  readonly invoiceNumber: string;
  readonly paymentStatus: string;
  readonly serviceName: string;
  readonly totalMinor: number;
  readonly vehicleRegistration: string;
}

export interface BuiltInvoiceEmail {
  readonly attachmentFilename: string;
  readonly subject: string;
  readonly text: string;
}

export type GmailErrorCode =
  | "NOT_CONFIGURED"
  | "AUTH_FAILED"
  | "API_REJECTED"
  | "RATE_LIMITED"
  | "TRANSPORT_FAILED";

export class GmailError extends Error {
  public constructor(
    public readonly code: GmailErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GmailError";
  }
}

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value);
}

export function formatMinorAmount(minor: number, currencyCode: string): string {
  const amount = (minor / 100).toFixed(2);
  return currencyCode.toUpperCase() === "INR"
    ? `₹${amount}`
    : `${currencyCode} ${amount}`;
}

export function invoiceEmailFilename(invoiceNumber: string): string {
  const safe = invoiceNumber.replace(/[^A-Za-z0-9._-]/gu, "-");
  return `WashPro-${safe}.pdf`;
}

export function buildInvoiceEmail(input: InvoiceEmailInput): BuiltInvoiceEmail {
  const attachmentFilename = invoiceEmailFilename(input.invoiceNumber);
  const subject = `Your WashPro Invoice – ${input.invoiceNumber}`;
  const amount = formatMinorAmount(input.totalMinor, input.currencyCode);
  const serviceName = input.serviceName || "Car wash";
  const payment =
    input.paymentStatus === "PAID" ? "PAID ✅" : input.paymentStatus;
  const text = [
    `Hi ${input.customerName},`,
    "",
    "Thank you for choosing WashPro! 🚗✨",
    "",
    `Your ${serviceName} for vehicle ${input.vehicleRegistration} is complete.`,
    "",
    `Amount: ${amount}`,
    `Payment: ${payment}`,
    "",
    "Your invoice is attached as a PDF.",
    "",
    "Thanks for visiting WashPro.",
    "See you again! 😊",
    "",
    "WashPro",
  ].join("\n");
  return { attachmentFilename, subject, text };
}

function rfc2047(value: string): string {
  if (/^[\x20-\x7E]*$/u.test(value)) return value;
  return `=?UTF-8?B?${bytesToBase64(new TextEncoder().encode(value))}?=`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }
  return btoa(binary);
}

function base64Url(value: string): string {
  return btoa(value)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

interface MimeParts {
  readonly attachmentBytes: Uint8Array;
  readonly attachmentFilename: string;
  readonly fromDisplayName: string;
  readonly fromEmail: string;
  readonly subject: string;
  readonly text: string;
  readonly to: string;
}

export function buildInvoiceMime(parts: MimeParts): string {
  const boundary = `washpro-${crypto.randomUUID()}`;
  const lines = [
    "MIME-Version: 1.0",
    `From: ${rfc2047(parts.fromDisplayName)} <${parts.fromEmail}>`,
    `To: ${parts.to}`,
    `Subject: ${rfc2047(parts.subject)}`,
    "Content-Type: multipart/mixed;",
    ` boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    parts.text,
    "",
    `--${boundary}`,
    `Content-Type: application/pdf; name="${parts.attachmentFilename}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${parts.attachmentFilename}"`,
    "",
    chunkBase64(bytesToBase64(parts.attachmentBytes), 76),
    `--${boundary}--`,
  ];
  return lines.join("\r\n");
}

function chunkBase64(value: string, width: number): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < value.length; offset += width) {
    chunks.push(value.slice(offset, offset + width));
  }
  return chunks.join("\r\n");
}

async function fetchAccessToken(env: Env): Promise<string> {
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = env;
  const response = await fetch(TOKEN_URL, {
    body: new URLSearchParams({
      client_id: GMAIL_CLIENT_ID,
      client_secret: GMAIL_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: GMAIL_REFRESH_TOKEN,
    }),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new GmailError(
      "AUTH_FAILED",
      "The email service could not authenticate with Google.",
    );
  }
  const body = (await response.json()) as { access_token?: string };
  if (typeof body.access_token !== "string" || body.access_token === "") {
    throw new GmailError(
      "AUTH_FAILED",
      "The email service could not authenticate with Google.",
    );
  }
  return body.access_token;
}

export interface SendInvoiceEmailInput {
  readonly attachmentBytes: Uint8Array;
  readonly attachmentFilename: string;
  readonly fromDisplayName: string;
  readonly subject: string;
  readonly text: string;
  readonly to: string;
}

export async function sendInvoiceEmail(
  env: Env,
  input: SendInvoiceEmailInput,
): Promise<{ messageId: string; sentAt: string }> {
  const {
    GMAIL_CLIENT_ID,
    GMAIL_CLIENT_SECRET,
    GMAIL_REFRESH_TOKEN,
    GMAIL_SENDER_EMAIL,
  } = env;
  if (
    GMAIL_CLIENT_ID === "" ||
    GMAIL_CLIENT_SECRET === "" ||
    GMAIL_REFRESH_TOKEN === "" ||
    GMAIL_SENDER_EMAIL === ""
  ) {
    throw new GmailError("NOT_CONFIGURED", "Invoice email is not configured.");
  }
  const accessToken = await fetchAccessToken(env);
  const mime = buildInvoiceMime({
    attachmentBytes: input.attachmentBytes,
    attachmentFilename: input.attachmentFilename,
    fromDisplayName: input.fromDisplayName,
    fromEmail: GMAIL_SENDER_EMAIL,
    subject: input.subject,
    text: input.text,
    to: input.to,
  });
  let response: Response;
  try {
    response = await fetch(GMAIL_SEND_URL, {
      body: JSON.stringify({ raw: base64Url(mime) }),
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      method: "POST",
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new GmailError(
      "TRANSPORT_FAILED",
      "The email service could not be reached.",
    );
  }
  if (response.status === 401 || response.status === 403) {
    throw new GmailError(
      "AUTH_FAILED",
      "The email service could not authenticate with Google.",
    );
  }
  if (response.status === 429) {
    throw new GmailError(
      "RATE_LIMITED",
      "The email service is busy. Try again later.",
    );
  }
  if (!response.ok) {
    throw new GmailError(
      "API_REJECTED",
      "The email service rejected the message.",
    );
  }
  const body = (await response.json()) as { id?: string };
  if (typeof body.id !== "string" || body.id === "") {
    throw new GmailError(
      "API_REJECTED",
      "The email service rejected the message.",
    );
  }
  return { messageId: body.id, sentAt: new Date().toISOString() };
}
