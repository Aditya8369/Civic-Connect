import { describe, it, expect, vi } from 'vitest'
import {
  normalizeSeverity,
  triageImagePayload,
  handleIssueImageTriage,
  DEPARTMENT_CATEGORIES,
} from './imageTriage.js'

describe('Cloud Function Image Triage', () => {
  describe('normalizeSeverity', () => {
    it('normalizes various severity inputs correctly', () => {
      expect(normalizeSeverity('urgent')).toBe('Urgent')
      expect(normalizeSeverity('CRITICAL')).toBe('Urgent')
      expect(normalizeSeverity('high priority')).toBe('High')
      expect(normalizeSeverity('low risk')).toBe('Low')
      expect(normalizeSeverity('unknown')).toBe('Medium')
      expect(normalizeSeverity(null)).toBe('Medium')
    })
  })

  describe('triageImagePayload', () => {
    it('uses heuristic classification based on filename keywords', async () => {
      const waterResult = await triageImagePayload({
        imageUrl: 'https://storage.example.com/burst_pipe.jpg',
        filename: 'water_leak.png',
      })
      expect(waterResult.department).toBe('Water')
      expect(waterResult.category).toBe(DEPARTMENT_CATEGORIES.Water)
      expect(waterResult.severity).toBe('High')

      const electricResult = await triageImagePayload({
        imageUrl: 'https://storage.example.com/broken_light.jpg',
        filename: 'streetlight_dark.jpg',
      })
      expect(electricResult.department).toBe('Electricity')
      expect(electricResult.category).toBe(DEPARTMENT_CATEGORIES.Electricity)
      expect(electricResult.severity).toBe('Low')

      const roadResult = await triageImagePayload({
        imageUrl: 'https://storage.example.com/pothole.jpg',
        filename: 'pothole_crater.jpg',
      })
      expect(roadResult.department).toBe('Roads')
      expect(roadResult.category).toBe(DEPARTMENT_CATEGORIES.Roads)
    })

    it('calls Gemini API when geminiApiKey and fetchFn are provided', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      category: 'Public Safety',
                      confidence: 0.95,
                      severity: 'Urgent',
                      suggestedTitle: 'Dangerous traffic signal failure',
                      suggestedDescription: 'Intersection traffic light completely blacked out.',
                    }),
                  },
                ],
              },
            },
          ],
        }),
      })

      const result = await triageImagePayload(
        { imageUrl: 'https://storage.example.com/traffic.jpg' },
        { geminiApiKey: 'test-api-key', fetchFn: mockFetch }
      )

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(result.department).toBe('Public Safety')
      expect(result.category).toBe('Traffic Issues')
      expect(result.confidence).toBe(0.95)
      expect(result.severity).toBe('Urgent')
      expect(result.suggestedTitle).toBe('Dangerous traffic signal failure')
      expect(result.source).toBe('gemini')
    })
  })

  describe('handleIssueImageTriage', () => {
    it('skips when snapshot has no data or no image', async () => {
      const emptySnap = { data: () => null }
      const res1 = await handleIssueImageTriage(emptySnap)
      expect(res1.triaged).toBe(false)
      expect(res1.reason).toBe('no_data')

      const noImageSnap = { data: () => ({ title: 'No image here' }) }
      const res2 = await handleIssueImageTriage(noImageSnap)
      expect(res2.triaged).toBe(false)
      expect(res2.reason).toBe('no_image')
    })

    it('skips when issue has already been triaged', async () => {
      const alreadyTriagedSnap = {
        data: () => ({
          imageUrl: 'https://storage.example.com/photo.jpg',
          aiTriage: { processed: true },
        }),
      }
      const res = await handleIssueImageTriage(alreadyTriagedSnap)
      expect(res.triaged).toBe(false)
      expect(res.reason).toBe('already_triaged')
    })

    it('updates snapshot with triage metadata and fills empty severity and category', async () => {
      const mockUpdate = vi.fn().mockResolvedValue(true)
      const snap = {
        data: () => ({
          imageUrl: 'https://storage.example.com/pothole.jpg',
          photoFileName: 'big_pothole.jpg',
          title: 'Road issue',
        }),
        ref: { update: mockUpdate },
      }

      const res = await handleIssueImageTriage(snap, { params: { issueId: 'issue-123' } })
      expect(res.triaged).toBe(true)
      expect(mockUpdate).toHaveBeenCalledTimes(1)

      const updateCall = mockUpdate.mock.calls[0][0]
      expect(updateCall.aiTriage).toBeDefined()
      expect(updateCall.aiTriage.processed).toBe(true)
      expect(updateCall.severity).toBe('High')
      expect(updateCall.priority).toBe('High')
      expect(updateCall.category).toBe('Potholes & Road Damage')
      expect(updateCall.department).toBe('Roads')
    })
  })
})
