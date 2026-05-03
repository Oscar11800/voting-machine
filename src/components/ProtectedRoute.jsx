import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Wraps any admin page. If the user isn't logged in, sends them to /login.
export default function ProtectedRoute({ children }) {
  const { user } = useAuth()

  if (!user) return <Navigate to="/login" replace />

  return children
}
