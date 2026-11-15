import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  OCR_MIN_CONFIDENCE,
  OCR_TIMEOUT_MS,
  buildDarkTextImage,
  buildLightTextImage,
  buildOCRSuggestions,
  cleanOCRText,
  extractReadablePhrase,
  extractTextFromImage,
  findLightTextRegions,
  findRedTextRegions,
  isReadableOCRText,
  preprocessImage,
  selectBestOCRLine,
  terminateWorker,
} from '@/utils/ocr'

// Mock the lazy Tesseract import. The worker is shared by the utility, so the
// same mock object is reused across tests.
const tesseract = vi.hoisted(() => {
  const worker = {
    recognize: vi.fn(),
    setParameters: vi.fn(),
    terminate: vi.fn(),
  }

  return {
    worker,
    createWorker: vi.fn(async () => worker),
  }
})

vi.mock('tesseract.js', () => ({
  createWorker: tesseract.createWorker,
}))

const sampleFile = () =>
  new File(['fake-image-data'], 'complaint.jpg', { type: 'image/jpeg' })

beforeEach(async () => {
  vi.useRealTimers()
  await terminateWorker()
  vi.clearAllMocks()
  tesseract.worker.recognize.mockReset()
  tesseract.worker.setParameters.mockReset()
  tesseract.worker.terminate.mockReset()
  tesseract.createWorker.mockReset()
  tesseract.createWorker.mockImplementation(async () => tesseract.worker)
})

afterEach(async () => {
  vi.useRealTimers()
  // Allow any abandoned worker from a timeout test to finish terminating
  // before the next test resets the mock call history.
  await Promise.resolve()
  await Promise.resolve()
  await terminateWorker()
})

