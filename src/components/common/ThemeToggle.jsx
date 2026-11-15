
import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { useLanguage } from '@/contexts/LanguageContext'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/cn'

const iconClass =
  'absolute inset-0 m-auto transition-all duration-300 ease-out motion-reduce:transition-none'

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const { t } = useLanguage()

  const isDark = theme === 'dark'

  const label = isDark
    ? t('switchToLightMode')
    : t('switchToDarkMode')

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className="rounded-full"
      aria-label={label}
      title={label}
    >
      <span className="relative h-5 w-5" aria-hidden="true">
        <Sun
          className={cn(
            iconClass,
            isDark
              ? 'rotate-0 scale-100 opacity-100'
              : '-rotate-90 scale-50 opacity-0'
          )}
        />

        <Moon
          className={cn(
            iconClass,
            isDark
              ? 'rotate-90 scale-50 opacity-0'
              : 'rotate-0 scale-100 opacity-100'
          )}
        />
      </span>
    </Button>
  )
}

