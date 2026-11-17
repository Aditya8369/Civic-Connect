import { onRequest } from 'firebase-functions/v2/https'
import { app } from './app.js'

export const api = onRequest({ region: process.env.FUNCTIONS_REGION || 'us-central1' }, app)
