import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Home() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')

  function handleJoin(e) {
    e.preventDefault()
    const roomCode = code.trim().toUpperCase()
    console.log('[HOME] joining with roomCode:', roomCode)
    if (roomCode.length === 4) {
      console.log('[HOME] navigating to /vote/' + roomCode)
      navigate(`/vote/${roomCode}`)
    } else {
      console.log('[HOME] code too short:', roomCode.length)
    }
  }

  return (
    <div>
    <nav className="uc-nav">
      <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
        <img className="uc-nav-logo" src="/uchicago-logo.png" alt="University of Chicago" />
        <span className="uc-nav-title">UChicago Vote</span>
      </a>
    </nav>
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
          autoCorrect="off"
          spellCheck="false"
        />
        <button
          className="home-btn"
          type="submit"
          disabled={code.trim().length < 4}
        >
          Join
        </button>
      </form>

      <p className="home-admin-link">
        Admin? <a href="/login">Sign in here</a>
      </p>
    </div>
    </div>
  )
}
