import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Home from './pages/Home'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ElectionEditor from './pages/ElectionEditor'
import AdminLive from './pages/AdminLive'
import VoterSession from './pages/VoterSession'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/vote/:roomCode" element={<VoterSession />} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/election/:id" element={<ProtectedRoute><ElectionEditor /></ProtectedRoute>} />
          <Route path="/live/:id" element={<ProtectedRoute><AdminLive /></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
