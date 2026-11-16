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
    expect(response.body).toEqual({ success: false, error: { code: 'internal_error', message: 'An unexpected error occurred.' } })
    expect(response.text).not.toContain('private database details')
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
})
