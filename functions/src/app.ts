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
    console.info(JSON.stringify({ method: req.method, path: req.path, status: res.statusCode, durationMs: Date.now() - startedAt }))
  })
  next()
})

app.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString(), projectId: projectEnvironment() } })
})
app.use('/api/v1/system', systemRouter)
app.use((_req, _res, next) => next(new ApiError(404, 'Route not found.', 'not_found')))

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const status = error instanceof ApiError ? error.status : 500
  const code = error instanceof ApiError ? error.code : 'internal_error'
  const message = status === 500 ? 'An unexpected error occurred.' : error.message
  if (status === 500) console.error('Unhandled API error', error)
  res.status(status).json({ success: false, error: { code, message } })
}

app.use(errorHandler)
