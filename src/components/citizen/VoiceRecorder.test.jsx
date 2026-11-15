
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
import VoiceRecorder from './VoiceRecorder'

if (typeof HTMLMediaElement === 'undefined') {
  globalThis.HTMLMediaElement = class HTMLMediaElement {
    pause() {}
    play() {
      return Promise.resolve()
    }
  }
} else {
  if (!HTMLMediaElement.prototype.pause) {
    HTMLMediaElement.prototype.pause = () => {}
  }
  if (!HTMLMediaElement.prototype.play) {
    HTMLMediaElement.prototype.play = () => Promise.resolve()
  }
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root
let mockRecorder
let mockStream
let mockTrack
let mockGetUserMedia

class MockMediaRecorder {
  constructor(stream, options) {
    this.stream = stream
    this.options = options
    this.mimeType = options?.mimeType || 'audio/webm'
    this.state = 'inactive'
    this.ondataavailable = null
    this.onstop = null
    this.onerror = null
    mockRecorder = this
  }

  static isTypeSupported() {
    return true
  }

  start() {
    this.state = 'recording'
  }

  stop() {
    if (this.state !== 'recording') return

    this.state = 'inactive'

    this.ondataavailable?.({
      data: new Blob(['test audio'], { type: this.mimeType }),
    })

    this.onstop?.()
  }
}

async function renderRecorder(props = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  await act(async () => {
    root.render(
      <LanguageProvider>
        <VoiceRecorder {...props} />
      </LanguageProvider>
    )
  })
}

async function clickButton(label) {
  const button = Array.from(container.querySelectorAll('button')).find(
    (item) => item.textContent.includes(label)
  )

  if (!button) {
    throw new Error(`Button "${label}" was not found`)
  }

  await act(async () => {
    button.click()
  })
}

beforeEach(() => {
  localStorage.setItem('civic-connect-language', 'en')

  mockTrack = { stop: vi.fn() }

  mockStream = {
    getTracks: () => [mockTrack],
  }

  mockGetUserMedia = vi.fn().mockResolvedValue(mockStream)

  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: mockGetUserMedia,
    },
  })

  globalThis.MediaRecorder = MockMediaRecorder

  globalThis.URL.createObjectURL = vi.fn(() => 'blob:test-audio')
  globalThis.URL.revokeObjectURL = vi.fn()

  if (typeof HTMLMediaElement !== 'undefined' && HTMLMediaElement.prototype) {
    if (!HTMLMediaElement.prototype.pause) {
      HTMLMediaElement.prototype.pause = () => {}
    }

    if (!HTMLMediaElement.prototype.play) {
      HTMLMediaElement.prototype.play = () => Promise.resolve()
    }

    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
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
  vi.useRealTimers()
})