describe('extractTextFromImage', () => {
  it('lazily creates the OCR worker only on the first extraction', async () => {
    expect(tesseract.createWorker).not.toHaveBeenCalled()

    tesseract.worker.recognize.mockResolvedValue({
      data: { text: 'Pothole on Main Street' },
    })

    await expect(extractTextFromImage(sampleFile())).resolves.toBe(
      'Pothole on Main Street'
    )

    expect(tesseract.createWorker).toHaveBeenCalledTimes(1)
    expect(tesseract.createWorker).toHaveBeenCalledWith('eng')
    expect(tesseract.worker.recognize).toHaveBeenCalledTimes(1)
  })

  it('configures automatic page segmentation for photo text', async () => {
    tesseract.worker.recognize.mockResolvedValue({ data: { text: 'Pothole' } })

    await extractTextFromImage(sampleFile())

    expect(tesseract.worker.setParameters).toHaveBeenCalledWith({
      tessedit_pageseg_mode: '3',
    })
  })

  it('reuses the worker for subsequent images', async () => {
    tesseract.worker.recognize.mockResolvedValue({ data: { text: 'Stop sign' } })

    await extractTextFromImage(sampleFile())
    await extractTextFromImage(sampleFile())

    expect(tesseract.createWorker).toHaveBeenCalledTimes(1)
    expect(tesseract.worker.recognize).toHaveBeenCalledTimes(2)
    expect(tesseract.worker.terminate).not.toHaveBeenCalled()
  })

  it('supports the legacy top-level text response shape', async () => {
    tesseract.worker.recognize.mockResolvedValue({ text: '12 Main Road' })

    await expect(extractTextFromImage(sampleFile())).resolves.toBe('12 Main Road')
  })

  it('drops unreadable OCR fragments instead of suggesting them', async () => {
    tesseract.worker.recognize.mockResolvedValue({
      data: { text: 'wR\noe ae a\n\n', confidence: 90 },
    })

    await expect(extractTextFromImage(sampleFile())).resolves.toBe('')
  })

  it('rejects low-confidence texture noise', async () => {
    tesseract.worker.recognize.mockResolvedValue({
      data: { text: 'Seer 5', confidence: OCR_MIN_CONFIDENCE - 1 },
    })

    await expect(extractTextFromImage(sampleFile())).resolves.toBe('')
  })

  it('keeps readable text when confidence is acceptable', async () => {
    tesseract.worker.recognize.mockResolvedValue({
      data: { text: 'Pothole\n', confidence: OCR_MIN_CONFIDENCE },
    })

    await expect(extractTextFromImage(sampleFile())).resolves.toBe('Pothole')
  })

  it('removes fragment lines while keeping readable lines', async () => {
    tesseract.worker.recognize.mockResolvedValue({
      data: {
        text: 'wR\noe ae a\nPothole\n12 Main Street',
        confidence: 90,
      },
    })

    await expect(extractTextFromImage(sampleFile())).resolves.toBe(
      'Pothole\n12 Main Street'
    )
  })

  it('returns an empty string when no image is supplied', async () => {
    await expect(extractTextFromImage(null)).resolves.toBe('')
    await expect(extractTextFromImage(undefined)).resolves.toBe('')
    expect(tesseract.createWorker).not.toHaveBeenCalled()
  })

  it('returns an empty string instead of throwing when recognition fails', async () => {
    tesseract.worker.recognize.mockRejectedValue(new Error('bad image'))

    await expect(extractTextFromImage(sampleFile())).resolves.toBe('')
  })

  it('returns an empty string when the worker cannot be loaded', async () => {
    tesseract.createWorker.mockRejectedValueOnce(new Error('wasm unavailable'))

    await expect(extractTextFromImage(sampleFile())).resolves.toBe('')
  })

  it('times out after five seconds without blocking the caller', async () => {
    // Warm the lazily imported worker before switching to fake timers.
    tesseract.worker.recognize.mockResolvedValueOnce({ data: { text: 'warm' } })
    await extractTextFromImage(sampleFile())

    tesseract.worker.recognize.mockReset()
    tesseract.worker.recognize.mockReturnValue(new Promise(() => {}))
    vi.useFakeTimers()

    const extraction = extractTextFromImage(sampleFile())

    await vi.advanceTimersByTimeAsync(OCR_TIMEOUT_MS)
    await expect(extraction).resolves.toBe('')

    // Let the abandoned worker finish shutting down.
    await vi.advanceTimersByTimeAsync(0)
    await Promise.resolve()
    await Promise.resolve()

    expect(OCR_TIMEOUT_MS).toBe(5_000)
    expect(tesseract.worker.terminate).toHaveBeenCalled()
  })

  it('supports a custom timeout for callers that need a shorter wait', async () => {
    // Warm the lazily imported worker before switching to fake timers.
    tesseract.worker.recognize.mockResolvedValueOnce({ data: { text: 'warm' } })
    await extractTextFromImage(sampleFile())

    tesseract.worker.recognize.mockReset()
    tesseract.worker.recognize.mockReturnValue(new Promise(() => {}))
    vi.useFakeTimers()

    const extraction = extractTextFromImage(sampleFile(), { timeoutMs: 100 })

    await vi.advanceTimersByTimeAsync(100)
    await expect(extraction).resolves.toBe('')

    await vi.advanceTimersByTimeAsync(0)
    await Promise.resolve()
    await Promise.resolve()
  })
})

describe('terminateWorker', () => {
  it('terminates and forgets the cached worker', async () => {
    tesseract.worker.recognize.mockResolvedValue({ data: { text: 'Text' } })
    await extractTextFromImage(sampleFile())

    await expect(terminateWorker()).resolves.toBe(true)
    expect(tesseract.worker.terminate).toHaveBeenCalledTimes(1)

    // A later scan creates a fresh worker.
    await extractTextFromImage(sampleFile())
    expect(tesseract.createWorker).toHaveBeenCalledTimes(2)
  })

  it('is a safe no-op when no worker has been created', async () => {
    await expect(terminateWorker()).resolves.toBe(false)
    expect(tesseract.worker.terminate).not.toHaveBeenCalled()
  })
})

describe('preprocessImage', () => {
  it('falls back to the original image when canvas preprocessing is unavailable', async () => {
    const file = sampleFile()

    await expect(preprocessImage(file)).resolves.toBe(file)
  })
})

