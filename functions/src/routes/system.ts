import { Router } from 'express'
import { getAdminFirestore } from '../admin.js'
import { requireAuth } from '../middleware/auth.js'

export const systemRouter = Router()

systemRouter.get('/status', requireAuth(), async (_req, res, next) => {
  try {
    await getAdminFirestore().collection('_health').limit(1).get()
    return res.json({ success: true, data: { database: 'connected' } })
  } catch (error) {
    return next(error)
  }
})
