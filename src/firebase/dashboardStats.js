import {
  average,
  collection,
  count,
  getAggregateFromServer,
  getCountFromServer,
  query,
  where,
} from 'firebase/firestore'
import { db } from './services'
import { DEPARTMENT_WORKLOAD_THRESHOLD, OPEN_TICKET_STATUSES } from '@/utils/departmentWorkload'

// The dashboard's live widgets (recent list, map, SLA badge counts) only ever need
// the newest reports, so their listener is capped to this window instead of the
// whole `issues` collection.
export const DASHBOARD_WINDOW_SIZE = 200

// Same department list the app uses when assigning reports (BulkActionsToolbar / reports filter).
export const WORKLOAD_DEPARTMENTS = ['Roads', 'Sanitation', 'Electricity', 'Water', 'Public Safety']

export const DASHBOARD_REFRESH_INTERVAL_MS = 60_000
const REFRESH_DEBOUNCE_MS = 1_000

const issues = () => collection(db, 'issues')

async function countWhere(...constraints) {
  const snap = await getCountFromServer(query(issues(), ...constraints))
  return snap.data().count
}

/**
 * Whole-collection numbers computed by Firestore itself (count / average aggregations
 * bill roughly one read per 1,000 index entries) instead of downloading every document.
 * All queries use equality / `in` filters or a single-field range, so none needs a
 * composite index.
 */
export async function fetchDashboardAggregates() {
  const [total, pendingOnly, reopened, inProgress, resolved, ratings, ...departmentCounts] =
    await Promise.all([
      getCountFromServer(issues()).then((s) => s.data().count),
      countWhere(where('status', '==', 'Pending')),
      countWhere(where('status', '==', 'Reopened')),
      countWhere(where('status', '==', 'In Progress')),
      countWhere(where('status', '==', 'Resolved')),
      getAggregateFromServer(query(issues(), where('feedback.rating', '>', 0)), {
        ratedCount: count(),
        avgRating: average('feedback.rating'),
      }).then((s) => s.data()),
      ...WORKLOAD_DEPARTMENTS.map((department) =>
        countWhere(where('department', '==', department), where('status', 'in', OPEN_TICKET_STATUSES))
      ),
    ])

  const workload = WORKLOAD_DEPARTMENTS.map((department, i) => ({
    department,
    count: departmentCounts[i],
    isOverCapacity: departmentCounts[i] > DEPARTMENT_WORKLOAD_THRESHOLD,
  }))
    .filter(({ count: n }) => n > 0)
    .sort((a, b) => b.count - a.count || a.department.localeCompare(b.department))

  return {
    total,
    // Matches the dashboard's existing definition: Reopened tickets count as pending.
    pending: pendingOnly + reopened,
    inProgress,
    resolved,
    ratedCount: ratings.ratedCount,
    avgRating: ratings.ratedCount > 0 ? ratings.avgRating : null,
    workload,
  }
}

/**
 * Loads the aggregates now, then keeps them fresh: every `intervalMs`, and whenever
 * the caller invokes refresh() (debounced) because the live window just changed.
 * Responses that arrive after stop() or that were superseded are discarded.
 */
export function startDashboardAggregates(
  { onData, onError },
  { intervalMs = DASHBOARD_REFRESH_INTERVAL_MS, fetcher = fetchDashboardAggregates } = {}
) {
  let stopped = false
  let requestId = 0
  let debounceTimer = null

  const load = async () => {
    const id = ++requestId
    try {
      const data = await fetcher()
      if (!stopped && id === requestId) onData(data)
    } catch (err) {
      if (!stopped && id === requestId) onError(err)
    }
  }

  load()
  const interval = setInterval(load, intervalMs)

  return {
    refresh() {
      if (stopped) return
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(load, REFRESH_DEBOUNCE_MS)
    },
    stop() {
      stopped = true
      clearInterval(interval)
      clearTimeout(debounceTimer)
    },
  }
}
