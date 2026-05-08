import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  doc, collection, onSnapshot, updateDoc,
  addDoc, deleteDoc, query, orderBy, serverTimestamp, getDocs, writeBatch
} from 'firebase/firestore'
import { db } from '../firebase'

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ElectionEditor() {
  const { id } = useParams()       // grab the election ID from the URL
  const navigate = useNavigate()

  const [election, setElection] = useState(null)
  const [positions, setPositions] = useState([])
  const [name, setName] = useState('')

  // Listen to the election document
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'elections', id), (snapshot) => {
      const data = { id: snapshot.id, ...snapshot.data() }
      setElection(data)
      setName(data.name)
    })
    return unsubscribe
  }, [id])

  // Listen to the positions subcollection, sorted by order
  useEffect(() => {
    const q = query(collection(db, 'elections', id, 'positions'), orderBy('order'))
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPositions(snapshot.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    return unsubscribe
  }, [id])

  // Save the election name when the input loses focus
  async function saveName() {
    if (name.trim() === election.name) return
    await updateDoc(doc(db, 'elections', id), { name: name.trim() })
  }

  async function addPosition() {
    await addDoc(collection(db, 'elections', id, 'positions'), {
      name: 'New Position',
      order: positions.length, // next in line
      status: 'not_started',
      winnerIds: [],
    })
  }

  async function resetToDraft() {
    const confirmed = window.confirm(
      'This will delete all votes and results. This cannot be undone. Continue?'
    )
    if (!confirmed) return

    const batch = writeBatch(db)

    // Reset all positions to not_started and clear winners
    for (const position of positions) {
      batch.update(doc(db, 'elections', id, 'positions', position.id), {
        status: 'not_started',
        winnerIds: [],
      })

      // Delete all vote records for this position
      const votesSnap = await getDocs(collection(db, 'elections', id, 'votes'))
      votesSnap.docs
        .filter(d => d.id.startsWith(position.id))
        .forEach(d => batch.delete(d.ref))

      // Reset all candidate vote counts to 0
      const candidatesSnap = await getDocs(
        collection(db, 'elections', id, 'positions', position.id, 'candidates')
      )
      candidatesSnap.docs.forEach(d => batch.update(d.ref, { voteCount: 0 }))
    }

    // Reset the election itself
    batch.update(doc(db, 'elections', id), {
      status: 'draft',
      roomCode: null,
      currentPositionId: null,
      currentPositionStatus: null,
      lastActiveAt: serverTimestamp(),
    })

    await batch.commit()
  }

  async function goLive() {
    if (positions.length === 0) {
      alert('Add at least one position before going live.')
      return
    }

    // Generate a random 4-letter uppercase room code
    const code = Array.from({ length: 4 }, () =>
      String.fromCharCode(65 + Math.floor(Math.random() * 26))
    ).join('')

    await updateDoc(doc(db, 'elections', id), {
      status: 'live',
      roomCode: code,
      lastActiveAt: serverTimestamp(),
    })

    navigate(`/live/${id}`)
  }

  if (!election) return <div className="loading-page">Loading...</div>

  return (
    <div className="page-wide">
      {/* Header */}
      <div className="page-header">
        <div>
          <button className="page-back" onClick={() => navigate('/dashboard')}>
            ← Back
          </button>
          <div className="row" style={{ gap: 10, marginTop: 4 }}>
            <input
              className="input-inline"
              style={{ fontSize: 20, fontWeight: 700 }}
              value={name}
              onChange={e => setName(e.target.value)}
              onBlur={saveName}
            />
            <span className={`badge badge-${election.status}`}>{election.status}</span>
          </div>
        </div>
        <div className="row">
          {election.status === 'draft' && (
            <button className="btn btn-primary" onClick={goLive}>Go Live</button>
          )}
          {election.status === 'live' && (
            <button className="btn btn-danger" onClick={resetToDraft}>Reset to Draft</button>
          )}
        </div>
      </div>

      {/* Positions */}
      <div className="section-header">
        <h2>Positions</h2>
        <button className="btn btn-secondary btn-sm" onClick={addPosition}>+ Add Position</button>
      </div>

      {positions.length === 0 && (
        <p className="text-muted text-sm" style={{ marginBottom: 16 }}>
          No positions yet. Add one to get started.
        </p>
      )}

      {positions.map(position => (
        <PositionItem
          key={position.id}
          electionId={id}
          position={position}
          positions={positions}
        />
      ))}

      <hr className="divider" />

      {/* Slide Configuration */}
      <div className="section-header">
        <h2>Slides</h2>
      </div>

      <SlideConfig
        label="Welcome Slide"
        slide={election.welcomeSlide}
        onSave={updated => updateDoc(doc(db, 'elections', id), { welcomeSlide: updated })}
      />
      <SlideConfig
        label="Pending Slide"
        slide={election.pendingSlide}
        onSave={updated => updateDoc(doc(db, 'elections', id), { pendingSlide: updated })}
      />
      <SlideConfig
        label="End Slide"
        slide={election.endSlide}
        onSave={updated => updateDoc(doc(db, 'elections', id), { endSlide: updated })}
        showWinnersToggle
      />
    </div>
  )
}

// ─── Position Row ─────────────────────────────────────────────────────────────

