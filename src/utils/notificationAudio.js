
let audioContext = null

/**
 * Initializes audio after a user interaction, such as enabling the sound
 * preference. Browsers may block audio until the user interacts with the page.
 */
export async function initializeNotificationAudio() {
  const AudioContextClass =
    globalThis.AudioContext || globalThis.webkitAudioContext

  if (!AudioContextClass) {
    return false
  }

  try {
    if (!audioContext) {
      audioContext = new AudioContextClass()
    }

    if (audioContext.state === 'suspended') {
      await audioContext.resume()
    }

    return audioContext.state === 'running'
  } catch (error) {
    console.warn('Could not initialize notification audio:', error)
    return false
  }
}

/**
 * Plays a short notification chime.
 * Audio must have been initialized through a user interaction first.
 */
export function playNotificationSound() {
  if (!audioContext || audioContext.state !== 'running') {
    return false
  }

  try {
    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime)

    gain.gain.setValueAtTime(0.15, audioContext.currentTime)
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      audioContext.currentTime + 0.2
    )

    oscillator.connect(gain)
    gain.connect(audioContext.destination)

    oscillator.start()
    oscillator.stop(audioContext.currentTime + 0.2)

    return true
  } catch (error) {
    console.warn('Could not play notification sound:', error)
    return false
  }
}

/** Resets the audio context between tests. */
export function _resetNotificationAudioForTests() {
  audioContext = null
}
