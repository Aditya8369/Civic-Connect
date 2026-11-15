// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ResolutionTemplateSelector } from './ResolutionTemplateSelector'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const templates = [
  { id: 'pothole-filled', title: 'Pothole filled', body: 'Pothole body' },
  {
    id: 'transformer-replaced',
    title: 'Transformer replaced',
    body: 'Transformer body',
  },
]

let container = null
let root = null

function renderComponent(ui) {
  act(() => {
    root.render(ui)
  })
}

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
  container = null
  root = null
  vi.clearAllMocks()
})

describe('ResolutionTemplateSelector', () => {
  it('renders a placeholder and every template option', () => {
    renderComponent(<ResolutionTemplateSelector templates={templates} />)

    const select = container.querySelector('select')
    const optionLabels = [...select.options].map((option) => option.textContent)

    expect(select).not.toBeNull()
    expect(select.disabled).toBe(false)
    expect(optionLabels).toEqual([
      'Choose a canned response…',
      'Pothole filled',
      'Transformer replaced',
    ])
  })

  it('reports the selected template id', () => {
    const onChange = vi.fn()

    renderComponent(
      <ResolutionTemplateSelector templates={templates} onChange={onChange} />
    )

    const select = container.querySelector('select')

    act(() => {
      select.value = 'transformer-replaced'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(onChange).toHaveBeenCalledWith('transformer-replaced')
  })

  it('reflects the controlled value', () => {
    renderComponent(
      <ResolutionTemplateSelector
        templates={templates}
        value="pothole-filled"
        onChange={() => {}}
      />
    )

    expect(container.querySelector('select').value).toBe('pothole-filled')
  })

  it('disables the select and explains when no templates exist', () => {
    renderComponent(<ResolutionTemplateSelector templates={[]} />)

    const select = container.querySelector('select')

    expect(select.disabled).toBe(true)
    expect(select.options[0].textContent).toBe('No templates available')
  })

  it('honours the disabled prop even when templates exist', () => {
    renderComponent(
      <ResolutionTemplateSelector templates={templates} disabled />
    )

    expect(container.querySelector('select').disabled).toBe(true)
  })
})
