// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import EvidenceTombstone from './EvidenceTombstone'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  if (root) {
    act(() => {
      root.unmount()
    })
  }
  if (container) {
    container.remove()
  }
})

describe('EvidenceTombstone component', () => {
  it('renders default tombstone message and policy version', async () => {
    await act(async () => {
      root.render(<EvidenceTombstone />)
    })

    const el = container.querySelector('[data-testid="evidence-tombstone"]')
    expect(el).not.toBeNull()
    expect(el.textContent).toContain('Evidence Erased Under Retention Policy')
    expect(el.textContent).toContain('v2026.1')
    expect(el.textContent).toContain('Municipal data retention policy')
  })

  it('renders formatted erasure date when provided', async () => {
    await act(async () => {
      root.render(
        <EvidenceTombstone
          erasedAt="2026-03-15T10:30:00Z"
          reason="Closed record retention expired"
          policyVersion="2026.2"
        />
      )
    })

    const el = container.querySelector('[data-testid="evidence-tombstone"]')
    expect(el.textContent).toContain('Closed record retention expired')
    expect(el.textContent).toContain('v2026.2')
    expect(el.textContent).toContain('Erased')
  })
})
