// Spreadsheet apps run cells that start with =, +, - or @ as formulas (CSV injection),
// so such values are prefixed with an apostrophe to force them to plain text.
//
// The check also looks past leading whitespace, control and invisible characters
// (spaces, NBSP, zero-width characters, BOM, ...), because some spreadsheet parsers
// skip those before deciding whether a cell is a formula. A cell that merely starts
// with a tab, CR or LF is neutralised too, as recommended by OWASP.
//
// Known trade-off: the apostrophe is a real character in the CSV, so Excel shows it
// (e.g. a worker phone "+91 98765 43210" appears as "'+91 98765 43210").
const FORMULA_TRIGGERS =
  // eslint-disable-next-line no-control-regex -- control characters are matched on purpose
  /^(?:[\t\r\n]|[\s\u0000-\u001F\u007F-\u009F\u200B-\u200D\u2060\uFEFF]*[=+\-@])/

export function escapeCsvCell(value) {
  let str = value == null ? '' : String(value)
  if (FORMULA_TRIGGERS.test(str)) str = `'${str}`
  if (/[",\r\n]/.test(str) || str !== str.trim()) str = `"${str.replace(/"/g, '""')}"`
  return str
}

export function toCsv(headers, rows) {
  return [headers, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')
}

// Local-time YYYY-MM-DD (toISOString() would give the UTC date, which is off by a day near midnight in IST).
// Returns '' for anything that is not a valid Date instead of "NaN-NaN-NaN".
export function formatDateStamp(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// Revoking synchronously after click() can cancel the download in some browsers
// (notably Safari and older Firefox), so the URL is released a little later.
const REVOKE_DELAY_MS = 10000

export function downloadCsv(filename, csv) {
  // The BOM makes Excel read the file as UTF-8 so non-ASCII text (e.g. Hindi addresses) isn't garbled.
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  try {
    link.click()
  } finally {
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
  }
}