describe('cleanOCRText', () => {
  it('removes lines made only of short fragments', () => {
    expect(cleanOCRText('wR\noe ae a')).toBe('')
  })

  it('keeps lines containing a word or number', () => {
    expect(cleanOCRText('wR\nPothole\n12 Main Street\noe ae a')).toBe(
      'Pothole\n12 Main Street'
    )
  })

  it('normalises whitespace and ignores empty input', () => {
    expect(cleanOCRText('  Pothole   near school \n\n  MG Road  ')).toBe(
      'Pothole near school\nMG Road'
    )
    expect(cleanOCRText(null)).toBe('')
  })

  it('reports whether any readable text remains', () => {
    expect(isReadableOCRText('Pothole')).toBe(true)
    expect(isReadableOCRText('wR\noe ae a')).toBe(false)
  })
})

describe('buildOCRSuggestions', () => {
  it('uses the first line as the title and an address-like line as the address', () => {
    const suggestions = buildOCRSuggestions(
      'Broken streetlight\n12 Main Street\nDowntown'
    )

    expect(suggestions.title).toBe('Broken streetlight')
    expect(suggestions.address).toBe('12 Main Street')
  })

  it('normalises whitespace and ignores blank lines', () => {
    const suggestions = buildOCRSuggestions('  Pothole   near school \n\n  MG Road  ')

    expect(suggestions.title).toBe('Pothole')
    expect(suggestions.address).toBe('near school, MG Road')
  })

  it('returns empty suggestions for empty or non-text input', () => {
    expect(buildOCRSuggestions('')).toEqual({ title: '', address: '', lines: [] })
    expect(buildOCRSuggestions(null)).toEqual({ title: '', address: '', lines: [] })
  })

  it('returns empty suggestions for unreadable OCR fragments', () => {
    expect(buildOCRSuggestions('wR\noe ae a')).toEqual({
      title: '',
      address: '',
      lines: [],
    })
  })

  it.each([
    'Pothole',
    'Road damage',
    'Broken street light',
    'Traffic Issue',
    'Water Leakage',
    'Garbage and sanitation',
    'Illegal construction',
  ])('never uses the issue "%s" as an address', (issue) => {
    expect(buildOCRSuggestions(issue)).toEqual({
      title: issue,
      address: '',
      lines: [issue],
    })
  })

  it('puts a location phrase in the address and keeps the issue as the title', () => {
    const suggestions = buildOCRSuggestions('Pothole near school')

    expect(suggestions.title).toBe('Pothole')
    expect(suggestions.address).toBe('near school')
  })

  it('suggests the address when an issue label and an address are both present', () => {
    const suggestions = buildOCRSuggestions(
      'Water Leakage\n12 Main Street, Sector 4'
    )

    expect(suggestions.title).toBe('Water Leakage')
    expect(suggestions.address).toBe('12 Main Street, Sector 4')
  })

  it('finds the issue title when the address is printed first', () => {
    const suggestions = buildOCRSuggestions(
      '12 Main Street\nGarbage and sanitation'
    )

    expect(suggestions.title).toBe('Garbage and sanitation')
    expect(suggestions.address).toBe('12 Main Street')
  })

  it('fills only the address when the photo contains no issue text', () => {
    const suggestions = buildOCRSuggestions('12 Main Street, Downtown')

    expect(suggestions.title).toBe('')
    expect(suggestions.address).toBe('12 Main Street, Downtown')
  })

  it('splits a single line containing both the issue and the address', () => {
    const suggestions = buildOCRSuggestions('Pothole 12 Main Street')

    expect(suggestions.title).toBe('Pothole')
    expect(suggestions.address).toBe('12 Main Street')
  })

  it.each([
    ['Water Leakage at 12 Main Street', 'Water Leakage', '12 Main Street'],
    ['Pothole on MG Road', 'Pothole', 'MG Road'],
    ['Garbage and sanitation, MG Road', 'Garbage and sanitation', 'MG Road'],
    [
      'Broken streetlight on 12 Main Street',
      'Broken streetlight',
      '12 Main Street',
    ],
    [
      'Illegal construction at Sector 4',
      'Illegal construction',
      'Sector 4',
    ],
    ['12 Main Street Pothole', 'Pothole', '12 Main Street'],
    ['Pothole MG Road', 'Pothole', 'MG Road'],
    ['Traffic in Mumbai', 'Traffic', 'Mumbai'],
    ['Pothole near school', 'Pothole', 'near school'],
  ])('splits "%s" into title and address', (text, title, address) => {
    expect(buildOCRSuggestions(text)).toMatchObject({ title, address })
  })

  it('splits a location phrase without a street or number', () => {
    expect(buildOCRSuggestions('Traffic in Mumbai')).toMatchObject({
      title: 'Traffic',
      address: 'Mumbai',
    })
  })

  it('keeps a combined issue line intact when it has no location phrase', () => {
    expect(buildOCRSuggestions('Construction of road')).toMatchObject({
      title: 'Construction of road',
      address: '',
    })
  })
})

