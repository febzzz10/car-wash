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
