
import { useEffect, useState } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'

/**
 * Load Leaflet only after the component has mounted in a browser.
 *
 * Keeping Leaflet out of the module's initial dependency graph prevents
 * Node-based tests and server rendering from importing browser-only code.
 */
export function ComplaintLocationMap(props) {
  const { t } = useLanguage()
  const [MapView, setMapView] = useState(null)

  useEffect(() => {
    let active = true

    import('./ComplaintLocationMapLeaflet.jsx')
      .then(({ ComplaintLocationMapLeaflet: Component }) => {
        if (active) setMapView(() => Component)
      })
      .catch((error) => {
        console.error('Failed to load complaint location map:', error)
      })

    return () => {
      active = false
    }
  }, [])

  if (!MapView) {
    return (
      <div
        role="status"
        aria-label={t('loadingComplaintLocationMap')}
        className={`rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-sm text-gray-500 dark:text-gray-400 ${props.className || ''}`}
        style={{ height: props.height || '280px' }}
      >
        {t('loadingMap')}
      </div>
    )
  }

  return <MapView {...props} />
}

export default ComplaintLocationMap
