import { beforeEach, describe, expect, it, vi } from 'vitest'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from './services'
import {
  DEFAULT_RESOLUTION_TEMPLATES,
  RESOLUTION_TEMPLATE_BODY_MAX_LENGTH,
  RESOLUTION_TEMPLATE_TITLE_MAX_LENGTH,
  RESOLUTION_TEMPLATES_SETTING_ID,
  createResolutionTemplateId,
  getDefaultResolutionTemplates,
  getResolutionTemplateBody,
  loadResolutionTemplates,
  normalizeResolutionTemplate,
  normalizeResolutionTemplates,
  saveResolutionTemplates,
} from './resolutionTemplates'

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
}))

vi.mock('./services', () => ({
  db: {},
}))

describe('resolution templates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    doc.mockReturnValue('resolution-templates-document')
  })

  describe('defaults', () => {
    it('ships the required municipal canned responses', () => {
      const titles = DEFAULT_RESOLUTION_TEMPLATES.map(({ title }) => title)

      expect(titles).toEqual(
        expect.arrayContaining([
          'Pothole filled',
          'Transformer replaced',
          'Sanitation sweep completed',
        ])
      )
    })

    it('returns a fresh copy so callers cannot mutate the defaults', () => {
      const first = getDefaultResolutionTemplates()
      first[0].title = 'Changed'

      expect(getDefaultResolutionTemplates()[0].title).toBe('Pothole filled')
    })
  })

  describe('createResolutionTemplateId', () => {
    it('slugifies a title', () => {
      expect(createResolutionTemplateId('  Pothole Filled!  ')).toBe(
        'pothole-filled'
      )
    })

    it('falls back to a stable id when the title has no usable characters', () => {
      expect(createResolutionTemplateId('!!!')).toBe('resolution-template')
    })

    it('adds the next available numeric suffix for collisions', () => {
      expect(
        createResolutionTemplateId('Pothole filled', [
          'pothole-filled',
          'pothole-filled-2',
        ])
      ).toBe('pothole-filled-3')
    })
  })

  describe('normalizeResolutionTemplate', () => {
    it('trims text and generates a missing id', () => {
      expect(
        normalizeResolutionTemplate({
          title: '  Drain cleared  ',
          body: '  The drain was cleared.  ',
        })
      ).toEqual({
        id: 'drain-cleared',
        title: 'Drain cleared',
        body: 'The drain was cleared.',
      })
    })

    it('rejects entries without a title or body', () => {
      expect(normalizeResolutionTemplate(null)).toBeNull()
      expect(normalizeResolutionTemplate({ title: 'Only title' })).toBeNull()
      expect(normalizeResolutionTemplate({ body: 'Only body' })).toBeNull()
      expect(
        normalizeResolutionTemplate({ title: '   ', body: 'Body' })
      ).toBeNull()
    })

    it('caps title and body length', () => {
      const template = normalizeResolutionTemplate({
        title: 'x'.repeat(RESOLUTION_TEMPLATE_TITLE_MAX_LENGTH + 20),
        body: 'y'.repeat(RESOLUTION_TEMPLATE_BODY_MAX_LENGTH + 20),
      })

      expect(template.title).toHaveLength(RESOLUTION_TEMPLATE_TITLE_MAX_LENGTH)
      expect(template.body).toHaveLength(RESOLUTION_TEMPLATE_BODY_MAX_LENGTH)
    })
  })

  describe('normalizeResolutionTemplates', () => {
    it('drops invalid entries and de-duplicates ids', () => {
      const result = normalizeResolutionTemplates([
        { id: 'same', title: 'First', body: 'First body' },
        { id: 'same', title: 'Second', body: 'Second body' },
        { title: '', body: 'Missing title' },
        null,
      ])

      expect(result).toEqual([
        { id: 'same', title: 'First', body: 'First body' },
        { id: 'second', title: 'Second', body: 'Second body' },
      ])
    })

    it('returns an empty list for non-array input', () => {
      expect(normalizeResolutionTemplates(null)).toEqual([])
      expect(normalizeResolutionTemplates({})).toEqual([])
    })
  })

  describe('loadResolutionTemplates', () => {
    it('reads the settings document', async () => {
      getDoc.mockResolvedValue({ exists: () => false })

      await loadResolutionTemplates()

      expect(doc).toHaveBeenCalledWith(
        db,
        'settings',
        RESOLUTION_TEMPLATES_SETTING_ID
      )
    })

    it('uses built-in defaults until an administrator saves templates', async () => {
      getDoc.mockResolvedValue({ exists: () => false })

      await expect(loadResolutionTemplates()).resolves.toEqual(
        getDefaultResolutionTemplates()
      )
    })

    it('loads and normalizes saved templates', async () => {
      getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          templates: [
            { id: 'custom', title: ' Custom ', body: ' Custom body ' },
          ],
        }),
      })

      await expect(loadResolutionTemplates()).resolves.toEqual([
        { id: 'custom', title: 'Custom', body: 'Custom body' },
      ])
    })

    it('respects an intentionally cleared template list', async () => {
      getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ templates: [] }),
      })

      await expect(loadResolutionTemplates()).resolves.toEqual([])
    })

    it('falls back to defaults when the settings document cannot be read', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      getDoc.mockRejectedValue(new Error('Network unavailable'))

      await expect(loadResolutionTemplates()).resolves.toEqual(
        getDefaultResolutionTemplates()
      )
      expect(warn).toHaveBeenCalled()

      warn.mockRestore()
    })
  })

  describe('saveResolutionTemplates', () => {
    it('persists normalized templates with an audit trail', async () => {
      setDoc.mockResolvedValue(undefined)

      const saved = await saveResolutionTemplates(
        [{ title: '  Drain cleared ', body: ' Drain cleared body ' }],
        'admin-1'
      )

      expect(saved).toEqual([
        { id: 'drain-cleared', title: 'Drain cleared', body: 'Drain cleared body' },
      ])
      expect(setDoc).toHaveBeenCalledWith(
        'resolution-templates-document',
        {
          templates: saved,
          updatedAt: 'SERVER_TIMESTAMP',
          updatedBy: 'admin-1',
        },
        { merge: true }
      )
    })

    it('omits updatedBy when there is no signed-in actor', async () => {
      setDoc.mockResolvedValue(undefined)

      await saveResolutionTemplates([])

      expect(setDoc).toHaveBeenCalledWith(
        'resolution-templates-document',
        {
          templates: [],
          updatedAt: 'SERVER_TIMESTAMP',
        },
        { merge: true }
      )
    })
  })

  describe('getResolutionTemplateBody', () => {
    it('returns the body for a matching template', () => {
      expect(
        getResolutionTemplateBody(DEFAULT_RESOLUTION_TEMPLATES, 'pothole-filled')
      ).toContain('pothole has been filled')
    })

    it('returns an empty string for missing input or unknown ids', () => {
      expect(getResolutionTemplateBody(DEFAULT_RESOLUTION_TEMPLATES, '')).toBe('')
      expect(
        getResolutionTemplateBody(DEFAULT_RESOLUTION_TEMPLATES, 'unknown')
      ).toBe('')
      expect(getResolutionTemplateBody(null, 'pothole-filled')).toBe('')
    })
  })
})
