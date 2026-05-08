import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '../firebase'

export default function Home() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleJoin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const roomCode = code.trim().toUpperCase()

    // Look for a live election with this room code
    const q = query(
      collection(db, 'elections'),
      where('roomCode', '==', roomCode),
      where('status', '==', 'live')
    )
    const snapshot = await getDocs(q)

    if (snapshot.empty) {
      setError('No active election found with that code. Check with your admin.')
      setLoading(false)
      return
    }

    navigate(`/vote/${roomCode}`)
  }

  return (
    <div className="home-page">
      <div className="home-brand">UChicago Vote</div>
      <p className="home-tagline">Enter your room code to join a vote.</p>

      <form className="home-form" onSubmit={handleJoin}>
        <input
          className="home-input"
          value={code}
          onChange={e => setCode(e.target.value)}
          placeholder="ABCD"
          maxLength={4}
          autoFocus
          autoCapitalize="characters"
          autoComplete="off"
        />
        <button
          className="home-btn"
          type="submit"
          disabled={loading || code.length < 4}
        >
          {loading ? 'Joining...' : 'Join'}
        </button>
        {error && <p className="home-error">{error}</p>}
      </form>

      <p className="home-admin-link">
        Admin? <a href="/login">Sign in here</a>
      </p>
    </div>
  )
}
