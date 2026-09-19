// Shared normalization for member identity fields, applied before validation,
// uniqueness checks, and storage so equivalent inputs ("123 456 789 01" vs
// "12345678901") are always treated as the same value.

export function normalizeNin(value: string): string {
  return value.replace(/\s|-/g, '').trim();
}

export function normalizePvc(value: string): string {
  return value.replace(/\s|-/g, '').trim().toUpperCase();
}

// Nigerian phone numbers: accepts 0-prefixed 11-digit local format or +234 /
// 234-prefixed international format, and normalizes to +234XXXXXXXXXX for
// any NEW write. Existing records are left untouched by the migration.
export const NIGERIAN_PHONE_PATTERN = /^(?:\+?234|0)(7|8|9)(0|1)\d{8}$/;

export function isValidNigerianPhone(value: string): boolean {
  return NIGERIAN_PHONE_PATTERN.test(value.replace(/[\s-]/g, ''));
}

export function normalizeNigerianPhone(value: string): string {
  const digits = value.replace(/[\s-]/g, '');
  if (digits.startsWith('+234')) return digits;
  if (digits.startsWith('234')) return `+${digits}`;
  if (digits.startsWith('0')) return `+234${digits.slice(1)}`;
  return digits;
}
