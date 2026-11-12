/**
 * Municipal Department Crests & Category Icon Avatars Design System
 * Provides normalized metadata, color tokens, and geometry configurations
 * for civic municipal departments and complaint categories.
 */

export const DEPARTMENT_KEYS = {
  ROADS_BRIDGES: 'roads_bridges',
  WATER_WORKS: 'water_works',
  CLEANLINESS_SANITATION: 'cleanliness_sanitation',
  POWER_GRID: 'power_grid',
  PUBLIC_SAFETY: 'public_safety',
  CIVIC_ADMIN: 'civic_admin',
  UNASSIGNED: 'unassigned',
}

export const DEPARTMENT_CONFIG = {
  [DEPARTMENT_KEYS.ROADS_BRIDGES]: {
    key: DEPARTMENT_KEYS.ROADS_BRIDGES,
    name: 'Roads & Bridges',
    shortName: 'Roads',
    tagline: 'Civil Infrastructure & Transport',
    shape: 'keystone',
    theme: {
      badge: 'bg-amber-50 border-amber-200 text-amber-950 dark:bg-amber-950/40 dark:border-amber-800/60 dark:text-amber-200',
      avatarBg: 'bg-gradient-to-br from-amber-500 to-amber-600 text-white dark:from-amber-600 dark:to-amber-700',
      iconColor: 'text-amber-600 dark:text-amber-400',
      fillColor: 'text-amber-500/20 dark:text-amber-400/20',
      ringColor: 'ring-amber-500/30',
      chip: 'bg-amber-100/80 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800',
    },
    aliases: [
      'roads',
      'roads & bridges',
      'roads and bridges',
      'infrastructure',
      'bridges',
      'highways',
      'potholes & road damage',
      'traffic issues',
    ],
  },

  [DEPARTMENT_KEYS.WATER_WORKS]: {
    key: DEPARTMENT_KEYS.WATER_WORKS,
    name: 'Water Works',
    shortName: 'Water',
    tagline: 'Hydraulic & Water Distribution',
    shape: 'droplet',
    theme: {
      badge: 'bg-sky-50 border-sky-200 text-sky-950 dark:bg-sky-950/40 dark:border-sky-800/60 dark:text-sky-200',
      avatarBg: 'bg-gradient-to-br from-sky-500 to-blue-600 text-white dark:from-sky-600 dark:to-blue-700',
      iconColor: 'text-sky-600 dark:text-sky-400',
      fillColor: 'text-sky-500/20 dark:text-sky-400/20',
      ringColor: 'ring-sky-500/30',
      chip: 'bg-sky-100/80 text-sky-900 border-sky-300 dark:bg-sky-950/60 dark:text-sky-200 dark:border-sky-800',
    },
    aliases: [
      'water',
      'water works',
      'waterworks',
      'drainage',
      'sewerage',
      'water leakage',
    ],
  },

  [DEPARTMENT_KEYS.CLEANLINESS_SANITATION]: {
    key: DEPARTMENT_KEYS.CLEANLINESS_SANITATION,
    name: 'Cleanliness & Sanitation',
    shortName: 'Sanitation',
    tagline: 'Waste Management & Public Hygiene',
    shape: 'hexagon',
    theme: {
      badge: 'bg-emerald-50 border-emerald-200 text-emerald-950 dark:bg-emerald-950/40 dark:border-emerald-800/60 dark:text-emerald-200',
      avatarBg: 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white dark:from-emerald-600 dark:to-teal-700',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      fillColor: 'text-emerald-500/20 dark:text-emerald-400/20',
      ringColor: 'ring-emerald-500/30',
      chip: 'bg-emerald-100/80 text-emerald-900 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-800',
    },
    aliases: [
      'sanitation',
      'cleanliness',
      'cleanliness & sanitation',
      'cleanliness and sanitation',
      'garbage & sanitation',
      'waste',
      'solid waste',
    ],
  },

  [DEPARTMENT_KEYS.POWER_GRID]: {
    key: DEPARTMENT_KEYS.POWER_GRID,
    name: 'Power & Grid',
    shortName: 'Electricity',
    tagline: 'Electrical Grid & Lighting',
    shape: 'diamond',
    theme: {
      badge: 'bg-violet-50 border-violet-200 text-violet-950 dark:bg-violet-950/40 dark:border-violet-800/60 dark:text-violet-200',
      avatarBg: 'bg-gradient-to-br from-violet-500 to-indigo-600 text-white dark:from-violet-600 dark:to-indigo-700',
      iconColor: 'text-violet-600 dark:text-violet-400',
      fillColor: 'text-violet-500/20 dark:text-violet-400/20',
      ringColor: 'ring-violet-500/30',
      chip: 'bg-violet-100/80 text-violet-900 border-violet-300 dark:bg-violet-950/60 dark:text-violet-200 dark:border-violet-800',
    },
    aliases: [
      'electricity',
      'power',
      'power & grid',
      'power and grid',
      'energy',
      'electrical',
      'streetlight issues',
      'lights',
    ],
  },

  [DEPARTMENT_KEYS.PUBLIC_SAFETY]: {
    key: DEPARTMENT_KEYS.PUBLIC_SAFETY,
    name: 'Public Safety',
    shortName: 'Safety',
    tagline: 'Emergency & Civic Protection',
    shape: 'shield',
    theme: {
      badge: 'bg-rose-50 border-rose-200 text-rose-950 dark:bg-rose-950/40 dark:border-rose-800/60 dark:text-rose-200',
      avatarBg: 'bg-gradient-to-br from-rose-500 to-red-600 text-white dark:from-rose-600 dark:to-red-700',
      iconColor: 'text-rose-600 dark:text-rose-400',
      fillColor: 'text-rose-500/20 dark:text-rose-400/20',
      ringColor: 'ring-rose-500/30',
      chip: 'bg-rose-100/80 text-rose-900 border-rose-300 dark:bg-rose-950/60 dark:text-rose-200 dark:border-rose-800',
    },
    aliases: [
      'public safety',
      'safety',
      'emergency',
      'police',
      'fire',
      'noise pollution',
      'illegal construction',
    ],
  },

  [DEPARTMENT_KEYS.UNASSIGNED]: {
    key: DEPARTMENT_KEYS.UNASSIGNED,
    name: 'Municipal Board',
    shortName: 'Unassigned',
    tagline: 'Pending Department Triage',
    shape: 'circle',
    theme: {
      badge: 'bg-gray-100/80 border-gray-200 text-gray-700 dark:bg-gray-800/60 dark:border-gray-700 dark:text-gray-300',
      avatarBg: 'bg-gradient-to-br from-gray-500 to-slate-600 text-white dark:from-gray-600 dark:to-slate-700',
      iconColor: 'text-gray-500 dark:text-gray-400',
      fillColor: 'text-gray-400/20 dark:text-gray-500/20',
      ringColor: 'ring-gray-400/20',
      chip: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
    },
    aliases: [
      'unassigned',
      'not assigned',
      'none',
      'pending',
      'other',
      '',
    ],
  },
}

