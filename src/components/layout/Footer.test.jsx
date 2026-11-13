// @vitest-environment jsdom

globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Footer } from './Footer'
import { BackToTop } from '@/components/common/BackToTop'
import {
  DEFAULT_OFFICE_HOURS,
  MUNICIPAL_SLA_SUMMARY,
} from '@/data/municipalData'
import { DEFAULT_MUNICIPAL_WARDS } from '@/utils/spotlightSearch'

describe('Footer Component', () => {
  let container
  let root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  const renderFooter = (props = {}) => {
    act(() => {
      root.render(
        <MemoryRouter>
          <Footer {...props} />
        </MemoryRouter>
      )
    })
  }

  describe('Footer Rendering', () => {
    it('renders the footer element with accessible landmark label', () => {
      renderFooter()
      const footer = container.querySelector('footer')
      expect(footer).not.toBeNull()
      expect(footer.getAttribute('aria-label')).toBe('Municipal Portal Footer')
    })

    it('renders all four primary municipal column sections', () => {
      renderFooter()
      const headings = Array.from(container.querySelectorAll('h3')).map((h) =>
        h.textContent.trim()
      )

      expect(headings).toContain('Quick Citizen Links')
      expect(headings).toContain('Zonal Office Hours')
      expect(headings).toContain('Legal & Citizen Charter')

      // Column 1 branding header
      expect(container.textContent).toContain('CivicConnect')
      expect(container.textContent).toContain('Municipal Grievance Portal')
    })

    it('displays introductory municipal purpose and public desk credentials', () => {
      renderFooter()
      expect(container.textContent).toContain(
        'CivicConnect is the official digital civic engagement and grievance redressal platform'
      )
      expect(container.textContent).toContain(
        'Urban Local Governance & Public Works Desk'
      )
    })

    it('renders copyright notice, portal status badge and official disclaimer', () => {
      renderFooter()
      const currentYear = new Date().getFullYear().toString()
      expect(container.textContent).toContain(currentYear)
      expect(container.textContent).toContain('CivicConnect Municipal Corporation')
      expect(container.textContent).toContain('Portal Operational')
      expect(container.textContent).toContain('SLA Monitored')
    })
  })

  describe('Navigation & Quick Citizen Links', () => {
    it('renders all essential citizen service links with valid routes', () => {
      renderFooter()
      const links = Array.from(container.querySelectorAll('a'))
      const hrefs = links.map((a) => a.getAttribute('href'))

      // Valid project routes verified against AppRoutes.jsx
      expect(hrefs).toContain('/report')
      expect(hrefs).toContain('/my-reports')
      expect(hrefs).toContain('/dashboard')
      expect(hrefs).toContain('/notifications')
      expect(hrefs).toContain('/help')
      expect(hrefs).toContain('/profile')
    })

    it('displays exact citizen navigation link labels', () => {
      renderFooter()
      expect(container.textContent).toContain('File a Grievance')
      expect(container.textContent).toContain('Track Complaint')
      expect(container.textContent).toContain('Citizen Dashboard')
      expect(container.textContent).toContain('Grievance History')
      expect(container.textContent).toContain('Citizen Notifications')
      expect(container.textContent).toContain('Help & Support Desk')
    })

    it('renders legal and RTI navigation links using verified application routes', () => {
      renderFooter()
      const legalNav = container.querySelector('nav[aria-label="Legal and RTI links"]')
      expect(legalNav).not.toBeNull()

      const legalLinks = Array.from(legalNav.querySelectorAll('a'))
      const linkTexts = legalLinks.map((l) => l.textContent.trim())

      expect(linkTexts).toContain('Citizen Charter')
      expect(linkTexts).toContain('Right to Information (RTI)')
      expect(linkTexts).toContain('Privacy Policy')
      expect(linkTexts).toContain('Terms and Conditions')

      legalLinks.forEach((link) => {
        expect(link.getAttribute('href')).toBe('/help')
      })
    })
  })

  describe('Municipal Information & Zonal Hours', () => {
    it('renders office hours with sample reference identification when supported by data', () => {
      renderFooter({ officeHours: DEFAULT_OFFICE_HOURS })
      expect(container.textContent).toContain('Office Hours (Sample / Reference)')
      expect(container.textContent).toContain('09:30 AM – 05:30 PM (Mon – Fri)')
      expect(container.textContent).toContain('09:30 AM – 01:30 PM (1st & 3rd Sat)')
      expect(container.textContent).toContain('Closed for In-Person Counters')
    })

    it('does not render office hours section when officeHours is false or null', () => {
      renderFooter({ officeHours: null })
      expect(container.textContent).not.toContain('Office Hours (Sample / Reference)')
      expect(container.textContent).not.toContain('09:30 AM – 05:30 PM (Mon – Fri)')
    })

    it('renders ward directory when wards data is available', () => {
      renderFooter({ wards: DEFAULT_MUNICIPAL_WARDS })
      expect(container.textContent).toContain('Municipal Wards & Jurisdiction')
      expect(container.textContent).toContain('12 Wards Active')
      expect(container.textContent).toContain('Ward 1')
      expect(container.textContent).toContain('Ward 2')
    })

    it('displays fallback state when ward data is unavailable or empty', () => {
      renderFooter({ wards: [] })
      expect(container.textContent).toContain(
        'Ward directory data unavailable for unconfigured sectors'
      )
    })

    it('renders contact information with verified support email and 24x7 desk disclosure', () => {
      renderFooter()
      expect(container.textContent).toContain('admin_contact@civic.in')
      expect(container.textContent).toContain('Available 24x7 via CivicConnect Portal')
      expect(container.textContent).not.toContain('1913')
    })

    it('displays verified SLA durations matching project sla.js calculations', () => {
      renderFooter({ slaSummary: MUNICIPAL_SLA_SUMMARY })
      expect(container.textContent).toContain('Grievance Redressal SLA')
      expect(container.textContent).toContain('Water & Electricity')
      expect(container.textContent).toContain('24 Hours')
      expect(container.textContent).toContain('Sanitation & Solid Waste')
      expect(container.textContent).toContain('48 Hours')
      expect(container.textContent).toContain('Roads & Infrastructure')
      expect(container.textContent).toContain('7 Days')
    })
  })

  describe('Interactive Modal Dialogs', () => {
    it('opens Ward Directory dialog with supported municipal wards upon clicking View Directory', () => {
      renderFooter()
      const viewDirBtn = container.querySelector(
        'button[aria-label="View complete Ward Directory"]'
      )
      expect(viewDirBtn).not.toBeNull()

      act(() => {
        viewDirBtn.click()
      })

      const dialog = document.body.querySelector('[role="dialog"]')
      expect(dialog).not.toBeNull()
      expect(dialog.textContent).toContain('Municipal Ward Directory')
      expect(dialog.textContent).toContain('12 Wards Configured')
      DEFAULT_MUNICIPAL_WARDS.forEach((ward) => {
        expect(dialog.textContent).toContain(ward)
      })
    })

    it('opens Citizen Charter dialog with SLA table upon clicking Details', () => {
      renderFooter()
      const charterBtn = container.querySelector(
        'button[aria-label="View Grievance Redressal Citizen Charter"]'
      )
      expect(charterBtn).not.toBeNull()

      act(() => {
        charterBtn.click()
      })

      const dialog = document.body.querySelector('[role="dialog"]')
      expect(dialog).not.toBeNull()
      expect(dialog.textContent).toContain('Citizen Grievance Redressal Charter')
      expect(dialog.textContent).toContain('Statutory Redressal SLA Deadlines')
      expect(dialog.textContent).toContain('Key Charter Commitments')
    })

    it('opens RTI guidelines dialog upon clicking Guidelines', () => {
      renderFooter()
      const rtiBtn = container.querySelector(
        'button[aria-label="View RTI guidelines and nodal information"]'
      )
      expect(rtiBtn).not.toBeNull()

      act(() => {
        rtiBtn.click()
      })

      const dialog = document.body.querySelector('[role="dialog"]')
      expect(dialog).not.toBeNull()
      expect(dialog.textContent).toContain('Right to Information (RTI) Compliance')
      expect(dialog.textContent).toContain('Public Records & Transparency Guidelines')
    })
  })

  describe('Responsive and Accessibility Checks', () => {
    it('applies responsive grid classes for desktop, tablet, and mobile', () => {
      renderFooter()
      const grid = container.querySelector('.grid')
      expect(grid.className).toContain('grid-cols-1')
      expect(grid.className).toContain('md:grid-cols-2')
      expect(grid.className).toContain('lg:grid-cols-4')
    })

    it('includes accessible labels on interactive buttons and dialog triggers', () => {
      renderFooter()
      const buttons = Array.from(container.querySelectorAll('button'))
      buttons.forEach((btn) => {
        const hasAria = btn.getAttribute('aria-label') || btn.textContent.trim()
        expect(Boolean(hasAria)).toBe(true)
      })
    })
  })
})

