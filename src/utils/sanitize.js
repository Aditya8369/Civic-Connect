import DOMPurify from 'dompurify'

/**
 * Returns an initialized DOMPurify instance across browser, test (jsdom), and Node environments.
 */
export function getPurifier() {
  if (typeof DOMPurify?.sanitize === 'function') {
    return DOMPurify
  }
  if (typeof window !== 'undefined') {
    return DOMPurify(window)
  }
  if (typeof globalThis !== 'undefined' && globalThis.window) {
    return DOMPurify(globalThis.window)
  }
  return DOMPurify
}

/**
 * Allowed HTML tags for user-submitted markdown / rich text.
 */
export const ALLOWED_MARKDOWN_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
  'blockquote', 'code', 'pre', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'span', 'a',
]

/**
 * Allowed HTML attributes for user-submitted markdown / rich text.
 */
export const ALLOWED_MARKDOWN_ATTR = [
  'href', 'title', 'target', 'rel', 'class',
]

/**
 * Tags strictly prohibited under all circumstances.
 */
export const FORBIDDEN_TAGS = [
  'script', 'style', 'iframe', 'frame', 'object', 'embed',
  'form', 'input', 'button', 'select', 'textarea',
  'svg', 'math', 'base', 'meta', 'link', 'audio', 'video', 'img',
]

/**
 * Sanitizes plain text input (titles, addresses, names, categories, etc.)
 * by stripping all HTML tags, script vectors, and malicious attributes.
 *
 * @param {string} value - Raw user input.
 * @returns {string} Sanitized plain text string.
 */
export function sanitizeText(value) {
  if (value == null) return ''
  const str = String(value)
  if (!str.trim()) return ''

  const purifier = getPurifier()
  if (typeof purifier?.sanitize !== 'function') {
    return str.replace(/<[^>]*>/g, '').trim()
  }

  // Pre-strip svg tags while preserving inner text if any
  const normalized = str.replace(/<svg\b[^>]*>([\s\S]*?)<\/svg>/gi, '$1')

  const cleaned = purifier.sanitize(normalized, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,
  })

  return cleaned.trim()
}

/**
 * Sanitizes user-submitted markdown or formatted text.
 * Strips script tags, unsafe protocols (javascript:, data:), event handlers, and arbitrary HTML,
 * while permitting safe formatting tags (e.g. bold, italics, links, lists, blockquotes).
 *
 * @param {string} value - Raw markdown or HTML formatted string.
 * @param {object} options - Custom DOMPurify options.
 * @returns {string} Sanitized string safe for rendering.
 */
export function sanitizeMarkdown(value, options = {}) {
  if (value == null) return ''
  const str = String(value)
  if (!str.trim()) return ''

  const purifier = getPurifier()
  if (typeof purifier?.sanitize !== 'function') {
    return str.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '').trim()
  }

  const config = {
    ALLOWED_TAGS: ALLOWED_MARKDOWN_TAGS,
    ALLOWED_ATTR: ALLOWED_MARKDOWN_ATTR,
    FORBID_TAGS: FORBIDDEN_TAGS,
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
    ...options,
  }

  const sanitized = purifier.sanitize(str, config)
  return typeof sanitized === 'string' ? sanitized.trim() : ''
}

/**
 * Lightweight helper to convert basic markdown formatting (bold, italic, inline code,
 * headings, lists, links, line breaks) into safe HTML sanitized via DOMPurify.
 *
 * @param {string} markdown - Raw citizen markdown/text.
 * @returns {string} Sanitized HTML string safe for rendering.
 */
export function renderMarkdownToSafeHtml(markdown) {
  if (!markdown) return ''

  // Pre-sanitize raw input to disarm scripts, event handlers, and disallowed tags
  const safe = sanitizeMarkdown(markdown)
  if (!safe) return ''

  // Parse basic markdown syntax into HTML elements
  let html = safe
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/(\*\*|__)(.*?)\1/g, '<strong>$2</strong>')
    .replace(/(\*|_)(.*?)\1/g, '<em>$2</em>')
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+|tel:[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary-600 underline hover:text-primary-800">$1</a>'
    )
    .replace(/^>\s*(.+)$/gm, '<blockquote class="border-l-2 border-gray-300 pl-3 italic text-gray-600 my-1">$1</blockquote>')
    .replace(/^\s*[-*]\s+(.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/\r\n|\r|\n/g, '<br />')

  // Final DOMPurify pass to ensure the resulting markup complies strictly with safe tag/attribute rules
  return sanitizeMarkdown(html)
}

/**
 * Sanitizes citizen complaint payload fields.
 */
export function sanitizeComplaintPayload(payload = {}) {
  return {
    ...payload,
    title: sanitizeText(payload.title),
    description: sanitizeMarkdown(payload.description),
    address: sanitizeText(payload.address),
    ...(payload.category ? { category: sanitizeText(payload.category) } : {}),
  }
}

/**
 * Sanitizes citizen comment payload fields.
 */
export function sanitizeCommentPayload(payload = {}) {
  return {
    ...payload,
    text: sanitizeMarkdown(payload.text),
    ...(payload.authorName ? { authorName: sanitizeText(payload.authorName) } : {}),
  }
}

/**
 * Sanitizes citizen resolution feedback payload fields.
 */
export function sanitizeFeedbackPayload(payload = {}) {
  return {
    ...payload,
    comment: sanitizeMarkdown(payload.comment),
    tags: Array.isArray(payload.tags) ? payload.tags.map(sanitizeText) : [],
  }
}

/**
 * Sanitizes citizen profile update payload fields.
 */
export function sanitizeProfilePayload(payload = {}) {
  return {
    ...payload,
    name: sanitizeText(payload.name),
    phone: sanitizeText(payload.phone),
    address: sanitizeText(payload.address),
  }
}