/**
 * Category-to-Department default resolution
 */
export const CATEGORY_DEPARTMENT_MAP = {
  'potholes & road damage': DEPARTMENT_KEYS.ROADS_BRIDGES,
  'traffic issues': DEPARTMENT_KEYS.ROADS_BRIDGES,
  'water leakage': DEPARTMENT_KEYS.WATER_WORKS,
  'garbage & sanitation': DEPARTMENT_KEYS.CLEANLINESS_SANITATION,
  'streetlight issues': DEPARTMENT_KEYS.POWER_GRID,
  'noise pollution': DEPARTMENT_KEYS.PUBLIC_SAFETY,
  'illegal construction': DEPARTMENT_KEYS.PUBLIC_SAFETY,
  'other': DEPARTMENT_KEYS.UNASSIGNED,
}

/**
 * Normalizes any department or category input string into a canonical department key.
 *
 * @param {string} [department] - Department string (e.g. 'Roads', 'Water', 'Electricity')
 * @param {string} [category] - Optional category string as fallback if department is empty
 * @returns {string} One of DEPARTMENT_KEYS
 */
export function normalizeDepartmentKey(department, category) {
  if (department && typeof department === 'string') {
    const raw = department.trim().toLowerCase()
    for (const [key, config] of Object.entries(DEPARTMENT_CONFIG)) {
      if (config.aliases.some((alias) => alias.toLowerCase() === raw)) {
        return key
      }
    }
  }

  // Fallback to category if department is not assigned or unrecognized
  if (category && typeof category === 'string') {
    const catRaw = category.trim().toLowerCase()
    if (CATEGORY_DEPARTMENT_MAP[catRaw]) {
      return CATEGORY_DEPARTMENT_MAP[catRaw]
    }
    // Check aliases across departments for category string
    for (const [key, config] of Object.entries(DEPARTMENT_CONFIG)) {
      if (config.aliases.some((alias) => alias.toLowerCase() === catRaw)) {
        return key
      }
    }
  }

  return DEPARTMENT_KEYS.UNASSIGNED
}

