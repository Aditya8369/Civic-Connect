import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onIdTokenChanged,
  updateProfile,
  sendPasswordResetEmail,
} from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '@/firebase/services'

const AuthContext = createContext(null)

function formatFirebaseUser(firebaseUser, role) {
  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
    role: role || 'citizen',
  }
}

function sessionChanged() {
  return Object.assign(new Error('The authentication session changed'), { code: 'auth/session-changed' })
}

async function readRole(firebaseUser, registration) {
  // The observer can run before registration receives its credential. Wait for
  // that account's profile write instead of hydrating from a missing document.
  if (registration && (registration.firebaseUser
    ? registration.firebaseUser === firebaseUser
    : registration.email === firebaseUser.email?.toLowerCase())) {
    const result = await registration.result.catch(() => null)
    if (result?.firebaseUser === firebaseUser) return result.role
    if (auth.currentUser !== firebaseUser) return undefined
  }
  const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid))
  return userDoc.exists() ? userDoc.data().role : 'citizen'
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authInitialized, setAuthInitialized] = useState(false)
  const lifetime = useRef(null)

  const isCurrent = useCallback((active, session) => {
    return !!session && lifetime.current === active && active.session === session
      && auth.currentUser === session.firebaseUser
  }, [])

  const startSession = useCallback((active, firebaseUser) => {
    if (!active || lifetime.current !== active || active.signOut || auth.currentUser !== firebaseUser) return null
    if (active.session?.firebaseUser === firebaseUser) return active.session

    // User object identity distinguishes sign-ins with the same UID. The
    // session object also invalidates pending work immediately on local logout.
    const session = { firebaseUser, profile: null }
    active.session = session
    setUser(null)
    setLoading(!!firebaseUser)
    if (!firebaseUser) {
      setAuthInitialized(true)
      return session
    }

    session.profile = (async () => {
      let role, failure
      try {
        role = await readRole(firebaseUser, active.registration)
      } catch (error) {
        failure = { error }
      }
      if (!isCurrent(active, session)) return null
      const hydrated = formatFirebaseUser(firebaseUser, role)
      setUser(hydrated)
      setLoading(false)
      setAuthInitialized(true)
      return { user: hydrated, failure }
    })()
    return session
  }, [isCurrent])

  useEffect(() => {
    const active = { session: null, signOut: null, registration: null }
    lifetime.current = active
    // Unlike onAuthStateChanged, this also notifies for a new sign-in with the
    // same UID. startSession reuses hydration on ordinary token refreshes.
    const unsubscribe = onIdTokenChanged(auth, firebaseUser => startSession(active, firebaseUser)?.profile)
    return () => {
      lifetime.current = null
      unsubscribe()
    }
  }, [startSession])

  const currentProfile = useCallback(async (active, firebaseUser) => {
    const session = startSession(active, firebaseUser)
    const result = await session?.profile
    if (!result || !isCurrent(active, session)) throw sessionChanged()
    if (result.failure) throw result.failure.error
    return result.user
  }, [isCurrent, startSession])

  const login = useCallback(async (email, password) => {
    const active = lifetime.current
    const cred = await signInWithEmailAndPassword(auth, email, password)
    return currentProfile(active, cred.user)
  }, [currentProfile])

  const register = useCallback(async ({ name, email, password, role = 'citizen' }) => {
    const active = lifetime.current
    if (!active) throw sessionChanged()
    const registration = { email: email.trim().toLowerCase(), firebaseUser: null }
    active.registration = registration
    registration.result = Promise.resolve().then(async () => {
      const { user: firebaseUser } = await createUserWithEmailAndPassword(auth, email, password)
      registration.firebaseUser = firebaseUser
      const session = startSession(active, firebaseUser)
      if (!isCurrent(active, session)) throw sessionChanged()
      try {
        await updateProfile(firebaseUser, { displayName: name })
        if (!isCurrent(active, session)) throw sessionChanged()
        await setDoc(doc(db, 'users', firebaseUser.uid), { name, email, role, createdAt: serverTimestamp() })
      } catch (error) {
        if (!isCurrent(active, session)) throw sessionChanged()
        throw error
      }
      if (!isCurrent(active, session)) throw sessionChanged()
      return { firebaseUser, role }
    })
    try {
      const { firebaseUser } = await registration.result
      return await currentProfile(active, firebaseUser)
    } finally {
      if (active.registration === registration) active.registration = null
    }
  }, [currentProfile, isCurrent, startSession])

  const logout = useCallback(async () => {
    const active = lifetime.current
    if (!active) throw sessionChanged()
    if (active.signOut) return active.signOut
    active.session = null
    setUser(null)
    setLoading(true)
    active.signOut = Promise.resolve().then(() => signOut(auth))
    try {
      await active.signOut
    } finally {
      active.signOut = null
      startSession(active, auth.currentUser)
    }
  }, [startSession])

  const updateUserProfile = useCallback(async ({ name, phone, address }) => {
    const active = lifetime.current
    const session = active?.session
    const current = auth.currentUser
    if (!current) throw new Error('Not signed in')
    if (!isCurrent(active, session)) throw sessionChanged()
    // Only these fields are written, never role
    await setDoc(
      doc(db, 'users', current.uid),
      { name, phone, address, updatedAt: serverTimestamp() },
      { merge: true }
    )
    if (!isCurrent(active, session)) return
    await updateProfile(current, { displayName: name })
    if (isCurrent(active, session)) setUser(prev => prev ? { ...prev, name } : prev)
  }, [isCurrent])

  const resetPassword = useCallback(async (email) => {
    await sendPasswordResetEmail(auth, email)
  }, [])

  const value = {
    user,
    loading,
    login,
    register,
    logout,
    resetPassword,
    isAuthenticated: !!user,
    authInitialized,
    updateUserProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
