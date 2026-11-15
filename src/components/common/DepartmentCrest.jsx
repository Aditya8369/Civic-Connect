
import { forwardRef } from 'react'
import {
  DEPARTMENT_KEYS,
  getDepartmentConfig,
  CATEGORY_CONFIG,
} from '@/utils/departmentCrests'
import { useLanguage } from '@/contexts/LanguageContext'
import { cn } from '@/utils/cn'

export function RoadsBridgesCrestIcon({ className = 'h-5 w-5', ...props }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" {...props}>
      <path d="M4.5 4.5 L19.5 4.5 L18 16.8 L12 21.5 L6 16.8 Z" className="fill-current opacity-15" />
      <path d="M4.5 4.5 L19.5 4.5 L18 16.8 L12 21.5 L6 16.8 Z" />
      <path d="M6 13.5 H18" />
      <path d="M7 13.5 Q12 9 17 13.5" />
      <path d="M12 4.5 V9" />
      <path d="M9 13.5 L7.5 17.5" />
      <path d="M15 13.5 L16.5 17.5" />
      <path d="M12 13.5 V18.5" strokeDasharray="1.5 1.5" />
    </svg>
  )
}

export function WaterWorksCrestIcon({ className = 'h-5 w-5', ...props }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" {...props}>
      <path d="M12 2.5 C12 2.5 19.5 9 19.5 14.5 C19.5 18.6 16.1 21.5 12 21.5 C7.9 21.5 4.5 18.6 4.5 14.5 C4.5 9 12 2.5 12 2.5 Z" className="fill-current opacity-15" />
      <path d="M12 2.5 C12 2.5 19.5 9 19.5 14.5 C19.5 18.6 16.1 21.5 12 21.5 C7.9 21.5 4.5 18.6 4.5 14.5 C4.5 9 12 2.5 12 2.5 Z" />
      <path d="M12 7.5 C12 7.5 9.8 10.5 9.8 12.2 C9.8 13.5 10.8 14.5 12 14.5 C13.2 14.5 14.2 13.5 14.2 12.2 C14.2 10.5 12 7.5 12 7.5 Z" />
      <path d="M7 16 C8.5 17.5 10.2 18.2 12 18.2 C13.8 18.2 15.5 17.5 17 16" />
      <path d="M5.5 14 H7" />
      <path d="M17 14 H18.5" />
    </svg>
  )
}

export function CleanlinessSanitationCrestIcon({ className = 'h-5 w-5', ...props }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" {...props}>
      <path d="M12 2.5 L19.2 6.6 L19.2 15.4 L12 21.5 L4.8 15.4 L4.8 6.6 Z" className="fill-current opacity-15" />
      <path d="M12 2.5 L19.2 6.6 L19.2 15.4 L12 21.5 L4.8 15.4 L4.8 6.6 Z" />
      <path d="M12 6 C8.5 9.5 9 14.5 12 17 C15 14.5 15.5 9.5 12 6 Z" />
      <path d="M12 8.5 V15" />
      <path d="M10 11.5 Q12 12.5 12 12.5" />
      <path d="M14 11.5 Q12 12.5 12 12.5" />
      <path d="M7 9 L7.5 10 L8.5 10.5 L7.5 11 L7 12 L6.5 11 L5.5 10.5 L6.5 10 Z" fill="currentColor" />
      <path d="M17 9 L17.5 10 L18.5 10.5 L17.5 11 L17 12 L16.5 11 L15.5 10.5 L16.5 10 Z" fill="currentColor" />
    </svg>
  )
}

export function PowerGridCrestIcon({ className = 'h-5 w-5', ...props }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" {...props}>
      <path d="M12 2.2 L19.8 6.8 L18.2 17.2 L12 21.8 L5.8 17.2 L4.2 6.8 Z" className="fill-current opacity-15" />
      <path d="M12 2.2 L19.8 6.8 L18.2 17.2 L12 21.8 L5.8 17.2 L4.2 6.8 Z" />
      <path d="M13 5.5 L8.5 12 H12.5 L11 18.5 L16 11.5 H12 Z" />
      <circle cx="6" cy="11.5" r="1" fill="currentColor" />
      <circle cx="18" cy="11.5" r="1" fill="currentColor" />
      <path d="M7 11.5 H8.5" />
      <path d="M15.5 11.5 H17" />
    </svg>
  )
}

