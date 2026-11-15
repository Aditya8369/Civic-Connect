// @vitest-environment jsdom


import { act } from 'react'
import { createRoot } from 'react-dom/client'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { LanguageProvider } from '@/contexts/LanguageContext'
import ComplaintAudioPlayer from './ComplaintAudioPlayer'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root
let mockPlay
let mockPause

async function renderPlayer(props = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  await act(async () => {
    root.render(
      <LanguageProvider>
        <ComplaintAudioPlayer {...props} />
      </LanguageProvider>
    )
  })
}

beforeEach(() => {
  localStorage.setItem('civic-connect-language', 'en')

  mockPlay = vi.fn().mockResolvedValue(undefined)
  mockPause = vi.fn()

  if (
    typeof HTMLMediaElement !== 'undefined' &&
    HTMLMediaElement.prototype
  ) {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(mockPlay)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(mockPause)
  }
})

afterEach(async () => {
  if (root) {
    await act(async () => {
      root.unmount()
    })
    root = null
  }

  container?.remove()
  container = null

  vi.restoreAllMocks()
})

describe('ComplaintAudioPlayer', () => {
  const sampleAudioNote = {
    url: 'https://example.com/audio/sample-complaint.webm',
    durationSeconds: 30,
    filename: 'sample-complaint.webm',
    contentType: 'audio/webm',
  }

  it('renders null when audioNote or url is missing', async () => {
    await renderPlayer({ audioNote: null })
    expect(container.innerHTML).toBe('')

    await renderPlayer({ audioNote: {} })
    expect(container.innerHTML).toBe('')

    await renderPlayer({ audioNote: { url: '' } })
    expect(container.innerHTML).toBe('')
  })

  it('renders playback waveform visualizer, play button, and duration', async () => {
    await renderPlayer({ audioNote: sampleAudioNote })

    expect(container.textContent).toContain('Voice Note')
    expect(container.textContent).toContain('Duration: 0:30')
    expect(
      container.querySelector('[aria-label="Play voice note"]')
    ).not.toBeNull()
    expect(
      container.querySelector('[data-testid="playback-waveform"]')
    ).not.toBeNull()
  })

  it('renders 36 distinct waveform bars', async () => {
    await renderPlayer({ audioNote: sampleAudioNote })

    const bars = container.querySelectorAll(
      '[data-testid="playback-bar"]'
    )
    expect(bars.length).toBe(36)

    // All bars should initially be unplayed
    bars.forEach((bar) => {
      expect(bar.getAttribute('data-played')).toBe('false')
    })
  })

  it('toggles playback when play/pause button is clicked', async () => {
    await renderPlayer({ audioNote: sampleAudioNote })

    const playButton = container.querySelector(
      '[aria-label="Play voice note"]'
    )
    expect(playButton).not.toBeNull()

    const audioElement = container.querySelector('audio')

    await act(async () => {
      playButton.click()
    })

    expect(mockPlay).toHaveBeenCalledTimes(1)

    // Simulate audio onPlay event
    await act(async () => {
      audioElement.dispatchEvent(new Event('play'))
    })

    const pauseButton = container.querySelector(
      '[aria-label="Pause voice note"]'
    )
    expect(pauseButton).not.toBeNull()

    await act(async () => {
      pauseButton.click()
    })

    expect(mockPause).toHaveBeenCalledTimes(1)

    // Simulate audio onPause event
    await act(async () => {
      audioElement.dispatchEvent(new Event('pause'))
    })

    expect(
      container.querySelector('[aria-label="Play voice note"]')
    ).not.toBeNull()
  })

  it('synchronizes waveform progress and played bars with audio currentTime', async () => {
    await renderPlayer({ audioNote: sampleAudioNote })

    const audioElement = container.querySelector('audio')
    const slider = container.querySelector(
      '[data-testid="playback-waveform"]'
    )

    // Simulate metadata loading
    Object.defineProperty(audioElement, 'duration', {
      value: 30,
      configurable: true,
    })

    await act(async () => {
      audioElement.dispatchEvent(new Event('loadedmetadata'))
    })

    // Advance playback to 15 seconds (50% progress)
    Object.defineProperty(audioElement, 'currentTime', {
      value: 15,
      configurable: true,
    })

    await act(async () => {
      audioElement.dispatchEvent(new Event('timeupdate'))
    })

    expect(slider.getAttribute('aria-valuenow')).toBe('15')
    expect(container.textContent).toContain('00:15 / 00:30')

    const bars = container.querySelectorAll(
      '[data-testid="playback-bar"]'
    )
    const playedBars = Array.from(bars).filter(
      (bar) => bar.getAttribute('data-played') === 'true'
    )
    const unplayedBars = Array.from(bars).filter(
      (bar) => bar.getAttribute('data-played') === 'false'
    )

    // At 50%, roughly half the bars should be marked as played
    expect(playedBars.length).toBeGreaterThan(15)
    expect(unplayedBars.length).toBeGreaterThan(15)
    expect(playedBars.length + unplayedBars.length).toBe(36)
  })

  it('allows user to click on the waveform to seek', async () => {
    await renderPlayer({ audioNote: sampleAudioNote })

    const audioElement = container.querySelector('audio')
    const slider = container.querySelector(
      '[data-testid="playback-waveform"]'
    )

    // Mock getBoundingClientRect for track
    vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      width: 200,
      top: 0,
      bottom: 40,
      right: 300,
      height: 40,
      x: 100,
      y: 0,
      toJSON: () => {},
    })

    // Click at 75% across track
    await act(async () => {
      slider.dispatchEvent(
        new MouseEvent('pointerdown', {
          bubbles: true,
          clientX: 250,
        })
      )
    })

    // 75% of 30 seconds = 22.5s
    expect(audioElement.currentTime).toBeCloseTo(22.5, 1)
  })

  it('supports dragging and scrubbing across the waveform', async () => {
    await renderPlayer({ audioNote: sampleAudioNote })

    const audioElement = container.querySelector('audio')
    const slider = container.querySelector(
      '[data-testid="playback-waveform"]'
    )

    vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      width: 100,
      top: 0,
      bottom: 40,
      right: 100,
      height: 40,
      x: 0,
      y: 0,
      toJSON: () => {},
    })

    // Start drag at 20%
    await act(async () => {
      slider.dispatchEvent(
        new MouseEvent('pointerdown', {
          bubbles: true,
          clientX: 20,
        })
      )
    })
    expect(audioElement.currentTime).toBeCloseTo(6, 1)

    // Drag to 60%
    await act(async () => {
      slider.dispatchEvent(
        new MouseEvent('pointermove', {
          bubbles: true,
          clientX: 60,
        })
      )
    })
    expect(audioElement.currentTime).toBeCloseTo(18, 1)

    // Release drag
    await act(async () => {
      slider.dispatchEvent(
        new MouseEvent('pointerup', {
          bubbles: true,
          clientX: 60,
        })
      )
    })

    // Further move should not change time once released
    await act(async () => {
      slider.dispatchEvent(
        new MouseEvent('pointermove', {
          bubbles: true,
          clientX: 90,
        })
      )
    })
    expect(audioElement.currentTime).toBeCloseTo(18, 1)
  })

  it('toggles playback with Space key when slider is focused', async () => {
    await renderPlayer({ audioNote: sampleAudioNote })

    const slider = container.querySelector(
      '[data-testid="playback-waveform"]'
    )

    await act(async () => {
      slider.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: ' ',
          bubbles: true,
          cancelable: true,
        })
      )
    })

    expect(mockPlay).toHaveBeenCalledTimes(1)
  })

  it('seeks with Arrow Left and Arrow Right keys', async () => {
    await renderPlayer({ audioNote: sampleAudioNote })

    const audioElement = container.querySelector('audio')
    const slider = container.querySelector(
      '[data-testid="playback-waveform"]'
    )

    // Set initial position to 10s
    audioElement.currentTime = 10

    await act(async () => {
      audioElement.dispatchEvent(new Event('timeupdate'))
    })

    // ArrowRight: seek +5s
    await act(async () => {
      slider.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'ArrowRight',
          bubbles: true,
          cancelable: true,
        })
      )
    })
    expect(audioElement.currentTime).toBe(15)

    // ArrowLeft: seek -5s
    await act(async () => {
      slider.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'ArrowLeft',
          bubbles: true,
          cancelable: true,
        })
      )
    })
    expect(audioElement.currentTime).toBe(10)

    // Clamps at 0 when seeking left past start
    audioElement.currentTime = 2

    await act(async () => {
      audioElement.dispatchEvent(new Event('timeupdate'))
    })

    await act(async () => {
      slider.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'ArrowLeft',
          bubbles: true,
          cancelable: true,
        })
      )
    })
    expect(audioElement.currentTime).toBe(0)
  })

  it('does not intercept keyboard shortcuts from unrelated form inputs', async () => {
    await renderPlayer({ audioNote: sampleAudioNote })

    const textInput = document.createElement('input')
    textInput.type = 'text'
    container.appendChild(textInput)

    const keyEvent = new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
    })

    await act(async () => {
      textInput.dispatchEvent(keyEvent)
    })

    // Should NOT have triggered audio play!
    expect(mockPlay).not.toHaveBeenCalled()
  })

  it('toggles audio mute and unmute with volume button', async () => {
    await renderPlayer({ audioNote: sampleAudioNote })

    const audioElement = container.querySelector('audio')
    const muteButton = container.querySelector(
      '[aria-label="Mute voice note"]'
    )
    expect(muteButton).not.toBeNull()

    await act(async () => {
      muteButton.click()
    })

    expect(audioElement.muted).toBe(true)
    expect(
      container.querySelector('[aria-label="Unmute voice note"]')
    ).not.toBeNull()

    await act(async () => {
      container.querySelector('[aria-label="Unmute voice note"]').click()
    })

    expect(audioElement.muted).toBe(false)
  })

  it('handles audio ended event by resetting playback to start', async () => {
    await renderPlayer({ audioNote: sampleAudioNote })

    const audioElement = container.querySelector('audio')

    // Simulate playing to end
    audioElement.currentTime = 30

    await act(async () => {
      audioElement.dispatchEvent(new Event('play'))
      audioElement.dispatchEvent(new Event('ended'))
    })

    expect(audioElement.currentTime).toBe(0)
    expect(
      container.querySelector('[aria-label="Play voice note"]')
    ).not.toBeNull()
  })

  it('handles audio loading error gracefully without crashing', async () => {
    await renderPlayer({ audioNote: sampleAudioNote })

    const audioElement = container.querySelector('audio')

    await act(async () => {
      audioElement.dispatchEvent(new Event('error'))
    })

    expect(container.textContent).toContain(
      'Audio recording could not be played.'
    )
    expect(container.querySelector('[role="alert"]')).not.toBeNull()

    const playBtn = container.querySelector('button')
    expect(playBtn.disabled).toBe(true)
  })
})
