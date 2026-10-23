// Preserve country codes outside India; match Indian local and +91 formats.
export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, '')
  return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits
}