function makeRedTextPixels(width, height) {
  const data = new Uint8ClampedArray(width * height * 4)
  const bandTop = Math.round(height * 0.2)
  const bandBottom = Math.round(height * 0.4)
  const bandLeft = Math.round(width * 0.1)
  const bandRight = Math.round(width * 0.9)
  const lightTop = Math.round(height * 0.6)
  const lightBottom = Math.round(height * 0.8)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4
      const isRed =
        y >= bandTop &&
        y <= bandBottom &&
        x >= bandLeft &&
        x <= bandRight &&
        x % 10 < 4
      const isLight =
        y >= lightTop &&
        y <= lightBottom &&
        x >= bandLeft &&
        x <= bandRight &&
        x % 9 === 0

      data[index] = isLight ? 255 : 60
      data[index + 1] = isLight ? 255 : isRed ? 30 : 60
      data[index + 2] = isLight ? 255 : isRed ? 30 : 60
      data[index + 3] = 255
    }
  }

  return data
}

function createFakeCanvasContext(canvas) {
  let pixels = null
  let pixelWidth = 0
  let pixelHeight = 0

  const ensurePixels = (width, height) => {
    if (!pixels || pixelWidth !== width || pixelHeight !== height) {
      pixelWidth = width
      pixelHeight = height
      pixels = makeRedTextPixels(width, height)
    }
  }

  return {
    imageSmoothingEnabled: false,
    imageSmoothingQuality: '',
    drawImage: vi.fn(() => {
      ensurePixels(canvas.width, canvas.height)
    }),
    getImageData: vi.fn((x, y, width, height) => {
      ensurePixels(width, height)
      return {
        data: new Uint8ClampedArray(pixels),
        width,
        height,
      }
    }),
    putImageData: vi.fn((imageData) => {
      pixels = new Uint8ClampedArray(imageData.data)
      pixelWidth = imageData.width
      pixelHeight = imageData.height
    }),
  }
}

describe('findRedTextRegions', () => {
  it('finds a wide red text band and ignores solid red objects', () => {
    const width = 200
    const height = 100
    const data = new Uint8ClampedArray(width * height * 4)

    for (let index = 0; index < data.length; index += 4) {
      data[index] = 200
      data[index + 1] = 200
      data[index + 2] = 200
      data[index + 3] = 255
    }

    const setRed = (x, y) => {
      const index = (y * width + x) * 4
      data[index] = 200
      data[index + 1] = 30
      data[index + 2] = 30
      data[index + 3] = 255
    }

    // Letter-like stripes form the headline.
    for (let y = 20; y <= 40; y += 1) {
      for (let x = 20; x <= 179; x += 1) {
        if (x % 10 < 4) setRed(x, y)
      }
    }

    // A solid red object is far denser and must not be chosen.
    for (let y = 60; y <= 90; y += 1) {
      for (let x = 10; x <= 190; x += 1) setRed(x, y)
    }

    const regions = findRedTextRegions(data, width, height)

    expect(regions.length).toBeGreaterThan(0)
    expect(regions[0]).toMatchObject({
      x0: 20,
      y0: 20,
      x1: 173,
      y1: 40,
      width: 154,
      height: 21,
    })
  })

  it('returns an empty list when the image has no red text', () => {
    const width = 50
    const height = 50
    const data = new Uint8ClampedArray(width * height * 4).fill(200)

    expect(findRedTextRegions(data, width, height)).toEqual([])
  })
})

