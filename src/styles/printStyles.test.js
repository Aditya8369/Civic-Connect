import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Print Stylesheet Verification (#161)', () => {
  const cssPath = path.resolve(__dirname, '../index.css')
  const cssContent = fs.readFileSync(cssPath, 'utf8')

  it('contains dedicated @media print block', () => {
    expect(cssContent).toContain('@media print')
  })

  it('configures @page with flexible sizing and margins for both A4 and US Letter compatibility', () => {
    expect(cssContent).toMatch(/@page\s*\{[^}]*size:\s*auto/i)
    expect(cssContent).toMatch(/@page\s*\{[^}]*margin:\s*10mm\s*12mm/i)
  })

  it('resets background to clean white and text to dark ink color', () => {
    expect(cssContent).toContain('background-color: #ffffff !important;')
    expect(cssContent).toContain('color: #0f172a !important;')
    expect(cssContent).toContain('print-color-adjust: exact !important;')
  })

  it('hides main navigation, headers, sidebars and footers', () => {
    // aside, nav, header, footer must be hidden
    expect(cssContent).toMatch(/aside[^{]*\{[^}]*display:\s*none\s*!important/s)
    expect(cssContent).toMatch(/nav[^{]*\{[^}]*display:\s*none\s*!important/s)
    expect(cssContent).toMatch(/header:not\(\.printable-receipt header\)[^{]*\{[^}]*display:\s*none\s*!important/s)
    expect(cssContent).toMatch(/footer:not\(\.printable-receipt footer\)[^{]*\{[^}]*display:\s*none\s*!important/s)
  })

  it('hides interactive controls, buttons, and modals in print mode', () => {
    expect(cssContent).toMatch(/button[^{]*\{[^}]*display:\s*none\s*!important/s)
    expect(cssContent).toMatch(/\[role="dialog"\][^{]*\{[^}]*display:\s*none\s*!important/s)
    expect(cssContent).toContain('.no-print')
    expect(cssContent).toContain('.print-hidden')
  })

  it('ensures printable receipt is visible and takes full width', () => {
    expect(cssContent).toMatch(/\.printable-receipt\s*\{[^}]*display:\s*block\s*!important/s)
    expect(cssContent).toMatch(/\.printable-receipt\s*\{[^}]*visibility:\s*visible\s*!important/s)
    expect(cssContent).toMatch(/\.printable-receipt\s*\{[^}]*width:\s*100%\s*!important/s)
  })

  it('removes sidebar layout padding and unsets overflow clipping', () => {
    expect(cssContent).toContain('.lg\\:pl-64')
    expect(cssContent).toContain('padding-left: 0 !important;')
    expect(cssContent).toContain('overflow: visible !important;')
  })

  it('applies break-inside: avoid for physical page split protection', () => {
    expect(cssContent).toContain('break-inside: avoid !important;')
    expect(cssContent).toContain('page-break-inside: avoid !important;')
  })

  it('preserves QR code sharpness using crispEdges rendering in print', () => {
    expect(cssContent).toContain('shape-rendering: crispEdges !important;')
  })
})