describe('BackToTop Component', () => {
  let container
  let root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    window.scrollY = 0
    document.documentElement.scrollTop = 0
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('is visually hidden with opacity-0 when near the top of the page', () => {
    act(() => {
      root.render(<BackToTop threshold={300} />)
    })

    const button = container.querySelector('button[aria-label="Back to top"]')
    expect(button).not.toBeNull()
    expect(button.getAttribute('data-visible')).toBe('false')
    expect(button.getAttribute('aria-hidden')).toBe('true')
    expect(button.getAttribute('tabindex')).toBe('-1')
    expect(button.className).toContain('opacity-0')
    expect(button.className).toContain('pointer-events-none')
  })

  it('becomes visible when window scrolls past the threshold', () => {
    act(() => {
      root.render(<BackToTop threshold={300} />)
    })

    const button = container.querySelector('button[aria-label="Back to top"]')
    expect(button.getAttribute('data-visible')).toBe('false')

    // Simulate scroll past 300px
    window.scrollY = 450
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })

    expect(button.getAttribute('data-visible')).toBe('true')
    expect(button.getAttribute('aria-hidden')).toBe('false')
    expect(button.getAttribute('tabindex')).toBe('0')
    expect(button.className).toContain('opacity-100')
    expect(button.className).toContain('pointer-events-auto')
  })

  it('hides again when scrolling back up near the top', () => {
    act(() => {
      root.render(<BackToTop threshold={300} />)
    })

    const button = container.querySelector('button[aria-label="Back to top"]')

    window.scrollY = 500
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })
    expect(button.getAttribute('data-visible')).toBe('true')

    window.scrollY = 100
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })
    expect(button.getAttribute('data-visible')).toBe('false')
  })

  it('clicking button triggers window.scrollTo to top with smooth behavior', () => {
    const scrollToSpy = vi.fn()
    window.scrollTo = scrollToSpy

    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))

    act(() => {
      root.render(<BackToTop threshold={100} />)
    })

    window.scrollY = 250
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })

    const button = container.querySelector('button[aria-label="Back to top"]')
    act(() => {
      button.click()
    })

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
  })

  it('respects prefers-reduced-motion by using behavior: auto', () => {
    const scrollToSpy = vi.fn()
    window.scrollTo = scrollToSpy

    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))

    act(() => {
      root.render(<BackToTop threshold={100} />)
    })

    window.scrollY = 350
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })

    const button = container.querySelector('button[aria-label="Back to top"]')
    act(() => {
      button.click()
    })

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: 'auto' })
  })

  it('removes scroll event listener on unmount without memory leaks', () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')

    act(() => {
      root.render(<BackToTop threshold={200} />)
    })

    act(() => {
      root.unmount()
    })

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'scroll',
      expect.any(Function),
      { capture: true }
    )
  })

  it('has accessible title and label', () => {
    act(() => {
      root.render(<BackToTop />)
    })

    const button = container.querySelector('button')
    expect(button.getAttribute('aria-label')).toBe('Back to top')
    expect(button.getAttribute('title')).toBe('Back to top')
  })
})