describe('findLightTextRegions', () => {
  it('finds a wide band of bright lettering in a high-pass image', () => {
    const width = 200
    const height = 100
    const data = new Uint8ClampedArray(width * height * 4).fill(255)

    // The high-pass pass renders light lettering as dark pixels on white.
    for (let y = 20; y <= 40; y += 1) {
      for (let x = 20; x <= 179; x += 1) {
        if (x % 10 < 4) {
          const index = (y * width + x) * 4
          data[index] = 0
          data[index + 1] = 0
          data[index + 2] = 0
        }
      }
    }

    const regions = findLightTextRegions(data, width, height)

    expect(regions.length).toBeGreaterThan(0)
    expect(regions[0]).toMatchObject({
      x0: 20,
      y0: 20,
      x1: 173,
      y1: 40,
      width: 154,
      height: 21,
    })
  })

  it('returns an empty list when the image has no bright text', () => {
    const width = 50
    const height = 50
    const data = new Uint8ClampedArray(width * height * 4).fill(255)

    expect(findLightTextRegions(data, width, height)).toEqual([])
  })
})

describe('extractReadablePhrase', () => {
  it('keeps the real words and drops surrounding OCR noise', () => {
    expect(
      extractReadablePhrase(
        'Traffic Issue, + p |  | - —— |  | ) |  | ys |  | - |  | 6 it'
      )
    ).toBe('Traffic Issue')
  })

  it('keeps short connector words inside a phrase', () => {
    expect(extractReadablePhrase('Traffic in Mumbai _.=.7')).toBe(
      'Traffic in Mumbai'
    )
    expect(extractReadablePhrase('Garbage and sanitation |')).toBe(
      'Garbage and sanitation'
    )
  })

  it('returns an empty string for fragment-only lines', () => {
    expect(extractReadablePhrase('wR oe ae a')).toBe('')
  })
})

describe('selectBestOCRLine', () => {
  it('picks the phrase with the most real words', () => {
    expect(selectBestOCRLine('x\nTraffic Issue, + p | ys\n-')).toBe(
      'Traffic Issue'
    )
  })
})

describe('red-text fallback', () => {
  let getContextSpy

  beforeEach(() => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 200, height: 100, close: vi.fn() }))
    )

    getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(function (type) {
        if (type !== '2d') return null
        if (!this.__fakeContext) {
          this.__fakeContext = createFakeCanvasContext(this)
        }
        return this.__fakeContext
      })
  })

  afterEach(() => {
    getContextSpy.mockRestore()
    vi.unstubAllGlobals()
  })

  it('retries with red-text segmentation when the normal pass finds nothing', async () => {
    tesseract.worker.recognize
      .mockResolvedValueOnce({ data: { text: '', confidence: 95 } })
      .mockResolvedValueOnce({
        data: { text: 'Traffic Issue, + p | ys', confidence: 55 },
      })

    await expect(extractTextFromImage(sampleFile())).resolves.toBe(
      'Traffic Issue'
    )

    expect(tesseract.worker.recognize).toHaveBeenCalledTimes(2)

    const psmCalls = tesseract.worker.setParameters.mock.calls.map(
      ([parameters]) => parameters.tessedit_pageseg_mode
    )
    expect(psmCalls).toEqual(['3', '11', '3'])
  })

  it('does not run the fallback when the normal pass already found text', async () => {
    tesseract.worker.recognize.mockResolvedValue({
      data: { text: 'Pothole', confidence: 90 },
    })

    await expect(extractTextFromImage(sampleFile())).resolves.toBe('Pothole')
    expect(tesseract.worker.recognize).toHaveBeenCalledTimes(1)
  })
})