export function PublicSafetyCrestIcon({ className = 'h-5 w-5', ...props }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" {...props}>
      <path d="M12 2.5 L19 5.5 V11.5 C19 16.5 16 19.8 12 21.5 C8 19.8 5 16.5 5 11.5 V5.5 Z" className="fill-current opacity-15" />
      <path d="M12 2.5 L19 5.5 V11.5 C19 16.5 16 19.8 12 21.5 C8 19.8 5 16.5 5 11.5 V5.5 Z" />
      <path d="M12 7.2 L13.4 9.8 L16.3 10.2 L14.2 12.3 L14.7 15.2 L12 13.8 L9.3 15.2 L9.8 12.3 L7.7 10.2 L10.6 9.8 Z" />
    </svg>
  )
}

export function CivicUnassignedCrestIcon({ className = 'h-5 w-5', ...props }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" {...props}>
      <path d="M12 3 L19 6.2 V12 C19 16.5 16 19.8 12 21.5 C8 19.8 5 16.5 5 12 V6.2 Z" className="fill-current opacity-15" />
      <path d="M12 3 L19 6.2 V12 C19 16.5 16 19.8 12 21.5 C8 19.8 5 16.5 5 12 V6.2 Z" />
      <path d="M8 8 L12 6 L16 8 H8 Z" />
      <path d="M9 10 V15" />
      <path d="M12 10 V15" />
      <path d="M15 10 V15" />
      <path d="M7 16 H17" />
    </svg>
  )
}

const CREST_ICON_MAP = {
  [DEPARTMENT_KEYS.ROADS_BRIDGES]: RoadsBridgesCrestIcon,
  [DEPARTMENT_KEYS.WATER_WORKS]: WaterWorksCrestIcon,
  [DEPARTMENT_KEYS.CLEANLINESS_SANITATION]: CleanlinessSanitationCrestIcon,
  [DEPARTMENT_KEYS.POWER_GRID]: PowerGridCrestIcon,
  [DEPARTMENT_KEYS.PUBLIC_SAFETY]: PublicSafetyCrestIcon,
  [DEPARTMENT_KEYS.UNASSIGNED]: CivicUnassignedCrestIcon,
}

const DEPARTMENT_TRANSLATION_KEYS = {
  [DEPARTMENT_KEYS.ROADS_BRIDGES]: {
    name: 'departmentRoadsBridges',
    shortName: 'departmentRoadsShort',
    tagline: 'departmentRoadsTagline',
  },
  [DEPARTMENT_KEYS.WATER_WORKS]: {
    name: 'departmentWaterWorks',
    shortName: 'departmentWaterShort',
    tagline: 'departmentWaterTagline',
  },
  [DEPARTMENT_KEYS.CLEANLINESS_SANITATION]: {
    name: 'departmentCleanlinessSanitation',
    shortName: 'departmentSanitationShort',
    tagline: 'departmentSanitationTagline',
  },
  [DEPARTMENT_KEYS.POWER_GRID]: {
    name: 'departmentPowerGrid',
    shortName: 'departmentElectricityShort',
    tagline: 'departmentPowerTagline',
  },
  [DEPARTMENT_KEYS.PUBLIC_SAFETY]: {
    name: 'departmentPublicSafety',
    shortName: 'departmentSafetyShort',
    tagline: 'departmentSafetyTagline',
  },
  [DEPARTMENT_KEYS.UNASSIGNED]: {
    name: 'departmentMunicipalBoard',
    shortName: 'departmentUnassignedShort',
    tagline: 'departmentUnassignedTagline',
  },
}

const CATEGORY_TRANSLATION_KEYS = {
  'Potholes & Road Damage': 'categoryRoadDamage',
  'Streetlight Issues': 'categoryStreetlightIssues',
  'Water Leakage': 'categoryWaterLeakage',
  'Garbage & Sanitation': 'categoryGarbageSanitation',
  'Noise Pollution': 'categoryNoisePollution',
  'Illegal Construction': 'categoryIllegalConstruction',
  'Traffic Issues': 'categoryTrafficIssues',
  Other: 'categoryOther',
}

const SIZE_VARIANTS = {
  xs: {
    avatar: 'h-5 w-5 p-0.5',
    icon: 'h-3.5 w-3.5',
    text: 'text-[11px]',
    container: 'px-2 py-0.5 gap-1.5',
  },
  sm: {
    avatar: 'h-6 w-6 p-1',
    icon: 'h-4 w-4',
    text: 'text-xs',
    container: 'px-2.5 py-1 gap-2',
  },
  md: {
    avatar: 'h-8 w-8 p-1.5',
    icon: 'h-5 w-5',
    text: 'text-sm',
    container: 'px-3 py-1.5 gap-2.5',
  },
  lg: {
    avatar: 'h-10 w-10 p-2',
    icon: 'h-6 w-6',
    text: 'text-base',
    container: 'px-4 py-2 gap-3',
  },
}

