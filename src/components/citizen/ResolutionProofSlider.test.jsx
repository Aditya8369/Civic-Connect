// @vitest-environment jsdom


import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LanguageProvider } from '@/contexts/LanguageContext'
import ResolutionProofSlider, { getResolutionPhoto } from './ResolutionProofSlider'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

beforeEach(() => {
  localStorage.setItem('civic-connect-language', 'en')
})

async function renderSlider(props) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  await act(async () => {
    root.render(
      <LanguageProvider>
        <ResolutionProofSlider {...props} />
      </LanguageProvider>
    )
  })
}

afterEach(async () => {
  if (root) {
    await act(async () => root.unmount())
    root = null
  }

  container?.remove()
  container = null
})

describe('ResolutionProofSlider', () => {
  it('renders an interactive before and after comparison', async () => {
    await renderSlider({
      beforePhoto: 'before.jpg',
      afterPhoto: 'after.jpg',
    })

    expect(
      container.querySelector('[data-testid="resolution-proof-slider"]')
    ).not.toBeNull()

    expect(
      container.querySelector('img[alt="Before complaint evidence"]').src
    ).toContain('before.jpg')

    expect(
      container.querySelector('img[alt="After resolution evidence"]').src
    ).toContain('after.jpg')

    expect(container.textContent).toContain('Before')
    expect(container.textContent).toContain('After')
  })

  it('updates the split position when dragged', async () => {
    await renderSlider({
      beforePhoto: 'before.jpg',
      afterPhoto: 'after.jpg',
    })

    const range = container.querySelector('input[type="range"]')

    await act(async () => {
      range.value = '72'
      range.dispatchEvent(new Event('input', { bubbles: true }))
      range.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(container.querySelector('input[type="range"]').value).toBe('72')

    expect(
      container.querySelector('.absolute.inset-y-0.left-0').style.width
    ).toBe('72%')
  })

  it('falls back to the available photo when only one exists', async () => {
    await renderSlider({ beforePhoto: 'before.jpg' })

    expect(
      container.querySelector('[data-testid="resolution-proof-slider"]')
    ).toBeNull()

    expect(container.querySelector('img').alt).toBe('Complaint evidence')
    expect(container.textContent).toContain('Before')
  })

  it('renders nothing when no photo exists', async () => {
    await renderSlider({})

    expect(container.innerHTML).toBe('')
  })

  it('reads supported resolution photo fields', () => {
    expect(
      getResolutionPhoto({ resolutionPhotos: ['after.jpg'] })
    ).toBe('after.jpg')

    expect(
      getResolutionPhoto({ resolutionEvidence: ['evidence.jpg'] })
    ).toBe('evidence.jpg')

    expect(
      getResolutionPhoto({ resolutionPhotoUrl: 'url.jpg' })
    ).toBe('url.jpg')

    expect(
      getResolutionPhoto({ resolutionPhotos: [] })
    ).toBeNull()
  })
})