describe('VoiceRecorder', () => {
  it('renders the voice recorder controls', async () => {
    await renderRecorder()

    expect(container.textContent).toContain('Voice note')
    expect(container.textContent).toContain('Maximum 60 seconds')
    expect(container.textContent).toContain('Start recording')
  })

  it('starts recording after microphone permission is granted', async () => {
    await renderRecorder()

    await clickButton('Start recording')

    expect(mockGetUserMedia).toHaveBeenCalledWith({ audio: true })
    expect(mockRecorder.state).toBe('recording')
    expect(container.textContent).toContain('Recording')
  })

  it('stops recording and returns the audio recording', async () => {
    const onRecordingComplete = vi.fn()

    await renderRecorder({ onRecordingComplete })

    await clickButton('Start recording')
    await clickButton('Stop recording')

    expect(mockRecorder.state).toBe('inactive')

    expect(onRecordingComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        blob: expect.any(Blob),
        durationSeconds: 0,
        contentType: 'audio/webm;codecs=opus',
      })
    )

    expect(mockTrack.stop).toHaveBeenCalled()
    expect(container.textContent).toContain('Play')
    expect(container.textContent).toContain('Discard')
  })

  it('shows an error when microphone permission is denied', async () => {
    mockGetUserMedia.mockRejectedValue(
      new DOMException('Permission denied', 'NotAllowedError')
    )

    await renderRecorder()

    await clickButton('Start recording')

    expect(container.textContent).toContain(
      'Microphone permission denied'
    )
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
  })

  it('shows an error when no microphone is available', async () => {
    mockGetUserMedia.mockRejectedValue(
      new DOMException('No microphone', 'NotFoundError')
    )

    await renderRecorder()

    await clickButton('Start recording')

    expect(container.textContent).toContain(
      'No microphone was found'
    )
  })

  it('shows an error when recording is unsupported', async () => {
    globalThis.MediaRecorder = undefined

    await renderRecorder()

    await clickButton('Start recording')

    expect(container.textContent).toContain(
      'Audio recording is not supported'
    )
    expect(mockGetUserMedia).not.toHaveBeenCalled()
  })

  it('does not start recording when disabled', async () => {
    await renderRecorder({ disabled: true })

    const button = container.querySelector('button')

    expect(button.disabled).toBe(true)
    expect(mockGetUserMedia).not.toHaveBeenCalled()
  })

  it('discards a recording and clears the audio preview', async () => {
    const onRecordingComplete = vi.fn()

    await renderRecorder({ onRecordingComplete })

    await clickButton('Start recording')
    await clickButton('Stop recording')

    await clickButton('Discard')

    expect(container.textContent).toContain('Start recording')
    expect(container.textContent).not.toContain('Discard')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-audio')
    expect(onRecordingComplete).toHaveBeenLastCalledWith(null)
  })

  it('automatically stops recording after 60 seconds', async () => {
    vi.useFakeTimers()

    try {
      const onRecordingComplete = vi.fn()

      await renderRecorder({ onRecordingComplete })
      await clickButton('Start recording')

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000)
      })

      expect(mockRecorder.state).toBe('inactive')
      expect(onRecordingComplete).toHaveBeenCalled()
      expect(container.textContent).toContain('Play')
    } finally {
      vi.useRealTimers()
    }
  }, 15000)

  it('stops the microphone when the component unmounts', async () => {
    await renderRecorder()

    await clickButton('Start recording')

    await act(async () => {
      root.unmount()
      root = null
    })

    expect(mockTrack.stop).toHaveBeenCalled()
    expect(mockRecorder.state).toBe('inactive')
  })

  it('renders the waveform visualizer container and 32 tactile bars', async () => {
    await renderRecorder()

    const waveformContainer = container.querySelector(
      '[data-testid="recording-waveform"]'
    )

    expect(waveformContainer).not.toBeNull()
    expect(waveformContainer.getAttribute('aria-label')).toBe(
      'Audio waveform visualization'
    )
    expect(waveformContainer.getAttribute('data-waveform-mode')).toBe('idle')

    const bars = container.querySelectorAll(
      '[data-testid="waveform-bar"]'
    )

    expect(bars.length).toBe(32)
  })

  it('uses real Web Audio API AnalyserNode when available', async () => {
    const mockAnalyser = {
      fftSize: 0,
      smoothingTimeConstant: 0,
      frequencyBinCount: 32,
      getByteFrequencyData: vi.fn((arr) => {
        arr.fill(180)
      }),
      disconnect: vi.fn(),
    }

    const mockSource = {
      connect: vi.fn(),
      disconnect: vi.fn(),
    }

    const mockAudioContext = {
      state: 'running',
      resume: vi.fn().mockResolvedValue(),
      createAnalyser: vi.fn(() => mockAnalyser),
      createMediaStreamSource: vi.fn(() => mockSource),
      close: vi.fn().mockResolvedValue(),
    }

    globalThis.AudioContext = vi.fn(() => mockAudioContext)

    try {
      await renderRecorder()
      await clickButton('Start recording')

      expect(globalThis.AudioContext).toHaveBeenCalled()
      expect(mockAudioContext.createAnalyser).toHaveBeenCalled()
      expect(mockAudioContext.createMediaStreamSource).toHaveBeenCalledWith(
        mockStream
      )
      expect(mockSource.connect).toHaveBeenCalledWith(mockAnalyser)

      const waveform = container.querySelector(
        '[data-testid="recording-waveform"]'
      )

      expect(waveform.getAttribute('data-waveform-mode')).toBe('analyser')
    } finally {
      delete globalThis.AudioContext
    }
  })

  it('falls back to simulated waveform when Web Audio API is unavailable', async () => {
    delete globalThis.AudioContext
    delete globalThis.webkitAudioContext

    await renderRecorder()
    await clickButton('Start recording')

    const waveform = container.querySelector(
      '[data-testid="recording-waveform"]'
    )

    expect(waveform.getAttribute('data-waveform-mode')).toBe('simulated')
    expect(mockRecorder.state).toBe('recording')
  })

  it('handles AudioContext initialization failure gracefully without crashing', async () => {
    globalThis.AudioContext = vi.fn(() => {
      throw new Error('Audio hardware initialization failed')
    })

    try {
      await renderRecorder()
      await clickButton('Start recording')

      // Should not crash, and should fall back to simulated mode
      const waveform = container.querySelector(
        '[data-testid="recording-waveform"]'
      )

      expect(waveform.getAttribute('data-waveform-mode')).toBe('simulated')
      expect(mockRecorder.state).toBe('recording')
    } finally {
      delete globalThis.AudioContext
    }
  })

  it('cleans up AudioContext, analyser, and animation frame when recording stops', async () => {
    const mockAnalyser = {
      fftSize: 0,
      smoothingTimeConstant: 0,
      frequencyBinCount: 32,
      getByteFrequencyData: vi.fn(),
      disconnect: vi.fn(),
    }

    const mockSource = {
      connect: vi.fn(),
      disconnect: vi.fn(),
    }

    const mockAudioContext = {
      state: 'running',
      resume: vi.fn().mockResolvedValue(),
      createAnalyser: vi.fn(() => mockAnalyser),
      createMediaStreamSource: vi.fn(() => mockSource),
      close: vi.fn().mockResolvedValue(),
    }

    globalThis.AudioContext = vi.fn(() => mockAudioContext)

    try {
      await renderRecorder()
      await clickButton('Start recording')
      await clickButton('Stop recording')

      expect(mockAudioContext.close).toHaveBeenCalled()
      expect(mockSource.disconnect).toHaveBeenCalled()
      expect(mockAnalyser.disconnect).toHaveBeenCalled()

      const waveform = container.querySelector(
        '[data-testid="recording-waveform"]'
      )

      expect(waveform.getAttribute('data-waveform-mode')).toBe('idle')
    } finally {
      delete globalThis.AudioContext
    }
  })

  it('cleans up Web Audio resources when component unmounts during active recording', async () => {
    const mockAnalyser = {
      fftSize: 0,
      smoothingTimeConstant: 0,
      frequencyBinCount: 32,
      getByteFrequencyData: vi.fn(),
      disconnect: vi.fn(),
    }

    const mockSource = {
      connect: vi.fn(),
      disconnect: vi.fn(),
    }

    const mockAudioContext = {
      state: 'running',
      resume: vi.fn().mockResolvedValue(),
      createAnalyser: vi.fn(() => mockAnalyser),
      createMediaStreamSource: vi.fn(() => mockSource),
      close: vi.fn().mockResolvedValue(),
    }

    globalThis.AudioContext = vi.fn(() => mockAudioContext)

    try {
      await renderRecorder()
      await clickButton('Start recording')

      await act(async () => {
        root.unmount()
        root = null
      })

      expect(mockAudioContext.close).toHaveBeenCalled()
      expect(mockTrack.stop).toHaveBeenCalled()
    } finally {
      delete globalThis.AudioContext
    }
  })
})
