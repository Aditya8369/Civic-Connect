/**
 * Client-side login throttling helpers.
 *
 * The first two failed attempts are immediate. After the third failure,
 * subsequent retries are delayed progressively: 1s, 2s, 4s, 8s, then 16s
 * (capped). This is a UX safeguard, not a replacement for server-side limits.
 */
export const LOGIN_BACKOFF_BASE_ATTEMPT = 3
export const LOGIN_BACKOFF_MAX_MS = 16_000
export const LOGIN_LOCKOUT_BANNER_ATTEMPTS = 5

export function getLoginBackoffDelay(failedAttempts) {
  if (!Number.isInteger(failedAttempts) || failedAttempts < LOGIN_BACKOFF_BASE_ATTEMPT) {
    return 0
  }

  const exponent = failedAttempts - LOGIN_BACKOFF_BASE_ATTEMPT
  return Math.min(1_000 * (2 ** exponent), LOGIN_BACKOFF_MAX_MS)
}

export function shouldShowLoginLockoutBanner(failedAttempts) {
  return failedAttempts >= LOGIN_LOCKOUT_BANNER_ATTEMPTS
}

export function recordLoginFailure(state) {
  const failedAttempts = state.failedAttempts + 1
  return {
    failedAttempts,
    retryDelayMs: getLoginBackoffDelay(failedAttempts),
    showLockoutBanner: shouldShowLoginLockoutBanner(failedAttempts),
  }
}

export function resetLoginProtection() {
  return {
    failedAttempts: 0,
    retryDelayMs: 0,
    showLockoutBanner: false,
  }
}
