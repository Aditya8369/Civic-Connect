/**
 * Client-side OCR text extraction utility using Tesseract.js.
 *
 * The Tesseract module and worker are loaded lazily, so the ~multi-megabyte
 * recognition engine is only downloaded when a citizen actually asks to scan
 * a photo. The worker is then reused for subsequent scans and can be disposed
 * explicitly with `terminateWorker()`.
 *
 * Recognition is wrapped in a 5 second timeout so a slow model download or a
 * difficult image can never block the complaint form.
 */

export const OCR_TIMEOUT_MS = 5_000
export const OCR_LANGUAGE = 'eng'
export const OCR_MIN_CONFIDENCE = 30
export const OCR_STRONG_CONFIDENCE = 60
export const OCR_MAX_UPSCALE = 4
export const OCR_MAX_DIMENSION = 2_400
export const OCR_RED_TEXT_THRESHOLD = 15
export const OCR_RED_FALLBACK_PSM = '11'
export const OCR_RED_MAX_REGION_HEIGHT = 128
export const OCR_LIGHT_TEXT_THRESHOLD = 60
export const OCR_LIGHT_FALLBACK_PSM = '6'

// A line is worth suggesting only when it contains a real word or a number.
// Tesseract sometimes returns fragments such as "wR", "oe ae a" or "MRE gre"
// for textured photos (potholes, gravel, foliage) that would otherwise look
// like a title. Requiring four letters keeps short noise tokens out while
// still accepting ordinary words such as "Road", "Fire", and "Leak".
const READABLE_OCR_LINE = /(?:[A-Za-z]{4,}|\d{2,})/

// Cached promise for the shared worker. Keeping the promise (rather than the
// worker itself) also makes concurrent first calls share one worker.
let workerPromise = null

/**
 * Removes OCR noise, keeping only lines that contain a readable word or
 * number. This turns output like `"wR\noe ae a"` into an empty string instead
 * of auto-filling a nonsense title.
 *
 * @param {string} text
 * @returns {string} Cleaned text, or an empty string when nothing is readable
 */
export function cleanOCRText(text) {
  if (typeof text !== 'string' || text.trim() === '') return ''

  return text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line !== '' && READABLE_OCR_LINE.test(line))
    .join('\n')
}

/**
 * Whether OCR output contains at least one readable line.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function isReadableOCRText(text) {
  return cleanOCRText(text) !== ''
}

/**
 * Pulls the most word-like run out of a noisy OCR line. The red-text fallback
 * often recognises the sign headline correctly but also emits punctuation and
 * short fragments around it (for example `"Traffic Issue, + p | ys it"`).
 *
 * @param {string} line
 * @returns {string} The longest run of real words, or an empty string
 */
