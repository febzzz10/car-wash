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
