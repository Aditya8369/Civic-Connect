
// @vitest-environment jsdom

globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest'
import { LanguageProvider } from '@/contexts/LanguageContext'
import { KeyboardShortcutsModal } from './KeyboardShortcutsModal'

let spotlightOpen = false

vi.mock('@/contexts/SpotlightContext', () => ({
  useSpotlightSearch: () => ({ isOpen: spotlightOpen }),
}))

let container
let root

function pressKey(target, key, options = {}) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  })

  act(() => {
    target.dispatchEvent(event)
  })

  return event
}

function getDialog() {
  return document.body.querySelector('[role="dialog"]')
}

beforeEach(() => {
  localStorage.setItem('civic-connect-language', 'en')

  spotlightOpen = false
  container = document.createElement('div')
  document.body.appendChild(container)

  root = createRoot(container)

  act(() => {
    root.render(
      <LanguageProvider>
        <KeyboardShortcutsModal />
      </LanguageProvider>
    )
  })
})

afterEach(() => {
  act(() => root.unmount())

  container.remove()
  document.body.innerHTML = ''
})

describe('KeyboardShortcutsModal', () => {
  it('is closed until "?" is pressed', () => {
    expect(getDialog()).toBeNull()
  })

  it('opens when "?" is pressed outside a text field', () => {
    pressKey(document.body, '?', { shiftKey: true })

    const dialog = getDialog()

    expect(dialog).not.toBeNull()
    expect(dialog.textContent).toContain('Keyboard shortcuts')
    expect(dialog.textContent).toContain('Open or close search')
    expect(dialog.textContent).toContain(
      'Show this list of keyboard shortcuts'
    )
  })

  it.each([
    ['input', () => document.createElement('input')],
    ['textarea', () => document.createElement('textarea')],
    ['select', () => document.createElement('select')],
    [
      'contenteditable element',
      () => {
        const el = document.createElement('div')
        el.setAttribute('contenteditable', 'true')
        return el
      },
    ],
    [
      'element inside a combobox',
      () => {
        const el = document.createElement('div')
        el.setAttribute('role', 'combobox')
        return el
      },
    ],
  ])('does not open while typing in a %s', (_name, create) => {
    const field = create()
    document.body.appendChild(field)

    pressKey(field, '?', { shiftKey: true })

    expect(getDialog()).toBeNull()
  })

  it('ignores "?" with Ctrl, Meta or Alt held', () => {
    pressKey(document.body, '?', { ctrlKey: true })
    pressKey(document.body, '?', { metaKey: true })
    pressKey(document.body, '?', { altKey: true })

    expect(getDialog()).toBeNull()
  })

  it('ignores other keys and keys handled elsewhere', () => {
    pressKey(document.body, '/')

    const handled = new KeyboardEvent('keydown', {
      key: '?',
      bubbles: true,
      cancelable: true,
    })

    window.addEventListener(
      'keydown',
      (e) => e.preventDefault(),
      { once: true, capture: true }
    )

    act(() => {
      document.body.dispatchEvent(handled)
    })

    expect(getDialog()).toBeNull()
  })

  it('does not open while the search modal is open', () => {
    spotlightOpen = true

    act(() => {
      root.render(
        <LanguageProvider>
          <KeyboardShortcutsModal />
        </LanguageProvider>
      )
    })

    pressKey(document.body, '?', { shiftKey: true })

    expect(getDialog()).toBeNull()
  })

  it('closes with Escape', () => {
    pressKey(document.body, '?', { shiftKey: true })

    expect(getDialog()).not.toBeNull()

    pressKey(document.activeElement || document.body, 'Escape')

    expect(getDialog()).toBeNull()
  })

  it('closes with the labelled close button', () => {
    pressKey(document.body, '?', { shiftKey: true })

    const closeButton = document.body.querySelector(
      'button[aria-label="Close keyboard shortcuts"]'
    )

    expect(closeButton).not.toBeNull()

    act(() => {
      closeButton.click()
    })

    expect(getDialog()).toBeNull()
  })

  it('moves focus into the dialog when open', () => {
    pressKey(document.body, '?', { shiftKey: true })

    expect(
      getDialog().contains(document.activeElement)
    ).toBe(true)
  })

  it('keeps Tab and Shift+Tab focus inside the dialog', () => {
    pressKey(document.body, '?', { shiftKey: true })

    const dialog = getDialog()

    const closeButton = dialog.querySelector(
      'button[aria-label="Close keyboard shortcuts"]'
    )

    act(() => closeButton.focus())

    pressKey(closeButton, 'Tab')

    expect(
      dialog.contains(document.activeElement)
    ).toBe(true)

    pressKey(document.activeElement, 'Tab', {
      shiftKey: true,
    })

    expect(
      dialog.contains(document.activeElement)
    ).toBe(true)
  })

  it('pulls focus back into the dialog when it moves outside', () => {
    const outside = document.createElement('button')
    document.body.appendChild(outside)

    pressKey(document.body, '?', { shiftKey: true })

    const dialog = getDialog()

    act(() => outside.focus())

    expect(
      dialog.contains(document.activeElement)
    ).toBe(true)
  })

  it('returns focus to the previously focused element after closing', async () => {
    const trigger = document.createElement('button')
    trigger.textContent = 'Page button'
    document.body.appendChild(trigger)

    act(() => trigger.focus())

    pressKey(trigger, '?', { shiftKey: true })

    expect(
      getDialog().contains(document.activeElement)
    ).toBe(true)

    pressKey(document.activeElement, 'Escape')

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    expect(getDialog()).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('closes when the search modal opens', () => {
    pressKey(document.body, '?', { shiftKey: true })

    expect(getDialog()).not.toBeNull()

    spotlightOpen = true

    act(() => {
      root.render(
        <LanguageProvider>
          <KeyboardShortcutsModal />
        </LanguageProvider>
      )
    })

    expect(getDialog()).toBeNull()
  })
})
