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
          {(election.status === 'live' || election.status === 'ended') && (
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

      {positions.map((position, index) => (
        <PositionItem
          key={position.id}
          electionId={id}
          position={position}
          index={index}
          onReorder={async (fromIndex, toIndex) => {
            const sorted = [...positions].sort((a, b) => a.order - b.order)
            const moved = sorted.splice(fromIndex, 1)[0]
            sorted.splice(toIndex, 0, moved)
            const batch = writeBatch(db)
            sorted.forEach((p, i) => {
              batch.update(doc(db, 'elections', id, 'positions', p.id), { order: i })
            })
            await batch.commit()
          }}
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
    </div>
  )
}

// ─── Position Row ─────────────────────────────────────────────────────────────

// Shared drag state (module-level so it persists across renders without re-renders)
const dragState = { type: null, index: null }

function PositionItem({ electionId, position, index, onReorder }) {
  const [candidates, setCandidates] = useState([])
  const [posName, setPosName] = useState(position.name)
  const [dragOver, setDragOver] = useState(false)

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

  async function addCandidate() {
    await addDoc(
      collection(db, 'elections', electionId, 'positions', position.id, 'candidates'),
      { name: 'New Candidate', order: candidates.length, voteCount: 0 }
    )
  }

  async function reorderCandidates(fromIndex, toIndex) {
    const sorted = [...candidates].sort((a, b) => a.order - b.order)
    const moved = sorted.splice(fromIndex, 1)[0]
    sorted.splice(toIndex, 0, moved)
    const batch = writeBatch(db)
    sorted.forEach((c, i) => {
      batch.update(
        doc(db, 'elections', electionId, 'positions', position.id, 'candidates', c.id),
        { order: i }
      )
    })
    await batch.commit()
  }

  return (
    <div
      className={`position-card${dragOver ? ' drag-over' : ''}`}
      draggable
      onDragStart={e => {
        dragState.type = 'position'
        dragState.index = index
        e.dataTransfer.effectAllowed = 'move'
        const el = e.currentTarget
        requestAnimationFrame(() => el.classList.add('dragging'))
      }}
      onDragEnd={e => {
        e.currentTarget.classList.remove('dragging')
        setDragOver(false)
      }}
      onDragOver={e => {
        if (dragState.type !== 'position') return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault()
        setDragOver(false)
        if (dragState.type !== 'position' || dragState.index === index) return
        onReorder(dragState.index, index)
      }}
    >
      <div className="position-card-header">
        <span className="drag-handle" title="Drag to reorder">⠿</span>
        <input
          className="input-inline flex-1"
          style={{ fontWeight: 600, fontSize: 18 }}
          value={posName}
          onChange={e => setPosName(e.target.value)}
          onBlur={saveName}
        />
        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={deletePosition}>
          Delete
        </button>
      </div>

      <div className="position-card-body">
        {candidates.map((candidate, candIndex) => (
          <CandidateItem
            key={candidate.id}
            electionId={electionId}
            positionId={position.id}
            candidate={candidate}
            index={candIndex}
            onReorder={reorderCandidates}
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

function CandidateItem({ electionId, positionId, candidate, index, onReorder }) {
  const [candName, setCandName] = useState(candidate.name)
  const [dragOver, setDragOver] = useState(false)

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

  return (
    <div
      className={`candidate-row${dragOver ? ' drag-over' : ''}`}
      draggable
      onDragStart={e => {
        dragState.type = `candidate-${positionId}`
        dragState.index = index
        e.dataTransfer.effectAllowed = 'move'
        const el = e.currentTarget
        requestAnimationFrame(() => el.classList.add('dragging'))
        e.stopPropagation()
      }}
      onDragEnd={e => {
        e.currentTarget.classList.remove('dragging')
        setDragOver(false)
      }}
      onDragOver={e => {
        if (dragState.type !== `candidate-${positionId}`) return
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'move'
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault()
        e.stopPropagation()
        setDragOver(false)
        if (dragState.type !== `candidate-${positionId}` || dragState.index === index) return
        onReorder(dragState.index, index)
      }}
    >
      <span className="drag-handle" title="Drag to reorder">⠿</span>
      <input
        className="input-inline flex-1"
        style={{ fontSize: 16 }}
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
