import { beforeEach, expect, it, vi } from 'vitest'
import { Navigate } from 'react-router-dom'
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile } from 'firebase/auth'
import { getDoc, setDoc } from 'firebase/firestore'
import { ProtectedRoute } from '@/components/common/ProtectedRoute'
import { AuthProvider } from './AuthContext'

const runtime = vi.hoisted(() => ({
  auth: { currentUser: null }, context: null, observer: null, unsubscribe: vi.fn(),
  slots: [], cursor: 0, effect: null, cleanup: null, publications: 0,
}))

// Run the real provider and route guard. The harness controls effect lifetime
// and state so profile requests can finish in a precise order without a DOM.
vi.mock('react', async original => ({
  ...await original(),
  useState(initial) {
    const index = runtime.cursor++
    if (!(index in runtime.slots)) runtime.slots[index] = typeof initial === 'function' ? initial() : initial
    return [runtime.slots[index], value => {
      runtime.publications++
      runtime.slots[index] = typeof value === 'function' ? value(runtime.slots[index]) : value
    }]
  },
  useRef(initial) {
    const index = runtime.cursor++
    return runtime.slots[index] ||= { current: initial }
  },
  useEffect(effect) { runtime.effect = effect },
  useCallback(callback) { return callback },
  useContext() { return runtime.context },
}))

vi.mock('react-router-dom', () => ({
  Navigate: () => null, useLocation: () => ({ pathname: '/dashboard' }),
}))
vi.mock('@/firebase/services', () => ({ auth: runtime.auth, db: {} }))
vi.mock('firebase/auth', () => {
  const subscribe = (_auth, callback) => {
    runtime.observer = callback
    return () => {
      runtime.unsubscribe()
      if (runtime.observer === callback) runtime.observer = null
    }
  }
  return {
    onAuthStateChanged: subscribe, onIdTokenChanged: subscribe,
    signInWithEmailAndPassword: vi.fn(), createUserWithEmailAndPassword: vi.fn(),
    signOut: vi.fn(), updateProfile: vi.fn(), sendPasswordResetEmail: vi.fn(),
  }
})
vi.mock('firebase/firestore', () => ({
  doc: (_db, ...segments) => segments.join('/'),
  getDoc: vi.fn(), setDoc: vi.fn(), serverTimestamp: () => 'server-time',
}))

function account(uid, name = uid) {
  return { uid, email: `${uid}@example.test`, displayName: name }
}

function profile(role) {
  return { exists: () => role !== undefined, data: () => ({ role }) }
}

