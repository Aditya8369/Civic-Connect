import { describe, it, expect } from 'vitest'
import {
  redactPII,
  encryptChatMessage,
  decryptChatMessage,
} from './chatEncryption'

describe('chatEncryption & PII Redaction', () => {
  describe('redactPII', () => {
    it('redacts email addresses', () => {
      const text = 'Hello officer, you can contact me at citizen.doe@gmail.com for details.'
      const redacted = redactPII(text)
      expect(redacted).not.toContain('citizen.doe@gmail.com')
      expect(redacted).toContain('[REDACTED_EMAIL]')
    })

    it('redacts phone numbers while preserving small numbers', () => {
      const text = 'Call me at +91 9876543210 or 987-654-3210. I am at Ward 4 near block 12.'
      const redacted = redactPII(text)
      expect(redacted).not.toContain('9876543210')
      expect(redacted).not.toContain('987-654-3210')
      expect(redacted).toContain('[REDACTED_PHONE]')
      expect(redacted).toContain('Ward 4')
      expect(redacted).toContain('block 12')
    })

    it('redacts Aadhaar / SSN formatted numbers', () => {
      const text = 'My ID is 1234-5678-9012.'
      const redacted = redactPII(text)
      expect(redacted).not.toContain('1234-5678-9012')
      expect(redacted).toContain('[REDACTED_ID]')
    })

    it('returns empty string for null or non-string input', () => {
      expect(redactPII(null)).toBe('')
      expect(redactPII(undefined)).toBe('')
      expect(redactPII(123)).toBe('')
    })
  })

  describe('encryptChatMessage & decryptChatMessage', () => {
    it('encrypts plaintext into an envelope and decrypts back correctly', () => {
      const complaintId = 'CMP-2026-9901'
      const original = 'Can you specify a nearby landmark?'

      const encrypted = encryptChatMessage(original, complaintId)
      expect(encrypted.encrypted).toBe(true)
      expect(encrypted.ciphertext).toBeDefined()
      expect(encrypted.ciphertext).not.toBe(original)
      expect(encrypted.iv).toBeDefined()

      const decrypted = decryptChatMessage(encrypted, complaintId)
      expect(decrypted).toBe(original)
    })

    it('redacts PII before encrypting so ciphertext never stores plain emails or phone numbers', () => {
      const complaintId = 'CMP-2026-9902'
      const messageWithPII = 'Please call my mobile +91 9876543210 or email test@civic.gov'

      const encrypted = encryptChatMessage(messageWithPII, complaintId)
      expect(encrypted.piiRedacted).toBe(true)

      const decrypted = decryptChatMessage(encrypted, complaintId)
      expect(decrypted).not.toContain('9876543210')
      expect(decrypted).not.toContain('test@civic.gov')
      expect(decrypted).toContain('[REDACTED_PHONE]')
      expect(decrypted).toContain('[REDACTED_EMAIL]')
    })

    it('handles plaintext strings gracefully for backward compatibility', () => {
      const plainMessage = 'Officer on site at main road'
      const decrypted = decryptChatMessage(plainMessage, 'CMP-2026-9903')
      expect(decrypted).toBe(plainMessage)
    })

    it('returns empty string or safe fallback for invalid payloads', () => {
      expect(decryptChatMessage(null)).toBe('')
      expect(decryptChatMessage({ ciphertext: 'invalid-base64', iv: 'bad' })).toBe('[Encrypted Message]')
    })
  })
})