export function extractReadablePhrase(line) {
  if (typeof line !== 'string' || line.trim() === '') return ''

  const tokens = line.split(/\s+/).filter(Boolean)
  // Short connector words ("in", "of", "at") are not words on their own, but
  // they belong inside a phrase such as "Traffic in Mumbai".
  const isConnector = (token) =>
    /^(?:a|an|and|at|by|for|in|of|on|or|the|to)$/i.test(
      token.replace(/[^A-Za-z]/g, '')
    )
  const isWord = (token) => {
    const letters = token.replace(/[^A-Za-z'’-]/g, '')
    return /^[A-Za-z]/.test(token) && letters.length >= 3
  }

  let best = []
  let current = []

  for (const token of tokens) {
    if (isWord(token)) {
      current.push(token.replace(/[,.;:!?]+$/, ''))
    } else if (isConnector(token) && current.length > 0) {
      current.push(token.toLowerCase())
    } else {
      if (current.length > best.length) best = current
      current = []
    }
  }

  if (current.length > best.length) best = current

  return best.join(' ').trim()
}

/**
 * Chooses the most convincing readable phrase from noisy fallback output.
 *
 * @param {string} text
 * @returns {string} A concise phrase, or an empty string
 */
export function selectBestOCRLine(text) {
  const lines = cleanOCRText(text).split('\n').filter(Boolean)

  let best = ''
  let bestScore = 0

  for (const line of lines) {
    const phrase = extractReadablePhrase(line)
    if (!phrase) continue

    const score = phrase.split(/\s+/).length * 100 + phrase.length
    if (score > bestScore) {
      bestScore = score
      best = phrase
    }
  }

  return best
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

/**
 * Finds the longest run of rows that are wide enough to belong to a text line.
 * Short gaps are allowed so letters with thin strokes or spaces between words
 * do not split one headline into several pieces.
 *
 * @param {Uint32Array|number[]} rowSpans
 * @param {number} minSpan
 * @param {number} [maxGap]
 * @returns {[number, number]|null}
 */
function findLargestRowRun(rowSpans, minSpan, maxGap = 6) {
  let bestStart = 0
  let bestEnd = -1
  let runStart = -1
  let lastGood = -1

  for (let index = 0; index < rowSpans.length; index += 1) {
    if (rowSpans[index] < minSpan) continue

    if (runStart === -1) {
      runStart = index
    } else if (index - lastGood - 1 > maxGap) {
      if (lastGood - runStart > bestEnd - bestStart) {
        bestStart = runStart
        bestEnd = lastGood
      }
      runStart = index
    }

    lastGood = index
  }

  if (runStart !== -1 && lastGood - runStart > bestEnd - bestStart) {
    bestStart = runStart
    bestEnd = lastGood
  }

  return bestEnd === -1 ? null : [bestStart, bestEnd]
}

/**
 * Finds horizontal bands of red pixels that look like a line of sign text.
 *
 * Coloured banners and warning labels often blend into busy photo backgrounds
 * after normal grayscale preprocessing, but their red channel still stands out.
 * Bands are filtered by size, aspect ratio, and red-pixel density so tail
 * lights, clothing, and other solid red objects are ignored.
 *
 * @param {Uint8ClampedArray|number[]} data RGBA pixel data
 * @param {number} width
 * @param {number} height
 * @param {object} [options]
 * @returns {Array<{x0:number,y0:number,x1:number,y1:number,width:number,height:number,count:number,density:number}>}
 */
export function findRedTextRegions(data, width, height, options = {}) {
  if (!data || width <= 0 || height <= 0) return []

  const threshold = Number.isFinite(options.threshold)
    ? options.threshold
    : OCR_RED_TEXT_THRESHOLD
  const minHeight = Number.isFinite(options.minHeight) ? options.minHeight : 8
  const maxHeight = Number.isFinite(options.maxHeight)
    ? options.maxHeight
    : Math.min(OCR_RED_MAX_REGION_HEIGHT, height)
  const minWidth = Number.isFinite(options.minWidth)
    ? options.minWidth
    : Math.min(30, Math.max(8, Math.round(width * 0.1)))
  const minAspect = Number.isFinite(options.minAspect) ? options.minAspect : 1.2
  const minDensity = Number.isFinite(options.minDensity)
    ? options.minDensity
    : 0.08
  const maxDensity = Number.isFinite(options.maxDensity)
    ? options.maxDensity
    : 0.75
  const minPixels = Number.isFinite(options.minPixels) ? options.minPixels : 40

  const rowCounts = new Uint32Array(height)

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width * 4
    let count = 0

    for (let x = 0; x < width; x += 1) {
      const index = rowOffset + x * 4
      const red = data[index]
      const green = data[index + 1]
      const blue = data[index + 2]
      if (red - Math.max(green, blue) > threshold) count += 1
    }

    rowCounts[y] = count
  }

  // A text row contains at least a small fraction of red pixels. Requiring a
  // few pixels avoids detecting isolated compression artefacts while still
  // separating a headline from sparse red details further down the photo.
  const rowThreshold = Math.max(2, Math.floor(width * 0.01))
  const bands = []
  let bandStart = -1

  for (let y = 0; y <= height; y += 1) {
    const active = y < height && rowCounts[y] >= rowThreshold

    if (active && bandStart === -1) {
      bandStart = y
    } else if (!active && bandStart !== -1) {
      const previous = bands[bands.length - 1]

      // Letters with descenders and accents can leave one or two empty rows
      // inside the same headline, so merge bands separated by a tiny gap.
      if (previous && bandStart - previous[1] <= 3) {
        previous[1] = y - 1
      } else {
        bands.push([bandStart, y - 1])
      }

      bandStart = -1
    }
  }

  const regions = []

  for (const [startY, endY] of bands) {
    const rowSpans = new Uint32Array(endY - startY + 1)
    let bandMinX = width
    let bandMaxX = -1

    for (let y = startY; y <= endY; y += 1) {
      const rowOffset = y * width * 4
      let rowMinX = width
      let rowMaxX = -1

      for (let x = 0; x < width; x += 1) {
        const index = rowOffset + x * 4
        const red = data[index]
        const green = data[index + 1]
        const blue = data[index + 2]

        if (red - Math.max(green, blue) > threshold) {
          if (x < rowMinX) rowMinX = x
          if (x > rowMaxX) rowMaxX = x
        }
      }

      if (rowMaxX >= rowMinX) {
        rowSpans[y - startY] = rowMaxX - rowMinX + 1
        if (rowMinX < bandMinX) bandMinX = rowMinX
        if (rowMaxX > bandMaxX) bandMaxX = rowMaxX
      }
    }

    if (bandMaxX < bandMinX) continue

    // A red object below the headline can merge into the same row band. Keep
    // only the widest run of rows, which is the actual line of text.
    const bandWidth = bandMaxX - bandMinX + 1
    const run = findLargestRowRun(
      rowSpans,
      Math.max(8, Math.round(bandWidth * 0.1)),
      6
    )
    if (!run) continue

    const trimmedStartY = startY + run[0]
    const trimmedEndY = startY + run[1]

    let minX = width
    let maxX = -1
    let count = 0

    for (let y = trimmedStartY; y <= trimmedEndY; y += 1) {
      const rowOffset = y * width * 4

      for (let x = 0; x < width; x += 1) {
        const index = rowOffset + x * 4
        const red = data[index]
        const green = data[index + 1]
        const blue = data[index + 2]

        if (red - Math.max(green, blue) > threshold) {
          count += 1
          if (x < minX) minX = x
          if (x > maxX) maxX = x
        }
      }
    }

    if (maxX < minX || count === 0) continue

    const regionWidth = maxX - minX + 1
    const regionHeight = trimmedEndY - trimmedStartY + 1

    if (regionHeight < minHeight || regionHeight > maxHeight) continue
    if (regionWidth < minWidth) continue
    if (regionWidth / regionHeight < minAspect) continue

    const density = count / (regionWidth * regionHeight)
    if (count < minPixels || density < minDensity || density > maxDensity) {
      continue
    }

    regions.push({
      x0: minX,
      y0: trimmedStartY,
      x1: maxX,
      y1: trimmedEndY,
      width: regionWidth,
      height: regionHeight,
      count,
      density,
    })
  }

  // Prefer dense, headline-shaped bands. Density matters because large red
  // objects (vehicles, clothing) cover far more pixels but have a much lower
  // fill ratio than a line of lettering.
  regions.sort((a, b) => {
    const scoreA =
      a.count * Math.min(a.width / a.height, 8) * a.density * a.density
    const scoreB =
      b.count * Math.min(b.width / b.height, 8) * b.density * b.density
    return scoreB - scoreA
  })

  return regions
}

/**
 * Finds horizontal bands of bright, high-contrast pixels that look like a line
 * of light text. The input is a high-passed grayscale image where bright
 * lettering has been turned into dark pixels on a white background.
 *
 * This handles white overlay titles printed on busy or textured backgrounds,
 * which the normal darkest-channel pass cannot separate from the photo.
 *
 * @param {Uint8ClampedArray|number[]} data RGBA pixel data from a high-pass pass
 * @param {number} width
 * @param {number} height
 * @param {object} [options]
 * @returns {Array<{x0:number,y0:number,x1:number,y1:number,width:number,height:number,count:number,density:number}>}
 */
export function findLightTextRegions(data, width, height, options = {}) {
  if (!data || width <= 0 || height <= 0) return []

  const minHeight = Number.isFinite(options.minHeight) ? options.minHeight : 8
  const maxHeight = Number.isFinite(options.maxHeight)
    ? options.maxHeight
    : Math.min(OCR_RED_MAX_REGION_HEIGHT, height)
  const minWidth = Number.isFinite(options.minWidth)
    ? options.minWidth
    : Math.min(30, Math.max(8, Math.round(width * 0.1)))
  const minAspect = Number.isFinite(options.minAspect) ? options.minAspect : 1.2
  const minDensity = Number.isFinite(options.minDensity)
    ? options.minDensity
    : 0.05
  const maxDensity = Number.isFinite(options.maxDensity)
    ? options.maxDensity
    : 0.9
  const minPixels = Number.isFinite(options.minPixels) ? options.minPixels : 40
  const configuredColumnGap = Number.isFinite(options.maxColumnGap)
    ? options.maxColumnGap
    : null

  // A headline row needs a meaningful share of text pixels. Requiring 2% of
  // the width ignores isolated bright specks while still catching short labels.
  const rowThreshold = Math.max(8, Math.round(width * 0.02))
  const rowCounts = new Uint32Array(height)

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width * 4
    let count = 0

    for (let x = 0; x < width; x += 1) {
      if (data[rowOffset + x * 4] < 128) count += 1
    }

    rowCounts[y] = count
  }

  const bands = []
  let bandStart = -1

  for (let y = 0; y <= height; y += 1) {
    const active = y < height && rowCounts[y] >= rowThreshold

    if (active && bandStart === -1) {
      bandStart = y
    } else if (!active && bandStart !== -1) {
      const previous = bands[bands.length - 1]

      if (previous && bandStart - previous[1] <= 3) {
        previous[1] = y - 1
      } else {
        bands.push([bandStart, y - 1])
      }

      bandStart = -1
    }
  }

  const regions = []

  for (const [startY, endY] of bands) {
    const rowSpans = new Uint32Array(endY - startY + 1)
    let bandMinX = width
    let bandMaxX = -1

    for (let y = startY; y <= endY; y += 1) {
      const rowOffset = y * width * 4
      let rowMinX = width
      let rowMaxX = -1

      for (let x = 0; x < width; x += 1) {
        if (data[rowOffset + x * 4] < 128) {
          if (x < rowMinX) rowMinX = x
          if (x > rowMaxX) rowMaxX = x
        }
      }

      if (rowMaxX >= rowMinX) {
        rowSpans[y - startY] = rowMaxX - rowMinX + 1
        if (rowMinX < bandMinX) bandMinX = rowMinX
        if (rowMaxX > bandMaxX) bandMaxX = rowMaxX
      }
    }

    if (bandMaxX < bandMinX) continue

    const bandWidth = bandMaxX - bandMinX + 1
    const run = findLargestRowRun(
      rowSpans,
      Math.max(8, Math.round(bandWidth * 0.1)),
      6
    )
    if (!run) continue

    const trimmedStartY = startY + run[0]
    const trimmedEndY = startY + run[1]
    const regionHeight = trimmedEndY - trimmedStartY + 1
    // Spaces between words are roughly one character tall, so allow a gap
    // proportional to the line height without merging distant objects.
    const maxColumnGap =
      configuredColumnGap ??
      Math.min(24, Math.max(8, Math.round(regionHeight * 1.5)))

    const columnCounts = new Uint32Array(width)

    for (let y = trimmedStartY; y <= trimmedEndY; y += 1) {
      const rowOffset = y * width * 4

      for (let x = 0; x < width; x += 1) {
        if (data[rowOffset + x * 4] < 128) columnCounts[x] += 1
      }
    }

    // Group text columns into words first, then merge neighbouring word runs.
    // Small fragments such as a stray ">" before the headline stay separate
    // because they are too small to count as a word.
    const columnRuns = []
    let runStart = -1
    let lastActive = -1
    let runCount = 0

    const flushColumnRun = () => {
      if (runStart === -1) return

      columnRuns.push({
        start: runStart,
        end: lastActive,
        width: lastActive - runStart + 1,
        count: runCount,
      })
      runStart = -1
      lastActive = -1
      runCount = 0
    }

    for (let x = 0; x < width; x += 1) {
      const columnCount = columnCounts[x]

      if (columnCount > 0) {
        if (runStart === -1) runStart = x
        lastActive = x
        runCount += columnCount
      } else if (runStart !== -1 && x - lastActive > 8) {
        flushColumnRun()
      }
    }

    flushColumnRun()

    const minRunWidth = Math.max(8, Math.round(regionHeight * 0.8))
    const minRunPixels = Math.max(20, Math.round(regionHeight * 2))
    const wordRuns = columnRuns.filter(
      (candidate) =>
        candidate.width >= minRunWidth && candidate.count >= minRunPixels
    )

    if (wordRuns.length === 0) continue

    let merged = { ...wordRuns[0] }
    let best = merged

    for (let index = 1; index < wordRuns.length; index += 1) {
      const next = wordRuns[index]

      if (next.start - merged.end - 1 <= maxColumnGap) {
        merged.end = next.end
        merged.width = merged.end - merged.start + 1
        merged.count += next.count
      } else {
        if (merged.count > best.count) best = merged
        merged = { ...next }
      }
    }

    if (merged.count > best.count) best = merged

    const x0 = best.start
    const x1 = best.end
    const regionWidth = x1 - x0 + 1

    if (regionHeight < minHeight || regionHeight > maxHeight) continue
    if (regionWidth < minWidth) continue
    if (regionWidth / regionHeight < minAspect) continue

    let count = 0

    for (let y = trimmedStartY; y <= trimmedEndY; y += 1) {
      const rowOffset = y * width * 4

      for (let x = x0; x <= x1; x += 1) {
        if (data[rowOffset + x * 4] < 128) count += 1
      }
    }

    const density = count / (regionWidth * regionHeight)
    if (count < minPixels || density < minDensity || density > maxDensity) {
      continue
    }

    regions.push({
      x0,
      y0: trimmedStartY,
      x1,
      y1: trimmedEndY,
      width: regionWidth,
      height: regionHeight,
      count,
      density,
    })
  }

  regions.sort((a, b) => {
    const scoreA =
      a.count * Math.min(a.width / a.height, 8) * a.density * a.density
    const scoreB =
      b.count * Math.min(b.width / b.height, 8) * b.density * b.density
    return scoreB - scoreA
  })

  return regions
}

function isCanvasSource(image) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return false
  }

  if (typeof Blob !== 'undefined' && image instanceof Blob) {
    return typeof createImageBitmap === 'function'
  }

  if (typeof HTMLImageElement !== 'undefined' && image instanceof HTMLImageElement) {
    return true
  }

  if (
    typeof HTMLCanvasElement !== 'undefined' &&
    image instanceof HTMLCanvasElement
  ) {
    return true
  }

  return false
}

