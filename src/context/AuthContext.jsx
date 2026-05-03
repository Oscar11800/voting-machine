import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '../firebase'

// Step 1: Create the context — an empty container that will hold the current user
const AuthContext = createContext(null)

// Step 2: The Provider — a component that wraps the whole app and makes the
// current user available to every component inside it
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // onAuthStateChanged is a Firebase listener — it fires immediately with the
    // current user (or null), then fires again any time login/logout happens.
    // This is how the app always knows who is logged in, even after a page refresh.
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser)
      setLoading(false)
    })

    // Cleanup: when the component unmounts, stop listening
    return unsubscribe
  }, [])

  // Don't render anything until Firebase has told us the auth state.
  // Without this, the app would flash the wrong page for a split second on load.
  if (loading) return null

  return (
    <AuthContext.Provider value={{ user }}>
      {children}
    </AuthContext.Provider>
  )
}

// Step 3: A custom hook — any component can call useAuth() to get the current user
// instead of importing AuthContext and useContext everywhere
export function useAuth() {
  return useContext(AuthContext)
}
