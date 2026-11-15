import {
  collection,
  documentId,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  Timestamp,
  where,
} from 'firebase/firestore'
import { db } from './services'
import { isUnconfirmedEmpty } from './snapshot'
import { parseDateInput } from '@/utils/dateRange'

export const REPORTS_PAGE_SIZE = 15

// The Select filter values used by AdminReportsPage mapped to the exact `status`
// strings stored on `issues` documents (see statusVariant / firestore.rules).
export const STATUS_FILTER_TO_FIELD_VALUE = {
  pending: 'Pending',
  'in-progress': 'In Progress',
  resolved: 'Resolved',
  rejected: 'Rejected',
  reopened: 'Reopened',
  'merged - duplicate': 'Merged - Duplicate',
}

/**
 * Builds the Firestore query constraints for one page of the admin reports list.
 * Filters are applied as where() clauses BEFORE the cursor and limit.
 *
 * Ordering is createdAt DESC then document ID DESC, so documents sharing a
 * timestamp still have a total order and no record is skipped or repeated
 * across page boundaries.
 *
 * `cursor` is the last DocumentSnapshot of the previous page (or null).
 * We request one extra document (pageSize + 1) purely to learn whether a next
 * page exists; that extra document is never displayed.
 */
export function buildReportsPageConstraints({
  status = 'all',
  department = 'all',
  category = 'all',
  dateFrom = '',
  dateTo = '',
  cursor = null,
  pageSize = REPORTS_PAGE_SIZE,
} = {}) {
  const constraints = []

  if (status !== 'all') {
    constraints.push(where('status', '==', STATUS_FILTER_TO_FIELD_VALUE[status] ?? status))
  }
  if (department !== 'all') constraints.push(where('department', '==', department))
  if (category !== 'all') constraints.push(where('category', '==', category))

  // Same-field range on createdAt: compatible with orderBy('createdAt') and needs
  // no extra composite index beyond the equality fields.
  const from = parseDateInput(dateFrom)
  const to = parseDateInput(dateTo, { endOfDay: true })
  if (from) constraints.push(where('createdAt', '>=', Timestamp.fromDate(from)))
  if (to) constraints.push(where('createdAt', '<=', Timestamp.fromDate(to)))

  constraints.push(orderBy('createdAt', 'desc'), orderBy(documentId(), 'desc'))
  if (cursor) constraints.push(startAfter(cursor))
  constraints.push(limit(pageSize + 1))

  return constraints
}

function toPage(snapshot, pageSize) {
  const hasMore = snapshot.docs.length > pageSize
  const pageDocs = hasMore ? snapshot.docs.slice(0, pageSize) : snapshot.docs
  return {
    docs: pageDocs.map((d) => ({ id: d.id, ...d.data() })),
    // Last DISPLAYED document: the cursor for the next page. Never the probe document.
    cursor: pageDocs.length ? pageDocs[pageDocs.length - 1] : null,
    hasMore,
  }
}

/**
 * Live subscription to ONE page (at most pageSize + 1 documents are ever read).
 * Keeps the real-time behaviour the page had before (e.g. bulk status changes
 * show up immediately) while bounding the listener to a single page.
 *
 * onPage({ docs, cursor, hasMore }) / onError(err) / onOfflineEmpty() are called
 * as results arrive. Returns the unsubscribe function.
 */
export function subscribeToReportsPage(options, { onPage, onError, onOfflineEmpty }) {
  const pageSize = options.pageSize ?? REPORTS_PAGE_SIZE
  const q = query(collection(db, 'issues'), ...buildReportsPageConstraints({ ...options, pageSize }))
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snapshot) => {
      // Offline with nothing cached yields an empty cache snapshot, not an error.
      if (isUnconfirmedEmpty(snapshot)) {
        onOfflineEmpty?.()
        return
      }
      onPage(toPage(snapshot, pageSize))
    },
    onError
  )
}

/**
 * One-off read of every report matching the SERVER-side filters, for CSV/PDF export.
 * Runs only when the admin clicks export, in pages of `batchSize`, capped at `maxDocs`.
 * Resolves to { docs, truncated }.
 */
export async function fetchAllReportsForExport(
  filters = {},
  { batchSize = 500, maxDocs = 5000 } = {}
) {
  const docs = []
  let cursor = null
  for (;;) {
    const snapshot = await getDocs(
      query(
        collection(db, 'issues'),
        ...buildReportsPageConstraints({ ...filters, cursor, pageSize: batchSize })
      )
    )
    const page = toPage(snapshot, batchSize)
    docs.push(...page.docs)
    if (!page.hasMore) return { docs, truncated: false }
    if (docs.length >= maxDocs) return { docs, truncated: true }
    cursor = page.cursor
  }
}

/**
 * Reads every report matching the server-side filters for a complete client-side
 * search. Unlike exports, search results must not be silently capped.
 */
export async function fetchAllReportsForSearch(
  filters = {},
  { batchSize = 500 } = {}
) {
  const docs = []
  let cursor = null

  for (;;) {
    const snapshot = await getDocs(
      query(
        collection(db, 'issues'),
        ...buildReportsPageConstraints({ ...filters, cursor, pageSize: batchSize })
      )
    )
    const page = toPage(snapshot, batchSize)
    docs.push(...page.docs)
    if (!page.hasMore) return docs
    cursor = page.cursor
  }
}
