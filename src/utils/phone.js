// Accepts a 10-digit phone number with an optional +91, 91 or 0 prefix,
// ignoring spaces, dashes, dots and brackets.
// Returns it as "+91 XXXXXXXXXX", or null if invalid.

export function normalizePhone(value) {
  if (typeof value !== 'string') return null
  if (!/^[\d\s()+.-]+$/.test(value.trim())) return null

  const digits = value
    .replace(/\D/g, '')
    .replace(/^(91|0)(?=\d{10}$)/, '')

  return /^\d{10}$/.test(digits) ? `+91 ${digits}` : null
}