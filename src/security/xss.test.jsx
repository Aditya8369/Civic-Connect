// @vitest-environment jsdom

globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  sanitizeText,
  sanitizeMarkdown,
  renderMarkdownToSafeHtml,
  sanitizeComplaintPayload,
  sanitizeCommentPayload,
  sanitizeFeedbackPayload,
  sanitizeProfilePayload,
} from '@/utils/sanitize'
import { SafeMarkdown } from '@/components/common/SafeMarkdown'
import { createRoot } from 'react-dom/client'
import { act } from 'react'

describe('XSS and Injection Security Fortification Suite', () => {
  describe('Strict Content Security Policy (index.html)', () => {
    const indexPath = path.resolve(process.cwd(), 'index.html')
    const indexHtml = fs.readFileSync(indexPath, 'utf-8')

    it('contains a Content-Security-Policy meta tag', () => {
      expect(indexHtml).toMatch(/<meta[^>]+http-equiv=["']Content-Security-Policy["']/i)
    })

    it('enforces default-src \'self\'', () => {
      expect(indexHtml).toMatch(/default-src\s+'self'/)
    })

    it('enforces object-src \'none\' to prevent plugin and object hijacking', () => {
      expect(indexHtml).toMatch(/object-src\s+'none'/)
    })

    it('enforces base-uri \'self\' to mitigate base-tag redirection attacks', () => {
      expect(indexHtml).toMatch(/base-uri\s+'self'/)
    })

    it('whitelists required Firebase, OpenStreetMap, and font resources in connect-src / img-src', () => {
      expect(indexHtml).toContain('tile.openstreetmap.org')
      expect(indexHtml).toContain('googleapis.com')
      expect(indexHtml).toContain('fonts.gstatic.com')
    })
  })

  describe('DOMPurify Plaintext Sanitization (sanitizeText)', () => {
    it('strips classical <script> tags from citizen inputs', () => {
      const malicious = "<script>alert('XSS')</script>Broken Water Pipe"
      expect(sanitizeText(malicious)).toBe('Broken Water Pipe')
    })

    it('strips case-insensitive and malformed script tags', () => {
      const payload = "<sCrIpt src='https://evil.com/xss.js'></scRIpt>Pothole"
      expect(sanitizeText(payload)).toBe('Pothole')
    })

    it('removes <img> tags with inline event handlers', () => {
      const payload = '<img src="x" onerror="alert(document.cookie)">'
      expect(sanitizeText(payload)).toBe('')
    })

    it('removes <svg> vectors with onload handlers', () => {
      const payload = '<svg onload="alert(1)">Main Street</svg>'
      expect(sanitizeText(payload)).toBe('Main Street')
    })

    it('strips iframe and object tags', () => {
      const payload = '<iframe src="javascript:alert(1)"></iframe>123 Elm St'
      expect(sanitizeText(payload)).toBe('123 Elm St')
    })

    it('handles null, undefined, empty strings and non-string inputs safely', () => {
      expect(sanitizeText(null)).toBe('')
      expect(sanitizeText(undefined)).toBe('')
      expect(sanitizeText('')).toBe('')
      expect(sanitizeText('   ')).toBe('')
      expect(sanitizeText(12345)).toBe('12345')
    })
  })

  describe('DOMPurify Markdown / Rich Text Sanitization (sanitizeMarkdown)', () => {
    it('strips active executable scripts while preserving safe markdown markup', () => {
      const input = "<script>alert('Pwned')</script><strong>High Priority Issue:</strong> deep pothole"
      const result = sanitizeMarkdown(input)
      expect(result).not.toContain('<script>')
      expect(result).not.toContain('alert(')
      expect(result).toContain('<strong>High Priority Issue:</strong>')
      expect(result).toContain('deep pothole')
    })

    it('neutralizes javascript: URIs in hyperlinks', () => {
      const payload = '<a href="javascript:alert(\'XSS\')">Click for evidence</a>'
      const clean = sanitizeMarkdown(payload)
      expect(clean).not.toContain('javascript:')
      expect(clean).not.toContain('alert(')
    })

    it('removes dangerous event handlers from tags (onclick, onmouseover, onerror)', () => {
      const attack = '<p onclick="alert(1)" onmouseover="stealTokens()">Dangerous street light</p>'
      const sanitized = sanitizeMarkdown(attack)
      expect(sanitized).not.toContain('onclick')
      expect(sanitized).not.toContain('onmouseover')
      expect(sanitized).toContain('<p>Dangerous street light</p>')
    })

    it('strips <style> tags and CSS injection attacks', () => {
      const stylePayload = '<style>body { display: none; }</style>Report details'
      const clean = sanitizeMarkdown(stylePayload)
      expect(clean).not.toContain('<style>')
      expect(clean).toBe('Report details')
    })

    it('neutralizes data: text/html base64 XSS payloads', () => {
      const payload = '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">Evidence</a>'
      const sanitized = sanitizeMarkdown(payload)
      expect(sanitized).not.toContain('data:text/html')
      expect(sanitized).not.toContain('base64')
    })
  })

  describe('renderMarkdownToSafeHtml formatting & protection', () => {
    it('renders basic markdown bold, italics, code, and lists safely', () => {
      const md = '**Urgent** *Pothole* with `code reference`\n- Item 1\n- Item 2'
      const html = renderMarkdownToSafeHtml(md)
      expect(html).toContain('<strong>Urgent</strong>')
      expect(html).toContain('<em>Pothole</em>')
      expect(html).toContain('<code>code reference</code>')
      expect(html).toContain('<li class="ml-4 list-disc">Item 1</li>')
    })

    it('escapes and sanitizes embedded HTML tags before markdown rendering', () => {
      const attack = '<script>fetch("https://attacker.com")</script>**Valid bold**'
      const html = renderMarkdownToSafeHtml(attack)
      expect(html).not.toContain('<script>')
      expect(html).not.toContain('fetch(')
      expect(html).toContain('<strong>Valid bold</strong>')
    })

    it('renders links with secure target and rel attributes', () => {
      const mdLink = '[Municipal Docs](https://civic.org/docs)'
      const html = renderMarkdownToSafeHtml(mdLink)
      expect(html).toContain('target="_blank"')
      expect(html).toContain('rel="noopener noreferrer"')
      expect(html).toContain('href="https://civic.org/docs"')
    })
  })

  describe('Citizen Text Field Payload Sanitizers', () => {
    it('sanitizeComplaintPayload sanitizes title, description, address, and category', () => {
      const rawComplaint = {
        title: '<script>alert(1)</script>Water leakage at 5th cross',
        description: '<img src=x onerror=alert(2)>Large pipe burst near school **urgent repair**',
        address: '<svg onload=alert(3)>Sector 4, Block B</svg>',
        category: '<b>Water</b>',
      }

      const sanitized = sanitizeComplaintPayload(rawComplaint)
      expect(sanitized.title).toBe('Water leakage at 5th cross')
      expect(sanitized.description).not.toContain('onerror')
      expect(sanitized.description).toContain('Large pipe burst near school')
      expect(sanitized.description).toContain('**urgent repair**')
      expect(sanitized.address).toBe('Sector 4, Block B')
      expect(sanitized.category).toBe('Water')
    })

    it('sanitizeCommentPayload sanitizes text and authorName', () => {
      const rawComment = {
        text: '<script>alert("hack")</script>I noticed this too!',
        authorName: '<b onclick=alert(1)>Concerned Citizen</b>',
      }

      const clean = sanitizeCommentPayload(rawComment)
      expect(clean.text).toBe('I noticed this too!')
      expect(clean.authorName).toBe('Concerned Citizen')
    })

    it('sanitizeFeedbackPayload sanitizes comment and feedback tags', () => {
      const rawFeedback = {
        comment: '<iframe src="evil.com"></iframe>Work was completed quickly.',
        tags: ['<script>xss</script>Quick response', 'Clean finish'],
      }

      const clean = sanitizeFeedbackPayload(rawFeedback)
      expect(clean.comment).toBe('Work was completed quickly.')
      expect(clean.tags).toEqual(['Quick response', 'Clean finish'])
    })

    it('sanitizeProfilePayload sanitizes name, phone, and address', () => {
      const rawProfile = {
        name: '<b>John Doe</b>',
        phone: '<script>alert(1)</script>+91 98765 43210',
        address: '<img src=x onerror=1>Flat 402, Green Valley Apartments',
      }

      const clean = sanitizeProfilePayload(rawProfile)
      expect(clean.name).toBe('John Doe')
      expect(clean.phone).toBe('+91 98765 43210')
      expect(clean.address).toBe('Flat 402, Green Valley Apartments')
    })
  })

  describe('SafeMarkdown Component Integration', () => {
    it('renders clean markdown without executing script tags or inline events', async () => {
      const container = document.createElement('div')
      document.body.appendChild(container)
      const root = createRoot(container)

      const maliciousContent = '**Important:** <img src=x onerror="window.pwned=true"> Please fix streetlight.'

      await act(async () => {
        root.render(<SafeMarkdown content={maliciousContent} className="test-markdown" />)
      })

      expect(container.querySelector('strong')?.textContent).toBe('Important:')
      expect(container.innerHTML).not.toContain('onerror')
      expect(window.pwned).toBeUndefined()
      expect(container.textContent).toContain('Please fix streetlight.')

      act(() => {
        root.unmount()
      })
      container.remove()
    })
  })
})
