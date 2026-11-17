import cors from 'cors'
import express, { type ErrorRequestHandler } from 'express'
import { ApiError } from './middleware/auth.js'
import { systemRouter } from './routes/system.js'

function configuredOrigins(): string[] {
  return (process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
}

function projectEnvironment(): string | null {
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT
  try {
    const config = JSON.parse(process.env.FIREBASE_CONFIG || '{}') as { projectId?: string }
    return config.projectId || null
  } catch {
    return null
  }
}

export const app = express()

app.use(cors({
  origin(origin, callback) {
    const allowed = configuredOrigins()
    if (!origin || allowed.includes(origin)) return callback(null, true)
    return callback(new ApiError(403, 'This origin is not allowed.', 'cors_origin_denied'))
  },
  credentials: true,
}))
app.use(express.json({ limit: '1mb' }))
app.use((req, res, next) => {
  const startedAt = Date.now()
  res.on('finish', () => {
    console.info(JSON.stringify({ method: req.method, path: req.originalUrl.split('?')[0], status: res.statusCode, durationMs: Date.now() - startedAt }))
  })
  next()
})

app.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString(), projectId: projectEnvironment() } })
})
app.use('/api/v1/system', systemRouter)
app.use((_req, _res, next) => next(new ApiError(404, 'Route not found.', 'not_found')))

export const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) return next(error)
  const rawStatus = Number(error?.status ?? error?.statusCode)
  const clientStatus = rawStatus >= 400 && rawStatus < 500 ? rawStatus : 500
  const status = error instanceof ApiError ? error.status : clientStatus
  const code = error instanceof ApiError
    ? error.code
    : status === 413 ? 'payload_too_large'
    : status === 500 ? 'internal_error'
    : 'bad_request'
  const message = status === 500
    ? 'An unexpected error occurred.'
    : error instanceof ApiError ? error.message
    : status === 413 ? 'Request body is too large.' : 'The request could not be processed.'
  if (status === 500) console.error('Unhandled API error', error)
  res.status(status).json({ success: false, error: { code, message } })
}

app.use(errorHandler)
