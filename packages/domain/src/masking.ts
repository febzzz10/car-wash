export function maskPhoneNumber(input: string | null | undefined): string {
  if (input === null || input === undefined) return "";
  const trimmed = input.trim();
  if (trimmed === "") return "";
  const digits = trimmed.replace(/\D/gu, "");
  if (digits.length <= 4) return trimmed;
  if (trimmed.includes("x")) return trimmed;
  if (digits.length === 12 && digits.startsWith("91")) {
    const local = digits.slice(2);
    return `+91 ${local.slice(0, 2)}${"x".repeat(6)}${local.slice(-2)}`;
  }
  return `${digits.slice(0, 2)}${"x".repeat(digits.length - 4)}${digits.slice(-2)}`;
}