import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
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

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authInitialized, setAuthInitialized] = useState(false)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid))
          const role = userDoc.exists() ? userDoc.data().role : 'citizen'
          setUser(formatFirebaseUser(firebaseUser, role))
        } catch {
          setUser(formatFirebaseUser(firebaseUser, 'citizen'))
        }
      } else {
        setUser(null)
      }
      setLoading(false)
      setAuthInitialized(true)
    })
    return unsubscribe
  }, [])

  const login = useCallback(async (email, password) => {
    const cred = await signInWithEmailAndPassword(auth, email, password)
    const userDoc = await getDoc(doc(db, 'users', cred.user.uid))
    const role = userDoc.exists() ? userDoc.data().role : 'citizen'
    const formatted = formatFirebaseUser(cred.user, role)
    setUser(formatted)
    return formatted
  }, [])

  const register = useCallback(async ({ name, email, password, role = 'citizen' }) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    await updateProfile(cred.user, { displayName: name })
    await setDoc(doc(db, 'users', cred.user.uid), {
      name,
      email,
      role,
      createdAt: serverTimestamp(),
    })
    const formatted = formatFirebaseUser(cred.user, role)
    setUser(formatted)
    return formatted
  }, [])

  const logout = useCallback(async () => {
    await signOut(auth)
    setUser(null)
  }, [])
  
    const updateUserProfile = useCallback(async ({ name, phone, address }) => {
    const current = auth.currentUser
    if (!current) throw new Error('Not signed in')
    // Only these fields are written, never role
    await setDoc(
      doc(db, 'users', current.uid),
      { name, phone, address, updatedAt: serverTimestamp() },
      { merge: true }
    )
    await updateProfile(current, { displayName: name })
    setUser((prev) => (prev ? { ...prev, name } : prev))
  }, [])
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
