import { describe, expect, it } from 'vitest'
import { normalizePhone } from './phone'

describe('normalizePhone', () => {
  it.each([
    '9876543210',
    '+91 9876543210',
    '91-9876543210',
    '09876543210',
    '98765 43210',
    '98765-43210',
    '(98765) 43210',
    '98765.43210',
  ])('normalizes valid number: %s', phone => {
    expect(normalizePhone(phone)).toBe('+91 9876543210')
  })

  it.each([
    '',
    '   ',
    '987654321',
    '98765432101',
    '+1 9876543210',
    '98765abc210',
    '98765/43210',
    null,
    undefined,
    9876543210,
  ])('rejects invalid phone number: %s', phone => {
    expect(normalizePhone(phone)).toBeNull()
  })
})