const WHITESPACE = /\s+/g;

export function normalizePhone(
  input: string,
  defaultCountryCode = "91",
): string {
  let digits = input.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) digits = `${defaultCountryCode}${digits}`;
  if (digits.length < 8 || digits.length > 15) {
    throw new Error("Enter a valid phone number.");
  }
  return `+${digits}`;
}

export function normalizeRegistration(input: string): {
  readonly display: string;
  readonly search: string;
} {
  const display = input
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(WHITESPACE, " ")
    .trim();
  const search = display.replace(/\s/g, "");
  if (search.length < 3) throw new Error("Enter a valid registration number.");
  return { display, search };
}

export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

export function normalizeNameSearch(input: string): string {
  return input.trim().toLocaleLowerCase("en-IN").replace(WHITESPACE, " ");
}

export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function normalizeVehicleModel(
  input: string,
): { name: string; normalizedName: string } | null {
  const name = input.trim().replace(WHITESPACE, " ");
  if (name.length === 0) return null;
  return { name, normalizedName: name.toLowerCase() };
}

export function normalizeVehicleMake(
  input: string,
): { name: string; normalizedName: string } | null {
  return normalizeVehicleModel(input);
}

const supportedCurrencies: ReadonlySet<string> = new Set(
  typeof Intl !== "undefined" && typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("currency")
    : ["AED", "AFN", "ALL", "AMD", "ANG", "AOA", "ARS", "AUD", "AWG", "AZN",
       "BAM", "BBD", "BDT", "BGN", "BHD", "BIF", "BMD", "BND", "BOB", "BRL",
       "BSD", "BTN", "BWP", "BYN", "BZD", "CAD", "CDF", "CHF", "CLP", "CNY",
       "COP", "CRC", "CUP", "CVE", "CZK", "DJF", "DKK", "DOP", "DZD", "EGP",
       "ERN", "ETB", "EUR", "FJD", "FKP", "FOK", "GBP", "GEL", "GGP", "GHS",
       "GIP", "GMD", "GNF", "GTQ", "GYD", "HKD", "HNL", "HRK", "HTG", "HUF",
       "IDR", "ILS", "IMP", "INR", "IQD", "IRR", "ISK", "JEP", "JMD", "JOD",
       "JPY", "KES", "KGS", "KHR", "KID", "KMF", "KRW", "KWD", "KYD", "KZT",
       "LAK", "LBP", "LKR", "LRD", "LSL", "LYD", "MAD", "MDL", "MGA", "MKD",
       "MMK", "MNT", "MOP", "MRU", "MUR", "MVR", "MWK", "MXN", "MYR", "MZN",
       "NAD", "NGN", "NIO", "NOK", "NPR", "NZD", "OMR", "PAB", "PEN", "PGK",
       "PHP", "PKR", "PLN", "PYG", "QAR", "RON", "RSD", "RUB", "RWF", "SAR",
       "SBD", "SCR", "SDG", "SEK", "SGD", "SHP", "SLE", "SLL", "SOS", "SRD",
       "SSP", "STN", "SYP", "SZL", "THB", "TJS", "TMT", "TND", "TOP", "TRY",
       "TTD", "TVD", "TWD", "TZS", "UAH", "UGX", "USD", "UYU", "UZS", "VES",
       "VND", "VUV", "WST", "XAF", "XCD", "XOF", "XPF", "YER", "ZAR", "ZMW",
       "ZWG"],
);

export function validateCurrencyCode(input: string): {
  readonly valid: false;
  readonly reason: string;
} | {
  readonly valid: true;
  readonly currency: string;
} {
  const trimmed = input.trim();
  if (trimmed.length === 0) return { valid: false, reason: "Enter a currency code." };
  const upper = trimmed.toUpperCase();
  if (!/^[A-Z]{3}$/.test(upper)) return { valid: false, reason: "Enter a valid three-letter currency code, for example INR." };
  if (!supportedCurrencies.has(upper)) return { valid: false, reason: `"${upper}" is not a supported currency code.` };
  return { valid: true, currency: upper };
}
