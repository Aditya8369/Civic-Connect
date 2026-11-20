import { describe, it, expect, vi } from 'vitest'
import {
  sanitizePrivacyText,
  handleResolutionChatMessage,
} from './chatNotifications'

describe('Cloud Function Chat Notifications', () => {
  describe('sanitizePrivacyText', () => {
    it('masks phone numbers and email addresses', () => {
      const text = 'Contact officer at 9876543210 or email officer@civic.gov'
      const sanitized = sanitizePrivacyText(text)
      expect(sanitized).not.toContain('9876543210')
      expect(sanitized).not.toContain('officer@civic.gov')
      expect(sanitized).toContain('[REDACTED_PHONE]')
      expect(sanitized).toContain('[REDACTED_EMAIL]')
    })

    it('returns empty string for falsy input', () => {
      expect(sanitizePrivacyText(null)).toBe('')
      expect(sanitizePrivacyText('')).toBe('')
    })
  })

  describe('handleResolutionChatMessage', () => {
    it('dispatches notification without leaking private phone numbers or emails', async () => {
      const mockNotificationsAdd = vi.fn().mockResolvedValue({ id: 'notif-1' })
      const mockIssueGet = vi.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          title: 'Burst Water Pipe',
          reportedBy: 'citizen-uid-456',
          assignedOfficerId: 'officer-uid-789',
        }),
      })

      const mockFirestore = {
        collection: (name) => {
          if (name === 'issues') {
            return { doc: () => ({ get: mockIssueGet }) }
          }
          if (name === 'notifications') {
            return { add: mockNotificationsAdd }
          }
          return {}
        },
      }

      const mockMessaging = {
        send: vi.fn().mockResolvedValue('msg-id-123'),
      }

      const snapshot = {
        data: () => ({
          senderId: 'officer-uid-789',
          senderRole: 'officer',
          senderName: 'Officer Sharma',
          content: 'I will be at the site in 15 minutes. Call 9876543210.',
        }),
      }

      const context = {
        params: {
          issueId: 'CMP-2026-8888',
          messageId: 'msg-999',
        },
      }

      const res = await handleResolutionChatMessage(snapshot, context, {
        firestore: mockFirestore,
        messaging: mockMessaging,
      })

      expect(res.dispatched).toBe(true)
      expect(res.recipientUid).toBe('citizen-uid-456')
      expect(res.pushDispatched).toBe(true)

      // Verify in-app notification doc was saved
      expect(mockNotificationsAdd).toHaveBeenCalledTimes(1)
      const notifData = mockNotificationsAdd.mock.calls[0][0]
      expect(notifData.recipientUid).toBe('citizen-uid-456')
      expect(notifData.type).toBe('resolution_chat')
      expect(notifData.message).not.toContain('9876543210')
      expect(notifData.message).toContain('CMP-2026-8888')

      // Verify push payload
      expect(mockMessaging.send).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: 'issue_CMP-2026-8888',
          notification: expect.objectContaining({
            title: 'Municipal Officer Message',
          }),
        })
      )
    })

    it('returns false when snapshot data or issueId is missing', async () => {
      const res1 = await handleResolutionChatMessage({ data: () => null })
      expect(res1.dispatched).toBe(false)
      expect(res1.reason).toBe('no_data')

      const res2 = await handleResolutionChatMessage({ data: () => ({}) }, { params: {} })
      expect(res2.dispatched).toBe(false)
      expect(res2.reason).toBe('no_issue_id')
    })
  })
})
