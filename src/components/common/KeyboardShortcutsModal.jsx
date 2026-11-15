
import { useCallback, useEffect, useRef, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useSpotlightSearch } from '@/contexts/SpotlightContext'
import { useLanguage } from '@/contexts/LanguageContext'

const EDITABLE_SELECTOR =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"], [role="combobox"]'

function isEditableTarget(target) {
  if (!target || typeof target.closest !== 'function') return false
  return target.isContentEditable === true || target.closest(EDITABLE_SELECTOR) !== null
}

function isMacPlatform() {
  return typeof navigator !== 'undefined' && /MAC/i.test(navigator.platform || '')
}

function getShortcutGroups(isMac, t) {
  return [
    {
      title: t('shortcutSearch'),
      shortcuts: [
        {
          keys: [isMac ? '⌘' : 'Ctrl', 'K'],
          description: t('shortcutOpenCloseSearch'),
        },
        { keys: ['↑', '↓'], description: t('shortcutMoveResults') },
        { keys: ['Enter'], description: t('shortcutOpenSelectedResult') },
      ],
    },
    {
      title: t('shortcutGeneral'),
      shortcuts: [
        { keys: ['?'], description: t('shortcutShowList') },
        { keys: ['Esc'], description: t('shortcutCloseDialog') },
      ],
    },
  ]
}

function Keycap({ children }) {
  return (
    <kbd className="inline-flex min-w-6 items-center justify-center rounded border border-gray-300 bg-white px-1.5 py-0.5 font-mono text-[11px] text-gray-700 shadow-2xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
      {children}
    </kbd>
  )
}

export function KeyboardShortcutsModal() {
  const [isOpen, setIsOpen] = useState(false)
  const { isOpen: isSpotlightOpen } = useSpotlightSearch()
  const { t } = useLanguage()
  const previousFocusRef = useRef(null)

  useEffect(() => {
    if (isSpotlightOpen) setIsOpen(false)
  }, [isSpotlightOpen])

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== '?') return
      if (event.defaultPrevented || event.isComposing || event.repeat) return
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (isEditableTarget(event.target)) return
      if (isSpotlightOpen) return
      if (document.querySelector('[role="dialog"][data-state="open"]')) return

      previousFocusRef.current = document.activeElement
      setIsOpen(true)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isSpotlightOpen])

  const handleCloseAutoFocus = useCallback((event) => {
    event.preventDefault()
    const previous = previousFocusRef.current

    if (
      previous &&
      typeof previous.focus === 'function' &&
      document.body.contains(previous)
    ) {
      previous.focus()
    }
  }, [])

  const groups = getShortcutGroups(isMacPlatform(), t)

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={setIsOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />

        <DialogPrimitive.Content
          onCloseAutoFocus={handleCloseAutoFocus}
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-gray-200 bg-white p-6 shadow-lg dark:border-gray-800 dark:bg-gray-900 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <DialogPrimitive.Title className="text-lg font-semibold text-gray-900 dark:text-white">
                {t('keyboardShortcuts')}
              </DialogPrimitive.Title>

              <DialogPrimitive.Description className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t('keyboardShortcutsDescription')}
              </DialogPrimitive.Description>
            </div>

            <DialogPrimitive.Close
              aria-label={t('closeKeyboardShortcuts')}
              className="rounded-sm p-1 text-gray-500 opacity-80 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-400"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>

          <div className="space-y-5">
            {groups.map((group) => (
              <section key={group.title} aria-label={group.title}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {group.title}
                </h3>

                <ul className="space-y-2">
                  {group.shortcuts.map((shortcut) => (
                    <li
                      key={shortcut.description}
                      className="flex items-center justify-between gap-4 text-sm text-gray-700 dark:text-gray-200"
                    >
                      <span>{shortcut.description}</span>

                      <span className="flex shrink-0 items-center gap-1">
                        {shortcut.keys.map((key) => (
                          <Keycap key={key}>{key}</Keycap>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export default KeyboardShortcutsModal
