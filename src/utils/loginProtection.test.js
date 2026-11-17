import { describe, expect, it } from 'vitest'
import {
  getLoginBackoffDelay,
  recordLoginFailure,
  resetLoginProtection,
  shouldShowLoginLockoutBanner,
} from './loginProtection'

describe('login protection', () => {
  it('applies progressive delays after the third failed attempt and caps at 16 seconds', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(getLoginBackoffDelay)).toEqual([
      0, 0, 1_000, 2_000, 4_000, 8_000, 16_000, 16_000,
    ])
  })

  it('shows the lockout banner after five failed attempts', () => {
    expect(shouldShowLoginLockoutBanner(4)).toBe(false)
    expect(shouldShowLoginLockoutBanner(5)).toBe(true)
    expect(shouldShowLoginLockoutBanner(6)).toBe(true)
  })

  it('increments failures and returns the delay for the next retry', () => {
    const state = { failedAttempts: 2 }
    expect(recordLoginFailure(state)).toEqual({
      failedAttempts: 3,
      retryDelayMs: 1_000,
      showLockoutBanner: false,
    })
  })

  it('resets all protection state after a successful login', () => {
    expect(resetLoginProtection()).toEqual({
      failedAttempts: 0,
      retryDelayMs: 0,
      showLockoutBanner: false,
    })
    expect(recordLoginFailure(resetLoginProtection())).toMatchObject({
      failedAttempts: 1,
      retryDelayMs: 0,
      showLockoutBanner: false,
    })
  })
})
