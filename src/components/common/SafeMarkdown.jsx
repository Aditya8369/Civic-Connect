import { useMemo } from 'react'
import { renderMarkdownToSafeHtml } from '@/utils/sanitize'

/**
 * SafeMarkdown renders user-submitted markdown and text safely
 * after running it through DOMPurify sanitization.
 */
export function SafeMarkdown({ content, className = '', as = 'div', ...props }) {
  const safeHtml = useMemo(() => {
    return renderMarkdownToSafeHtml(content)
  }, [content])

  if (!content) return null

  const Component = as

  return (
    <Component
      className={className}
      dangerouslySetInnerHTML={{ __html: safeHtml }}
      {...props}
    />
  )
}

export default SafeMarkdown
