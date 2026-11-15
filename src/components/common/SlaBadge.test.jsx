
import { beforeEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LanguageProvider } from '@/contexts/LanguageContext'
import { SlaBadge, SlaCountdown } from './SlaBadge'

beforeEach(() => {
  localStorage.setItem('civic-connect-language', 'en')
})

function renderWithLanguage(component) {
  return renderToStaticMarkup(
    <LanguageProvider>
      {component}
    </LanguageProvider>
  )
}

describe('SlaBadge', () => {
  const baseTime = 1740000000000

  it('renders pulsing red badge when SLA is breached', () => {
    // Streetlight Issues (24h) created 30 hours ago
    const complaint = {
      status: 'Pending',
      category: 'Streetlight Issues',
      createdAt: baseTime - 30 * 3600000,
    }

    const html = renderWithLanguage(
      <SlaBadge complaint={complaint} />
    )

    expect(html).toContain('SLA Breached')
    expect(html).toContain('animate-ping')
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-label="SLA Breached.')
  })

  it('renders amber badge when SLA is urgent and due soon', () => {
    // 24h SLA created 20 hours ago -> 4 hours left (< 6h)
    const now = Date.now()

    const complaint = {
      status: 'In Progress',
      category: 'Streetlight Issues',
      createdAt: now - 20 * 3600000,
    }

    const html = renderWithLanguage(
      <SlaBadge complaint={complaint} />
    )

    expect(html).toContain('Urgent - Due Soon')
    expect(html).toContain('role="status"')
  })

  it('renders green badge for resolved complaints', () => {
    const complaint = {
      status: 'Resolved',
      category: 'Streetlight Issues',
      createdAt: baseTime,
      resolvedAt: baseTime + 10 * 3600000,
    }

    const html = renderWithLanguage(
      <SlaBadge complaint={complaint} />
    )

    expect(html).toContain('Resolved in 10 hours')
    expect(html).toContain('role="status"')
  })

  it('renders on-track countdown badge when more than 6 hours remain', () => {
    const now = Date.now()

    // 7 days SLA (168h) created 10 hours ago -> 158h left
    const complaint = {
      status: 'Pending',
      category: 'Potholes & Road Damage',
      createdAt: now - 10 * 3600000,
    }

    const html = renderWithLanguage(
      <SlaBadge complaint={complaint} />
    )

    expect(html).toContain('left')
    expect(html).toContain('role="status"')
  })

  it('renders nothing for rejected complaints', () => {
    const complaint = {
      status: 'Rejected',
      category: 'Streetlight Issues',
      createdAt: baseTime,
    }

    const html = renderWithLanguage(
      <SlaBadge complaint={complaint} />
    )

    expect(html).toBe('')
  })

  it('renders nothing for null or missing complaint or createdAt', () => {
    expect(
      renderWithLanguage(<SlaBadge complaint={null} />)
    ).toBe('')

    expect(
      renderWithLanguage(
        <SlaBadge complaint={{ title: 'No Date' }} />
      )
    ).toBe('')
  })
})

describe('SlaCountdown', () => {
  const baseTime = 1740000000000

  it('renders breached SLA alert panel with overdue time', () => {
    const complaint = {
      status: 'Pending',
      category: 'Streetlight Issues',
      createdAt: baseTime - 30 * 3600000,
    }

    const html = renderWithLanguage(
      <SlaCountdown complaint={complaint} />
    )

    expect(html).toContain('SLA Breached')
    expect(html).toContain('Overdue by')
    expect(html).toContain('role="region"')
  })

  it('renders urgent countdown panel when due soon', () => {
    const now = Date.now()

    const complaint = {
      status: 'In Progress',
      category: 'Streetlight Issues',
      createdAt: now - 20 * 3600000,
    }

    const html = renderWithLanguage(
      <SlaCountdown complaint={complaint} />
    )

    expect(html).toContain('Urgent - Resolution Due Soon')
    expect(html).toContain('remaining')
  })

  it('renders live countdown panel when on track', () => {
    const now = Date.now()

    const complaint = {
      status: 'Pending',
      category: 'Potholes & Road Damage',
      createdAt: now - 10 * 3600000,
    }

    const html = renderWithLanguage(
      <SlaCountdown complaint={complaint} />
    )

    expect(html).toContain('SLA Resolution Countdown')
    expect(html).toContain('remaining')
  })

  it('renders resolved status panel', () => {
    const complaint = {
      status: 'Resolved',
      category: 'Streetlight Issues',
      createdAt: baseTime,
      resolvedAt: baseTime + 10 * 3600000,
    }

    const html = renderWithLanguage(
      <SlaCountdown complaint={complaint} />
    )

    expect(html).toContain('Resolved within SLA')
    expect(html).toContain(
      'Turnaround: Resolved in 10 hours'
    )
  })

  it('renders nothing for rejected or invalid complaints', () => {
    expect(
      renderWithLanguage(
        <SlaCountdown complaint={{ status: 'Rejected' }} />
      )
    ).toBe('')

    expect(
      renderWithLanguage(
        <SlaCountdown complaint={null} />
      )
    ).toBe('')
  })
})
