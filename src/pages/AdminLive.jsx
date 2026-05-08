import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  doc, collection, query, orderBy, onSnapshot, updateDoc, serverTimestamp
} from 'firebase/firestore'
import { ref, onValue } from 'firebase/database'
import { db, rtdb } from '../firebase'

export default function AdminLive() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [election, setElection] = useState(null)
  const [positions, setPositions] = useState([])
  const [candidates, setCandidates] = useState([])
  const [voterCount, setVoterCount] = useState(0)
  const [selectedWinnerIds, setSelectedWinnerIds] = useState([])

  // Load election doc
  useEffect(() => {
    return onSnapshot(doc(db, 'elections', id), (snapshot) => {
      setElection({ id: snapshot.id, ...snapshot.data() })
    })
  }, [id])

  // Load all positions
  useEffect(() => {
    const q = query(collection(db, 'elections', id, 'positions'), orderBy('order'))
    return onSnapshot(q, (snapshot) => {
      setPositions(snapshot.docs.map(d => ({ id: d.id, ...d.data() })))
    })
  }, [id])

  // Load candidates for the current position, sorted by voteCount descending
  // Re-runs whenever the active position changes
  useEffect(() => {
    if (!election?.currentPositionId) {
      setCandidates([])
      return
    }
    const q = query(
      collection(db, 'elections', id, 'positions', election.currentPositionId, 'candidates'),
      orderBy('voteCount', 'desc')
    )
    return onSnapshot(q, (snapshot) => {
      setCandidates(snapshot.docs.map(d => ({ id: d.id, ...d.data() })))
    })
  }, [id, election?.currentPositionId])

  // Listen to RTDB presence for live voter count
  useEffect(() => {
    if (!election?.roomCode) return
    const presenceRef = ref(rtdb, `presence/${election.roomCode}`)
    return onValue(presenceRef, (snapshot) => {
      const data = snapshot.val()
      setVoterCount(data ? Object.keys(data).length : 0)
    })
  }, [election?.roomCode])

  // Clear winner selections whenever the position changes
  useEffect(() => {
    setSelectedWinnerIds([])
  }, [election?.currentPositionId])

  // ── Derived values ──────────────────────────────────────────────────────────

  const currentPosition = positions.find(p => p.id === election?.currentPositionId)
  const currentIndex = positions.findIndex(p => p.id === election?.currentPositionId)
  const nextPosition = positions[currentIndex + 1]
  const isLastPosition = currentIndex === positions.length - 1
  const positionStatus = election?.currentPositionStatus

  function toggleWinner(candidateId) {
    setSelectedWinnerIds(prev =>
      prev.includes(candidateId)
        ? prev.filter(id => id !== candidateId)
        : [...prev, candidateId]
    )
  }

  // ── Admin actions ───────────────────────────────────────────────────────────

  async function openVoting(position) {
    await updateDoc(doc(db, 'elections', id), {
      currentPositionId: position.id,
      currentPositionStatus: 'voting',
      lastActiveAt: serverTimestamp(),
    })
    await updateDoc(doc(db, 'elections', id, 'positions', position.id), {
      status: 'voting',
    })
  }

  async function closeVoting() {
    await updateDoc(doc(db, 'elections', id), { currentPositionStatus: 'pending' })
    await updateDoc(doc(db, 'elections', id, 'positions', currentPosition.id), {
      status: 'closed',
    })
  }

  async function reopenVoting() {
    await updateDoc(doc(db, 'elections', id), { currentPositionStatus: 'voting' })
    await updateDoc(doc(db, 'elections', id, 'positions', currentPosition.id), {
      status: 'voting',
    })
  }

  async function releaseResults() {
    if (selectedWinnerIds.length === 0) {
      alert('Select at least one winner before releasing results.')
      return
    }
    await updateDoc(doc(db, 'elections', id, 'positions', currentPosition.id), {
      status: 'results_released',
      winnerIds: selectedWinnerIds,
    })
    await updateDoc(doc(db, 'elections', id), { currentPositionStatus: 'results_released' })
  }

  async function advanceToNext() {
    await openVoting(nextPosition)
  }

  async function endElection() {
    await updateDoc(doc(db, 'elections', id), {
      status: 'ended',
      roomCode: null,
      currentPositionId: null,
      currentPositionStatus: null,
      lastActiveAt: serverTimestamp(),
    })
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!election) return <div className="loading-page">Loading...</div>

  return (
    <div>
    <nav className="uc-nav">
      <img className="uc-nav-logo" src="/uchicago-logo.png" alt="University of Chicago" />
      <span className="uc-nav-title">UChicago Vote</span>
    </nav>
    <div className="page-wide">
      {/* Header */}
      <div className="page-header">
        <div>
          <button className="page-back" onClick={() => navigate('/dashboard')}>
            ← Dashboard
          </button>
          <h1 style={{ marginTop: 4 }}>{election.name}</h1>
        </div>
        <div className="room-code-pill" style={{ fontSize: 20, padding: '6px 16px' }}>
          {election.roomCode}
        </div>
      </div>

      {/* Stats — only shown during a live election */}
      {election.status !== 'ended' && (
        <div className="stats-bar">
          <div className="stat-item">
            <div className="stat-label">Voters Connected</div>
            <div className={`stat-value ${voterCount > 0 ? 'live' : ''}`}>{voterCount}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Positions</div>
            <div className="stat-value">{positions.length}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Current Position</div>
            <div className="stat-value" style={{ fontSize: 15, paddingTop: 4 }}>
              {currentPosition ? currentPosition.name : 'Standby'}
            </div>
          </div>
        </div>
      )}

      {/* No position open yet — show the full position list */}
      {!currentPosition && election.status !== 'ended' && (
        <div>
          <div className="section-header" style={{ marginBottom: 12 }}>
            <h2>Positions</h2>
            <p className="text-muted text-sm">Click "Open Voting" to start a position.</p>
          </div>
          {positions.map(p => (
            <div key={p.id} className="position-list-item">
              <span className="position-list-item-name">{p.name}</span>
              <div className="row">
                {p.status === 'not_started' && (
                  <button className="btn btn-primary btn-sm" onClick={() => openVoting(p)}>
                    Open Voting
                  </button>
                )}
                {p.status === 'results_released' && (
                  <span className="badge badge-ended">Done</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Active position control panel */}
      {currentPosition && election.status !== 'ended' && (
        <div>
          <div className="section-header">
            <h2>{currentPosition.name}</h2>
            <span className={`badge badge-${positionStatus === 'voting' ? 'live' : 'draft'}`}>
              {positionStatus?.replace('_', ' ')}
            </span>
          </div>

          {/* Controls */}
          <div className="live-controls">
            {positionStatus === 'voting' && (
              <button className="btn btn-secondary" onClick={closeVoting}>Close Voting</button>
            )}
            {positionStatus === 'pending' && (
              <button className="btn btn-secondary" onClick={reopenVoting}>Reopen Voting</button>
            )}
            {positionStatus === 'pending' && (
              <button
                className="btn btn-primary"
                onClick={releaseResults}
                disabled={selectedWinnerIds.length === 0}
              >
                Release Results {selectedWinnerIds.length > 0 ? `(${selectedWinnerIds.length} selected)` : ''}
              </button>
            )}
            {positionStatus === 'results_released' && (
              isLastPosition
                ? <button className="btn btn-danger" onClick={endElection}>End Election</button>
                : <button className="btn btn-primary" onClick={advanceToNext}>Next Position →</button>
            )}
          </div>

          {/* Live tally */}
          <div>
            {candidates.map(candidate => {
              const totalVotes = candidates.reduce((sum, c) => sum + c.voteCount, 0)
              const pct = totalVotes > 0 ? Math.round((candidate.voteCount / totalVotes) * 100) : 0
              const isSelected = selectedWinnerIds.includes(candidate.id)

              return (
                <button
                  key={candidate.id}
                  className={`tally-row${isSelected ? ' selected' : ''}`}
                  onClick={() => toggleWinner(candidate.id)}
                  disabled={positionStatus === 'voting' || positionStatus === 'results_released'}
                >
                  <div className="tally-row-header">
                    <span className="tally-name">
                      {isSelected && <span className="winner-check">✓ </span>}
                      {candidate.name}
                    </span>
                    <span className="tally-count">
                      {candidate.voteCount} vote{candidate.voteCount !== 1 ? 's' : ''} · {pct}%
                    </span>
                  </div>
                  <div className="tally-bar-track">
                    <div className="tally-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                </button>
              )
            })}
            <p className="tally-hint">
              {positionStatus === 'pending'
                ? 'Tap a candidate to mark them as winner, then release results.'
                : positionStatus === 'results_released'
                ? 'Results released. Advance to the next position or end the election.'
                : 'Tally updates live. Close voting to declare a winner.'}
            </p>
          </div>
        </div>
      )}

      {/* Election ended — show full results */}
      {election.status === 'ended' && (
        <div>
          <div className="section-header" style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 22 }}>Final Results</h2>
            <span className="badge badge-ended">Election Ended</span>
          </div>
          {positions.map(p => (
            <PositionResult key={p.id} electionId={id} position={p} />
          ))}
        </div>
      )}
    </div>
    </div>
  )
}

// ── Per-position results card (used on the ended results view) ───────────────

function PositionResult({ electionId, position }) {
  const [candidates, setCandidates] = useState([])

  useEffect(() => {
    const q = query(
      collection(db, 'elections', electionId, 'positions', position.id, 'candidates'),
      orderBy('voteCount', 'desc')
    )
    return onSnapshot(q, snap => {
      setCandidates(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
  }, [electionId, position.id])

  const totalVotes = candidates.reduce((sum, c) => sum + c.voteCount, 0)
  const winnerIds = position.winnerIds ?? []

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, flex: 1 }}>{position.name}</h3>
        {winnerIds.length > 0 && (
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand)', background: 'var(--brand-light)', padding: '4px 10px', borderRadius: 999 }}>
            Winner{winnerIds.length > 1 ? 's' : ''}: {candidates.filter(c => winnerIds.includes(c.id)).map(c => c.name).join(' & ')}
          </span>
        )}
      </div>

      {candidates.map(c => {
        const pct = totalVotes > 0 ? Math.round((c.voteCount / totalVotes) * 100) : 0
        const isWinner = winnerIds.includes(c.id)
        return (
          <div key={c.id} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontWeight: isWinner ? 700 : 400, color: isWinner ? 'var(--brand)' : 'var(--text)' }}>
                {isWinner ? '✓ ' : ''}{c.name}
              </span>
              <span className="text-muted text-sm">{c.voteCount} vote{c.voteCount !== 1 ? 's' : ''} · {pct}%</span>
            </div>
            <div className="tally-bar-track">
              <div className="tally-bar-fill" style={{ width: `${pct}%`, background: isWinner ? 'var(--brand)' : '#cbd5e1' }} />
            </div>
          </div>
        )
      })}

      {totalVotes === 0 && (
        <p className="text-muted text-sm">No votes recorded.</p>
      )}
    </div>
  )
}
