export interface FormattingPreferences {
  readonly currency: string;
  readonly dateFormat: string;
  readonly locale: string;
  readonly timeZone: string;
}

const defaults: FormattingPreferences = {
  currency: "INR",
  dateFormat: "DD/MM/YYYY",
  locale: "en-IN",
  timeZone: "Asia/Kolkata",
};

let activePreferences = defaults;

export function configureFormatting(
  preferences: Partial<FormattingPreferences> | null,
): void {
  activePreferences = { ...defaults, ...preferences };
}

function validLocale(locale: string): string {
  try {
    new Intl.NumberFormat(locale);
    return locale;
  } catch {
    return defaults.locale;
  }
}

function validTimeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return timeZone;
  } catch {
    return defaults.timeZone;
  }
}

function dateLocale(): string {
  if (activePreferences.dateFormat === "MM/DD/YYYY") return "en-US";
  if (activePreferences.dateFormat === "YYYY-MM-DD") return "en-CA";
  return "en-GB";
}

export function money(minor: number, currency?: string): string {
  return new Intl.NumberFormat(validLocale(activePreferences.locale), {
    currency: currency ?? activePreferences.currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(minor / 100);
}

export function dateTime(value: string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.DateTimeFormat(dateLocale(), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: validTimeZone(activePreferences.timeZone),
  }).format(new Date(value));
}

export function duration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = Math.max(0, Math.floor(seconds % 60));
  return [hours, minutes, remaining]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

export function titleCase(value: string): string {
  return value
    .toLocaleLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/gu, (letter) => letter.toLocaleUpperCase());
}

export function parseDecimalToMinor(value: string): number {
  const clean = value.trim();
  if (clean.length === 0) throw new Error("Enter an amount.");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) {
    throw new Error("Enter a valid amount with up to two decimal places.");
  }
  const parts = clean.split(".");
  const major = parseInt(parts[0]!, 10);
  const minor = parts.length === 2 ? parseInt(parts[1]!.padEnd(2, "0"), 10) : 0;
  if (major > Math.floor((Number.MAX_SAFE_INTEGER - minor) / 100)) {
    throw new Error("Amount is too large.");
  }
  return major * 100 + minor;
}
