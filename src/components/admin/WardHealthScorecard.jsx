import { useState, useMemo } from 'react'
import {
  Activity,
  Award,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Layers,
  MapPin,
  TrendingUp,
  Building,
  RotateCcw,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  calculateWardHealthScorecards,
  exportWardScorecardsCsv,
} from '@/utils/wardHealthScorecard'
import { getNormalizedWards } from '@/utils/wardBoundaries'
import { MapContainer, TileLayer, Polygon, Tooltip, Popup, Marker } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import toast from 'react-hot-toast'

const DEFAULT_CATEGORIES = [
  'All',
  'Potholes & Road Damage',
  'Streetlight Issues',
  'Water Leakage',
  'Garbage & Sanitation',
  'Noise Pollution',
  'Illegal Construction',
  'Traffic Issues',
  'Other',
]

export function WardHealthScorecard({ complaints = [] }) {
  const [timeWindow, setTimeWindow] = useState('90') // default last 90 days
  const [category, setCategory] = useState('All')
  const [resolutionSpeed, setResolutionSpeed] = useState('all')
  const [selectedWardId, setSelectedWardId] = useState(null)
  const [exportingPdf, setExportingPdf] = useState(false)

  const wards = useMemo(() => getNormalizedWards(), [])

  // Derive available categories dynamically
  const availableCategories = useMemo(() => {
    const set = new Set(DEFAULT_CATEGORIES)
    if (Array.isArray(complaints)) {
      for (const c of complaints) {
        if (c?.category) set.add(c.category)
      }
    }
    return Array.from(set)
  }, [complaints])

  const { wardScorecards, citywideSummary, filteredComplaints } = useMemo(() => {
    return calculateWardHealthScorecards(complaints, wards, {
      timeWindow,
      category,
      resolutionSpeed,
    })
  }, [complaints, wards, timeWindow, category, resolutionSpeed])

  const handleExportCsv = () => {
    try {
      exportWardScorecardsCsv(wardScorecards, { timeWindow, category, resolutionSpeed })
      toast.success('Ward Infrastructure Health CSV exported')
    } catch (err) {
      console.error('CSV export error:', err)
      toast.error('Could not export CSV')
    }
  }

  const handleExportPdf = async () => {
    setExportingPdf(true)
    try {
      const { downloadWardScorecardsPdf } = await import('@/utils/wardScorecardPdf')
      downloadWardScorecardsPdf({
        wardScorecards,
        citywideSummary,
        filters: { timeWindow, category, resolutionSpeed },
      })
      toast.success('Ward Executive Summary PDF exported')
    } catch (err) {
      console.error('PDF export error:', err)
      toast.error('Could not export PDF summary')
    } finally {
      setExportingPdf(false)
    }
  }

  const handleResetFilters = () => {
    setTimeWindow('all')
    setCategory('All')
    setResolutionSpeed('all')
  }

  const mapCenter = [28.6139, 77.209]

  return (
    <div className="space-y-6">
      {/* Analytics & Predictive Filters Toolbar */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
              {/* Time Window Filter */}
              <div>
                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-1">
                  Time Window
                </label>
                <select
                  data-testid="filter-time-window"
                  value={timeWindow}
                  onChange={(e) => setTimeWindow(e.target.value)}
                  className="flex h-9 w-full rounded-lg border border-gray-300 bg-white px-3 py-1 text-xs focus:border-primary-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                >
                  <option value="30">Last 30 Days</option>
                  <option value="90">Last 90 Days (Quarterly)</option>
                  <option value="365">Last 365 Days (Annual)</option>
                  <option value="all">All Time History</option>
                </select>
              </div>

              {/* Category Filter */}
              <div>
                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-1">
                  Infrastructure Category
                </label>
                <select
                  data-testid="filter-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="flex h-9 w-full rounded-lg border border-gray-300 bg-white px-3 py-1 text-xs focus:border-primary-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                >
                  {availableCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              {/* Resolution Speed Filter */}
              <div>
                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-1">
                  Resolution Speed
                </label>
                <select
                  data-testid="filter-resolution-speed"
                  value={resolutionSpeed}
                  onChange={(e) => setResolutionSpeed(e.target.value)}
                  className="flex h-9 w-full rounded-lg border border-gray-300 bg-white px-3 py-1 text-xs focus:border-primary-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                >
                  <option value="all">All Resolution Speeds</option>
                  <option value="fast">Fast Response (&lt; 24h)</option>
                  <option value="standard">Standard Response (24 - 72h)</option>
                  <option value="slow">Slow / Breached (&gt; 72h)</option>
                </select>
              </div>
            </div>

            {/* Export and Action Controls */}
            <div className="flex flex-wrap items-center gap-2 pt-1 lg:pt-4">
              {(timeWindow !== 'all' || category !== 'All' || resolutionSpeed !== 'all') && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleResetFilters}
                  className="h-9 text-xs gap-1 text-gray-600 dark:text-gray-400"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset
                </Button>
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="export-scorecards-csv-btn"
                onClick={handleExportCsv}
                className="h-9 text-xs gap-1.5"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                Export CSV
              </Button>

              <Button
                type="button"
                size="sm"
                data-testid="export-scorecards-pdf-btn"
                onClick={handleExportPdf}
                disabled={exportingPdf}
                className="h-9 text-xs gap-1.5 bg-primary-600 hover:bg-primary-700 text-white"
              >
                <FileText className="w-3.5 h-3.5" />
                {exportingPdf ? 'Generating PDF...' : 'Executive PDF Summary'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Executive KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  Municipal Health Score
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                  {citywideSummary.citywideHealthScore}
                  <span className="text-xs font-normal text-gray-500 ml-1">/ 100</span>
                </p>
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 font-medium">
                  {citywideSummary.citywideHealthScore >= 80 ? 'Grade A - Optimal' : 'Grade B - Stable'}
                </p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 dark:bg-primary-900/40 text-primary-600">
                <Activity className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  Avg Resolution Time (ART)
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                  {citywideSummary.averageResolutionTimeHours}
                  <span className="text-xs font-normal text-gray-500 ml-1">hrs</span>
                </p>
                <p className="text-[11px] text-gray-500 mt-1">
                  {citywideSummary.resolvedComplaints} tickets resolved
                </p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/40 text-blue-600">
                <Clock className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  SLA Compliance Rate
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                  {citywideSummary.slaComplianceRate}%
                </p>
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 font-medium">
                  Citywide Target &gt; 85%
                </p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  Citizen Satisfaction (CSI)
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                  {citywideSummary.citizenSatisfactionStars}
                  <span className="text-xs font-normal text-gray-500 ml-1">/ 5.0</span>
                </p>
                <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 font-medium">
                  ★ Verified Citizen Reviews
                </p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-900/40 text-amber-600">
                <Award className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Interactive Predictive Heatmap & Ward Boundary GIS Map */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary-600" />
                Predictive Civic Heatmap & Ward Health Cartography
              </CardTitle>
              <CardDescription className="text-xs">
                Density clustering and color-coded ward infrastructure grades (Green: Grade A, Blue: Grade B, Amber: Grade C, Red: Grade D)
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Grade A (&ge;85)
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Grade B (70-84)
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Grade C (55-69)
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Grade D (&lt;55)
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div
            data-testid="predictive-heatmap-canvas"
            className="h-80 w-full rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800"
          >
            <MapContainer
              center={mapCenter}
              zoom={12}
              scrollWheelZoom={false}
              style={{ width: '100%', height: '100%' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {wardScorecards.map((w) => {
                const isSelected = selectedWardId === w.wardId
                return (
                  <Polygon
                    key={w.wardId}
                    positions={w.positions}
                    pathOptions={{
                      color: w.healthColor,
                      fillColor: w.healthColor,
                      fillOpacity: isSelected ? 0.45 : 0.22,
                      weight: isSelected ? 4 : 2.5,
                      dashArray: isSelected ? '10 5' : '6 4',
                    }}
                    eventHandlers={{
                      click: () => setSelectedWardId(w.wardId),
                    }}
                    data-testid="heatmap-ward-polygon"
                  >
                    <Tooltip sticky direction="top">
                      <div className="p-1 space-y-0.5 text-xs text-stone-900">
                        <p className="font-bold text-stone-950">
                          {w.wardId}: {w.wardName}
                        </p>
                        <p className="text-[11px] font-semibold" style={{ color: w.healthColor }}>
                          Grade {w.healthGrade} Health Score: {w.healthScore}/100
                        </p>
                        <p className="text-[10px] text-stone-600">
                          ART: {w.averageResolutionTimeHours}h | SLA: {w.slaComplianceRate}%
                        </p>
                      </div>
                    </Tooltip>
                    <Popup minWidth={260}>
                      <div className="p-2 space-y-2 border-l-4" style={{ borderLeftColor: w.healthColor }}>
                        <div className="flex items-center justify-between border-b pb-1">
                          <span className="font-mono font-bold text-xs">{w.wardId}</span>
                          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-gray-100">
                            Grade {w.healthGrade} ({w.healthScore}/100)
                          </span>
                        </div>
                        <h4 className="font-bold text-sm text-stone-900 leading-snug">{w.wardName}</h4>
                        <div className="text-xs space-y-1 text-stone-700">
                          <p>Total Complaints: {w.totalIssues} ({w.resolvedIssues} Resolved)</p>
                          <p>Avg Resolution Time: {w.averageResolutionTimeHours} hrs</p>
                          <p>SLA Compliance: {w.slaComplianceRate}%</p>
                          <p>Citizen Satisfaction: {w.citizenSatisfactionStars} / 5.0</p>
                          <p className="text-amber-800 font-medium">Budget: {w.budgetPriority}</p>
                        </div>
                      </div>
                    </Popup>
                  </Polygon>
                )
              })}
            </MapContainer>
          </div>
        </CardContent>
      </Card>

      {/* Ward Infrastructure Health Scorecards Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Building className="w-4 h-4 text-primary-600" />
            Ward Infrastructure Health Scorecards ({wardScorecards.length} Wards)
          </h3>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Ranked by Budget Intervention Priority
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {wardScorecards.map((w) => (
            <Card
              key={w.wardId}
              data-testid="ward-scorecard-card"
              className={`border-l-4 transition-all hover:shadow-md ${
                selectedWardId === w.wardId ? 'ring-2 ring-primary-500' : ''
              }`}
              style={{ borderLeftColor: w.healthColor }}
            >
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border">
                        {w.wardId}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{w.zoneName}</span>
                    </div>
                    <h4 className="font-bold text-sm text-gray-900 dark:text-white mt-1">
                      {w.wardName}
                    </h4>
                  </div>
                  <div
                    className="flex flex-col items-end px-3 py-1.5 rounded-lg border text-right"
                    style={{
                      borderColor: `${w.healthColor}60`,
                      backgroundColor: `${w.healthColor}15`,
                    }}
                  >
                    <span className="text-xs font-bold" style={{ color: w.healthColor }}>
                      Grade {w.healthGrade}
                    </span>
                    <span className="text-lg font-black text-gray-900 dark:text-white leading-none">
                      {w.healthScore}
                      <span className="text-xs font-normal text-gray-400">/100</span>
                    </span>
                  </div>
                </div>

                {/* Metrics Matrix */}
                <div className="grid grid-cols-3 gap-2 py-2 border-y border-gray-100 dark:border-gray-800 text-center">
                  <div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">Avg Resolution</p>
                    <p className="text-sm font-bold text-gray-900 dark:text-white mt-0.5">
                      {w.averageResolutionTimeHours}h
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">SLA Compliance</p>
                    <p className="text-sm font-bold text-gray-900 dark:text-white mt-0.5">
                      {w.slaComplianceRate}%
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">Satisfaction</p>
                    <p className="text-sm font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                      ★ {w.citizenSatisfactionStars}
                    </p>
                  </div>
                </div>

                {/* Budget Recommendation & Backlog Details */}
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Budget Priority:</span>
                    <span className="font-semibold text-gray-900 dark:text-gray-200">
                      {w.budgetPriority}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Primary Backlog:</span>
                    <span className="font-medium text-stone-700 dark:text-stone-300">
                      {w.topCategory}
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-600 dark:text-stone-400 bg-stone-50 dark:bg-stone-900/60 p-2 rounded border border-dashed border-stone-200 dark:border-stone-800 mt-2">
                    💡 <span className="font-semibold">Allocation Advice:</span> {w.budgetRecommendation}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}

export default WardHealthScorecard
