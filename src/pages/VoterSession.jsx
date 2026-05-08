import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  collection, query, where, getDocs, doc,
  onSnapshot, orderBy, runTransaction, increment, serverTimestamp
} from 'firebase/firestore'
import { signInAnonymously } from 'firebase/auth'
import { ref, set, onDisconnect } from 'firebase/database'
import { auth, db, rtdb } from '../firebase'

export default function VoterSession() {
  const { roomCode } = useParams()

  const [election, setElection] = useState(null)
  const [currentPosition, setCurrentPosition] = useState(null)
  const [candidates, setCandidates] = useState([])
  const [selectedCandidateId, setSelectedCandidateId] = useState(null)
  const [hasVoted, setHasVoted] = useState(false)
  const [sessionId, setSessionId] = useState(null)
  const [error, setError] = useState('')

  async function setupPresence(roomCode, sessionId) {
    const presenceRef = ref(rtdb, `presence/${roomCode}/${sessionId}`)
    await set(presenceRef, true)
    onDisconnect(presenceRef).remove()
  }

  // On mount: find the election, sign in anonymously, set up presence
  useEffect(() => {
    async function init() {
      try {
        // Sign in anonymously first — Firestore rules require auth to read elections
        const credential = await signInAnonymously(auth)
        const sid = credential.user.uid
        setSessionId(sid)

        // Now authenticated, find the election by room code
        const q = query(
          collection(db, 'elections'),
          where('roomCode', '==', roomCode),
          where('status', '==', 'live')
        )
        const snapshot = await getDocs(q)
        if (snapshot.empty) { setError('No active election found with that code.'); return }

        const electionId = snapshot.docs[0].id

        // Set up real-time presence in RTDB
        await setupPresence(roomCode, sid)

        // Subscribe to the election doc for real-time state changes
        onSnapshot(doc(db, 'elections', electionId), (snap) => {
          setElection({ id: snap.id, ...snap.data() })
        })
      } catch (err) {
        setError('Failed to join. Please try again.')
        console.error(err)
      }
    }

    init()
  }, [roomCode])

  // When the current position changes, load its candidates and check vote status
  useEffect(() => {
    if (!election?.currentPositionId) {
      setCurrentPosition(null)
      setCandidates([])
      setHasVoted(false)
      setSelectedCandidateId(null)
      return
    }

    // Load position doc
    onSnapshot(doc(db, 'elections', election.id, 'positions', election.currentPositionId), (snap) => {
      setCurrentPosition({ id: snap.id, ...snap.data() })
    })

    // Load candidates sorted by order (ballot display order, not vote count)
    const q = query(
      collection(db, 'elections', election.id, 'positions', election.currentPositionId, 'candidates'),
      orderBy('order')
    )
    onSnapshot(q, (snap) => {
      setCandidates(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })

    // Check if this device already voted on this position
    const storedVote = localStorage.getItem(`voted_${election.currentPositionId}`)
    if (storedVote) {
      setHasVoted(true)
      setSelectedCandidateId(storedVote)
    } else {
      setHasVoted(false)
      setSelectedCandidateId(null)
    }
  }, [election?.currentPositionId, election?.id])

  // Submit or change a vote
  async function submitVote() {
    if (!selectedCandidateId || !election || !currentPosition || !sessionId) return

    const voteRef = doc(db, 'elections', election.id, 'votes', `${currentPosition.id}_${sessionId}`)
    const newCandidateRef = doc(db, 'elections', election.id, 'positions', currentPosition.id, 'candidates', selectedCandidateId)

    await runTransaction(db, async (transaction) => {
      const existingVote = await transaction.get(voteRef)

      if (existingVote.exists()) {
        const oldCandidateId = existingVote.data().candidateId
        // Only update counts if they changed their vote
        if (oldCandidateId !== selectedCandidateId) {
          const oldCandidateRef = doc(db, 'elections', election.id, 'positions', currentPosition.id, 'candidates', oldCandidateId)
          transaction.update(oldCandidateRef, { voteCount: increment(-1) })
          transaction.update(newCandidateRef, { voteCount: increment(1) })
        }
      } else {
        transaction.update(newCandidateRef, { voteCount: increment(1) })
      }

      transaction.set(voteRef, {
        sessionId,
        positionId: currentPosition.id,
        candidateId: selectedCandidateId,
        votedAt: serverTimestamp(),
      })
    })

    localStorage.setItem(`voted_${currentPosition.id}`, selectedCandidateId)
    setHasVoted(true)
  }

  // ── Determine which screen to show ─────────────────────────────────────────

  function getCurrentScreen() {
    if (!election) return 'loading'
    if (election.status === 'ended') return 'end'
    if (!election.currentPositionId) return 'welcome'
    const status = election.currentPositionStatus
    if (status === 'results_released') return 'winner'
    if (status === 'pending') return 'pending'
    if (status === 'voting') return hasVoted ? 'confirmation' : 'ballot'
    return 'welcome'
  }

  const screen = getCurrentScreen()
  const winningCandidates = candidates.filter(c => currentPosition?.winnerIds?.includes(c.id))

  // ── Screens ─────────────────────────────────────────────────────────────────

  if (error) return (
    <div className="error-page">
      <p>{error}</p>
    </div>
  )

  if (screen === 'loading') return (
    <div className="loading-page">Joining election...</div>
  )

  if (screen === 'welcome') return (
    <div
      className="voter-slide"
      style={{ backgroundColor: election.welcomeSlide.backgroundColor, color: '#f8fafc' }}
    >
      <h1>{election.welcomeSlide.message}</h1>
      <p>Waiting for voting to begin…</p>
    </div>
  )

  if (screen === 'ballot') return (
    <div className="ballot-page">
      <div className="ballot-header">
        <div className="ballot-position">Now voting</div>
        <h1 className="ballot-title">{currentPosition.name}</h1>
        <p className="ballot-subtitle">Select one candidate and submit your vote.</p>
      </div>

      <div className="ballot-candidates">
        {candidates.map(candidate => (
          <label
            key={candidate.id}
            className={`candidate-option${selectedCandidateId === candidate.id ? ' selected' : ''}`}
          >
            <input
              type="radio"
              name="candidate"
              value={candidate.id}
              checked={selectedCandidateId === candidate.id}
              onChange={() => setSelectedCandidateId(candidate.id)}
            />
            <span className="candidate-option-name">{candidate.name}</span>
          </label>
        ))}
      </div>

      <div className="ballot-actions">
        <button
          className="btn btn-primary btn-full btn-lg"
          onClick={submitVote}
          disabled={!selectedCandidateId}
        >
          Submit Vote
        </button>
      </div>
    </div>
  )

  if (screen === 'confirmation') return (
    <div className="confirmation-page">
      <div className="confirmation-check">✓</div>
      <h1 className="confirmation-title">Vote Recorded</h1>
      <p className="confirmation-detail">
        You voted for <strong>{candidates.find(c => c.id === selectedCandidateId)?.name}</strong>
      </p>
      <button className="btn btn-secondary" onClick={() => setHasVoted(false)}>
        Change Vote
      </button>
    </div>
  )

  if (screen === 'pending') return (
    <div
      className="voter-slide"
      style={{ backgroundColor: election.pendingSlide.backgroundColor, color: '#f8fafc' }}
    >
      <h1>{election.pendingSlide.message}</h1>
      <p>Hang tight…</p>
    </div>
  )

  if (screen === 'winner') return (
    <div className="winner-screen">
      <div className="winner-position-label">{currentPosition.name}</div>
      <div className="winner-for-label">
        Winner{winningCandidates.length > 1 ? 's' : ''}
      </div>
      <div className="winner-names">
        {winningCandidates.map(c => c.name).join(' & ')}
      </div>
    </div>
  )

  if (screen === 'end') return (
    <div
      className="voter-slide"
      style={{ backgroundColor: election.endSlide.backgroundColor, color: '#f8fafc' }}
    >
      <h1>{election.endSlide.message}</h1>
      {election.endSlide.showWinners && <WinnersList electionId={election.id} />}
    </div>
  )
}

// Loads and displays all position winners for the end slide
function WinnersList({ electionId }) {
  const [positions, setPositions] = useState([])
  const [allCandidates, setAllCandidates] = useState({})

  useEffect(() => {
    const q = query(collection(db, 'elections', electionId, 'positions'), orderBy('order'))
    return onSnapshot(q, async (snapshot) => {
      const pos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
      setPositions(pos)

      // Load candidates for each position to resolve winner names
      const candidateMap = {}
      for (const p of pos) {
        const cSnap = await getDocs(collection(db, 'elections', electionId, 'positions', p.id, 'candidates'))
        cSnap.docs.forEach(d => { candidateMap[d.id] = d.data().name })
      }
      setAllCandidates(candidateMap)
    })
  }, [electionId])

  return (
    <div className="winners-list">
      {positions.filter(p => p.winnerIds?.length > 0).map(p => (
        <div key={p.id} className="winners-list-item">
          <div className="winners-list-position">{p.name}</div>
          <div className="winners-list-name">
            {p.winnerIds.map(id => allCandidates[id]).filter(Boolean).join(' & ')}
          </div>
        </div>
      ))}
    </div>
  )
}
