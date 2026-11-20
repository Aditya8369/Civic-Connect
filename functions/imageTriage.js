/**
 * Cloud Function Trigger & Utility for AI-Powered Image Triage & Auto-Categorization
 * civicconnect backend service
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

export const DEPARTMENT_CATEGORIES = {
  Roads: 'Potholes & Road Damage',
  Water: 'Water Leakage',
  Sanitation: 'Garbage & Sanitation',
  Electricity: 'Streetlight Issues',
  'Public Safety': 'Traffic Issues',
}

export const CATEGORY_TO_DEPARTMENT = {
  'Potholes & Road Damage': 'Roads',
  'Streetlight Issues': 'Electricity',
  'Water Leakage': 'Water',
  'Garbage & Sanitation': 'Sanitation',
  'Noise Pollution': 'Public Safety',
  'Illegal Construction': 'Public Safety',
  'Traffic Issues': 'Public Safety',
  Other: 'Sanitation',
}

export const VALID_SEVERITIES = ['Low', 'Medium', 'High', 'Urgent']

/**
 * Normalizes severity string to one of the valid enum values
 */
export function normalizeSeverity(severity) {
  if (!severity || typeof severity !== 'string') return 'Medium'
  const clean = severity.trim().toLowerCase()
  if (clean.includes('urgent') || clean.includes('critical')) return 'Urgent'
  if (clean.includes('high')) return 'High'
  if (clean.includes('low')) return 'Low'
  return 'Medium'
}

/**
 * Analyzes image content using Gemini 1.5 Flash Vision API or heuristic fallback
 * @param {Object} params
 * @param {string} params.imageUrl
 * @param {string} params.mimeType
 * @param {string} [params.filename]
 * @param {Object} [options]
 */
export async function triageImagePayload({ imageUrl, mimeType = 'image/jpeg', filename = '' }, options = {}) {
  const apiKey = options.geminiApiKey || process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY

  if (apiKey && options.fetchFn) {
    try {
      const prompt = `Analyze this civic issue photo. Output strict JSON with:
category: one of [Roads, Water, Sanitation, Electricity, Public Safety]
confidence: number between 0.0 and 1.0
severity: one of [Low, Medium, High, Urgent]
suggestedTitle: short title
suggestedDescription: short description`

      const response = await options.fetchFn(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  { image_url: imageUrl },
                ],
              },
            ],
          }),
        }
      )

      if (response.ok) {
        const data = await response.json()
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
        if (text) {
          const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim()
          const parsed = JSON.parse(cleaned)
          const dept = parsed.category || 'Roads'
          return {
            department: dept,
            category: DEPARTMENT_CATEGORIES[dept] || dept,
            confidence: Math.min(1, Math.max(0.1, Number(parsed.confidence) || 0.85)),
            severity: normalizeSeverity(parsed.severity),
            suggestedTitle: parsed.suggestedTitle || '',
            suggestedDescription: parsed.suggestedDescription || '',
            source: 'gemini',
          }
        }
      }
    } catch (err) {
      console.warn('[ImageTriage] Remote vision call failed, falling back to heuristics:', err.message)
    }
  }

  // Fallback heuristic classification based on filename or metadata
  const lowerName = (filename || imageUrl || '').toLowerCase()
  let department = 'Roads'
  let severity = 'Medium'

  if (lowerName.includes('water') || lowerName.includes('leak') || lowerName.includes('pipe')) {
    department = 'Water'
    severity = 'High'
  } else if (lowerName.includes('light') || lowerName.includes('dark') || lowerName.includes('electric') || lowerName.includes('wire')) {
    department = 'Electricity'
    severity = 'Low'
  } else if (lowerName.includes('garbage') || lowerName.includes('trash') || lowerName.includes('waste') || lowerName.includes('dump')) {
    department = 'Sanitation'
    severity = 'Medium'
  } else if (lowerName.includes('traffic') || lowerName.includes('accident') || lowerName.includes('danger') || lowerName.includes('fire')) {
    department = 'Public Safety'
    severity = 'Urgent'
  } else if (lowerName.includes('pothole') || lowerName.includes('road') || lowerName.includes('crack') || lowerName.includes('asphalt')) {
    department = 'Roads'
    severity = 'High'
  }

  return {
    department,
    category: DEPARTMENT_CATEGORIES[department] || 'Potholes & Road Damage',
    confidence: 0.86,
    severity,
    suggestedTitle: `${department} Maintenance Required`,
    suggestedDescription: `Civic infrastructure issue detected in category ${DEPARTMENT_CATEGORIES[department] || department}.`,
    source: 'heuristic',
  }
}

/**
 * Pure handler for Firestore issue creation event
 */
export async function handleIssueImageTriage(snapshot, context = {}, options = {}) {
  try {
    const data = snapshot && typeof snapshot.data === 'function' ? snapshot.data() : null
    if (!data) return { triaged: false, reason: 'no_data' }

    // Check if image exists
    const imageUrl = data.imageUrl || data.photoUrl || data.photo || data.attachmentUrl
    if (!imageUrl) {
      return { triaged: false, reason: 'no_image' }
    }

    // Skip if already triaged
    if (data.aiTriage && data.aiTriage.processed) {
      return { triaged: false, reason: 'already_triaged' }
    }

    const triageResult = await triageImagePayload(
      { imageUrl, filename: data.photoFileName || data.imageFileName || '' },
      options
    )

    const updatePayload = {
      aiTriage: {
        ...triageResult,
        processed: true,
        triagedAt: new Date().toISOString(),
      },
    }

    // If issue didn't have severity or priority, auto-populate from triage
    if (!data.severity) {
      updatePayload.severity = triageResult.severity
    }
    if (!data.priority) {
      updatePayload.priority = triageResult.severity
    }

    // If issue didn't have a category, populate recommended category
    if (!data.category || data.category === 'Other') {
      updatePayload.category = triageResult.category
      updatePayload.department = triageResult.department
    }

    // Update document in Firestore
    if (snapshot.ref && typeof snapshot.ref.update === 'function') {
      await snapshot.ref.update(updatePayload)
    } else if (options.firestore && context.params?.issueId) {
      await options.firestore.collection('issues').doc(context.params.issueId).update(updatePayload)
    }

    return { triaged: true, result: triageResult }
  } catch (err) {
    console.error('[ImageTriage] Failed to triage issue image:', err)
    return { triaged: false, error: err.message }
  }
}

/**
 * Firestore trigger on document creation
 */
export const onIssueImageTriage = onDocumentCreated('issues/{issueId}', async (event) => {
  const app = getApps().find(({ name }) => name === '[DEFAULT]') ?? initializeApp()
  const firestore = getFirestore(app)
  return handleIssueImageTriage(event.data, event, { firestore })
})
