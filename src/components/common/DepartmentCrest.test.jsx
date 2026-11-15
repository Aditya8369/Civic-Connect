
import { beforeEach, describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  DepartmentCrest,
  CategoryAvatar,
  RoadsBridgesCrestIcon,
  WaterWorksCrestIcon,
  CleanlinessSanitationCrestIcon,
  PowerGridCrestIcon,
} from './DepartmentCrest'
import {
  normalizeDepartmentKey,
  DEPARTMENT_KEYS,
} from '@/utils/departmentCrests'
import { LanguageProvider } from '@/contexts/LanguageContext'

beforeEach(() => {
  localStorage.setItem('civic-connect-language', 'en')
})

function renderWithLanguage(component) {
  return renderToStaticMarkup(
    <LanguageProvider>{component}</LanguageProvider>
  )
}

describe('DepartmentCrest Component', () => {
  describe('1. Scalable SVG Icons & Geometric Badge Shapes', () => {
    it('renders Roads & Bridges with keystone arch geometric badge and consistent stroke', () => {
      const html = renderToStaticMarkup(<RoadsBridgesCrestIcon />)

      expect(html).toContain('viewBox="0 0 24 24"')
      expect(html).toContain('stroke-width="1.75"')
      expect(html).toContain('stroke-linecap="round"')
      expect(html).toContain('stroke-linejoin="round"')
      expect(html).toContain('M4.5 4.5 L19.5 4.5 L18 16.8 L12 21.5 L6 16.8 Z')
    })

    it('renders Water Works with droplet fluid geometric badge and consistent stroke', () => {
      const html = renderToStaticMarkup(<WaterWorksCrestIcon />)

      expect(html).toContain('viewBox="0 0 24 24"')
      expect(html).toContain('stroke-width="1.75"')
      expect(html).toContain('M12 2.5 C12 2.5 19.5 9')
    })

    it('renders Cleanliness & Sanitation with chamfered hexagon geometric badge', () => {
      const html = renderToStaticMarkup(<CleanlinessSanitationCrestIcon />)

      expect(html).toContain('viewBox="0 0 24 24"')
      expect(html).toContain('stroke-width="1.75"')
      expect(html).toContain('M12 2.5 L19.2 6.6 L19.2 15.4 L12 21.5 L4.8 15.4 L4.8 6.6 Z')
    })

    it('renders Power & Grid with notched diamond energy shield', () => {
      const html = renderToStaticMarkup(<PowerGridCrestIcon />)

      expect(html).toContain('viewBox="0 0 24 24"')
      expect(html).toContain('stroke-width="1.75"')
      expect(html).toContain('M12 2.2 L19.8 6.8')
    })
  })

  describe('2. Theme-Aware Dark/Light Contrast Adjustments', () => {
    it('applies warm amber light and dark mode classes for Roads & Bridges', () => {
      const html = renderWithLanguage(
        <DepartmentCrest department="Roads & Bridges" />
      )

      expect(html).toContain('bg-amber-50')
      expect(html).toContain('dark:bg-amber-950/40')
      expect(html).toContain('border-amber-200')
      expect(html).toContain('dark:border-amber-800/60')
      expect(html).toContain('text-amber-950')
      expect(html).toContain('dark:text-amber-200')
    })

    it('applies ocean cyan/sky light and dark mode classes for Water Works', () => {
      const html = renderWithLanguage(
        <DepartmentCrest department="Water Works" />
      )

      expect(html).toContain('bg-sky-50')
      expect(html).toContain('dark:bg-sky-950/40')
      expect(html).toContain('border-sky-200')
      expect(html).toContain('dark:border-sky-800/60')
      expect(html).toContain('text-sky-950')
      expect(html).toContain('dark:text-sky-200')
    })

    it('applies emerald green light and dark mode classes for Cleanliness & Sanitation', () => {
      const html = renderWithLanguage(
        <DepartmentCrest department="Cleanliness & Sanitation" />
      )

      expect(html).toContain('bg-emerald-50')
      expect(html).toContain('dark:bg-emerald-950/40')
      expect(html).toContain('border-emerald-200')
      expect(html).toContain('dark:border-emerald-800/60')
      expect(html).toContain('text-emerald-950')
      expect(html).toContain('dark:text-emerald-200')
    })

    it('applies electric violet light and dark mode classes for Power & Grid', () => {
      const html = renderWithLanguage(
        <DepartmentCrest department="Power & Grid" />
      )

      expect(html).toContain('bg-violet-50')
      expect(html).toContain('dark:bg-violet-950/40')
      expect(html).toContain('border-violet-200')
      expect(html).toContain('dark:border-violet-800/60')
      expect(html).toContain('text-violet-950')
      expect(html).toContain('dark:text-violet-200')
    })
  })

  describe('3. Department Normalization & Fallbacks', () => {
    it('normalizes legacy database keys to canonical department crests', () => {
      expect(normalizeDepartmentKey('Roads')).toBe(DEPARTMENT_KEYS.ROADS_BRIDGES)
      expect(normalizeDepartmentKey('Water')).toBe(DEPARTMENT_KEYS.WATER_WORKS)
      expect(normalizeDepartmentKey('Sanitation')).toBe(DEPARTMENT_KEYS.CLEANLINESS_SANITATION)
      expect(normalizeDepartmentKey('Electricity')).toBe(DEPARTMENT_KEYS.POWER_GRID)
      expect(normalizeDepartmentKey('Public Safety')).toBe(DEPARTMENT_KEYS.PUBLIC_SAFETY)
    })

    it('handles case-insensitivity and whitespace', () => {
      expect(normalizeDepartmentKey('  roads & bridges  ')).toBe(DEPARTMENT_KEYS.ROADS_BRIDGES)
      expect(normalizeDepartmentKey('WATER WORKS')).toBe(DEPARTMENT_KEYS.WATER_WORKS)
      expect(normalizeDepartmentKey('cleanliness & sanitation')).toBe(DEPARTMENT_KEYS.CLEANLINESS_SANITATION)
      expect(normalizeDepartmentKey('POWER & GRID')).toBe(DEPARTMENT_KEYS.POWER_GRID)
    })

    it('resolves category fallback when department is unassigned', () => {
      const html = renderWithLanguage(
        <DepartmentCrest department="" category="Water Leakage" />
      )

      expect(html).toContain('Water Works')
      expect(html).toContain('bg-sky-50')
    })

    it('falls back gracefully when unassigned without category', () => {
      const html = renderWithLanguage(
        <DepartmentCrest department="Unassigned" />
      )

      expect(html).toContain('Municipal Board')
      expect(html).toContain('bg-gray-100')
    })
  })

  describe('4. Display Variants', () => {
    it('renders badge variant with crest icon and label by default', () => {
      const html = renderWithLanguage(
        <DepartmentCrest department="Roads" />
      )

      expect(html).toContain('Roads &amp; Bridges')
      expect(html).toContain('role="status"')
      expect(html).toContain('aria-label="Department: Roads &amp; Bridges"')
    })

    it('renders avatar variant with geometric crest shape only', () => {
      const html = renderWithLanguage(
        <DepartmentCrest department="Water" variant="avatar" size="md" />
      )

      expect(html).toContain('role="img"')
      expect(html).toContain('h-8 w-8')
      expect(html).not.toContain('Water Works</span>')
    })

    it('renders chip variant with compact shortName', () => {
      const html = renderWithLanguage(
        <DepartmentCrest department="Sanitation" variant="chip" />
      )

      expect(html).toContain('Sanitation')
      expect(html).toContain('rounded-full')
    })
  })

  describe('5. CategoryAvatar Component', () => {
    it('renders category avatar with icon and label', () => {
      const html = renderWithLanguage(
        <CategoryAvatar category="Streetlight Issues" />
      )

      expect(html).toContain('Streetlight Issues')
      expect(html).toContain('role="status"')
      expect(html).toContain('aria-label="Category: Streetlight Issues"')
    })
  })
})
