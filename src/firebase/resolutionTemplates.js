import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from './services'

export const RESOLUTION_TEMPLATES_SETTING_ID = 'resolutionTemplates'
export const RESOLUTION_TEMPLATE_TITLE_MAX_LENGTH = 80
export const RESOLUTION_TEMPLATE_BODY_MAX_LENGTH = 2000

/**
 * Built-in canned responses shown to municipal officers before any custom
 * templates have been saved. Once an administrator saves the template list,
 * the saved copy (which may include these defaults) is used instead.
 */
export const DEFAULT_RESOLUTION_TEMPLATES = Object.freeze([
  {
    id: 'pothole-filled',
    title: 'Pothole filled',
    body:
      'The reported pothole has been filled and the road surface levelled. Loose debris was removed and the area was cleared for public use.',
  },
  {
    id: 'transformer-replaced',
    title: 'Transformer replaced',
    body:
      'The faulty transformer has been replaced and the power supply restored. The surrounding area was inspected and confirmed safe.',
  },
  {
    id: 'sanitation-sweep-completed',
    title: 'Sanitation sweep completed',
    body:
      'The sanitation sweep has been completed and the reported waste cleared. Regular collection has resumed for this location.',
  },
  {
    id: 'streetlight-repaired',
    title: 'Streetlight repaired',
    body:
      'The reported streetlight has been repaired and illumination restored. A night-time inspection confirmed the light is working correctly.',
  },
  {
    id: 'water-leak-sealed',
    title: 'Water leak sealed',
    body:
      'The water pipeline leak has been sealed and supply restored. The road surface was reinstated and the area left clean and safe.',
  },
])

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLength)
}

/**
 * Turns an arbitrary title into a stable, URL-safe template ID, adding a
 * numeric suffix when the base ID is already in use.
 */
export function createResolutionTemplateId(title, existingIds = []) {
  const base =
    cleanText(title, RESOLUTION_TEMPLATE_TITLE_MAX_LENGTH)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'resolution-template'

  const taken = new Set(
    (Array.isArray(existingIds) ? existingIds : []).filter(
      (id) => typeof id === 'string' && id
    )
  )

  if (!taken.has(base)) return base

  let suffix = 2
  while (taken.has(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}

export function normalizeResolutionTemplate(template) {
  if (!template || typeof template !== 'object') return null

  const title = cleanText(template.title, RESOLUTION_TEMPLATE_TITLE_MAX_LENGTH)
  const body = cleanText(template.body, RESOLUTION_TEMPLATE_BODY_MAX_LENGTH)
  if (!title || !body) return null

  const id = cleanText(template.id, RESOLUTION_TEMPLATE_TITLE_MAX_LENGTH)
  return {
    id: id || createResolutionTemplateId(title),
    title,
    body,
  }
}

/**
 * Sanitises a stored/saved template list: trims text, drops empty entries and
 * removes duplicate IDs so the selector always has unique option values.
 */
export function normalizeResolutionTemplates(templates) {
  if (!Array.isArray(templates)) return []

  const seenIds = new Set()
  const normalized = []

  for (const template of templates) {
    const clean = normalizeResolutionTemplate(template)
    if (!clean) continue

    let id = clean.id
    if (seenIds.has(id)) {
      id = createResolutionTemplateId(clean.title, [...seenIds])
    }

    seenIds.add(id)
    normalized.push({ ...clean, id })
  }

  return normalized
}

export function getDefaultResolutionTemplates() {
  return DEFAULT_RESOLUTION_TEMPLATES.map((template) => ({ ...template }))
}

/**
 * Returns the built-in templates when the settings document does not exist
 * yet. A saved empty list is respected (the administrator cleared them).
 */
export async function loadResolutionTemplates() {
  try {
    const snapshot = await getDoc(
      doc(db, 'settings', RESOLUTION_TEMPLATES_SETTING_ID)
    )

    if (!snapshot.exists()) return getDefaultResolutionTemplates()

    return normalizeResolutionTemplates(snapshot.data()?.templates)
  } catch (error) {
    console.warn('Could not load resolution templates:', error)
    return getDefaultResolutionTemplates()
  }
}

export async function saveResolutionTemplates(templates, actorUid = null) {
  const normalized = normalizeResolutionTemplates(templates)

  await setDoc(
    doc(db, 'settings', RESOLUTION_TEMPLATES_SETTING_ID),
    {
      templates: normalized,
      updatedAt: serverTimestamp(),
      ...(actorUid ? { updatedBy: actorUid } : {}),
    },
    { merge: true }
  )

  return normalized
}

export function getResolutionTemplateBody(templates, templateId) {
  if (!Array.isArray(templates) || !templateId) return ''
  const template = templates.find((item) => item?.id === templateId)
  return template?.body || ''
}
