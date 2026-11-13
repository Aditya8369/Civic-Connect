import { useEffect, useRef, useState } from 'react'

const DEFAULT_COLORS = [
  '#10B981', // emerald
  '#059669', // dark emerald
  '#3B82F6', // blue
  '#F59E0B', // amber
  '#EC4899', // pink
  '#8B5CF6', // violet
  '#FCD34D', // gold
]

export function ConfettiBurst({
  active = true,
  particleCount = 45,
  durationMs = 2800,
  colors = DEFAULT_COLORS,
  className = '',
  onComplete,
}) {
  const canvasRef = useRef(null)
  const [animating, setAnimating] = useState(active)

  useEffect(() => {
    if (!active) {
      setAnimating(false)
      return
    }

    // Check reduced-motion preference
    if (typeof window !== 'undefined' && window.matchMedia) {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (prefersReducedMotion) {
        setAnimating(false)
        onComplete?.()
        return
      }
    }

    setAnimating(true)
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext ? canvas.getContext('2d') : null
    if (!ctx) {
      // In environments like jsdom without node-canvas, don't crash
      const timer = setTimeout(() => {
        setAnimating(false)
        onComplete?.()
      }, durationMs)
      return () => clearTimeout(timer)
    }

    const { width, height } = canvas.getBoundingClientRect()
    canvas.width = Math.max(width || 300, 300)
    canvas.height = Math.max(height || 160, 160)

    // Generate confetti particles
    const particles = Array.from({ length: particleCount }).map(() => ({
      x: canvas.width * (0.35 + Math.random() * 0.3),
      y: canvas.height * 0.3,
      w: 6 + Math.random() * 6,
      h: 4 + Math.random() * 5,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 8,
      vy: -3 - Math.random() * 5,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 12,
      opacity: 1,
      gravity: 0.16 + Math.random() * 0.08,
      drag: 0.985,
    }))

    let animationFrameId
    const startTime = performance.now()

    const render = (now) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / durationMs, 1)

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      particles.forEach((p) => {
        p.x += p.vx
        p.y += p.vy
        p.vy += p.gravity
        p.vx *= p.drag
        p.rotation += p.rotationSpeed
        p.opacity = Math.max(0, 1 - Math.pow(progress, 1.5))

        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate((p.rotation * Math.PI) / 180)
        ctx.globalAlpha = p.opacity
        ctx.fillStyle = p.color
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        ctx.restore()
      })

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(render)
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        setAnimating(false)
        onComplete?.()
      }
    }

    animationFrameId = requestAnimationFrame(render)

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId)
    }
  }, [active, particleCount, durationMs, colors, onComplete])

  if (!animating) return null

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-testid="confetti-canvas"
      className={`pointer-events-none absolute inset-0 h-full w-full z-20 ${className}`}
    />
  )
}

export default ConfettiBurst

