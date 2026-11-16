import type { RequestHandler } from 'express'
import { getAdminAuth } from '../admin.js'

export class ApiError extends Error {
  constructor(public status: number, message: string, public code = 'request_error') {
    super(message)
    this.name = 'ApiError'
  }
}

export function requireAuth(roles: string[] = []): RequestHandler {
  return async (req, _res, next) => {
    const authorization = req.get('authorization')
    const match = authorization?.match(/^Bearer\s+(\S+)$/i)
    if (!match) return next(new ApiError(401, 'A valid Bearer token is required.', 'unauthenticated'))

    try {
      const decoded = await getAdminAuth().verifyIdToken(match[1], roles.length > 0)
      req.user = decoded
      if (roles.length) {
        const claims = decoded as typeof decoded & { role?: string; roles?: string[] }
        const userRoles = [claims.role, ...(Array.isArray(claims.roles) ? claims.roles : [])]
        if (!roles.some(role => userRoles.includes(role))) {
          return next(new ApiError(403, 'You do not have permission to access this resource.', 'permission_denied'))
        }
      }
      return next()
    } catch {
      return next(new ApiError(401, 'The Bearer token is invalid or expired.', 'unauthenticated'))
    }
  }
}
