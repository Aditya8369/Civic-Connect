import { describe, it, expect } from 'vitest'
import { escapeCsvCell, toCsv, formatDateStamp } from './csv'

describe('escapeCsvCell', () => {
  it('leaves plain values untouched', () => {
    expect(escapeCsvCell('Pothole near market')).toBe('Pothole near market')
  })

  it('renders null and undefined as empty cells', () => {
    expect(escapeCsvCell(null)).toBe('')
    expect(escapeCsvCell(undefined)).toBe('')
  })

  it('quotes values containing commas, quotes or newlines', () => {
    expect(escapeCsvCell('Main Rd, Dehradun')).toBe('"Main Rd, Dehradun"')
    expect(escapeCsvCell('the "big" one')).toBe('"the ""big"" one"')
    expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"')
  })

  it('neutralises values that spreadsheets would run as formulas', () => {
    expect(escapeCsvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`)
    expect(escapeCsvCell('+91 9876543210')).toBe("'+91 9876543210")
    expect(escapeCsvCell('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(escapeCsvCell('-1')).toBe("'-1")
  })
})

describe('toCsv', () => {
  it('joins header and rows with CRLF', () => {
    expect(toCsv(['A', 'B'], [['1', 'x,y'], [null, '2']])).toBe('A,B\r\n1,"x,y"\r\n,2')
  })
})

describe('formatDateStamp', () => {
  it('formats the local date as YYYY-MM-DD', () => {
    expect(formatDateStamp(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})
