import { useState, useRef, useEffect, useCallback } from 'react'
import { Headphones, Play, Pause, Volume2, VolumeX, AlertCircle, Loader2 } from 'lucide-react'

const BAR_COUNT = 36

function formatTime(seconds) {
  if (!seconds || isNaN(seconds) || seconds < 0) return '00:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function generateDeterministicBars(seed = '', count = BAR_COUNT) {
  let hash = 0
  const str = String(seed || 'civic-connect-voice')
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }

  const bars = []
  for (let i = 0; i < count; i++) {
    const pseudo = Math.abs(Math.sin((hash + i * 137.5) * 0.1))
    const cadence = 0.5 + 0.5 * Math.sin((i / count) * Math.PI * 3.2)
    const height = Math.round(20 + (pseudo * 0.65 + cadence * 0.35) * 75)
    bars.push(Math.max(20, Math.min(95, height)))
  }
  return bars
}

export default function ComplaintAudioPlayer({ audioNote }) {
  const initialDuration = Number(audioNote?.durationSeconds) || 0
  const [duration, setDuration] = useState(initialDuration)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [bars, setBars] = useState(() =>
    generateDeterministicBars(audioNote?.url || audioNote?.filename || initialDuration)
  )

  const audioRef = useRef(null)
  const trackRef = useRef(null)
  const isDraggingRef = useRef(false)
  const durationRef = useRef(initialDuration)

  durationRef.current = duration

  // Attempt Web Audio API decoding if buffer is accessible (e.g. blob: URL or same origin)
  useEffect(() => {
    let active = true

    async function extractPeaks() {
      if (!audioNote?.url) return
      // We only attempt direct decoding on blob URLs or relative paths to prevent cross-origin fetch errors
      if (!audioNote.url.startsWith('blob:') && !audioNote.url.startsWith('/')) {
        return
      }

      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext
        if (!AudioCtx) return

        const response = await fetch(audioNote.url)
        const buffer = await response.arrayBuffer()
        const ctx = new AudioCtx()
        const audioBuffer = await ctx.decodeAudioData(buffer)

        if (!active) {
          ctx.close().catch(() => {})
          return
        }

        const channelData = audioBuffer.getChannelData(0)
        const step = Math.floor(channelData.length / BAR_COUNT)
        const newBars = []

        for (let i = 0; i < BAR_COUNT; i++) {
          let sum = 0
          const start = i * step
          const end = start + step
          for (let j = start; j < end; j++) {
            sum += Math.abs(channelData[j] || 0)
          }
          const avg = step > 0 ? sum / step : 0
          const barHeight = Math.max(20, Math.min(95, Math.round(avg * 220 + 20)))
          newBars.push(barHeight)
        }

        setBars(newBars)
        ctx.close().catch(() => {})
      } catch {
        // Silently use deterministic fallback peaks
      }
    }

    extractPeaks()

    return () => {
      active = false
    }
  }, [audioNote?.url])

  // Sync duration if audioNote prop changes
  useEffect(() => {
    if (audioNote?.durationSeconds) {
      const parsed = Number(audioNote.durationSeconds)
      if (parsed > 0) {
        setDuration(parsed)
      }
    }
    setHasError(false)
  }, [audioNote])

  const seekToRatio = useCallback((ratio) => {
    const audio = audioRef.current
    const effectiveDuration = durationRef.current || (audio?.duration ?? 0)
    if (!audio || effectiveDuration <= 0) return

    const clampedRatio = Math.max(0, Math.min(1, ratio))
    const targetTime = clampedRatio * effectiveDuration
    audio.currentTime = targetTime
    setCurrentTime(targetTime)
  }, [])

  const handlePointerDown = (e) => {
    if (hasError) return
    isDraggingRef.current = true
    e.currentTarget.setPointerCapture?.(e.pointerId)

    const rect = e.currentTarget.getBoundingClientRect()
    if (rect.width > 0) {
      const ratio = (e.clientX - rect.left) / rect.width
      seekToRatio(ratio)
    }
  }

  const handlePointerMove = (e) => {
    if (!isDraggingRef.current || hasError) return
    const rect = e.currentTarget.getBoundingClientRect()
    if (rect.width > 0) {
      const ratio = (e.clientX - rect.left) / rect.width
      seekToRatio(ratio)
    }
  }

  const handlePointerUp = (e) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false
      try {
        e.currentTarget.releasePointerCapture?.(e.pointerId)
      } catch {
        // Safe ignore
      }
    }
  }

  const togglePlay = async () => {
    const audio = audioRef.current
    if (!audio || hasError) return

    if (isPlaying) {
      audio.pause()
    } else {
      try {
        await audio.play()
      } catch {
        setHasError(true)
      }
    }
  }

  const toggleMute = () => {
    const audio = audioRef.current
    if (!audio) return
    const nextMuted = !isMuted
    audio.muted = nextMuted
    setIsMuted(nextMuted)
  }

  const handleKeyDown = (e) => {
    if (hasError) return

    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault()
      e.stopPropagation()
      togglePlay()
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      e.stopPropagation()
      if (audioRef.current) {
        const newTime = Math.max(0, currentTime - 5)
        audioRef.current.currentTime = newTime
        setCurrentTime(newTime)
      }
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      e.stopPropagation()
      if (audioRef.current) {
        const effectiveDuration = durationRef.current || audioRef.current.duration || 0
        const newTime = Math.min(effectiveDuration, currentTime + 5)
        audioRef.current.currentTime = newTime
        setCurrentTime(newTime)
      }
    }
  }

  if (!audioNote?.url) return null

  const progress = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0

  return (
    <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-800">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
          <Headphones className="h-4 w-4 text-primary-600 dark:text-primary-400 shrink-0" />
          Voice Note
        </h3>

        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-medium text-gray-600 dark:text-gray-300">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 sm:p-4 shadow-xs transition-colors">
        <div className="flex items-center gap-3">
          {/* Play / Pause Button */}
          <button
            type="button"
            onClick={togglePlay}
            disabled={hasError}
            aria-label={isPlaying ? 'Pause voice note' : 'Play voice note'}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-600 text-white shadow-xs hover:bg-primary-700 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 disabled:cursor-not-allowed disabled:opacity-50 transition-all motion-reduce:active:scale-100"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : isPlaying ? (
              <Pause className="h-5 w-5" />
            ) : (
              <Play className="h-5 w-5 ml-0.5" />
            )}
          </button>

          {/* Tactile Waveform Scrubber Slider */}
          <div
            ref={trackRef}
            role="slider"
            tabIndex={0}
            aria-label="Voice note waveform"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(currentTime)}
            aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
            onKeyDown={handleKeyDown}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            data-testid="playback-waveform"
            className="relative flex-1 flex items-center h-12 cursor-pointer select-none touch-none rounded-lg px-2 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
          >
            {/* Waveform Bars Container */}
            <div className="flex w-full items-center justify-between gap-[3px] sm:gap-1 h-9">
              {bars.map((heightPercent, index) => {
                const barRatio = index / (bars.length - 1)
                const isPlayed = progress > 0 && barRatio <= progress

                return (
                  <span
                    key={index}
                    data-testid="playback-bar"
                    data-played={isPlayed ? 'true' : 'false'}
                    className={`w-1 sm:w-1.5 rounded-full transition-colors duration-100 motion-reduce:transition-none ${
                      isPlayed
                        ? 'bg-primary-600 dark:bg-primary-400 shadow-xs'
                        : 'bg-gray-200 dark:bg-gray-700 group-hover:bg-gray-300 dark:group-hover:bg-gray-600'
                    }`}
                    style={{
                      height: `${heightPercent}%`,
                    }}
                  />
                )
              })}
            </div>
          </div>

          {/* Volume Mute Toggle Button */}
          <button
            type="button"
            onClick={toggleMute}
            disabled={hasError}
            aria-label={isMuted ? 'Unmute voice note' : 'Mute voice note'}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 transition-colors"
          >
            {isMuted ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Existing duration line preserved for compatibility */}
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Duration: {Math.floor(duration / 60)}:
          {String(Math.floor(duration % 60)).padStart(2, '0')}
        </p>

        {hasError && (
          <div
            role="alert"
            className="mt-2 flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400"
          >
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>Audio recording could not be played.</span>
          </div>
        )}

        <audio
          ref={audioRef}
          preload="metadata"
          src={audioNote.url}
          onLoadedMetadata={() => {
            setIsLoading(false)
            if (audioRef.current?.duration && !isNaN(audioRef.current.duration)) {
              setDuration(audioRef.current.duration)
            }
          }}
          onDurationChange={() => {
            if (audioRef.current?.duration && !isNaN(audioRef.current.duration)) {
              setDuration(audioRef.current.duration)
            }
          }}
          onTimeUpdate={() => {
            if (!isDraggingRef.current && audioRef.current) {
              setCurrentTime(audioRef.current.currentTime)
            }
          }}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => {
            setIsPlaying(false)
            setCurrentTime(0)
            if (audioRef.current) audioRef.current.currentTime = 0
          }}
          onError={() => {
            setHasError(true)
            setIsLoading(false)
            setIsPlaying(false)
          }}
          onWaiting={() => setIsLoading(true)}
          onCanPlay={() => setIsLoading(false)}
          className="hidden"
          aria-hidden="true"
        >
          Your browser does not support audio playback.
        </audio>
      </div>
    </div>
  )
}