function PositionItem({ electionId, position, positions }) {
  const [candidates, setCandidates] = useState([])
  const [posName, setPosName] = useState(position.name)

  // Each PositionItem loads its own candidates
  useEffect(() => {
    const q = query(
      collection(db, 'elections', electionId, 'positions', position.id, 'candidates'),
      orderBy('order')
    )
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCandidates(snapshot.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    return unsubscribe
  }, [electionId, position.id])

  async function saveName() {
    if (posName.trim() === position.name) return
    await updateDoc(
      doc(db, 'elections', electionId, 'positions', position.id),
      { name: posName.trim() }
    )
  }

  async function deletePosition() {
    await deleteDoc(doc(db, 'elections', electionId, 'positions', position.id))
  }

  async function movePosition(direction) {
    // Sort all positions by order, find neighbors, and swap order values
    const sorted = [...positions].sort((a, b) => a.order - b.order)
    const index = sorted.findIndex(p => p.id === position.id)
    const swapIndex = direction === 'up' ? index - 1 : index + 1

    if (swapIndex < 0 || swapIndex >= sorted.length) return

    const swapWith = sorted[swapIndex]
    await updateDoc(doc(db, 'elections', electionId, 'positions', position.id), { order: swapWith.order })
    await updateDoc(doc(db, 'elections', electionId, 'positions', swapWith.id), { order: position.order })
  }

  async function addCandidate() {
    await addDoc(
      collection(db, 'elections', electionId, 'positions', position.id, 'candidates'),
      { name: 'New Candidate', order: candidates.length, voteCount: 0 }
    )
  }

  return (
    <div className="position-card">
      <div className="position-card-header">
        <div className="row" style={{ gap: 4 }}>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => movePosition('up')}>↑</button>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => movePosition('down')}>↓</button>
        </div>
        <input
          className="input-inline flex-1"
          style={{ fontWeight: 600 }}
          value={posName}
          onChange={e => setPosName(e.target.value)}
          onBlur={saveName}
        />
        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={deletePosition}>
          Delete
        </button>
      </div>

      <div className="position-card-body">
        {candidates.map(candidate => (
          <CandidateItem
            key={candidate.id}
            electionId={electionId}
            positionId={position.id}
            candidate={candidate}
            candidates={candidates}
          />
        ))}
        <button className="btn btn-ghost btn-sm mt-sm" onClick={addCandidate}>
          + Add Candidate
        </button>
      </div>
    </div>
  )
}

// ─── Slide Config ─────────────────────────────────────────────────────────────

function SlideConfig({ label, slide, onSave, showWinnersToggle = false }) {
  const [message, setMessage] = useState(slide.message)
  const [backgroundColor, setBackgroundColor] = useState(slide.backgroundColor)

  return (
    <div className="slide-config">
      <div className="slide-config-title">{label}</div>

      <div className="slide-field">
        <label>Message</label>
        <input
          className="input"
          value={message}
          onChange={e => setMessage(e.target.value)}
          onBlur={() => onSave({ ...slide, message: message.trim() })}
        />
      </div>

      <div className="slide-field">
        <label>Background Color</label>
        <div className="color-row">
          <button className="color-swatch">
            <input
              type="color"
              value={backgroundColor}
              onChange={e => setBackgroundColor(e.target.value)}
              onBlur={() => onSave({ ...slide, backgroundColor })}
            />
          </button>
          <span className="text-sm text-muted">{backgroundColor}</span>
        </div>
      </div>

      {showWinnersToggle && (
        <div className="slide-field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={slide.showWinners}
              onChange={e => onSave({ ...slide, showWinners: e.target.checked })}
            />
            Show winner list on end slide
          </label>
        </div>
      )}
    </div>
  )
}

// ─── Candidate Row ────────────────────────────────────────────────────────────

function CandidateItem({ electionId, positionId, candidate, candidates }) {
  const [candName, setCandName] = useState(candidate.name)

  async function saveName() {
    if (candName.trim() === candidate.name) return
    await updateDoc(
      doc(db, 'elections', electionId, 'positions', positionId, 'candidates', candidate.id),
      { name: candName.trim() }
    )
  }

  async function deleteCandidate() {
    await deleteDoc(
      doc(db, 'elections', electionId, 'positions', positionId, 'candidates', candidate.id)
    )
  }

  async function moveCandidate(direction) {
    const sorted = [...candidates].sort((a, b) => a.order - b.order)
    const index = sorted.findIndex(c => c.id === candidate.id)
    const swapIndex = direction === 'up' ? index - 1 : index + 1

    if (swapIndex < 0 || swapIndex >= sorted.length) return

    const swapWith = sorted[swapIndex]
    await updateDoc(
      doc(db, 'elections', electionId, 'positions', positionId, 'candidates', candidate.id),
      { order: swapWith.order }
    )
    await updateDoc(
      doc(db, 'elections', electionId, 'positions', positionId, 'candidates', swapWith.id),
      { order: candidate.order }
    )
  }

  return (
    <div className="candidate-row">
      <div className="row" style={{ gap: 2 }}>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => moveCandidate('up')}>↑</button>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => moveCandidate('down')}>↓</button>
      </div>
      <input
        className="input-inline flex-1"
        value={candName}
        onChange={e => setCandName(e.target.value)}
        onBlur={saveName}
      />
      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={deleteCandidate}>
        Delete
      </button>
    </div>
  )
}
