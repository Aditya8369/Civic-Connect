import { Label } from '@/components/ui/label'

/**
 * Dropdown used by municipal officers to apply a canned resolution response
 * to the notes field. A native select keeps the control keyboard-accessible
 * and avoids mounting a portal inside the complaint details page.
 */
export function ResolutionTemplateSelector({
  templates = [],
  value = '',
  onChange,
  disabled = false,
  id = 'resolution-template',
}) {
  const hasTemplates = templates.length > 0

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Resolution template</Label>
      <select
        id={id}
        aria-label="Resolution template"
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        disabled={disabled || !hasTemplates}
        className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
      >
        <option value="">
          {hasTemplates ? 'Choose a canned response…' : 'No templates available'}
        </option>
        {templates.map((template) => (
          <option key={template.id} value={template.id}>
            {template.title}
          </option>
        ))}
      </select>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Selecting a template fills in the resolution notes below. You can edit
        the text before saving.
      </p>
    </div>
  )
}

export default ResolutionTemplateSelector
