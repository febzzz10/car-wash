import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { buildInvoicePdf } from "../apps/api/src/services/invoice-pdf.ts";

const outputDirectory = resolve("output/pdf");
await mkdir(outputDirectory, { recursive: true });

const pdf = await buildInvoicePdf({
  balanceMinor: 34300,
  businessAddress: "1 Water Road, Kochi, Kerala 682001",
  businessContact: "Configured business contact",
  businessName: "WashPro Car Care",
  currencyCode: "INR",
  customerName: "Meera Shah",
  customerPhone: "Redacted for preview",
  discountMinor: 1500,
  footer: "WashPro Car Care - clean cars, clear records.",
  invoiceNumber: "WP-2026-000001",
  issuedAt: "2026-07-23T10:35:00.000Z",
  items: [
    {
      name: "Premium exterior and interior wash",
      quantity: 1,
      totalMinor: 27140,
      unitPriceMinor: 25000,
    },
    { name: "Wax finish", quantity: 1, totalMinor: 8660, unitPriceMinor: 8000 },
  ],
  paidMinor: 1500,
  paymentStatus: "PARTIALLY_PAID",
  referralCode: "MEERA123",
  staffName: "Ravi Kumar",
  subtotalMinor: 33000,
  taxMinor: 4300,
  taxRegistration: "32ABCDE1234F1Z5",
  terms:
    "Payment records and refunds are retained as append-only transactions.",
  thankYouMessage: "Thank you for choosing WashPro.",
  totalMinor: 35800,
  vehicle: "KL 01 AA 1000 - SUV - Tata Nexon",
  washCompletedAt: "2026-07-23T10:30:00.000Z",
  washDurationSeconds: 1800,
  washStartedAt: "2026-07-23T10:00:00.000Z",
});

await writeFile(resolve(outputDirectory, "washpro-invoice-preview.pdf"), pdf);
