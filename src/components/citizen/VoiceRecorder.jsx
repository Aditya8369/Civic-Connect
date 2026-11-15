
import { useEffect, useRef, useState } from 'react'
import { Mic, Square, RotateCcw, Play, Pause, Trash2 } from 'lucide-react'
import { useLanguage } from '@/contexts/LanguageContext'

const MAX_DURATION = 60
const BAR_COUNT = 32
const DEFAULT_BAR_HEIGHT = 8

function getSupportedMimeType() {
  if (typeof MediaRecorder === 'undefined') return ''

  const formats = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ]

  return formats.find((type) => MediaRecorder.isTypeSupported(type)) || ''
}

function getRecordedPreviewHeights(count = BAR_COUNT) {
  const heights = []
  for (let i = 0; i < count; i++) {
    const wave = Math.abs(Math.sin((i * 137.5) * 0.1))
    const cadence = 0.5 + 0.5 * Math.sin((i / count) * Math.PI * 3)
    const height = Math.round(10 + (wave * 0.6 + cadence * 0.4) * 26)
    heights.push(Math.max(8, Math.min(38, height)))
  }
  return heights
}

export default function VoiceRecorder({ onRecordingComplete, disabled = false }) {
  const { t } = useLanguage()

  const [status, setStatus] = useState('idle')
  const [seconds, setSeconds] = useState(0)
  const [audioUrl, setAudioUrl] = useState('')
  const [error, setError] = useState('')
  const [isPlaying, setIsPlaying] = useState(false)
  const [waveformMode, setWaveformMode] = useState('idle')

  const recorderRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const audioRef = useRef(null)
  const secondsRef = useRef(0)
  const mountedRef = useRef(true)
  const audioUrlRef = useRef('')

  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const sourceRef = useRef(null)
  const animationFrameRef = useRef(null)
  const barRefs = useRef([])
  const recordedHeightsRef = useRef(getRecordedPreviewHeights(BAR_COUNT))

  const cleanupWaveform = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect()
      } catch {
        // Safe ignore
      }
      sourceRef.current = null
    }

    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect()
      } catch {
        // Safe ignore
      }
      analyserRef.current = null
    }

    if (audioContextRef.current) {
      if (audioContextRef.current.state !== 'closed') {
        try {
          audioContextRef.current.close().catch(() => {})
        } catch {
          // Safe ignore
        }
      }
      audioContextRef.current = null
    }

    setWaveformMode('idle')
  }

  const resetBarHeights = (height = DEFAULT_BAR_HEIGHT) => {
    for (let i = 0; i < BAR_COUNT; i++) {
      const bar = barRefs.current[i]
      if (bar) bar.style.height = `${height}px`
    }
  }

  const applyRecordedHeights = () => {
    const heights = recordedHeightsRef.current
    for (let i = 0; i < BAR_COUNT; i++) {
      const bar = barRefs.current[i]
      if (bar) bar.style.height = `${heights[i] || 12}px`
    }
  }

  const startWaveformAnimation = (analyserNode) => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }

    const isReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches

    let lastFrameTime = 0

    const updateWaveform = () => {
      if (!mountedRef.current || recorderRef.current?.state !== 'recording') return

      const now = Date.now()
      if (now - lastFrameTime >= 30) {
        lastFrameTime = now

        if (analyserNode) {
          const dataArray = new Uint8Array(analyserNode.frequencyBinCount)
          analyserNode.getByteFrequencyData(dataArray)

          for (let i = 0; i < BAR_COUNT; i++) {
            const bar = barRefs.current[i]
            if (!bar) continue

            const binIndex = Math.min(i, dataArray.length - 1)
            const value = dataArray[binIndex] || 0
            const normalized = value / 255

            const targetHeight = isReducedMotion
              ? 12 + normalized * 8
              : 8 + normalized * 34

            bar.style.height = `${targetHeight.toFixed(1)}px`
          }
        } else {
          const time = now / 160
          for (let i = 0; i < BAR_COUNT; i++) {
            const bar = barRefs.current[i]
            if (!bar) continue

            if (isReducedMotion) {
              bar.style.height = '14px'
            } else {
              const wave1 = Math.sin(time + i * 0.35)
              const wave2 = Math.cos(time * 0.75 + i * 0.22)
              const norm = (wave1 + wave2 + 2) / 4
              const targetHeight = 8 + norm * 32
              bar.style.height = `${targetHeight.toFixed(1)}px`
            }
          }
        }
      }

      animationFrameRef.current = requestAnimationFrame(updateWaveform)
    }

    animationFrameRef.current = requestAnimationFrame(updateWaveform)
  }

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
      clearInterval(timerRef.current)
      cleanupWaveform()

      if (recorderRef.current?.state === 'recording') {
        recorderRef.current.onstop = null
        recorderRef.current.stop()
      }

      streamRef.current?.getTracks().forEach((track) => track.stop())

      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current)
      }
    }
  }, [])

  const stopMicrophone = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  const stopRecording = () => {
    clearInterval(timerRef.current)
    cleanupWaveform()

    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop()
    }
  }

  const startRecording = async () => {
    setError('')

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError(t('audioRecordingUnsupported'))
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }

      streamRef.current = stream
      chunksRef.current = []
      secondsRef.current = 0
      setSeconds(0)

      let activeAnalyser = null
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext
        if (AudioCtx) {
          const audioContext = new AudioCtx()
          if (audioContext.state === 'suspended') {
            audioContext.resume().catch(() => {})
          }

          const analyserNode = audioContext.createAnalyser()
          analyserNode.fftSize = 64
          analyserNode.smoothingTimeConstant = 0.8

          const sourceNode = audioContext.createMediaStreamSource(stream)
          sourceNode.connect(analyserNode)

          audioContextRef.current = audioContext
          analyserRef.current = analyserNode
          sourceRef.current = sourceNode
          activeAnalyser = analyserNode
          setWaveformMode('analyser')
        } else {
          setWaveformMode('simulated')
        }
      } catch (audioErr) {
        console.warn('AudioContext failed to initialize, using simulated waveform:', audioErr)
        setWaveformMode('simulated')
      }

      const mimeType = getSupportedMimeType()
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      )

      recorderRef.current = recorder

      recorder.ondataavailable = (event) => {
        if (event.data?.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      recorder.onerror = () => {
        clearInterval(timerRef.current)
        cleanupWaveform()
        stopMicrophone()
        resetBarHeights()

        if (mountedRef.current) {
          setStatus('idle')
          setError(t('recordingError'))
        }
      }

      recorder.onstop = () => {
        clearInterval(timerRef.current)
        cleanupWaveform()
        stopMicrophone()

        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        })

        if (!mountedRef.current) return

        if (blob.size === 0) {
          setStatus('idle')
          resetBarHeights()
          setError(t('noAudioRecorded'))
          return
        }

        const url = URL.createObjectURL(blob)

        setAudioUrl((previousUrl) => {
          if (previousUrl) URL.revokeObjectURL(previousUrl)
          audioUrlRef.current = url
          return url
        })

        setStatus('recorded')
        applyRecordedHeights()

        onRecordingComplete?.({
          blob,
          durationSeconds: secondsRef.current,
          contentType: blob.type,
        })
      }

      recorder.start()
      setStatus('recording')
      startWaveformAnimation(activeAnalyser)

      timerRef.current = setInterval(() => {
        secondsRef.current += 1
        setSeconds(secondsRef.current)

        if (secondsRef.current >= MAX_DURATION) {
          stopRecording()
        }
      }, 1000)
    } catch (err) {
      cleanupWaveform()
      stopMicrophone()
      resetBarHeights()

      if (mountedRef.current) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setError(t('microphonePermissionDenied'))
        } else if (err.name === 'NotFoundError') {
          setError(t('microphoneNotFound'))
        } else {
          setError(t('microphoneAccessFailed'))
        }

        setStatus('idle')
      }
    }
  }

  const discardRecording = () => {
    if (audioRef.current) audioRef.current.pause()

    if (audioUrl) URL.revokeObjectURL(audioUrl)

    setAudioUrl('')
    audioUrlRef.current = ''
    setSeconds(0)
    secondsRef.current = 0
    setIsPlaying(false)
    setStatus('idle')
    setError('')
    cleanupWaveform()
    resetBarHeights()
    onRecordingComplete?.(null)
  }

  const togglePlayback = async () => {
    if (!audioRef.current) return

    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      try {
        await audioRef.current.play()
        setIsPlaying(true)
      } catch {
        setError(t('audioPlaybackFailed'))
      }
    }
  }

  const formatTime = (value) => {
    const minutes = Math.floor(value / 60)
    const remainingSeconds = value % 60

    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
  }

  return (
    <div className="w-full rounded-xl border border-gray-200 bg-white p-4 shadow-xs dark:border-gray-800 dark:bg-gray-900 transition-colors">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-gray-800 dark:text-gray-100">
          {t('voiceNote')}
        </h3>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {t('maximumSeconds')}
        </span>
      </div>

      <div className="mb-3 flex items-center justify-center gap-3">
        <span
          className={`font-mono text-2xl font-semibold ${
            status === 'recording'
              ? 'text-red-600 dark:text-red-400'
              : 'text-gray-700 dark:text-gray-200'
          }`}
        >
          {formatTime(seconds)}
        </span>

        {status === 'recording' && (
          <span className="flex items-center gap-1.5 text-sm font-medium text-red-600 dark:text-red-400">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600 dark:bg-red-400" />
            {t('recording')}
          </span>
        )}
      </div>

      <div
        className="mb-4 flex h-14 items-center justify-center gap-1 rounded-xl bg-slate-50/80 px-4 py-2 border border-slate-100 dark:border-slate-800/80 dark:bg-slate-900/60"
        aria-label={t('audioWaveform')}
        data-testid="recording-waveform"
        data-waveform-mode={status === 'recording' ? waveformMode : 'idle'}
      >
        {Array.from({ length: BAR_COUNT }, (_, index) => (
          <span
            key={index}
            ref={(element) => {
              barRefs.current[index] = element
            }}
            data-testid="waveform-bar"
            className={`w-1 sm:w-1.5 rounded-full transition-[height,background-color] duration-75 motion-reduce:transition-none ${
              status === 'recording'
                ? 'bg-primary-600 dark:bg-primary-400 shadow-xs'
                : status === 'recorded'
                  ? 'bg-primary-700/80 dark:bg-primary-400/80'
                  : 'bg-slate-200 dark:bg-slate-700'
            }`}
            style={{ height: `${DEFAULT_BAR_HEIGHT}px` }}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {status === 'idle' && (
          <button
            type="button"
            disabled={disabled}
            onClick={startRecording}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 font-medium text-white hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 disabled:cursor-not-allowed disabled:opacity-50 transition-colors shadow-xs"
          >
            <Mic size={18} />
            {t('startRecording')}
          </button>
        )}

        {status === 'recording' && (
          <button
            type="button"
            onClick={stopRecording}
            className="flex items-center gap-2 rounded-lg bg-gray-800 px-5 py-2.5 font-medium text-white hover:bg-gray-900 dark:bg-gray-700 dark:hover:bg-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 transition-colors shadow-xs"
          >
            <Square size={16} />
            {t('stopRecording')}
          </button>
        )}

        {status === 'recorded' && (
          <>
            <button
              type="button"
              onClick={togglePlayback}
              className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 font-medium text-white hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 transition-colors shadow-xs"
            >
              {isPlaying ? <Pause size={18} /> : <Play size={18} />}
              {isPlaying ? t('pause') : t('play')}
            </button>

            <button
              type="button"
              onClick={discardRecording}
              className="flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2.5 font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 transition-colors"
            >
              <Trash2 size={18} />
              {t('discard')}
            </button>

            <button
              type="button"
              onClick={discardRecording}
              className="flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2.5 font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 transition-colors"
            >
              <RotateCcw size={18} />
              {t('recordAgain')}
            </button>
          </>
        )}
      </div>

      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onEnded={() => setIsPlaying(false)}
          className="hidden"
          aria-hidden="true"
        />
      )}

      {error && (
        <p role="alert" className="mt-3 text-center text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <p className="mt-3 text-center text-xs text-gray-500 dark:text-gray-400">
        {t('microphoneAccessInstruction')}
      </p>
    </div>
  )
}