describe('dark-text fallback', () => {
  let getContextSpy

  beforeEach(() => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 200, height: 100, close: vi.fn() }))
    )

    getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(function (type) {
        if (type !== '2d') return null
        if (!this.__fakeContext) {
          this.__fakeContext = createFakeCanvasContext(this)
        }
        return this.__fakeContext
      })
  })

  afterEach(() => {
    getContextSpy.mockRestore()
    vi.unstubAllGlobals()
  })

  it('builds a high-pass grayscale canvas for dark lettering', async () => {
    const canvas = await buildDarkTextImage(sampleFile())

    expect(canvas).toBeInstanceOf(HTMLCanvasElement)
    expect(canvas.width).toBeGreaterThan(0)
    expect(canvas.height).toBeGreaterThan(0)
  })

  it('retries with dark-text segmentation when both earlier passes find nothing', async () => {
    tesseract.worker.recognize
      .mockResolvedValueOnce({ data: { text: '', confidence: 95 } })
      .mockResolvedValueOnce({ data: { text: '', confidence: 26 } })
      .mockResolvedValueOnce({
        data: { text: 'Water Leakage', confidence: 72 },
      })

    await expect(extractTextFromImage(sampleFile())).resolves.toBe(
      'Water Leakage'
    )

    expect(tesseract.worker.recognize).toHaveBeenCalledTimes(3)

    const psmCalls = tesseract.worker.setParameters.mock.calls.map(
      ([parameters]) => parameters.tessedit_pageseg_mode
    )
    expect(psmCalls).toEqual(['3', '11', '3'])
  })

  it('returns an empty string when every pass finds nothing readable', async () => {
    tesseract.worker.recognize
      .mockResolvedValueOnce({ data: { text: '', confidence: 95 } })
      .mockResolvedValueOnce({ data: { text: '', confidence: 20 } })
      .mockResolvedValueOnce({ data: { text: '', confidence: 20 } })
      .mockResolvedValueOnce({ data: { text: '', confidence: 20 } })

    await expect(extractTextFromImage(sampleFile())).resolves.toBe('')
    expect(tesseract.worker.recognize).toHaveBeenCalledTimes(4)
  })
})

describe('light-text fallback', () => {
  let getContextSpy

  beforeEach(() => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 200, height: 100, close: vi.fn() }))
    )

    getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(function (type) {
        if (type !== '2d') return null
        if (!this.__fakeContext) {
          this.__fakeContext = createFakeCanvasContext(this)
        }
        return this.__fakeContext
      })
  })

  afterEach(() => {
    getContextSpy.mockRestore()
    vi.unstubAllGlobals()
  })

  it('builds a cropped high-pass canvas for bright overlay lettering', async () => {
    const canvas = await buildLightTextImage(sampleFile())

    expect(canvas).toBeInstanceOf(HTMLCanvasElement)
    expect(canvas.width).toBeGreaterThan(0)
    expect(canvas.height).toBeGreaterThan(0)
  })

  it('retries when the primary pass only finds a half-recognised word', async () => {
    tesseract.worker.recognize
      .mockResolvedValueOnce({
        data: { text: 'affic in', confidence: 45 },
      })
      .mockResolvedValueOnce({ data: { text: '', confidence: 95 } })
      .mockResolvedValueOnce({ data: { text: '', confidence: 95 } })
      .mockResolvedValueOnce({
        data: { text: 'Traffic in Mumbai', confidence: 43 },
      })

    await expect(extractTextFromImage(sampleFile())).resolves.toBe(
      'Traffic in Mumbai'
    )

    expect(tesseract.worker.recognize).toHaveBeenCalledTimes(4)
  })

  it('retries with light-text detection when earlier passes find nothing', async () => {
    tesseract.worker.recognize
      .mockResolvedValueOnce({
        data: { text: 'MRE gre\nFro, ify', confidence: 30 },
      })
      .mockResolvedValueOnce({ data: { text: '', confidence: 95 } })
      .mockResolvedValueOnce({ data: { text: '', confidence: 95 } })
      .mockResolvedValueOnce({
        data: { text: 'Garbage and sanitation', confidence: 70 },
      })

    await expect(extractTextFromImage(sampleFile())).resolves.toBe(
      'Garbage and sanitation'
    )

    expect(tesseract.worker.recognize).toHaveBeenCalledTimes(4)

    const psmCalls = tesseract.worker.setParameters.mock.calls.map(
      ([parameters]) => parameters.tessedit_pageseg_mode
    )
    expect(psmCalls).toEqual(['3', '11', '3', '6', '3'])
  })
})
