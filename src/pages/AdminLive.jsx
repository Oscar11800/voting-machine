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

  // ── YOUR TASK ───────────────────────────────────────────────────────────────
  // Write the toggleWinner function below.
  //
  // It receives a candidateId (string).
  // It should add that id to selectedWinnerIds if it's not already in there.
  // It should remove it if it is already in there.
  //
  // Use this pattern for updating arrays in state:
  //   setSelectedWinnerIds(prev => /* return the new array */)
  //
  // Hints:
  //   - prev.includes(candidateId) tells you if it's already selected
  //   - prev.filter(id => id !== candidateId) returns array without that id
  //   - [...prev, candidateId] returns array with that id added
  //
  function toggleWinner(candidateId) {
    setSelectedWinnerIds(prev =>
      prev.includes(candidateId)
        ? prev.filter(id => id !== candidateId)
        : [...prev, candidateId]
    )
  }
  // ───────────────────────────────────────────────────────────────────────────

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
      currentPositionId: null,
      currentPositionStatus: null,
      lastActiveAt: serverTimestamp(),
    })
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!election) return <p>Loading...</p>

  return (
    <div>
      {/* Header */}
      <div>
        <h1>{election.name}</h1>
        <p>Room Code: <strong>{election.roomCode}</strong></p>
        <p>Voters connected: <strong>{voterCount}</strong></p>
      </div>

      {/* No position open yet — show the full position list to kick things off */}
      {!currentPosition && election.status !== 'ended' && (
        <div>
          <h2>Positions</h2>
          {positions.map(p => (
            <div key={p.id}>
              <span>{p.name}</span>
              {p.status === 'not_started' && (
                <button onClick={() => openVoting(p)}>Open Voting</button>
              )}
              {p.status === 'results_released' && <span> ✓ Done</span>}
            </div>
          ))}
        </div>
      )}

      {/* Active position control panel */}
      {currentPosition && election.status !== 'ended' && (
        <div>
          <h2>{currentPosition.name}</h2>

          {/* Controls */}
          <div>
            {positionStatus === 'voting' && (
              <button onClick={closeVoting}>Close Voting</button>
            )}
            {positionStatus === 'pending' && (
              <>
                <button onClick={reopenVoting}>Reopen Voting</button>
              </>
            )}
            {(positionStatus === 'pending' || positionStatus === 'results_released') && (
              <>
                {positionStatus !== 'results_released' && (
                  <button onClick={releaseResults} disabled={selectedWinnerIds.length === 0}>
                    Release Results
                  </button>
                )}
                {positionStatus === 'results_released' && (
                  isLastPosition
                    ? <button onClick={endElection}>End Election</button>
                    : <button onClick={advanceToNext}>Next Position →</button>
                )}
              </>
            )}
          </div>

          {/* Live tally */}
          <div>
            <h3>Live Tally</h3>
            {candidates.map(candidate => {
              const totalVotes = candidates.reduce((sum, c) => sum + c.voteCount, 0)
              const pct = totalVotes > 0 ? Math.round((candidate.voteCount / totalVotes) * 100) : 0
              const isSelected = selectedWinnerIds.includes(candidate.id)

              return (
                <div key={candidate.id}>
                  <button
                    onClick={() => toggleWinner(candidate.id)}
                    disabled={positionStatus === 'voting'}
                    style={{ fontWeight: isSelected ? 'bold' : 'normal' }}
                  >
                    {isSelected ? '✓ ' : ''}{candidate.name} — {candidate.voteCount} vote{candidate.voteCount !== 1 ? 's' : ''} ({pct}%)
                  </button>
                </div>
              )
            })}
            <p style={{ fontSize: '0.8em', color: '#888' }}>
              {positionStatus === 'pending' || positionStatus === 'results_released'
                ? 'Click a candidate to select them as winner.'
                : 'Tally updates live. Close voting to declare a winner.'}
            </p>
          </div>
        </div>
      )}

      {/* Election ended */}
      {election.status === 'ended' && (
        <div>
          <h2>Election Ended</h2>
          <button onClick={() => navigate('/dashboard')}>Back to Dashboard</button>
        </div>
      )}
    </div>
  )
}
