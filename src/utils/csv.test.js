// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { escapeCsvCell, toCsv, formatDateStamp, downloadCsv } from './csv'
import { parseCsv } from './testSupport/parseCsv'

// Escape one value, then read it back through a real parser.
const roundTrip = (value) => parseCsv(escapeCsvCell(value))[0][0]

describe('escapeCsvCell', () => {
  it('leaves plain values untouched', () => {
    expect(escapeCsvCell('Pothole near market')).toBe('Pothole near market')
  })

  it('renders null, undefined and empty strings as empty cells', () => {
    expect(escapeCsvCell(null)).toBe('')
    expect(escapeCsvCell(undefined)).toBe('')
    expect(escapeCsvCell('')).toBe('')
  })

  it('stringifies numbers', () => {
    expect(escapeCsvCell(42)).toBe('42')
  })

  it('quotes values containing commas, quotes or line breaks', () => {
    expect(escapeCsvCell('Main Rd, Dehradun')).toBe('"Main Rd, Dehradun"')
    expect(escapeCsvCell('the "big" one')).toBe('"the ""big"" one"')
    expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"')
    expect(escapeCsvCell('line1\rline2')).toBe('"line1\rline2"')
    expect(escapeCsvCell('line1\r\nline2')).toBe('"line1\r\nline2"')
  })

  it('quotes values with leading or trailing whitespace so it survives a round trip', () => {
    expect(escapeCsvCell(' padded ')).toBe('" padded "')
    expect(roundTrip(' padded ')).toBe(' padded ')
  })

  it('round-trips awkward values through a real CSV parser', () => {
    for (const value of ['a,b', 'say "hi"', '"', '""', 'x\ny', 'x\r\ny', 'a,"b",\nc', ',', ' ']) {
      expect(roundTrip(value)).toBe(value)
    }
  })

  it('preserves Unicode text', () => {
    expect(escapeCsvCell('राजपुर रोड देहरादून')).toBe('राजपुर रोड देहरादून')
    expect(roundTrip('राजपुर रोड, देहरादून 🚧')).toBe('राजपुर रोड, देहरादून 🚧')
  })
})

describe('escapeCsvCell - formula injection', () => {
  it('neutralises values that spreadsheets would run as formulas', () => {
    expect(escapeCsvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`)
    expect(escapeCsvCell('+91 9876543210')).toBe("'+91 9876543210")
    expect(escapeCsvCell('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(escapeCsvCell('-1')).toBe("'-1")
    expect(escapeCsvCell('=1+1')).toBe("'=1+1")
  })

  it('neutralises formulas hidden behind leading whitespace or control characters', () => {
    const payloads = [
      ' =HYPERLINK("http://example.com")',
      '   +1+1',
      '\t=SUM(A1:A2)',
      '\r=SUM(A1:A2)',
      '\n=SUM(A1:A2)',
      '\r\n=SUM(A1:A2)',
      ' \t =cmd|calc',
      '\u00A0=1+1', // no-break space
      '\u200B=1+1', // zero-width space
      '\uFEFF=1+1', // BOM / zero-width no-break space
      '\u0000=1+1',
      '\u0007@SUM(1)',
      '  -2+3',
    ]
    for (const payload of payloads) {
      const out = roundTrip(payload)
      expect(out, JSON.stringify(payload)).toBe(`'${payload}`)
    }
  })

  it('neutralises cells that merely start with a tab, CR or LF', () => {
    expect(roundTrip('\tabc')).toBe("'\tabc")
    expect(roundTrip('\rabc')).toBe("'\rabc")
    expect(roundTrip('\nabc')).toBe("'\nabc")
  })

  it('leaves ordinary text alone, including trigger characters that are not first', () => {
    for (const value of ['Pothole', '98765 43210', 'a=b', 'x+y', 'user@example.com', 'a-b', '(=1)', '#1', "'=1"]) {
      expect(roundTrip(value)).toBe(value)
    }
  })

  it('does not trim or otherwise change the original value beyond the added apostrophe', () => {
    expect(roundTrip('=A1, B1')).toBe("'=A1, B1")
  })

  it('does not double-prefix and still quotes after prefixing', () => {
    expect(escapeCsvCell('=a,b')).toBe(`"'=a,b"`)
  })
})

