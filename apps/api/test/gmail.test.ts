import { describe, expect, it } from "vitest";

import {
  buildInvoiceEmail,
  buildInvoiceMime,
  formatMinorAmount,
  invoiceEmailFilename,
  isValidEmail,
} from "../src/services/gmail";

describe("isValidEmail", () => {
  it("accepts ordinary addresses", () => {
    expect(isValidEmail("meera@example.com")).toBe(true);
    expect(isValidEmail("first.last+tag@sub.example.co.in")).toBe(true);
  });

  it("rejects malformed addresses", () => {
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("a b@example.com")).toBe(false);
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("@example.com")).toBe(false);
  });
});

describe("formatMinorAmount", () => {
  it("formats INR with the rupee symbol", () => {
    expect(formatMinorAmount(11800, "INR")).toBe("₹118.00");
    expect(formatMinorAmount(0, "INR")).toBe("₹0.00");
    expect(formatMinorAmount(100000, "INR")).toBe("₹1000.00");
  });

  it("formats other currencies with a space-separated code", () => {
    expect(formatMinorAmount(11800, "USD")).toBe("USD 118.00");
    expect(formatMinorAmount(500, "AED")).toBe("AED 5.00");
  });
});

describe("invoiceEmailFilename", () => {
  it("builds a safe filename from the invoice number", () => {
    expect(invoiceEmailFilename("WP-2026-000001")).toBe(
      "WashPro-WP-2026-000001.pdf",
    );
  });

  it("replaces unsafe characters with dashes", () => {
    expect(invoiceEmailFilename("WP 2026/0001")).toBe(
      "WashPro-WP-2026-0001.pdf",
    );
  });
});

describe("buildInvoiceEmail", () => {
  const base = {
    attachmentBytes: new Uint8Array([37, 80, 68, 70]),
    businessName: "WashPro",
    currencyCode: "INR",
    customerEmail: "meera@example.com",
    customerName: "Meera Shah",
    invoiceNumber: "WP-2026-000001",
    paymentStatus: "PENDING",
    serviceName: "Full Wash",
    totalMinor: 11800,
    vehicleRegistration: "KL 01 AA 1000",
  };

  it("builds subject, attachment filename and a link-free body", () => {
    const email = buildInvoiceEmail(base);
    expect(email.subject).toBe("Your WashPro Invoice – WP-2026-000001");
    expect(email.attachmentFilename).toBe("WashPro-WP-2026-000001.pdf");
    expect(email.text).toContain("Hi Meera Shah,");
    expect(email.text).toContain(
      "Your Full Wash for vehicle KL 01 AA 1000 is complete.",
    );
    expect(email.text).toContain("Amount: ₹118.00");
    expect(email.text).toContain("Payment: PENDING");
    expect(email.text).toContain("Your invoice is attached as a PDF.");
    expect(email.text).not.toContain("/invoice/");
    expect(email.text).not.toContain("http");
  });

  it("marks PAID invoices explicitly", () => {
    const email = buildInvoiceEmail({ ...base, paymentStatus: "PAID" });
    expect(email.text).toContain("Payment: PAID ✅");
  });

  it("falls back to a generic service name", () => {
    const email = buildInvoiceEmail({ ...base, serviceName: "" });
    expect(email.text).toContain("Your Car wash for vehicle");
  });
});

describe("buildInvoiceMime", () => {
  const pdf = new Uint8Array(300).map((_, index) => index % 256);

  it("produces a CRLF multipart message with an encoded subject and a base64 PDF attachment", () => {
    const mime = buildInvoiceMime({
      attachmentBytes: pdf,
      attachmentFilename: "WashPro-WP-2026-000001.pdf",
      fromDisplayName: "WashPro Test Co.",
      fromEmail: "washpro@test.example",
      subject: "Your WashPro Invoice – WP-2026-000001",
      text: "Hi Meera Shah,",
      to: "meera@example.com",
    });

    expect(mime.replaceAll("\r\n", "")).not.toContain("\n");
    const lines = mime.split("\r\n");
    expect(lines[0]).toBe("MIME-Version: 1.0");
    expect(lines).toContain("From: WashPro Test Co. <washpro@test.example>");
    expect(lines).toContain("To: meera@example.com");
    const subjectLine = lines.find((line) => line.startsWith("Subject: "))!;
    expect(subjectLine).toMatch(/^Subject: =\?UTF-8\?B\?.+\?=$/u);

    const boundary = lines
      .find((line) => line.trimStart().startsWith("boundary="))!
      .trim()
      .slice("boundary=".length)
      .replaceAll('"', "");
    expect(mime).toContain(`--${boundary}`);
    expect(mime).toContain(`--${boundary}--`);
    expect(mime).toContain(
      `Content-Type: application/pdf; name="WashPro-WP-2026-000001.pdf"`,
    );
    expect(mime).toContain(
      `Content-Disposition: attachment; filename="WashPro-WP-2026-000001.pdf"`,
    );
    expect(mime).toContain("Content-Transfer-Encoding: base64");

    const start = lines.findIndex(
      (line) => line === "Content-Transfer-Encoding: base64",
    );
    const end = lines.findIndex((line) => line === `--${boundary}--`);
    const encoded = lines
      .slice(start + 1, end)
      .filter((line) => /^[A-Za-z0-9+/=]+$/u.test(line))
      .join("");
    expect(encoded.length).toBeGreaterThan(0);
    const decoded = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    expect(decoded.length).toBe(pdf.length);
    expect(decoded.every((byte, index) => byte === pdf[index])).toBe(true);
  });

  it("does not RFC2047-encode pure-ASCII headers", () => {
    const mime = buildInvoiceMime({
      attachmentBytes: pdf,
      attachmentFilename: "WashPro-WP-2026-000001.pdf",
      fromDisplayName: "WashPro",
      fromEmail: "washpro@test.example",
      subject: "Your WashPro Invoice - WP-2026-000001",
      text: "Hi,",
      to: "meera@example.com",
    });
    const lines = mime.split("\r\n");
    expect(lines).toContain("From: WashPro <washpro@test.example>");
    expect(lines).toContain("Subject: Your WashPro Invoice - WP-2026-000001");
  });
});
