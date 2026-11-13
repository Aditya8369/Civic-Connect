// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  useCivicGamification,
  syncUserLeaderboardEntry,
  syncUserLeaderboard,
} from './useCivicGamification'

const runtime = vi.hoisted(() => ({
  slots: [],
  cursor: 0,
  effects: [],
  cleanups: [],
  onSnapshotListeners: new Map(),
  getDocsQueries: [],
  setDocCalls: [],
  collectionsQueried: [],
  mockLeaderboardDocs: [],
  mockFiledDocs: [],
  mockEndorsedDocs: [],
  leaderboardReject: false,
}))

vi.mock('react', async (original) => ({
  ...(await original()),
  useState(initial) {
    const index = runtime.cursor++
    if (!(index in runtime.slots)) {
      runtime.slots[index] = typeof initial === 'function' ? initial() : initial
    }
    return [
      runtime.slots[index],
      (value) => {
        runtime.slots[index] =
          typeof value === 'function' ? value(runtime.slots[index]) : value
      },
    ]
  },
  useRef(initial) {
    const index = runtime.cursor++
    return (runtime.slots[index] ||= { current: initial })
  },
  useEffect(effect, deps) {
    const index = runtime.cursor++
    const prevDeps = runtime.slots[index]
    const hasChanged =
      !prevDeps || !deps || deps.some((d, i) => !Object.is(d, prevDeps[i]))
    runtime.slots[index] = deps
    if (hasChanged) {
      runtime.effects.push(effect)
    }
  },
}))

vi.mock('@/firebase/services', () => ({
  db: { name: 'mock-default-db' },
}))

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  collection: (_db, name) => {
    runtime.collectionsQueried.push(name)
    return { type: 'collection', name }
  },
  doc: (_db, col, id) => ({ type: 'doc', col, id, path: `${col}/${id}` }),
  query: (target, ...filters) => ({ type: 'query', target, filters }),
  where: (field, op, val) => ({ type: 'where', field, op, val }),
  orderBy: (field, dir) => ({ type: 'orderBy', field, dir }),
  limit: (count) => ({ type: 'limit', count }),
  serverTimestamp: () => 'SERVER_TIMESTAMP_MOCK',
  setDoc: vi.fn(async (ref, payload, opts) => {
    runtime.setDocCalls.push({ ref, payload, opts })
    return payload
  }),
  getDocs: vi.fn(async (q) => {
    runtime.getDocsQueries.push(q)
    if (runtime.leaderboardReject) {
      throw new Error('Firestore read failed')
    }
    const targetName = q.target?.name || q.name
    if (targetName === 'leaderboard') {
      return {
        empty: runtime.mockLeaderboardDocs.length === 0,
        docs: runtime.mockLeaderboardDocs.map((docData) => ({
          id: docData.uid || docData.id,
          data: () => docData,
        })),
      }
    }
    if (targetName === 'issues') {
      const isFiled = q.filters?.some?.(
        (f) => f.field === 'reportedBy'
      )
      const list = isFiled ? runtime.mockFiledDocs : runtime.mockEndorsedDocs
      return {
        empty: list.length === 0,
        docs: list.map((docData) => ({
          id: docData.id,
          data: () => docData,
        })),
      }
    }
    return { empty: true, docs: [] }
  }),
  onSnapshot: vi.fn((q, onNext, onError) => {
    const key = `${q.target?.name}_${q.filters?.[0]?.field}`
    runtime.onSnapshotListeners.set(key, { onNext, onError })
    return () => {
      runtime.onSnapshotListeners.delete(key)
    }
  }),
}))

function flushEffects() {
  while (runtime.effects.length > 0) {
    const effect = runtime.effects.shift()
    const cleanup = effect()
    if (typeof cleanup === 'function') {
      runtime.cleanups.push(cleanup)
    }
  }
}

function renderHook(hookFn) {
  runtime.cursor = 0
  const result = hookFn()
  flushEffects()
  return result
}

