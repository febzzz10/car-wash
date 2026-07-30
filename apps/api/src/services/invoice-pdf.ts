import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

export interface InvoicePdfItem {
  readonly name: string;
  readonly quantity: number;
  readonly totalMinor: number;
  readonly unitPriceMinor: number;
}

export interface InvoicePdfSnapshot {
  readonly balanceMinor: number;
  readonly businessAddress: string;
  readonly businessContact: string;
  readonly businessName: string;
  readonly couponDiscountMinor?: number;
  readonly currencyCode: string;
  readonly customerName: string;
  readonly customerPhone: string;
  readonly discountMinor: number;
  readonly footer: string;
  readonly invoiceNumber: string;
  readonly issuedAt: string;
  readonly items: readonly InvoicePdfItem[];
  readonly manualDiscountMinor?: number;
  readonly paidMinor: number;
  readonly paymentStatus: string;
  readonly referralCode: string | null;
  readonly referralDiscountMinor?: number;
  readonly rewardDiscountMinor?: number;
  readonly roundingMinor?: number;
  readonly staffName: string;
  readonly subtotalMinor: number;
  readonly taxMinor: number;
  readonly taxRegistration: string | null;
  readonly thankYouMessage: string;
  readonly terms: string;
  readonly totalMinor: number;
  readonly vehicle: string;
  readonly washCompletedAt: string | null;
  readonly washDurationSeconds: number | null;
  readonly washStartedAt: string | null;
}

export interface InvoiceLogo {
  readonly bytes: Uint8Array;
  readonly mimeType: "image/jpeg" | "image/png";
}

const navy = rgb(11 / 255, 31 / 255, 51 / 255);
const blue = rgb(22 / 255, 153 / 255, 221 / 255);
const ink = rgb(28 / 255, 38 / 255, 48 / 255);
const muted = rgb(94 / 255, 107 / 255, 119 / 255);
const pale = rgb(237 / 255, 247 / 255, 252 / 255);

function safeText(value: string): string {
  return value.normalize("NFKD").replace(/[^\x20-\x7E]/gu, "?");
}

function money(minor: number, currency: string): string {
  return `${currency} ${(minor / 100).toFixed(2)}`;
}

function dateTime(value: string | null): string {
  if (value === null) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : date.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

function drawText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  size = 9,
  color = ink,
): void {
  page.drawText(safeText(text), { color, font, size, x, y });
}

