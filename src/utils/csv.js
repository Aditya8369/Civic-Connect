// Spreadsheet apps run cells starting with these as formulas (CSV injection),
// so such values are prefixed with an apostrophe to force them to plain text.
const FORMULA_TRIGGERS = /^[=+\-@\t\r]/

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
export function formatDateStamp(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function downloadCsv(filename, csv) {
  // The BOM makes Excel read the file as UTF-8 so non-ASCII text (e.g. Hindi addresses) isn't garbled.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