describe('useCivicGamification hook & leaderboard projection', () => {
  const mockDb = { name: 'mock-custom-db' }
  const mockUser = {
    uid: 'citizen-alice-101',
    name: 'Alice Wonder',
    displayName: 'Alice Wonder',
    email: 'alice@example.com',
  }

  beforeEach(() => {
    runtime.slots = []
    runtime.cursor = 0
    runtime.effects = []
    runtime.cleanups = []
    runtime.onSnapshotListeners.clear()
    runtime.getDocsQueries = []
    runtime.setDocCalls = []
    runtime.collectionsQueried = []
    runtime.mockLeaderboardDocs = []
    runtime.mockFiledDocs = []
    runtime.mockEndorsedDocs = []
    runtime.leaderboardReject = false
    vi.clearAllMocks()
  })

  it('returns default initial state and skips subscriptions when user is null', () => {
    const state = renderHook(() => useCivicGamification(null, mockDb))
    expect(state.loading).toBe(false)
    expect(state.leaderboard).toEqual([])
    expect(state.currentUserRank).toBeNull()
    expect(state.stats.totalFiled).toBe(0)
    expect(runtime.onSnapshotListeners.size).toBe(0)
    expect(runtime.setDocCalls.length).toBe(0)
  })

  it('queries leaderboard collection instead of private users collection', async () => {
    runtime.mockLeaderboardDocs = [
      {
        uid: 'citizen-bob-202',
        name: 'Bob Builder',
        monthlyScore: 220,
        allTimeScore: 500,
        badgesCount: 4,
        reportsCount: 5,
      },
    ]

    renderHook(() => useCivicGamification(mockUser, mockDb))

    // Allow async loadLeaderboardParticipants to settle
    await vi.waitFor(() => {
      expect(runtime.getDocsQueries.length).toBeGreaterThan(0)
    })

    // Verify /leaderboard was queried
    const queriedCollections = runtime.collectionsQueried
    expect(queriedCollections).toContain('leaderboard')
    // Verify /users was NEVER queried, preserving citizen confidentiality
    expect(queriedCollections).not.toContain('users')

    // Check query structure has orderBy monthlyScore desc and limit 15
    const leaderboardQuery = runtime.getDocsQueries.find(
      (q) => q.target?.name === 'leaderboard'
    )
    expect(leaderboardQuery).toBeDefined()
    expect(leaderboardQuery.filters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'orderBy', field: 'monthlyScore', dir: 'desc' }),
        expect.objectContaining({ type: 'limit', count: 15 }),
      ])
    )
  })

  it('subscribes to filed and endorsed complaints and computes gamification score', async () => {
    let state = renderHook(() => useCivicGamification(mockUser, mockDb))

    // Deliver complaints snapshot
    const filedListener = runtime.onSnapshotListeners.get('issues_reportedBy')
    expect(filedListener).toBeDefined()

    const filedComplaintsData = [
      {
        id: 'issue-1',
        title: 'Pothole on Main St',
        category: 'Roads',
        status: 'Resolved',
        createdAt: new Date().toISOString(),
        resolvedAt: new Date().toISOString(),
        endorsementCount: 2,
      },
      {
        id: 'issue-2',
        title: 'Broken Streetlight',
        category: 'Electricity',
        status: 'Pending',
        createdAt: new Date().toISOString(),
        endorsementCount: 1,
      },
    ]

    filedListener.onNext({
      docs: filedComplaintsData.map((d) => ({
        id: d.id,
        data: () => d,
      })),
    })

    // Re-render hook with updated snapshot state
    state = renderHook(() => useCivicGamification(mockUser, mockDb))

    expect(state.loading).toBe(false)
    expect(state.stats.totalFiled).toBe(2)
    expect(state.stats.totalResolved).toBe(1)
    expect(state.score.allTimeScore).toBeGreaterThan(0)
    expect(state.score.monthlyScore).toBeGreaterThan(0)
  })

  it('automatically synchronizes current citizen calculated score to /leaderboard/{uid}', async () => {
    // Deliver filed complaints to trigger score computation
    renderHook(() => useCivicGamification(mockUser, mockDb))

    const filedListener = runtime.onSnapshotListeners.get('issues_reportedBy')
    filedListener.onNext({
      docs: [
        {
          id: 'issue-10',
          data: () => ({
            id: 'issue-10',
            title: 'Damaged sidewalk',
            category: 'Pavements',
            status: 'Resolved',
            createdAt: new Date().toISOString(),
            endorsementCount: 0,
          }),
        },
      ],
    })

    // Re-render to trigger sync effect after loading becomes false
    renderHook(() => useCivicGamification(mockUser, mockDb))

    await vi.waitFor(() => {
      expect(runtime.setDocCalls.length).toBeGreaterThan(0)
    })

    const syncCall = runtime.setDocCalls.find(
      (call) => call.ref.id === mockUser.uid && call.ref.col === 'leaderboard'
    )
    expect(syncCall).toBeDefined()
    expect(syncCall.opts).toEqual({ merge: true })
    expect(syncCall.payload).toMatchObject({
      uid: mockUser.uid,
      name: 'Alice Wonder',
      updatedAt: 'SERVER_TIMESTAMP_MOCK',
    })
    expect(syncCall.payload.monthlyScore).toBeGreaterThan(0)
    expect(syncCall.payload.allTimeScore).toBeGreaterThan(0)
    // Ensure no PII fields like email or phone are persisted in public leaderboard
    expect(syncCall.payload.email).toBeUndefined()
    expect(syncCall.payload.phone).toBeUndefined()
    expect(syncCall.payload.fcmTokens).toBeUndefined()
  })

  it('ranks community participants and assigns medals and current user rank', async () => {
    runtime.mockLeaderboardDocs = [
      {
        uid: 'user-top-1',
        name: 'Super Citizen',
        monthlyScore: 500,
        allTimeScore: 1000,
        badgesCount: 5,
        reportsCount: 10,
      },
      {
        uid: 'user-mid-2',
        name: 'Active Resident',
        monthlyScore: 300,
        allTimeScore: 600,
        badgesCount: 3,
        reportsCount: 4,
      },
    ]

    renderHook(() => useCivicGamification(mockUser, mockDb))

    await vi.waitFor(() => {
      expect(runtime.slots[2]?.length).toBeGreaterThan(0)
    })

    const state = renderHook(() => useCivicGamification(mockUser, mockDb))

    expect(state.leaderboard.length).toBe(3) // 2 community + 1 current user
    expect(state.leaderboard[0].name).toBe('Super Citizen')
    expect(state.leaderboard[0].rank).toBe(1)
    expect(state.leaderboard[0].medal).toBe('🥇')
    expect(state.leaderboard[1].name).toBe('Active Resident')
    expect(state.leaderboard[1].rank).toBe(2)
    expect(state.leaderboard[1].medal).toBe('🥈')
    expect(state.currentUserRank).toBe(3)
  })

  it('syncUserLeaderboardEntry writes sanitized projection with serverTimestamp', async () => {
    const payload = await syncUserLeaderboardEntry({
      user: { uid: 'user-77', displayName: 'Diana Prince' },
      score: { monthlyScore: 180, allTimeScore: 450 },
      badgesCount: 3,
      reportsCount: 6,
      customDb: mockDb,
    })

    expect(payload).toEqual({
      uid: 'user-77',
      name: 'Diana Prince',
      monthlyScore: 180,
      allTimeScore: 450,
      badgesCount: 3,
      reportsCount: 6,
      updatedAt: 'SERVER_TIMESTAMP_MOCK',
    })

    expect(runtime.setDocCalls).toContainEqual({
      ref: expect.objectContaining({ path: 'leaderboard/user-77' }),
      payload,
      opts: { merge: true },
    })
  })

  it('syncUserLeaderboardEntry returns null when user has no uid', async () => {
    const result = await syncUserLeaderboardEntry({
      user: null,
      score: { monthlyScore: 100 },
    })
    expect(result).toBeNull()
  })

  it('syncUserLeaderboard computes scores on demand and writes to leaderboard', async () => {
    runtime.mockFiledDocs = [
      {
        id: 'issue-f1',
        status: 'Resolved',
        createdAt: new Date().toISOString(),
        resolvedAt: new Date().toISOString(),
        endorsementCount: 1,
      },
    ]
    runtime.mockEndorsedDocs = []

    const synced = await syncUserLeaderboard({
      user: { uid: 'user-88', name: 'Bruce Wayne' },
      customDb: mockDb,
    })

    expect(synced).toMatchObject({
      uid: 'user-88',
      name: 'Bruce Wayne',
      reportsCount: 1,
      updatedAt: 'SERVER_TIMESTAMP_MOCK',
    })
    expect(synced.monthlyScore).toBeGreaterThan(0)
    expect(synced.allTimeScore).toBeGreaterThan(0)
  })

  it('handles leaderboard query error gracefully without crashing', async () => {
    runtime.leaderboardReject = true
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const state = renderHook(() => useCivicGamification(mockUser, mockDb))

    await vi.waitFor(() => {
      expect(runtime.getDocsQueries.length).toBeGreaterThan(0)
    })

    // Hook does not throw, still renders current user
    expect(state.leaderboard).toBeDefined()
    expect(state.leaderboard.length).toBe(1)
    expect(state.leaderboard[0].uid).toBe(mockUser.uid)

    warnSpy.mockRestore()
  })
})