function deferred() {
  let resolve, reject
  const promise = new Promise((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

function context() {
  runtime.cursor = 0
  runtime.context = AuthProvider({ children: null }).props.value
  return runtime.context
}

function route(requiredRole = 'citizen') {
  context()
  const result = ProtectedRoute({ children: 'protected content', requiredRole })
  if (result.type === Navigate) return result.props.to
  return typeof result === 'string' ? result : 'loading'
}

function emit(user) {
  runtime.auth.currentUser = user
  return runtime.observer(user)
}

function queueRead() {
  const read = deferred()
  getDoc.mockReturnValueOnce(read.promise)
  return read
}

function expectSignedOut() {
  expect(context()).toMatchObject({ user: null, loading: false, isAuthenticated: false, authInitialized: true })
  expect(route()).toBe('/auth')
}

beforeEach(() => {
  vi.resetAllMocks()
  runtime.auth.currentUser = null
  runtime.slots = []
  runtime.publications = 0
  getDoc.mockResolvedValue(profile('citizen'))
  signOut.mockImplementation(async () => { emit(null) })
  context()
  runtime.cleanup = runtime.effect()
})

it.each(['resolves', 'rejects'])('keeps the signed-out route when an old profile read %s', async outcome => {
  const read = queueRead()
  const pending = emit(account('a'))
  await context().logout()
  expectSignedOut()
  if (outcome === 'resolves') read.resolve(profile('citizen'))
  else read.reject(new Error('stale lookup failed'))
  await pending
  expectSignedOut()
})

it.each(['before', 'after'])('ignores A when it completes %s B', async order => {
  const a = queueRead(), b = queueRead()
  const previous = emit(account('a'))
  const current = emit(account('b'))
  if (order === 'before') {
    a.resolve(profile('admin'))
    await previous
    expect(context()).toMatchObject({ user: null, loading: true })
    expect(route('admin')).toBe('loading')
  }
  b.resolve(profile('citizen'))
  await current
  if (order === 'after') {
    a.resolve(profile('admin'))
    await previous
  }
  expect(runtime.auth.currentUser.uid).toBe('b')
  expect(context().user).toMatchObject({ uid: 'b', role: 'citizen' })
  expect(route()).toBe('protected content')
  expect(route('admin')).toBe('/dashboard')
})

it('ignores stale failure during the next account’s loading state', async () => {
  const a = queueRead(), b = queueRead()
  const previous = emit(account('a'))
  const current = emit(account('b'))
  a.reject(new Error('old lookup failed'))
  await previous
  expect(context()).toMatchObject({ user: null, loading: true })
  b.resolve(profile('admin'))
  await current
  expect(context().user).toMatchObject({ uid: 'b', role: 'admin' })
  expect(route('admin')).toBe('protected content')
})

it('ignores an old session after signing out and back into the same UID', async () => {
  const a1 = queueRead(), a2 = queueRead()
  const previous = emit(account('a', 'Old name'))
  await context().logout()
  const current = emit(account('a', 'New name'))
  a2.resolve(profile('citizen'))
  await current
  a1.resolve(profile('admin'))
  await previous
  expect(context().user).toMatchObject({ uid: 'a', name: 'New name', role: 'citizen' })
  expect(route('admin')).toBe('/dashboard')
})

it('uses the latest of three auth sessions and shares a read for duplicate notifications', async () => {
  const a = queueRead(), b = queueRead(), c = queueRead()
  const first = emit(account('a'))
  const second = emit(account('b'))
  const latestUser = account('c')
  const latest = emit(latestUser)
  const duplicate = emit(latestUser)
  a.resolve(profile('admin'))
  b.resolve(profile('admin'))
  await Promise.all([first, second])
  expect(context()).toMatchObject({ user: null, loading: true })
  c.resolve(profile('citizen'))
  await Promise.all([latest, duplicate])
  await emit(latestUser)
  expect(context().user).toMatchObject({ uid: 'c', role: 'citizen' })
  expect(getDoc.mock.calls).toEqual([['users/a'], ['users/b'], ['users/c']])
})

it('hides a previously hydrated role as soon as a replacement starts loading', async () => {
  getDoc.mockResolvedValueOnce(profile('admin'))
  await emit(account('a'))
  expect(route('admin')).toBe('protected content')
  const b = queueRead()
  const current = emit(account('b'))
  expect(context()).toMatchObject({ user: null, loading: true })
  expect(route('admin')).toBe('loading')
  b.resolve(profile('citizen'))
  await current
  expect(route('admin')).toBe('/dashboard')
})

it('ignores a profile completion while Firebase sign-out is still pending', async () => {
  const read = queueRead(), firebaseSignOut = deferred()
  signOut.mockImplementationOnce(() => firebaseSignOut.promise)
  const profilePending = emit(account('a'))
  const signingOut = context().logout()
  read.resolve(profile('admin'))
  await profilePending
  expect(context().user).toBeNull()
  await emit(null)
  firebaseSignOut.resolve()
  await signingOut
  expectSignedOut()
})

it('recovers the current session if Firebase rejects sign-out', async () => {
  const user = account('a')
  await emit(user)
  const error = new Error('sign-out failed')
  signOut.mockRejectedValueOnce(error)
  await expect(context().logout()).rejects.toBe(error)
  // The replacement hydration runs asynchronously after the failed sign-out.
  await emit(user)
  expect(context()).toMatchObject({ user: { uid: 'a', role: 'citizen' }, loading: false })
})

it('prevents an explicit login lookup from publishing after logout', async () => {
  const user = account('a'), read = queueRead()
  signInWithEmailAndPassword.mockImplementationOnce(async () => {
    runtime.auth.currentUser = user
    return { user }
  })
  const login = context().login(user.email, 'test-password')
  const result = login.catch(error => error)
  await Promise.resolve()
  expect(getDoc).toHaveBeenCalledWith('users/a')
  await context().logout()
  read.resolve(profile('citizen'))
  expectSignedOut()
  expect(await result).toMatchObject({ code: 'auth/session-changed' })
  expectSignedOut()
})

it('returns the same hydrated profile to login and the observer', async () => {
  const user = account('a'), read = queueRead()
  signInWithEmailAndPassword.mockImplementationOnce(async () => {
    emit(user)
    return { user }
  })
  const login = context().login(user.email, 'test-password')
  read.resolve(profile('admin'))
  const result = await login
  expect(result).toMatchObject({ uid: 'a', role: 'admin' })
  expect(context().user).toEqual(result)
  expect(route('admin')).toBe('protected content')
  expect(getDoc).toHaveBeenCalledTimes(1)
})

it('keeps the profile-read fallback while reporting a current login failure', async () => {
  const user = account('a')
  const error = new Error('could not read profile')
  getDoc.mockRejectedValueOnce(error)
  signInWithEmailAndPassword.mockImplementationOnce(async () => { emit(user); return { user } })
  await expect(context().login(user.email, 'test-password')).rejects.toBe(error)
  expect(context()).toMatchObject({ user: { uid: 'a', role: 'citizen' }, loading: false })
})

it.each(['login', 'register'])('preserves a current Firebase %s failure', async operation => {
  await emit(null)
  const error = new Error('credential request failed')
  const api = operation === 'login' ? signInWithEmailAndPassword : createUserWithEmailAndPassword
  api.mockRejectedValueOnce(error)
  const { login, register } = context()
  const result = operation === 'login' ? login('a@example.test', 'test-password') : register({ email: 'a@example.test' })
  await expect(result).rejects.toBe(error)
  expectSignedOut()
})

it.each(['resolves', 'rejects'])('ignores an obsolete registration write that %s', async outcome => {
  const user = account('a'), write = deferred()
  createUserWithEmailAndPassword.mockImplementationOnce(async () => { emit(user); return { user } })
  setDoc.mockReturnValueOnce(write.promise)
  const registration = context().register({ name: 'New account', email: user.email, password: 'test-password' })
  const result = registration.catch(error => error)
  await new Promise(setImmediate)
  expect(setDoc).toHaveBeenCalledOnce()
  await emit(account('b'))
  if (outcome === 'resolves') write.resolve()
  else write.reject(new Error('stale registration write failed'))
  expect(await result).toMatchObject({ code: 'auth/session-changed' })
  expect(context().user.uid).toBe('b')
})

it('keeps the registration error and releases loading when a current profile write fails', async () => {
  const user = account('a')
  const error = new Error('profile write failed')
  createUserWithEmailAndPassword.mockImplementationOnce(async () => { emit(user); return { user } })
  setDoc.mockRejectedValueOnce(error)
  await expect(context().register({ name: 'A', email: user.email })).rejects.toBe(error)
  await emit(user)
  expect(context()).toMatchObject({ user: { uid: 'a', role: 'citizen' }, loading: false })
})

it('publishes the registered profile after its writes complete', async () => {
  const user = account('a'), write = deferred()
  createUserWithEmailAndPassword.mockImplementationOnce(async () => { emit(user); return { user } })
  updateProfile.mockImplementationOnce(async (current, { displayName }) => { current.displayName = displayName })
  setDoc.mockReturnValueOnce(write.promise)
  const registration = context().register({ name: 'New account', email: user.email, password: 'test-password' })
  await new Promise(setImmediate)
  expect(route()).toBe('loading')
  expect(setDoc).toHaveBeenCalledWith('users/a', {
    name: 'New account', email: user.email, role: 'citizen', createdAt: 'server-time',
  })
  write.resolve()
  const result = await registration
  expect(result).toMatchObject({ uid: 'a', name: 'New account', role: 'citizen' })
  expect(context().user).toEqual(result)
  expect(route()).toBe('protected content')
})

it('preserves profile persistence without applying a stale rename to the next session', async () => {
  await emit(account('a'))
  const write = deferred()
  setDoc.mockReturnValueOnce(write.promise)
  const save = context().updateUserProfile({ name: 'New A', phone: '1234567', address: 'Main Street' })
  const completion = save.catch(error => error)
  expect(setDoc).toHaveBeenCalledWith('users/a', {
    name: 'New A', phone: '1234567', address: 'Main Street', updatedAt: 'server-time',
  }, { merge: true })
  await emit(account('b'))
  write.resolve()
  await completion
  expect(context().user).toMatchObject({ uid: 'b', name: 'b', role: 'citizen' })
})

it('updates the current user’s display name without changing their role', async () => {
  const user = account('a')
  getDoc.mockResolvedValueOnce(profile('admin'))
  await emit(user)
  await context().updateUserProfile({ name: 'New A', phone: '1234567', address: 'Main Street' })
  expect(updateProfile).toHaveBeenCalledWith(user, { displayName: 'New A' })
  expect(context().user).toMatchObject({ uid: 'a', name: 'New A', role: 'admin' })
})

it.each([
  ['a missing profile', () => getDoc.mockResolvedValueOnce(profile()), 'citizen'],
  ['a failed profile read', () => getDoc.mockRejectedValueOnce(new Error('offline')), 'citizen'],
  ['an admin profile', () => getDoc.mockResolvedValueOnce(profile('admin')), 'admin'],
])('restores a session with %s', async (_name, arrange, role) => {
  expect(route()).toBe('loading')
  arrange()
  await emit(account('a'))
  expect(context()).toMatchObject({ user: { uid: 'a', role }, loading: false, authInitialized: true })
  expect(route(role)).toBe('protected content')
})

it('unsubscribes and prevents profile publications after cleanup', async () => {
  const read = queueRead()
  const pending = emit(account('a'))
  runtime.cleanup()
  const before = runtime.publications
  read.resolve(profile('admin'))
  await pending
  expect(runtime.observer).toBeNull()
  expect(runtime.unsubscribe).toHaveBeenCalledOnce()
  expect(runtime.publications).toBe(before)
})

it('isolates an effect replay from the previous effect for the same Firebase user', async () => {
  const a1 = queueRead(), a2 = queueRead()
  const user = account('a')
  const oldEffect = emit(user)
  runtime.cleanup()
  runtime.effect()
  const newEffect = emit(user)
  a2.resolve(profile('citizen'))
  await newEffect
  a1.resolve(profile('admin'))
  await oldEffect
  expect(runtime.unsubscribe).toHaveBeenCalledOnce()
  expect(context().user).toMatchObject({ uid: 'a', role: 'citizen' })
})