/**
 * Returns the full Department config object for given department & category.
 *
 * @param {string} [department]
 * @param {string} [category]
 * @returns {typeof DEPARTMENT_CONFIG[keyof typeof DEPARTMENT_CONFIG]}
 */
export function getDepartmentConfig(department, category) {
  const key = normalizeDepartmentKey(department, category)
  return DEPARTMENT_CONFIG[key] || DEPARTMENT_CONFIG[DEPARTMENT_KEYS.UNASSIGNED]
}

/**
 * Category metadata for avatar icons and badges
 */
export const CATEGORY_CONFIG = {
  'Potholes & Road Damage': {
    name: 'Potholes & Road Damage',
    shortName: 'Road Damage',
    departmentKey: DEPARTMENT_KEYS.ROADS_BRIDGES,
    icon: 'Hammer',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800',
  },
  'Streetlight Issues': {
    name: 'Streetlight Issues',
    shortName: 'Streetlights',
    departmentKey: DEPARTMENT_KEYS.POWER_GRID,
    icon: 'Zap',
    badgeClass: 'bg-violet-50 text-violet-800 border-violet-200 dark:bg-violet-950/40 dark:text-violet-200 dark:border-violet-800',
  },
  'Water Leakage': {
    name: 'Water Leakage',
    shortName: 'Water Leaks',
    departmentKey: DEPARTMENT_KEYS.WATER_WORKS,
    icon: 'Droplets',
    badgeClass: 'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-200 dark:border-sky-800',
  },
  'Garbage & Sanitation': {
    name: 'Garbage & Sanitation',
    shortName: 'Sanitation',
    departmentKey: DEPARTMENT_KEYS.CLEANLINESS_SANITATION,
    icon: 'Sparkles',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800',
  },
  'Noise Pollution': {
    name: 'Noise Pollution',
    shortName: 'Noise',
    departmentKey: DEPARTMENT_KEYS.PUBLIC_SAFETY,
    icon: 'Volume2',
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-800',
  },
  'Illegal Construction': {
    name: 'Illegal Construction',
    shortName: 'Construction',
    departmentKey: DEPARTMENT_KEYS.PUBLIC_SAFETY,
    icon: 'HardHat',
    badgeClass: 'bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-950/40 dark:text-orange-200 dark:border-orange-800',
  },
  'Traffic Issues': {
    name: 'Traffic Issues',
    shortName: 'Traffic',
    departmentKey: DEPARTMENT_KEYS.ROADS_BRIDGES,
    icon: 'Compass',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800',
  },
  'Other': {
    name: 'Other',
    shortName: 'Other',
    departmentKey: DEPARTMENT_KEYS.UNASSIGNED,
    icon: 'HelpCircle',
    badgeClass: 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700',
  },
}

