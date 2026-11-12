
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  initializeNotificationAudio,
  playNotificationSound,
  _resetNotificationAudioForTests,
} from './notificationAudio'

describe('notificationAudio', () => {
  let mockContext

  beforeEach(() => {
    mockContext = {
      state: 'running',
      currentTime: 0,
      destination: {},
      resume: vi.fn().mockResolvedValue(undefined),
      createOscillator: vi.fn(() => ({
        type: '',
        frequency: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      })),
      createGain: vi.fn(() => ({
        gain: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      })),
    }

    const MockAudioContext = vi.fn(() => mockContext)
    vi.stubGlobal('AudioContext', MockAudioContext)
  })

  afterEach(() => {
    _resetNotificationAudioForTests()
    vi.unstubAllGlobals()
  })

  it('initializes the audio context', async () => {
    expect(await initializeNotificationAudio()).toBe(true)
    expect(globalThis.AudioContext).toHaveBeenCalledOnce()
  })

  it('resumes a suspended audio context', async () => {
  mockContext.state = 'suspended'
  mockContext.resume.mockImplementation(async () => {
    mockContext.state = 'running'
  })

  const result = await initializeNotificationAudio()

  expect(mockContext.resume).toHaveBeenCalledOnce()
  expect(result).toBe(true)
 })

  it('does not play sound before initialization', () => {
    expect(playNotificationSound()).toBe(false)
  })

  it('plays a chime after initialization', async () => {
    await initializeNotificationAudio()

    expect(playNotificationSound()).toBe(true)
    expect(mockContext.createOscillator).toHaveBeenCalledOnce()
    expect(mockContext.createGain).toHaveBeenCalledOnce()
  })

  it('returns false when audio is unsupported', async () => {
    vi.stubGlobal('AudioContext', undefined)

    expect(await initializeNotificationAudio()).toBe(false)
  })
})