function getSourceSize(source) {
  const width = source?.naturalWidth || source?.width || 0
  const height = source?.naturalHeight || source?.height || 0
  return { width, height }
}

/**
 * Improves recognition of small or low-contrast text before it reaches
 * Tesseract. Photos are upscaled, converted to their darkest colour channel
 * (which makes coloured lettering stand out from grey road/sky), and stretched
 * to use the full contrast range.
 *
 * Best-effort only: when canvas, `createImageBitmap`, or cross-origin image
 * access is unavailable the original image is returned unchanged.
 *
 * @param {File|Blob|HTMLImageElement|HTMLCanvasElement} image
 * @returns {Promise<File|Blob|HTMLImageElement|HTMLCanvasElement>}
 */
export async function preprocessImage(image) {
  if (!image || !isCanvasSource(image)) return image

  let bitmap = null

  try {
    let source = image

    if (typeof Blob !== 'undefined' && image instanceof Blob) {
      bitmap = await createImageBitmap(image)
      source = bitmap
    }

    const { width, height } = getSourceSize(source)
    if (!width || !height) return image

    // Upscale small photos so lettering is large enough for Tesseract, but
    // never blow a large camera photo up beyond a sensible memory budget.
    const scale = clamp(OCR_MAX_DIMENSION / Math.max(width, height), 1, OCR_MAX_UPSCALE)
    const targetWidth = Math.max(1, Math.round(width * scale))
    const targetHeight = Math.max(1, Math.round(height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight

    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return image

    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(source, 0, 0, targetWidth, targetHeight)

    const imageData = context.getImageData(0, 0, targetWidth, targetHeight)
    const { data } = imageData
    const histogram = new Uint32Array(256)

    // Use the darkest channel. Saturated red/green/blue lettering stays dark
    // while neutral backgrounds remain light, which preserves the text edge.
    for (let index = 0; index < data.length; index += 4) {
      const alpha = data[index + 3]
      let value = Math.min(data[index], data[index + 1], data[index + 2])

      // Flatten transparency onto white before measuring contrast.
      if (alpha < 255) {
        value = Math.round((value * alpha + 255 * (255 - alpha)) / 255)
      }

      data[index] = value
      histogram[value] += 1
    }

    const pixelCount = targetWidth * targetHeight
    const lowTarget = pixelCount * 0.02
    const highTarget = pixelCount * 0.98
    let accumulated = 0
    let low = 0
    let high = 255

    for (let value = 0; value < 256; value += 1) {
      accumulated += histogram[value]
      if (accumulated >= lowTarget) {
        low = value
        break
      }
    }

    accumulated = 0
    for (let value = 0; value < 256; value += 1) {
      accumulated += histogram[value]
      if (accumulated >= highTarget) {
        high = value
        break
      }
    }

    if (high <= low) {
      low = 0
      high = 255
    }

    const span = high - low
    const lookup = new Uint8ClampedArray(256)
    for (let value = 0; value < 256; value += 1) {
      lookup[value] = Math.round(((value - low) / span) * 255)
    }

    for (let index = 0; index < data.length; index += 4) {
      const value = lookup[data[index]]
      data[index] = value
      data[index + 1] = value
      data[index + 2] = value
    }

    context.putImageData(imageData, 0, 0)
    return canvas
  } catch {
    // Cross-origin images, unsupported browsers, or exhausted canvas memory:
    // fall back to recognising the original image.
    return image
  } finally {
    bitmap?.close?.()
  }
}

/**
 * Replaces a crop with a high-pass, thresholded grayscale image so coloured
 * lettering stands out from a textured background. The local background is
 * estimated with a box blur and subtracted from each pixel.
 *
 * @param {Uint8ClampedArray} data RGBA pixel data (modified in place)
 * @param {number} width
 * @param {number} height
 */
function highPassGrayscale(data, width, height, options = {}) {
  const pixelCount = width * height
  const gray = new Float32Array(pixelCount)
  const integral = new Float64Array((width + 1) * (height + 1))

  for (let y = 0; y < height; y += 1) {
    let rowSum = 0
    const rowOffset = y * width * 4

    for (let x = 0; x < width; x += 1) {
      const index = rowOffset + x * 4
      const alpha = data[index + 3] / 255
      const luminance =
        data[index] * 0.299 +
        data[index + 1] * 0.587 +
        data[index + 2] * 0.114

      // Flatten transparency onto white before measuring contrast.
      const value = luminance * alpha + 255 * (1 - alpha)
      gray[y * width + x] = value
      rowSum += value

      integral[(y + 1) * (width + 1) + (x + 1)] =
        integral[y * (width + 1) + (x + 1)] + rowSum
    }
  }

  const radius = Number.isFinite(options.radius)
    ? options.radius
    : clamp(Math.round(height * 0.25), 5, 21)
  const threshold = Number.isFinite(options.threshold)
    ? options.threshold
    : 20
  // Dark text (default) is darker than its surroundings. Light text such as
  // white overlay lettering is brighter, so the subtraction is reversed.
  const detectLightText = options.polarity === 'light'
  const multiplier = Number.isFinite(options.multiplier)
    ? options.multiplier
    : 3

  for (let y = 0; y < height; y += 1) {
    const top = Math.max(0, y - radius)
    const bottom = Math.min(height, y + radius + 1)

    for (let x = 0; x < width; x += 1) {
      const left = Math.max(0, x - radius)
      const right = Math.min(width, x + radius + 1)
      const area = (right - left) * (bottom - top)
      const sum =
        integral[bottom * (width + 1) + right] -
        integral[top * (width + 1) + right] -
        integral[bottom * (width + 1) + left] +
        integral[top * (width + 1) + left]
      const background = sum / area
      const difference = detectLightText
        ? Math.max(0, gray[y * width + x] - background)
        : Math.max(0, background - gray[y * width + x])
      const value = Math.round(
        255 - clamp((difference - threshold) * multiplier, 0, 255)
      )
      const index = (y * width + x) * 4

      data[index] = value
      data[index + 1] = value
      data[index + 2] = value
      data[index + 3] = 255
    }
  }
}

/**
 * Builds a high-contrast crop around red sign lettering for a second OCR pass.
 *
 * Best-effort only: returns `null` when canvas support is unavailable or when
 * no text-like red region is found, so callers can fall back to an empty
 * suggestion.
 *
 * @param {File|Blob|HTMLImageElement|HTMLCanvasElement} image
 * @returns {Promise<HTMLCanvasElement|null>}
 */
export async function buildRedTextImage(image) {
  if (!image || !isCanvasSource(image)) return null

  let bitmap = null

  try {
    let source = image

    if (typeof Blob !== 'undefined' && image instanceof Blob) {
      bitmap = await createImageBitmap(image)
      source = bitmap
    }

    const { width, height } = getSourceSize(source)
    if (!width || !height) return null

    // Detection can run below the source resolution: a headline band stays
    // clearly visible and the pixel scan stays cheap for camera photos.
    const detectionScale = clamp(
      OCR_MAX_DIMENSION / Math.max(width, height),
      0.25,
      1
    )
    const detectWidth = Math.max(1, Math.round(width * detectionScale))
    const detectHeight = Math.max(1, Math.round(height * detectionScale))

    const detectCanvas = document.createElement('canvas')
    detectCanvas.width = detectWidth
    detectCanvas.height = detectHeight

    const detectContext = detectCanvas.getContext('2d', {
      willReadFrequently: true,
    })
    if (!detectContext) return null

    detectContext.drawImage(source, 0, 0, detectWidth, detectHeight)

    const detection = detectContext.getImageData(0, 0, detectWidth, detectHeight)
    const [region] = findRedTextRegions(
      detection.data,
      detectWidth,
      detectHeight
    )
    if (!region) return null

    // Map the band back to source pixels and add breathing room so letters are
    // not clipped at the crop edge.
    const scaleX = width / detectWidth
    const scaleY = height / detectHeight
    const padding = clamp(Math.round(region.height * 0.2), 4, 12)
    const sourceX = clamp(
      Math.floor((region.x0 - padding) * scaleX),
      0,
      width - 1
    )
    const sourceY = clamp(
      Math.floor((region.y0 - padding) * scaleY),
      0,
      height - 1
    )
    const sourceRight = clamp(
      Math.ceil((region.x1 + padding + 1) * scaleX),
      sourceX + 1,
      width
    )
    const sourceBottom = clamp(
      Math.ceil((region.y1 + padding + 1) * scaleY),
      sourceY + 1,
      height
    )
    const cropWidth = sourceRight - sourceX
    const cropHeight = sourceBottom - sourceY

    if (cropWidth < 8 || cropHeight < 8) return null

    const cropCanvas = document.createElement('canvas')
    cropCanvas.width = cropWidth
    cropCanvas.height = cropHeight

    const cropContext = cropCanvas.getContext('2d', {
      willReadFrequently: true,
    })
    if (!cropContext) return null

    cropContext.drawImage(
      source,
      sourceX,
      sourceY,
      cropWidth,
      cropHeight,
      0,
      0,
      cropWidth,
      cropHeight
    )

    const cropImageData = cropContext.getImageData(0, 0, cropWidth, cropHeight)
    highPassGrayscale(cropImageData.data, cropWidth, cropHeight)
    cropContext.putImageData(cropImageData, 0, 0)

    // Tesseract needs reasonably large lettering. Upscale the crop while
    // keeping the final canvas inside the same memory budget as the primary
    // preprocessing pass.
    const maxUpscale = Math.max(
      1,
      Math.floor(OCR_MAX_DIMENSION / Math.max(cropWidth, cropHeight))
    )
    const upscale = Math.min(8, maxUpscale)

    if (upscale <= 1) return cropCanvas

    const output = document.createElement('canvas')
    output.width = cropWidth * upscale
    output.height = cropHeight * upscale

    const outputContext = output.getContext('2d')
    if (!outputContext) return cropCanvas

    outputContext.imageSmoothingEnabled = true
    outputContext.imageSmoothingQuality = 'high'
    outputContext.drawImage(cropCanvas, 0, 0, output.width, output.height)

    return output
  } catch {
    // Cross-origin images, unsupported browsers, or exhausted canvas memory.
    return null
  } finally {
    bitmap?.close?.()
  }
}

/**
 * Builds a high-pass grayscale version of the whole photo.
 *
 * Dark text printed on concrete, asphalt, brick, or other textured surfaces has
 * almost no global contrast, but it stands out from the local background. This
 * is a second fallback used when both normal recognition and the red-text pass
 * find nothing readable.
 *
 * @param {File|Blob|HTMLImageElement|HTMLCanvasElement} image
 * @returns {Promise<HTMLCanvasElement|null>}
 */
export async function buildDarkTextImage(image) {
  if (!image || !isCanvasSource(image)) return null

  let bitmap = null

  try {
    let source = image

    if (typeof Blob !== 'undefined' && image instanceof Blob) {
      bitmap = await createImageBitmap(image)
      source = bitmap
    }

    const { width, height } = getSourceSize(source)
    if (!width || !height) return null

    const scale = clamp(
      OCR_MAX_DIMENSION / Math.max(width, height),
      0.25,
      1
    )
    const workWidth = Math.max(1, Math.round(width * scale))
    const workHeight = Math.max(1, Math.round(height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = workWidth
    canvas.height = workHeight

    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return null

    context.drawImage(source, 0, 0, workWidth, workHeight)

    const imageData = context.getImageData(0, 0, workWidth, workHeight)
    const radius = clamp(
      Math.round(Math.max(workWidth, workHeight) * 0.05),
      15,
      61
    )

    highPassGrayscale(imageData.data, workWidth, workHeight, {
      radius,
      threshold: 25,
    })
    context.putImageData(imageData, 0, 0)

    const maxUpscale = Math.max(
      1,
      Math.floor(OCR_MAX_DIMENSION / Math.max(workWidth, workHeight))
    )
    const upscale = Math.min(2, maxUpscale)

    if (upscale <= 1) return canvas

    const output = document.createElement('canvas')
    output.width = workWidth * upscale
    output.height = workHeight * upscale

    const outputContext = output.getContext('2d')
    if (!outputContext) return canvas

    outputContext.imageSmoothingEnabled = true
    outputContext.imageSmoothingQuality = 'high'
    outputContext.drawImage(canvas, 0, 0, output.width, output.height)

    return output
  } catch {
    // Cross-origin images, unsupported browsers, or exhausted canvas memory.
    return null
  } finally {
    bitmap?.close?.()
  }
}

/**
 * Builds a cropped, high-pass grayscale image around light lettering.
 *
 * White overlay titles on photos have no colour or brightness separation from
 * a busy background after normal preprocessing. This pass turns bright
 * structures into dark text, finds the strongest headline-shaped band, and
 * crops it so Tesseract sees only the lettering.
 *
 * @param {File|Blob|HTMLImageElement|HTMLCanvasElement} image
 * @returns {Promise<HTMLCanvasElement|null>}
 */
export async function buildLightTextImage(image) {
  if (!image || !isCanvasSource(image)) return null

  let bitmap = null

  try {
    let source = image

    if (typeof Blob !== 'undefined' && image instanceof Blob) {
      bitmap = await createImageBitmap(image)
      source = bitmap
    }

    const { width, height } = getSourceSize(source)
    if (!width || !height) return null

    const scale = clamp(
      OCR_MAX_DIMENSION / Math.max(width, height),
      0.25,
      1
    )
    const workWidth = Math.max(1, Math.round(width * scale))
    const workHeight = Math.max(1, Math.round(height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = workWidth
    canvas.height = workHeight

    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return null

    context.drawImage(source, 0, 0, workWidth, workHeight)

    const imageData = context.getImageData(0, 0, workWidth, workHeight)
    const radius = clamp(
      Math.round(Math.min(workWidth, workHeight) * 0.012),
      3,
      9
    )

    highPassGrayscale(imageData.data, workWidth, workHeight, {
      radius,
      threshold: OCR_LIGHT_TEXT_THRESHOLD,
      polarity: 'light',
      multiplier: 4,
    })
    context.putImageData(imageData, 0, 0)

    const region = findLightTextRegions(
      imageData.data,
      workWidth,
      workHeight
    )[0]

    if (!region) return null

    const padding = clamp(Math.round(region.height * 0.4), 5, 12)
    const sourceX = Math.max(0, region.x0 - padding)
    const sourceY = Math.max(0, region.y0 - padding)
    const cropWidth = Math.min(
      workWidth - sourceX,
      region.width + padding * 2
    )
    const cropHeight = Math.min(
      workHeight - sourceY,
      region.height + padding * 2
    )

    if (cropWidth <= 0 || cropHeight <= 0) return null

    const crop = document.createElement('canvas')
    crop.width = cropWidth
    crop.height = cropHeight

    const cropContext = crop.getContext('2d')
    if (!cropContext) return null

    cropContext.drawImage(
      canvas,
      sourceX,
      sourceY,
      cropWidth,
      cropHeight,
      0,
      0,
      cropWidth,
      cropHeight
    )

    const maxUpscale = Math.max(
      1,
      Math.floor(OCR_MAX_DIMENSION / Math.max(cropWidth, cropHeight))
    )
    const upscale = Math.min(8, maxUpscale)

    if (upscale <= 1) return crop

    const output = document.createElement('canvas')
    output.width = cropWidth * upscale
    output.height = cropHeight * upscale

    const outputContext = output.getContext('2d')
    if (!outputContext) return crop

    outputContext.imageSmoothingEnabled = true
    outputContext.imageSmoothingQuality = 'high'
    outputContext.drawImage(crop, 0, 0, output.width, output.height)

    return output
  } catch {
    // Cross-origin images, unsupported browsers, or exhausted canvas memory.
    return null
  } finally {
    bitmap?.close?.()
  }
}

/**
 * Resolves Tesseract's createWorker factory. tesseract.js ships a CommonJS
 * build, so different bundlers/test environments expose it either as a named
 * export, on the default export, or under the legacy `Tesseract` namespace.
 */
async function loadCreateWorker() {
  const module = await import('tesseract.js')
  const createWorker =
    module?.createWorker ??
    module?.default?.createWorker ??
    module?.Tesseract?.createWorker ??
    module?.default?.Tesseract?.createWorker ??
    (typeof module?.default === 'function' ? module.default : null)

  if (typeof createWorker !== 'function') {
    throw new Error('Tesseract.js createWorker is unavailable')
  }

  return createWorker
}

function getWorker() {
  if (!workerPromise) {
    workerPromise = loadCreateWorker()
      .then(async (createWorker) => {
        const worker = await createWorker(OCR_LANGUAGE)

        // tesseract.js defaults to single-block segmentation, which treats
        // textured photo backgrounds as one noisy block. Automatic page
        // segmentation finds the isolated sign/label text instead.
        try {
          await worker?.setParameters?.({ tessedit_pageseg_mode: '3' })
        } catch {
          // Older Tesseract builds may not expose setParameters.
        }

        return worker
      })
      .catch((error) => {
        // Do not cache a failed load: a later attempt should be able to retry.
        workerPromise = null
        throw error
      })
  }

  return workerPromise
}

function readRecognizedText(result) {
  if (typeof result === 'string') return result

  // tesseract.js v5+ returns { data: { text } }, while older versions and
  // simple mocks may return { text } directly.
  const text = result?.data?.text ?? result?.text
  return typeof text === 'string' ? text : ''
}

function readRecognizedConfidence(result) {
  const confidence = result?.data?.confidence
  if (confidence === undefined || confidence === null) return null

  const numericConfidence = Number(confidence)
  return Number.isFinite(numericConfidence) ? numericConfidence : null
}

function readResultText(result) {
  // Very low confidence almost always means texture noise (road, gravel,
  // foliage) rather than real lettering. Drop it instead of suggesting it.
  const confidence = readRecognizedConfidence(result)
  if (confidence !== null && confidence < OCR_MIN_CONFIDENCE) return ''

  return cleanOCRText(readRecognizedText(result))
}

function readFallbackText(result) {
  const confidence = readRecognizedConfidence(result)
  if (confidence !== null && confidence < OCR_MIN_CONFIDENCE) return ''

  // The fallback pass deliberately over-detects, so reduce its output to the
  // most convincing phrase instead of returning the whole noisy block.
  return selectBestOCRLine(readRecognizedText(result))
}

/**
 * Whether a primary-pass result is trustworthy enough to skip the specialised
 * fallbacks. Low-confidence text that does not contain a known issue or
 * address word is often a half-recognised word ("affic in" for "Traffic in
 * Mumbai"), so it is kept only as a last resort.
 *
 * @param {string} text
 * @param {number|null} confidence
 * @returns {boolean}
 */
function isConfidentOCRText(text, confidence) {
  if (!text) return false
  if (confidence !== null && confidence >= OCR_STRONG_CONFIDENCE) return true

  return ISSUE_CUE.test(text) || ADDRESS_CUE.test(text)
}

async function disposeWorker(pendingWorker) {
  const pending = pendingWorker ?? workerPromise
  if (workerPromise === pending) workerPromise = null

  if (!pending) return

  try {
    const worker = await pending
    await worker?.terminate?.()
  } catch {
    // A worker that failed to initialise has nothing to terminate.
  }
}

/**
 * Extracts text from an image entirely in the browser.
 *
 * Never throws: timeouts, unsupported images, and Tesseract failures all
 * resolve to an empty string so the citizen can continue filling the form.
 *
 * @param {File|Blob|string|HTMLImageElement|HTMLCanvasElement} image
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<string>} Recognised text, or an empty string
 */
export async function extractTextFromImage(image, options = {}) {
  if (!image) return ''

  const requestedTimeout = Number(options?.timeoutMs)
  const timeoutMs =
    Number.isFinite(requestedTimeout) && requestedTimeout > 0
      ? requestedTimeout
      : OCR_TIMEOUT_MS

  let timerId
  let timedOut = false
  let pendingWorker = null

  // Start recognition immediately. The worker is created lazily on first use.
  const recognitionTask = (async () => {
    pendingWorker = getWorker()
    const worker = await pendingWorker

    // The timeout may have elapsed while the worker/model was loading.
    if (timedOut) return ''

    const preparedImage = await preprocessImage(image)
    if (timedOut) return ''

    const primary = await worker.recognize(preparedImage)
    if (timedOut) return ''

    const primaryConfidence = readRecognizedConfidence(primary)
    const primaryText = readResultText(primary)

    // A low-confidence, cue-less result is often a half-recognised word such
    // as "affic in" from "Traffic in Mumbai". Keep it as a fallback, but let
    // the specialised passes try to read the whole phrase first.
    if (primaryText && isConfidentOCRText(primaryText, primaryConfidence)) {
      return primaryText
    }

    const weakPrimaryText = primaryText

    // The normal pass found nothing readable. Coloured sign lettering (red
    // banners, warning labels) can blend into busy photo backgrounds, so try a
    // dedicated red-text crop before giving up.
    const redTextImage = await buildRedTextImage(image)

    if (redTextImage && !timedOut) {
      let fallback = null

      try {
        await worker?.setParameters?.({
          tessedit_pageseg_mode: OCR_RED_FALLBACK_PSM,
        })
        fallback = await worker.recognize(redTextImage)
      } catch {
        // Older Tesseract builds may not expose setParameters, or the crop may
        // be rejected. Continue to the dark-text pass instead of giving up.
      } finally {
        // Restore automatic page segmentation for the next normal scan.
        try {
          await worker?.setParameters?.({ tessedit_pageseg_mode: '3' })
        } catch {
          // The next scan sets PSM 3 again when it creates the worker.
        }
      }

      if (timedOut) return ''

      const redText = readFallbackText(fallback)
      if (redText) return redText
    }

    // Still nothing. Dark lettering printed on concrete, asphalt, or brick has
    // almost no global contrast, so retry with a whole-image high-pass pass.
    const darkTextImage = await buildDarkTextImage(image)

    if (darkTextImage && !timedOut) {
      let darkFallback = null

      try {
        darkFallback = await worker.recognize(darkTextImage)
      } catch {
        // Continue to the light-text pass instead of giving up.
      }

      if (timedOut) return ''

      const darkText = readFallbackText(darkFallback)
      if (darkText) return darkText
    }

    // Finally, try bright overlay lettering (white titles, labels). This is
    // cropped to the strongest headline-shaped band so the busy photo around
    // it does not drown out the words.
    const lightTextImage = await buildLightTextImage(image)
    if (!lightTextImage || timedOut) return weakPrimaryText

    let lightFallback = null

    try {
      // The crop contains a single line of lettering, so single-block
      // segmentation reads it more reliably than automatic page detection.
      await worker?.setParameters?.({
        tessedit_pageseg_mode: OCR_LIGHT_FALLBACK_PSM,
      })
      lightFallback = await worker.recognize(lightTextImage)
    } catch {
      return weakPrimaryText
    } finally {
      try {
        await worker?.setParameters?.({ tessedit_pageseg_mode: '3' })
      } catch {
        // The next scan sets PSM 3 again when it creates the worker.
      }
    }

    if (timedOut) return ''

    return readFallbackText(lightFallback) || weakPrimaryText
  })()

  const timeoutTask = new Promise((resolve) => {
    timerId = setTimeout(() => {
      timedOut = true
      resolve(null)
    }, timeoutMs)
  })

  try {
    const result = await Promise.race([recognitionTask, timeoutTask])

    if (timedOut) {
      // Recognition may still be running. Abandon the worker asynchronously so
      // this function returns promptly while the browser stops the work.
      void disposeWorker(pendingWorker)
      return ''
    }

    return typeof result === 'string' ? result : ''
  } catch {
    // An invalid image or a failed model load must not break the form.
    void disposeWorker(pendingWorker)
    return ''
  } finally {
    clearTimeout(timerId)
  }
}

/**
 * Stops and disposes the shared Tesseract worker. Safe to call when no worker
 * has been created (for example, when the form unmounts before any OCR scan).
 *
 * @returns {Promise<boolean>} Whether a worker was available to terminate
 */
export async function terminateWorker() {
  const pending = workerPromise
  workerPromise = null

  if (!pending) return false

  try {
    const worker = await pending
    await worker?.terminate?.()
    return true
  } catch {
    return false
  }
}

// Words that identify the complaint itself rather than a place. A photo of a
// pothole may say "Pothole near school" or "Illegal construction on MG Road";
// those lines describe the issue and must never be copied into the address
// field, even when they contain an address cue such as "road" or "near".
const ISSUE_CUE =
  /\b(potholes?|pot\s+holes?|road\s+damage|damaged\s+road|broken\s+road|street\s*lights?|traffic|water\s+leak(?:age|s)?|leak(?:age|s)?|garbage|sanitation|illegal\s+construction|construction|drainage|sewer(?:age)?|encroachment|stray\s+(?:dog|animal)s?)\b/i

// Words and numbers that usually indicate a postal address.
const ADDRESS_CUE =
  /\b(road|street|st\.?|avenue|ave\.?|lane|ln\.?|block|sector|nagar|colony|market|near|opposite|beside|behind|pin(?:code)?|district|city|village|town|apartment|flat|house|plot|floor|cross|layout|phase|ward|area|circle|junction|bus\s+stop|park)\b/i

function isIssueLine(line) {
  return ISSUE_CUE.test(line)
}

function isAddressLine(line) {
  // Issue text wins over address cues so "Pothole near school" is not offered
  // as a location just because it contains the word "near".
  if (isIssueLine(line)) return false

  return ADDRESS_CUE.test(line) || /\d/.test(line)
}

// A stronger signal is needed when a single OCR line contains both the issue
// label and the location. Weak cues such as "near" are not enough: "Pothole
// near school" is still an issue description, not an address.
const STRONG_ADDRESS_CUE =
  /\b(road|street|st\.?|avenue|ave\.?|lane|ln\.?|block|sector|nagar|colony|market|apartment|flat|house|plot|floor|cross|layout|phase|ward|junction|chowk|circle|square|bridge|flyover|station|temple|hospital|mall|bus\s+stop|pincode|pin)\b/i

const ADDRESS_TOKEN = new RegExp(`\\d|${STRONG_ADDRESS_CUE.source}`, 'i')

function stripAddressEdges(text) {
  return text
    .replace(/^[\s,;:|–—-]+/, '')
    .replace(/[\s,;:|–—-]+$/, '')
    .trim()
}

function stripTitleEdges(text) {
  return text.replace(/[\s,;:|–—-]+$/, '').trim()
}

function looksLikeAddressPhrase(text) {
  const value = stripAddressEdges(text)
  if (!value) return false
  if (/\d/.test(value)) return true
  if (!STRONG_ADDRESS_CUE.test(value)) return false

  // A lone "Road" is usually part of the issue wording ("construction of
  // road"), while "MG Road" or "Main Street" is a real address.
  return value.split(/\s+/).filter(Boolean).length >= 2
}

/**
 * Finds where an address starts inside text that follows an issue label.
 * Proper nouns before the street word are included so "MG Road" stays whole.
 *
 * @param {string} text
 * @returns {number} Start index, or -1 when no address token is present
 */
function findAddressPhraseStart(text) {
  const match = text.match(ADDRESS_TOKEN)
  if (!match) return -1

  let start = match.index

  while (start > 0) {
    const prefix = text.slice(0, start)
    const last = prefix.match(/([A-Za-z][A-Za-z.'-]*|\d+[A-Za-z]?)\s*$/)
    if (!last) break

    const token = last[1]
    const gap = prefix.slice(last.index + last[0].length)
    if (gap.trim() !== '') break
    if (!/^[A-Z0-9]/.test(token)) break

    start = last.index
  }

  return start
}

/**
 * Splits one OCR line such as "Pothole on 12 Main Street" into an issue title
 * and an address. Returns null when the line does not contain both.
 *
 * @param {string} line
 * @returns {{ title: string, address: string }|null}
 */
function splitIssueAndAddress(line) {
  const issueMatch = line.match(ISSUE_CUE)
  if (!issueMatch) return null

  const issueStart = issueMatch.index
  const issueEnd = issueStart + issueMatch[0].length

  // Address printed before the issue label: "12 Main Street Pothole".
  const prefix = line.slice(0, issueStart)
  if (looksLikeAddressPhrase(prefix)) {
    const title = stripTitleEdges(line.slice(issueStart))
    if (title) return { title, address: stripAddressEdges(prefix) }
  }

  const suffix = line.slice(issueEnd)
  if (!suffix.trim()) return null

  // Prefer a connector that introduces the location: "Pothole on MG Road",
  // "Traffic in Mumbai", "Pothole near school". Descriptive connectors such as
  // "near" stay in the address, while plain prepositions are dropped.
  const connectorPattern =
    /(?:^|[\s,;|–—-])(at|on|in|near|opposite|beside|behind|along|by|off|towards?)\s+/gi
  const keepConnector = /^(?:near|opposite|beside|behind|along|towards?)$/i
  let connectorMatch

  while ((connectorMatch = connectorPattern.exec(suffix)) !== null) {
    const connector = connectorMatch[1]
    const rest = suffix.slice(connectorMatch.index + connectorMatch[0].length)

    if (!isReadableOCRText(rest)) continue

    const location = stripAddressEdges(rest).replace(/^the\s+/i, '')
    if (!location) continue

    const address = keepConnector.test(connector)
      ? `${connector} ${location}`
      : location

    const title = stripTitleEdges(
      line.slice(0, issueEnd + connectorMatch.index)
    )
    if (title) return { title, address }
  }

  // No connector: "Pothole 12 Main Street" or "Pothole MG Road".
  const addressStart = findAddressPhraseStart(suffix)
  if (addressStart === -1) return null

  const address = stripAddressEdges(suffix.slice(addressStart))
  if (!looksLikeAddressPhrase(address)) return null

  const title = stripTitleEdges(line.slice(0, issueEnd + addressStart))
  if (!title) return null

  return { title, address }
}

/**
 * Turns free-form OCR output into concise, editable field suggestions.
 *
 * Complaint photos usually contain an issue label ("Pothole", "Water
 * Leakage") and sometimes a street address. The issue text becomes the title
 * and only address-like text becomes the address. A single line that contains
 * both, such as "Pothole on 12 Main Street", is split into both fields. When
 * the photo contains no address, the address suggestion stays empty instead
 * of duplicating the issue text.
 *
 * @param {string} text
 * @returns {{ title: string, address: string, lines: string[] }}
 */
export function buildOCRSuggestions(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    return { title: '', address: '', lines: [] }
  }

  const lines = cleanOCRText(text).split('\n').filter(Boolean)

  if (lines.length === 0) {
    return { title: '', address: '', lines: [] }
  }

  const parsed = lines.map((line) => {
    const split = splitIssueAndAddress(line)
    return split ? { line, ...split } : { line }
  })

  // Prefer an issue title (including the issue half of a combined line). If
  // there is none, fall back to the first neutral line, but never use an
  // address-only line as the title.
  const titleEntry =
    parsed.find((entry) => entry.title) ??
    parsed.find((entry) => isIssueLine(entry.line)) ??
    parsed.find((entry) => !isAddressLine(entry.line)) ??
    null

  const title = (titleEntry?.title ?? titleEntry?.line ?? '').slice(0, 120)

  const addressParts = []

  for (const entry of parsed) {
    if (entry.title) {
      if (entry.address) addressParts.push(entry.address)
    } else if (
      entry !== titleEntry &&
      !isIssueLine(entry.line) &&
      isAddressLine(entry.line)
    ) {
      addressParts.push(entry.line)
    }
  }

  return {
    title,
    address: addressParts.join(', ').slice(0, 200),
    lines,
  }
}

export default {
  extractTextFromImage,
  preprocessImage,
  buildRedTextImage,
  buildDarkTextImage,
  buildLightTextImage,
  findRedTextRegions,
  findLightTextRegions,
  cleanOCRText,
  isReadableOCRText,
  extractReadablePhrase,
  selectBestOCRLine,
  terminateWorker,
  buildOCRSuggestions,
  OCR_TIMEOUT_MS,
  OCR_LANGUAGE,
  OCR_MIN_CONFIDENCE,
  OCR_STRONG_CONFIDENCE,
  OCR_MAX_UPSCALE,
  OCR_MAX_DIMENSION,
  OCR_RED_TEXT_THRESHOLD,
  OCR_RED_FALLBACK_PSM,
  OCR_RED_MAX_REGION_HEIGHT,
  OCR_LIGHT_TEXT_THRESHOLD,
  OCR_LIGHT_FALLBACK_PSM,
}
