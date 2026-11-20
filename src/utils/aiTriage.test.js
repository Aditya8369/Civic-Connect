import { describe, it, expect, vi } from 'vitest'
import {
  analyzeComplaintPhoto,
  analyzePhotoHeuristics,
  buildGeminiTriagePrompt,
  mapDepartmentToCategory,
  mapCategoryToDepartment,
  normalizeSeverity,
  DEPARTMENT_TO_CATEGORY,
  CATEGORY_TO_DEPARTMENT,
  VALID_SEVERITIES,
} from './aiTriage'

describe('AI Vision Triage Utility Engine', () => {
  describe('Department & Category Mappings', () => {
    it('accurately maps municipal departments to primary CivicConnect complaint categories', () => {
      expect(mapDepartmentToCategory('Roads')).toBe('Potholes & Road Damage')
      expect(mapDepartmentToCategory('Water')).toBe('Water Leakage')
      expect(mapDepartmentToCategory('Sanitation')).toBe('Garbage & Sanitation')
      expect(mapDepartmentToCategory('Electricity')).toBe('Streetlight Issues')
      expect(mapDepartmentToCategory('Public Safety')).toBe('Traffic Issues')
      expect(mapDepartmentToCategory('roads')).toBe('Potholes & Road Damage')
    })

    it('accurately maps complaint categories to responsible municipal departments', () => {
      expect(mapCategoryToDepartment('Potholes & Road Damage')).toBe('Roads')
      expect(mapCategoryToDepartment('Water Leakage')).toBe('Water')
      expect(mapCategoryToDepartment('Garbage & Sanitation')).toBe('Sanitation')
      expect(mapCategoryToDepartment('Streetlight Issues')).toBe('Electricity')
      expect(mapCategoryToDepartment('Traffic Issues')).toBe('Public Safety')
      expect(mapCategoryToDepartment('Illegal Construction')).toBe('Public Safety')
      expect(mapCategoryToDepartment('Noise Pollution')).toBe('Public Safety')
      expect(mapCategoryToDepartment('Other')).toBe('Public Safety')
    })

    it('has full coverage for defined departments and categories', () => {
      for (const [dept, cat] of Object.entries(DEPARTMENT_TO_CATEGORY)) {
        expect(mapDepartmentToCategory(dept)).toBe(cat)
      }
      for (const [cat, dept] of Object.entries(CATEGORY_TO_DEPARTMENT)) {
        expect(mapCategoryToDepartment(cat)).toBe(dept)
      }
    })
  })

  describe('normalizeSeverity', () => {
    it('normalizes valid severities', () => {
      expect(normalizeSeverity('Urgent')).toBe('Urgent')
      expect(normalizeSeverity('urgent')).toBe('Urgent')
      expect(normalizeSeverity('Critical')).toBe('Urgent') // Critical aliases to Urgent
      expect(normalizeSeverity('High')).toBe('High')
      expect(normalizeSeverity('HIGH')).toBe('High')
      expect(normalizeSeverity('Medium')).toBe('Medium')
      expect(normalizeSeverity('Low')).toBe('Low')
    })

    it('falls back to Medium for unknown or empty severities', () => {
      expect(normalizeSeverity('')).toBe('Medium')
      expect(normalizeSeverity(null)).toBe('Medium')
      expect(normalizeSeverity(undefined)).toBe('Medium')
      expect(normalizeSeverity('not-real')).toBe('Medium')
    })

    it('all normalized severities belong to VALID_SEVERITIES', () => {
      for (const sev of ['Urgent', 'High', 'Medium', 'Low']) {
        expect(VALID_SEVERITIES).toContain(normalizeSeverity(sev))
      }
    })
  })

  describe('analyzePhotoHeuristics', () => {
    it('correctly categorizes water leaks from photo attributes', () => {
      const file = { name: 'broken_water_pipe.jpg', type: 'image/jpeg' }
      const res = analyzePhotoHeuristics(file)
      expect(res.department).toBe('Water')
      expect(res.category).toBe('Water Leakage')
      expect(res.confidence).toBeGreaterThanOrEqual(0.9)
      expect(res.severity).toBe('High')
      expect(res.suggestedTitle).toContain('Water')
      expect(res.source).toBe('heuristic')
    })

    it('correctly categorizes garbage and sanitation issues', () => {
      const file = { name: 'overflowing_garbage_bin.png', type: 'image/png' }
      const res = analyzePhotoHeuristics(file)
      expect(res.department).toBe('Sanitation')
      expect(res.category).toBe('Garbage & Sanitation')
      expect(res.confidence).toBeGreaterThanOrEqual(0.9)
      expect(res.suggestedTitle).toContain('Garbage')
    })

    it('correctly categorizes electrical and streetlight issues with appropriate urgency', () => {
      const normalFile = { name: 'dark_streetlight_pole.jpg' }
      const normalRes = analyzePhotoHeuristics(normalFile)
      expect(normalRes.department).toBe('Electricity')
      expect(normalRes.category).toBe('Streetlight Issues')
      expect(normalRes.severity).toBe('Medium')

      const urgentFile = { name: 'sparking_wire_hazard.jpg' }
      const urgentRes = analyzePhotoHeuristics(urgentFile)
      expect(urgentRes.severity).toBe('Urgent')
    })

    it('correctly categorizes public safety and traffic hazards', () => {
      const file = { name: 'traffic_accident_blockage.jpg' }
      const res = analyzePhotoHeuristics(file)
      expect(res.department).toBe('Public Safety')
      expect(res.category).toBe('Traffic Issues')
      expect(res.severity).toBe('Urgent')
    })

    it('defaults to Roads & Potholes for general pavement/street photos', () => {
      const file = { name: 'road_damage_IMG_001.jpg' }
      const res = analyzePhotoHeuristics(file)
      expect(res.department).toBe('Roads')
      expect(res.category).toBe('Potholes & Road Damage')
      expect(res.confidence).toBeGreaterThan(0.7)
    })
  })

  describe('analyzeComplaintPhoto Pipeline', () => {
    it('throws error when no file is provided', async () => {
      await expect(analyzeComplaintPhoto(null)).rejects.toThrow('Please provide an image file')
    })

    it('falls back to heuristics when no API key is configured', async () => {
      const file = {
        name: 'water_leak_street.jpg',
        type: 'image/jpeg',
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      }
      const res = await analyzeComplaintPhoto(file, { apiKey: '' })
      expect(res.success).toBe(true)
      expect(res.department).toBe('Water')
      expect(res.category).toBe('Water Leakage')
      expect(res.confidence).toBeGreaterThanOrEqual(0.9)
      expect(res.source).toBe('heuristic')
    })

    it('invokes Gemini 1.5 Flash Vision when API key and fetchFn are supplied', async () => {
      const mockGeminiResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    department: 'Roads',
                    category: 'Potholes & Road Damage',
                    confidence: 0.96,
                    severity: 'High',
                    severityReason: 'Large pothole on active roadway causing vehicle impact.',
                    suggestedTitle: 'Large Asphalt Pothole on Main Road',
                    suggestedDescription: 'Deep circular road depression with exposed gravel requiring immediate cold mix filling.',
                    alternativeCategories: [{ category: 'Traffic Issues', confidence: 0.1 }],
                  }),
                },
              ],
            },
          },
        ],
      }

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockGeminiResponse,
      })

      const file = {
        name: 'photo.jpg',
        type: 'image/jpeg',
        arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
      }

      const result = await analyzeComplaintPhoto(file, {
        apiKey: 'test-gemini-key',
        fetchFn: mockFetch,
      })

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toContain('gemini-1.5-flash:generateContent?key=test-gemini-key')
      expect(options.method).toBe('POST')

      expect(result.success).toBe(true)
      expect(result.department).toBe('Roads')
      expect(result.category).toBe('Potholes & Road Damage')
      expect(result.confidence).toBe(0.96)
      expect(result.severity).toBe('High')
      expect(result.suggestedTitle).toBe('Large Asphalt Pothole on Main Road')
      expect(result.source).toBe('gemini')
    })

    it('recovers gracefully to heuristics when Gemini API returns an error response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      })

      const file = {
        name: 'overflowing_garbage_bin.jpg',
        type: 'image/jpeg',
        arrayBuffer: async () => new Uint8Array([5, 6, 7]).buffer,
      }

      const result = await analyzeComplaintPhoto(file, {
        apiKey: 'test-key',
        fetchFn: mockFetch,
      })

      expect(result.success).toBe(true)
      expect(result.department).toBe('Sanitation')
      expect(result.category).toBe('Garbage & Sanitation')
      expect(result.source).toBe('heuristic')
    })

    it('recovers gracefully when fetch throws a network failure', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network offline'))

      const file = {
        name: 'deep_road_crater.jpg',
        type: 'image/jpeg',
        arrayBuffer: async () => new Uint8Array([8, 9, 10]).buffer,
      }

      const result = await analyzeComplaintPhoto(file, {
        apiKey: 'test-key',
        fetchFn: mockFetch,
      })

      expect(result.success).toBe(true)
      expect(result.department).toBe('Roads')
      expect(result.source).toBe('heuristic')
    })
  })

  describe('buildGeminiTriagePrompt', () => {
    it('includes all standard departments and output schema fields', () => {
      const prompt = buildGeminiTriagePrompt()
      expect(prompt).toContain('Roads')
      expect(prompt).toContain('Water')
      expect(prompt).toContain('Sanitation')
      expect(prompt).toContain('Electricity')
      expect(prompt).toContain('Public Safety')
      expect(prompt).toContain('confidence')
      expect(prompt).toContain('severity')
      expect(prompt).toContain('suggestedTitle')
      expect(prompt).toContain('suggestedDescription')
    })
  })
})
