// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi, beforeEach } from 'vitest'
import { LanguageProvider } from '@/contexts/LanguageContext'
import { ResolutionFeedback } from './ResolutionFeedback'
import { submitResolutionFeedback } from '@/firebase/resolutionFeedback'

vi.mock('@/firebase/resolutionFeedback', () => ({
  FEEDBACK_TAGS: ['Quick response', 'Courteous staff', 'Clean finish'],
  submitResolutionFeedback: vi.fn(),
}))

beforeEach(() => {
  localStorage.setItem('civic-connect-language', 'en')
  vi.clearAllMocks()
})

it('returns focus to Leave feedback after Escape closes the dialog', async () => {
  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)

  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)

  try {
    await act(async () => {
      root.render(
        <LanguageProvider>
          <ResolutionFeedback issueId="issue" title="Road repair" />
        </LanguageProvider>
      )
    })

    const trigger = container.querySelector('button')
    trigger.focus()

    await act(async () => trigger.click())

    const reaction = document.querySelector(
      '[role="dialog"] input[type="radio"]'
    )

    reaction.focus()
    expect(document.activeElement).toBe(reaction)

    await act(async () => {
      reaction.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
        })
      )
    })

    await vi.waitFor(() => {
      expect(document.querySelector('[role="dialog"]')).toBeNull()
      expect(document.activeElement).toBe(trigger)
    })
  } finally {
    await act(async () => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  }
})

it('keeps a failed draft, blocks a second pending submit, and thanks the citizen after a save', async () => {
  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)

  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)

  const findButton = (label) =>
    [...document.querySelectorAll('button')].find(
      (button) => button.textContent === label
    )

  try {
    await act(async () => {
      root.render(
        <LanguageProvider>
          <ResolutionFeedback issueId="issue" title="Road repair" />
        </LanguageProvider>
      )
    })

    await act(async () => findButton('Leave feedback').click())

    const dialog = document.querySelector('[role="dialog"]')

    expect(dialog.textContent).toContain('Road repair')

    const radios = dialog.querySelectorAll('input[type="radio"]')

    expect(radios).toHaveLength(5)
    expect(dialog.querySelector('form').checkValidity()).toBe(false)

    await act(async () => radios[4].click())

    await act(async () => {
      dialog.querySelector('input[type="checkbox"]').click()
    })

    expect(radios[4].checked).toBe(true)
    expect(radios[0].checked).toBe(false)
    expect(radios[4].labels[0].textContent).toBe('Very satisfied')

    expect(
      dialog.querySelector('input[type="checkbox"]').checked
    ).toBe(true)

    let rejectSave

    submitResolutionFeedback.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectSave = reject
        })
    )

    await act(async () => findButton('Submit feedback').click())

    await act(async () => {
      dialog.querySelector('form').dispatchEvent(
        new Event('submit', {
          bubbles: true,
          cancelable: true,
        })
      )
    })

    expect(submitResolutionFeedback).toHaveBeenCalledTimes(1)

    expect(dialog.textContent).not.toContain(
      'Your feedback was saved.'
    )

    await act(async () => rejectSave(new Error('Connection lost')))

    expect(dialog.querySelector('[role="alert"]').textContent).toBe(
      'Connection lost'
    )

    expect(radios[4].checked).toBe(true)

    submitResolutionFeedback.mockResolvedValueOnce(undefined)

    await act(async () => findButton('Submit feedback').click())

    expect(submitResolutionFeedback).toHaveBeenLastCalledWith(
      'issue',
      expect.objectContaining({
        rating: 5,
        tags: ['Quick response'],
      })
    )

    expect(dialog.textContent).toContain(
      'Your feedback was saved.'
    )
  } finally {
    await act(async () => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  }
})
