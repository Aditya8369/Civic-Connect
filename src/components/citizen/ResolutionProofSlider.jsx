import { useEffect, useRef, useState } from 'react'

export function getResolutionPhoto(complaint) {
  const photos =
    complaint?.resolutionPhotos ||
    complaint?.resolutionEvidence ||
    (complaint?.resolutionPhotoUrl ? [complaint.resolutionPhotoUrl] : [])

  if (Array.isArray(photos)) return photos[0] || null
  return typeof photos === 'string' ? photos : null
}

function EvidenceImage({ src, alt, onClick, className = '' }) {
  return (
    <img
      src={src}
      alt={alt}
      className={`absolute inset-0 h-full w-full object-cover ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
    />
  )
}

export default function ResolutionProofSlider({
  beforePhoto,
  afterPhoto,
  onImageClick,
}) {
  const [splitPosition, setSplitPosition] = useState(50)
  const rangeRef = useRef(null)

  // React's synthetic change event is skipped when a test or another script
  // assigns `input.value` directly (the value tracker sees no change). Listening
  // natively keeps the preview in sync in that case as well.
  useEffect(() => {
    const input = rangeRef.current
    if (!input) return undefined

    const handleNativeChange = (event) => {
      setSplitPosition(Number(event.target.value))
    }

    input.addEventListener('input', handleNativeChange)
    input.addEventListener('change', handleNativeChange)
    return () => {
      input.removeEventListener('input', handleNativeChange)
      input.removeEventListener('change', handleNativeChange)
    }
  }, [beforePhoto, afterPhoto])

  if (!beforePhoto && !afterPhoto) return null

  if (!beforePhoto || !afterPhoto) {
    const photo = beforePhoto || afterPhoto
    return (
      <div className="relative aspect-[16/10] w-full max-w-xl overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-900">
        <EvidenceImage
          src={photo}
          alt={beforePhoto ? 'Complaint evidence' : 'Resolution evidence'}
          onClick={onImageClick}
        />
        <span className="absolute left-2 top-2 rounded bg-black/65 px-2 py-1 text-[11px] font-medium text-white">
          {beforePhoto ? 'Before' : 'After'}
        </span>
      </div>
    )
  }

  return (
    <div
      className="relative aspect-[16/10] w-full max-w-xl overflow-hidden rounded-lg bg-gray-100 select-none dark:bg-gray-900"
      data-testid="resolution-proof-slider"
    >
      <EvidenceImage
        src={beforePhoto}
        alt="Before complaint evidence"
        onClick={onImageClick}
      />
      <div
        className="absolute inset-y-0 left-0 overflow-hidden"
        style={{ width: `${splitPosition}%` }}
      >
        <EvidenceImage
          src={afterPhoto}
          alt="After resolution evidence"
          onClick={onImageClick}
          className="max-w-none"
        />
      </div>
      <span className="absolute left-2 top-2 rounded bg-black/65 px-2 py-1 text-[11px] font-medium text-white">
        After
      </span>
      <span className="absolute right-2 top-2 rounded bg-black/65 px-2 py-1 text-[11px] font-medium text-white">
        Before
      </span>
      <div
        className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
        style={{ left: `${splitPosition}%` }}
        aria-hidden="true"
      >
        <span className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-xs font-bold text-gray-700 shadow-md">
          ↔
        </span>
      </div>
      <input
        ref={rangeRef}
        type="range"
        min="0"
        max="100"
        value={splitPosition}
        onChange={(event) => setSplitPosition(Number(event.target.value))}
        aria-label="Compare before and after evidence"
        className="absolute inset-0 z-20 h-full w-full cursor-ew-resize opacity-0"
      />
    </div>
  )
}