export async function buildInvoicePdf(
  snapshot: InvoicePdfSnapshot,
  logo?: InvoiceLogo,
): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  let page = document.addPage([595.28, 841.89]);
  let y = 790;

  const header = async (): Promise<void> => {
    page.drawRectangle({
      color: navy,
      height: 108,
      width: 595.28,
      x: 0,
      y: 733.89,
    });
    let textX = 42;
    if (logo !== undefined) {
      try {
        const image =
          logo.mimeType === "image/png"
            ? await document.embedPng(logo.bytes)
            : await document.embedJpg(logo.bytes);
        const dimensions = image.scaleToFit(58, 58);
        page.drawImage(image, {
          height: dimensions.height,
          width: dimensions.width,
          x: 42,
          y: 765,
        });
        textX = 116;
      } catch {
        textX = 42;
      }
    }
    drawText(page, bold, snapshot.businessName, textX, 802, 18, rgb(1, 1, 1));
    drawText(
      page,
      regular,
      snapshot.businessAddress,
      textX,
      784,
      8.5,
      rgb(0.86, 0.92, 0.96),
    );
    drawText(
      page,
      regular,
      snapshot.businessContact,
      textX,
      768,
      8.5,
      rgb(0.86, 0.92, 0.96),
    );
    drawText(page, bold, "TAX INVOICE", 438, 802, 14, rgb(1, 1, 1));
    drawText(
      page,
      regular,
      snapshot.invoiceNumber,
      438,
      782,
      9.5,
      rgb(0.86, 0.92, 0.96),
    );
    drawText(
      page,
      regular,
      dateTime(snapshot.issuedAt),
      438,
      766,
      7.5,
      rgb(0.86, 0.92, 0.96),
    );
  };
  await header();
  y = 705;

  page.drawRectangle({
    borderColor: rgb(0.82, 0.87, 0.9),
    borderWidth: 1,
    color: rgb(1, 1, 1),
    height: 92,
    width: 511,
    x: 42,
    y: y - 76,
  });
  drawText(page, bold, "BILL TO", 56, y, 8, blue);
  drawText(page, bold, snapshot.customerName, 56, y - 18, 11);
  drawText(page, regular, snapshot.customerPhone, 56, y - 35, 8.5, muted);
  drawText(page, bold, "VEHICLE", 300, y, 8, blue);
  drawText(page, bold, snapshot.vehicle, 300, y - 18, 10);
  drawText(
    page,
    regular,
    `Handled by ${snapshot.staffName}`,
    300,
    y - 35,
    8.5,
    muted,
  );
  drawText(
    page,
    regular,
    `Wash: ${dateTime(snapshot.washStartedAt)} to ${dateTime(snapshot.washCompletedAt)}`,
    56,
    y - 57,
    7.5,
    muted,
  );
  drawText(
    page,
    regular,
    `Active duration: ${snapshot.washDurationSeconds ?? 0} seconds`,
    300,
    y - 57,
    7.5,
    muted,
  );
  y -= 112;

  const drawTableHeader = (): void => {
    page.drawRectangle({
      color: pale,
      height: 25,
      width: 511,
      x: 42,
      y: y - 18,
    });
    drawText(page, bold, "SERVICE", 52, y - 10, 8, navy);
    drawText(page, bold, "QTY", 358, y - 10, 8, navy);
    drawText(page, bold, "RATE", 408, y - 10, 8, navy);
    drawText(page, bold, "AMOUNT", 488, y - 10, 8, navy);
    y -= 31;
  };
  drawTableHeader();
  for (const item of snapshot.items) {
    if (y < 135) {
      page = document.addPage([595.28, 841.89]);
      await header();
      y = 705;
      drawTableHeader();
    }
    drawText(page, regular, item.name, 52, y, 9);
    drawText(page, regular, String(item.quantity), 365, y, 9);
    drawText(
      page,
      regular,
      money(item.unitPriceMinor, snapshot.currencyCode),
      408,
      y,
      8.5,
    );
    drawText(
      page,
      bold,
      money(item.totalMinor, snapshot.currencyCode),
      488,
      y,
      8.5,
    );
    page.drawLine({
      color: rgb(0.9, 0.92, 0.94),
      end: { x: 553, y: y - 10 },
      start: { x: 42, y: y - 10 },
      thickness: 0.6,
    });
    y -= 28;
  }

  y -= 8;
  const totalsX = 325;
  const valueX = 470;
  const discountRows: [string, number][] = [];
  if ((snapshot.couponDiscountMinor ?? 0) > 0) discountRows.push(["Coupon", -snapshot.couponDiscountMinor!]);
  if ((snapshot.referralDiscountMinor ?? 0) > 0) discountRows.push(["Referral", -snapshot.referralDiscountMinor!]);
  if ((snapshot.rewardDiscountMinor ?? 0) > 0) discountRows.push(["Reward", -snapshot.rewardDiscountMinor!]);
  if ((snapshot.manualDiscountMinor ?? 0) > 0) discountRows.push(["Manual discount", -snapshot.manualDiscountMinor!]);
  for (const [label, value, strong] of [
    ["Subtotal", snapshot.subtotalMinor, false],
    ...discountRows,
    ...(discountRows.length === 0 ? [["Discount", -snapshot.discountMinor] as [string, number]] : []),
    ["Tax", snapshot.taxMinor, false],
    ...((snapshot.roundingMinor ?? 0) !== 0 ? [["Rounding", snapshot.roundingMinor] as [string, number]] : []),
    ["Total", snapshot.totalMinor, true],
    ["Paid", snapshot.paidMinor, false],
    ["Balance", snapshot.balanceMinor, true],
  ] as const) {
    drawText(
      page,
      strong ? bold : regular,
      label,
      totalsX,
      y,
      strong ? 10 : 8.5,
      strong ? navy : muted,
    );
    drawText(
      page,
      strong ? bold : regular,
      money(value, snapshot.currencyCode),
      valueX,
      y,
      strong ? 10 : 8.5,
      strong ? navy : ink,
    );
    y -= strong ? 23 : 18;
  }

  y = Math.min(y - 8, 205);
  page.drawRectangle({ color: pale, height: 66, width: 511, x: 42, y: y - 48 });
  drawText(
    page,
    bold,
    `Payment status: ${snapshot.paymentStatus}`,
    56,
    y - 2,
    9,
    navy,
  );
  drawText(
    page,
    regular,
    snapshot.referralCode === null
      ? "Share WashPro with a friend."
      : `Your referral code: ${snapshot.referralCode}`,
    56,
    y - 21,
    8.5,
    ink,
  );
  drawText(page, regular, snapshot.thankYouMessage, 56, y - 38, 8.5, muted);

  drawText(page, regular, snapshot.terms, 42, 70, 7, muted);
  drawText(page, regular, snapshot.footer, 42, 52, 7.5, muted);
  drawText(
    page,
    regular,
    snapshot.taxRegistration === null
      ? ""
      : `Tax registration: ${snapshot.taxRegistration}`,
    420,
    52,
    7,
    muted,
  );
  drawText(page, regular, "Generated by WashPro", 42, 34, 7, blue);

  document.setTitle(`Invoice ${snapshot.invoiceNumber}`);
  document.setAuthor(snapshot.businessName);
  document.setCreator("WashPro");
  document.setSubject(`Car wash invoice ${snapshot.invoiceNumber}`);
  return document.save({ addDefaultPage: false, useObjectStreams: false });
}