describe('toCsv', () => {
  it('joins header and rows with CRLF and no trailing separator', () => {
    expect(toCsv(['A', 'B'], [['1', 'x,y'], [null, '2']])).toBe('A,B\r\n1,"x,y"\r\n,2')
  })

  it('returns only the header for no rows', () => {
    expect(toCsv(['A', 'B'], [])).toBe('A,B')
  })

  it('escapes header cells too', () => {
    expect(toCsv(['=A', 'B,C'], [])).toBe(`'=A,"B,C"`)
  })

  it('round-trips a table', () => {
    const rows = [['1', 'say "hi"', 'a\nb'], ['', ',', 'é']]
    expect(parseCsv(toCsv(['x', 'y', 'z'], rows))).toEqual([['x', 'y', 'z'], ...rows])
  })
})

describe('formatDateStamp', () => {
  it('formats the local date as YYYY-MM-DD', () => {
    expect(formatDateStamp(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(formatDateStamp(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31')
  })

  it('uses local time, not UTC (no shift near midnight)', () => {
    const lateEvening = new Date(2026, 5, 15, 23, 30)
    expect(formatDateStamp(lateEvening)).toBe('2026-06-15')
  })

  it('returns an empty string for invalid dates and non-dates', () => {
    expect(formatDateStamp(new Date('nope'))).toBe('')
    expect(formatDateStamp(undefined)).toBe('')
    expect(formatDateStamp(null)).toBe('')
    expect(formatDateStamp('2026-01-05')).toBe('')
  })
})

describe('downloadCsv', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  function setup() {
    const create = vi.fn(() => 'blob:fake')
    const revoke = vi.fn()
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      // Capture the anchor as it looks at click time.
      click.seen = { download: this.download, href: this.href, attached: this.isConnected }
    })
    return { create, revoke, click }
  }

  it('downloads a UTF-8 CSV with a BOM and the given filename', async () => {
    const { create, click } = setup()
    downloadCsv('out.csv', 'a,b\r\nराज,2')

    expect(click).toHaveBeenCalledTimes(1)
    expect(click.seen).toMatchObject({ download: 'out.csv', href: 'blob:fake', attached: true })

    const blob = create.mock.calls[0][0]
    expect(blob.type).toBe('text/csv;charset=utf-8;')
    // Blob.text() strips the BOM when decoding, so check the raw bytes.
    const bytes = new Uint8Array(await blob.arrayBuffer())
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(new TextDecoder().decode(bytes.slice(3))).toBe('a,b\r\nराज,2')
  })

  it('removes the temporary anchor from the page', () => {
    setup()
    downloadCsv('out.csv', 'x')
    expect(document.querySelector('a[download]')).toBeNull()
  })

  it('releases the object URL after the download has had time to start, not synchronously', () => {
    vi.useFakeTimers()
    const { revoke } = setup()
    downloadCsv('out.csv', 'x')
    expect(revoke).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(revoke).toHaveBeenCalledTimes(1)
    expect(revoke).toHaveBeenCalledWith('blob:fake')
  })

  it('still cleans up and rethrows when the click fails', () => {
    vi.useFakeTimers()
    const { revoke, click } = setup()
    click.mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => downloadCsv('out.csv', 'x')).toThrow('blocked')
    expect(document.querySelector('a[download]')).toBeNull()
    vi.runAllTimers()
    expect(revoke).toHaveBeenCalledWith('blob:fake')
  })

  it('propagates errors from createObjectURL so the caller can show a message', () => {
    vi.stubGlobal('URL', {
      createObjectURL: () => {
        throw new Error('no blob url')
      },
      revokeObjectURL: vi.fn(),
    })
    expect(() => downloadCsv('out.csv', 'x')).toThrow('no blob url')
    expect(document.querySelector('a[download]')).toBeNull()
  })
})
