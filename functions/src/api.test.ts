import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { verifyIdToken, firestoreGet } = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  firestoreGet: vi.fn(),
}))

vi.mock('./admin.js', () => ({
  getAdminAuth: () => ({ verifyIdToken }),
  getAdminFirestore: () => ({ collection: () => ({ limit: () => ({ get: firestoreGet }) }) }),
}))

import { app, errorHandler } from './app.js'
import { requireAuth } from './middleware/auth.js'

beforeEach(() => {
  verifyIdToken.mockReset()
  firestoreGet.mockReset().mockResolvedValue({})
  delete process.env.CORS_ALLOWED_ORIGINS
  delete process.env.GCLOUD_PROJECT
  delete process.env.FIREBASE_CONFIG
})

describe('serverless API', () => {
  it('returns an unauthenticated health response with timestamp and project environment', async () => {
    process.env.GCLOUD_PROJECT = 'civic-connect-test'
    const response = await request(app).get('/health').expect(200)

    expect(response.body).toMatchObject({ success: true, data: { status: 'ok', projectId: 'civic-connect-test' } })
    expect(Number.isNaN(Date.parse(response.body.data.timestamp))).toBe(false)
  })

  it('allows configured browser origins and rejects origins outside the allowlist', async () => {
    process.env.CORS_ALLOWED_ORIGINS = 'https://civic.example.test'
    await request(app).get('/health').set('origin', 'https://civic.example.test').expect('access-control-allow-origin', 'https://civic.example.test').expect(200)
    const denied = await request(app).get('/health').set('origin', 'https://untrusted.example.test').expect(403)
    expect(denied.body.error.code).toBe('cors_origin_denied')
  })

  it('returns a consistent 404 response for unknown routes', async () => {
    const response = await request(app).get('/missing').expect(404)
    expect(response.body).toEqual({ success: false, error: { code: 'not_found', message: 'Route not found.' } })
  })

  it.each([undefined, 'Basic token', 'Bearer', 'Bearer token extra'])('rejects missing or malformed bearer credentials (%s)', async authorization => {
    const req = request(app).get('/api/v1/system/status')
    if (authorization) req.set('authorization', authorization)
    const response = await req.expect(401)
    expect(response.body.error.code).toBe('unauthenticated')
    expect(verifyIdToken).not.toHaveBeenCalled()
  })

  it('rejects an invalid token without exposing verifier details', async () => {
    verifyIdToken.mockRejectedValue(new Error('private verifier details'))
    const response = await request(app).get('/api/v1/system/status').set('authorization', 'Bearer bad-token').expect(401)
    expect(response.body).toEqual({ success: false, error: { code: 'unauthenticated', message: 'The Bearer token is invalid or expired.' } })
    expect(response.text).not.toContain('private verifier details')
  })

  it('returns authenticated Firestore health status', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'user-1' })
    const response = await request(app).get('/api/v1/system/status').set('authorization', 'Bearer valid-token').expect(200)
    expect(response.body).toEqual({ success: true, data: { database: 'connected' } })
    expect(firestoreGet).toHaveBeenCalledOnce()
  })

  it('returns a service error when Firestore health check fails', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'user-1' })
    firestoreGet.mockRejectedValue(new Error('private database details'))
    const response = await request(app).get('/api/v1/system/status').set('authorization', 'Bearer valid-token').expect(500)
    expect(response.body).toMatchObject({ success: false, error: { code: 'internal_error', message: 'An unexpected error occurred.' } })
    expect(response.body.error.requestId).toBeDefined()
    expect(response.text).not.toContain('private database details')
  })

  it('returns 400, not 500, for malformed JSON bodies', async () => {
    const response = await request(app)
      .post('/api/v1/system/status')
      .set('content-type', 'application/json')
      .send('{bad json')
      .expect(400)
    expect(response.body.error.code).toBe('bad_request')
    expect(response.body.error.message).toBe('The request could not be processed.')
  })

  it('returns 413 for oversized JSON bodies', async () => {
    const response = await request(app)
      .post('/api/v1/system/status')
      .set('content-type', 'application/json')
      .send(JSON.stringify({ data: 'x'.repeat(1_100_000) }))
      .expect(413)
    expect(response.body.error.code).toBe('payload_too_large')
  })

  it('checks token revocation only on role-protected routes', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'admin-1', roles: ['admin'] })
    const protectedApp = express()
    protectedApp.get('/admin', requireAuth(['admin']), (_req, res) => res.json({ success: true }))
    await request(protectedApp).get('/admin').set('authorization', 'Bearer valid-token').expect(200)
    expect(verifyIdToken).toHaveBeenLastCalledWith('valid-token', true)

    verifyIdToken.mockResolvedValue({ uid: 'user-1' })
    await request(app).get('/api/v1/system/status').set('authorization', 'Bearer valid-token').expect(200)
    expect(verifyIdToken).toHaveBeenLastCalledWith('valid-token', false)
  })

  it('checks custom role claims when a route requires a role', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'user-1', roles: ['citizen'] })
    const protectedApp = express()
    protectedApp.get('/admin', requireAuth(['admin']), (_req, res) => res.json({ success: true }))
    protectedApp.use(errorHandler)
    const response = await request(protectedApp).get('/admin').set('authorization', 'Bearer valid-token').expect(403)
    expect(response.body.error.code).toBe('permission_denied')
  })

  it('allows a user whose custom role claim satisfies the route requirement', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'admin-1', roles: ['admin'] })
    const protectedApp = express()
    protectedApp.get('/admin', requireAuth(['admin']), (req, res) => res.json({ success: true, uid: req.user?.uid }))
    const response = await request(protectedApp).get('/admin').set('authorization', 'Bearer valid-token').expect(200)
    expect(response.body).toEqual({ success: true, uid: 'admin-1' })
  })

  describe('request correlation IDs (Issue #285)', () => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

    it('generates a non-empty, valid UUID in the X-Request-ID response header (Test 1)', async () => {
      const response = await request(app).get('/health').expect(200)
      const requestId = response.header['x-request-id']

      expect(requestId).toBeDefined()
      expect(typeof requestId).toBe('string')
      expect(requestId.length).toBeGreaterThan(0)
      expect(requestId).toMatch(uuidRegex)
    })

    it('generates unique identifiers across independent requests (Test 2)', async () => {
      const res1 = await request(app).get('/health').expect(200)
      const res2 = await request(app).get('/health').expect(200)

      const id1 = res1.header['x-request-id']
      const id2 = res2.header['x-request-id']

      expect(id1).toMatch(uuidRegex)
      expect(id2).toMatch(uuidRegex)
      expect(id1).not.toBe(id2)
    })

    it('records consistent request ID in structured access logs with method, path, status, and duration (Test 3)', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

      const response = await request(app).get('/health').expect(200)
      const headerId = response.header['x-request-id']

      expect(consoleSpy).toHaveBeenCalled()
      const logCall = consoleSpy.mock.calls.find(call => {
        try {
          const parsed = JSON.parse(call[0])
          return parsed.path === '/health' && parsed.requestId === headerId
        } catch {
          return false
        }
      })

      expect(logCall).toBeDefined()
      const parsedLog = JSON.parse(logCall![0])
      expect(parsedLog).toMatchObject({
        requestId: headerId,
        method: 'GET',
        path: '/health',
        status: 200,
      })
      expect(typeof parsedLog.durationMs).toBe('number')
      expect(parsedLog.durationMs).toBeGreaterThanOrEqual(0)

      consoleSpy.mockRestore()
    })

    it('includes request ID in HTTP 500 error responses and matches X-Request-ID (Test 4)', async () => {
      verifyIdToken.mockResolvedValue({ uid: 'user-1' })
      firestoreGet.mockRejectedValue(new Error('controlled internal failure'))

      const response = await request(app)
        .get('/api/v1/system/status')
        .set('authorization', 'Bearer valid-token')
        .expect(500)

      const headerId = response.header['x-request-id']
      expect(headerId).toMatch(uuidRegex)

      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'internal_error',
          message: 'An unexpected error occurred.',
          requestId: headerId,
        },
      })
    })

    it('protects sensitive exception messages and stack traces from exposure in 500 responses (Test 5)', async () => {
      verifyIdToken.mockResolvedValue({ uid: 'user-1' })
      const sensitiveLeak = 'DB_PASSWORD_SUPER_SECRET_KEY at Database.connect(/etc/secrets/db.key:42)'
      firestoreGet.mockRejectedValue(new Error(sensitiveLeak))

      const response = await request(app)
        .get('/api/v1/system/status')
        .set('authorization', 'Bearer valid-token')
        .expect(500)

      expect(response.text).not.toContain(sensitiveLeak)
      expect(response.text).not.toContain('stack')
      expect(response.text).not.toContain('Database.connect')
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'internal_error',
          message: 'An unexpected error occurred.',
          requestId: response.header['x-request-id'],
        },
      })
    })

    it('protects against client-supplied X-Request-ID and enforces server-generated ID (Test 6)', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      const attackerId = 'attacker-injected-id-12345<script>alert(1)</script>'

      // Test on 200 success
      const successRes = await request(app)
        .get('/health')
        .set('x-request-id', attackerId)
        .expect(200)

      const serverSuccessId = successRes.header['x-request-id']
      expect(serverSuccessId).not.toBe(attackerId)
      expect(serverSuccessId).toMatch(uuidRegex)

      const successLog = consoleSpy.mock.calls.find(call => {
        try {
          return JSON.parse(call[0]).requestId === serverSuccessId
        } catch {
          return false
        }
      })
      expect(successLog).toBeDefined()
      expect(JSON.parse(successLog![0]).requestId).not.toBe(attackerId)

      // Test on 500 error
      verifyIdToken.mockResolvedValue({ uid: 'user-1' })
      firestoreGet.mockRejectedValue(new Error('test failure'))

      const errorRes = await request(app)
        .get('/api/v1/system/status')
        .set('authorization', 'Bearer valid-token')
        .set('x-request-id', attackerId)
        .expect(500)

      const serverErrorId = errorRes.header['x-request-id']
      expect(serverErrorId).not.toBe(attackerId)
      expect(serverErrorId).toMatch(uuidRegex)
      expect(errorRes.body.error.requestId).toBe(serverErrorId)
      expect(errorRes.body.error.requestId).not.toBe(attackerId)

      consoleSpy.mockRestore()
    })
  })
})