export const DepartmentCrest = forwardRef(function DepartmentCrest(
  {
    department,
    category,
    variant = 'badge',
    size = 'sm',
    showLabel = true,
    className,
    ...props
  },
  ref
) {
  const { t } = useLanguage()

  const config = getDepartmentConfig(department, category)
  const IconComponent = CREST_ICON_MAP[config.key] || CivicUnassignedCrestIcon
  const sizes = SIZE_VARIANTS[size] || SIZE_VARIANTS.sm
  const translationKeys = DEPARTMENT_TRANSLATION_KEYS[config.key]

  const departmentName = t(translationKeys.name)
  const departmentShortName = t(translationKeys.shortName)
  const departmentTagline = t(translationKeys.tagline)

  const translatedCategory = category
    ? t(CATEGORY_TRANSLATION_KEYS[category] || category)
    : ''

  const isAssigned =
    department &&
    department.trim() !== '' &&
    department.toLowerCase() !== 'unassigned'

  const displayName = isAssigned
    ? departmentName
    : category
      ? `${departmentName} (${translatedCategory})`
      : departmentName

  if (variant === 'avatar') {
    return (
      <span
        ref={ref}
        role="img"
        aria-label={`${t('departmentLabel')}: ${departmentName}`}
        title={`${departmentName} — ${departmentTagline}`}
        className={cn(
          'inline-flex items-center justify-center rounded-lg border shadow-xs transition-colors shrink-0',
          config.theme.badge,
          sizes.avatar,
          className
        )}
        {...props}
      >
        <IconComponent className={cn(sizes.icon, config.theme.iconColor)} />
      </span>
    )
  }

  if (variant === 'chip') {
    return (
      <span
        ref={ref}
        role="status"
        aria-label={`${t('departmentLabel')}: ${departmentName}`}
        title={`${departmentName} — ${departmentTagline}`}
        className={cn(
          'inline-flex items-center rounded-full border font-medium transition-colors shrink-0',
          config.theme.chip,
          sizes.container,
          sizes.text,
          className
        )}
        {...props}
      >
        <IconComponent className={cn(sizes.icon, config.theme.iconColor, 'shrink-0')} />
        {showLabel && (
          <span className="font-semibold truncate">{departmentShortName}</span>
        )}
      </span>
    )
  }

  return (
    <span
      ref={ref}
      role="status"
      aria-label={`${t('departmentLabel')}: ${displayName}`}
      title={`${departmentName} — ${departmentTagline}`}
      className={cn(
        'inline-flex items-center rounded-lg border shadow-xs transition-colors font-medium shrink-0',
        config.theme.badge,
        sizes.container,
        sizes.text,
        className
      )}
      {...props}
    >
      <span className="flex items-center justify-center rounded-md shrink-0 bg-white/70 dark:bg-black/25 p-0.5 border border-current/15">
        <IconComponent className={cn(sizes.icon, config.theme.iconColor)} />
      </span>

      {showLabel && (
        <span className="font-semibold tracking-tight truncate">
          {displayName}
        </span>
      )}
    </span>
  )
})

export const CategoryAvatar = forwardRef(function CategoryAvatar(
  {
    category,
    size = 'sm',
    showLabel = true,
    className,
    ...props
  },
  ref
) {
  const { t } = useLanguage()

  const config = getDepartmentConfig(undefined, category)
  const categoryInfo = CATEGORY_CONFIG[category]
  const IconComponent = CREST_ICON_MAP[config.key] || CivicUnassignedCrestIcon
  const sizes = SIZE_VARIANTS[size] || SIZE_VARIANTS.sm

  const categoryName = category
    ? t(CATEGORY_TRANSLATION_KEYS[category] || category)
    : t('categoryGeneral')

  return (
    <span
      ref={ref}
      role="status"
      aria-label={`${t('categoryLabel')}: ${categoryName}`}
      className={cn(
        'inline-flex items-center rounded-full border transition-colors font-medium shrink-0',
        categoryInfo?.badgeClass || config.theme.badge,
        sizes.container,
        sizes.text,
        className
      )}
      {...props}
    >
      <IconComponent className={cn(sizes.icon, config.theme.iconColor, 'shrink-0')} />
      {showLabel && <span className="truncate">{categoryName}</span>}
    </span>
  )
})
