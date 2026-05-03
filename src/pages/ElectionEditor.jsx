import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  doc, collection, onSnapshot, updateDoc,
  addDoc, deleteDoc, query, orderBy, serverTimestamp
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

  if (!election) return <p>Loading...</p>

  return (
    <div>
      <button onClick={() => navigate('/dashboard')}>← Back</button>

      <div>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={saveName}         // saves when you click away from the field
        />
        <span> ({election.status})</span>
      </div>

      <h2>Positions</h2>
      {positions.map(position => (
        <PositionItem
          key={position.id}
          electionId={id}
          position={position}
          positions={positions}
        />
      ))}
      <button onClick={addPosition}>+ Add Position</button>

      <hr />

      <h2>Slide Configuration</h2>

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

      <hr />

      <button onClick={goLive}>Go Live</button>
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
    <div style={{ border: '1px solid #ccc', margin: '8px 0', padding: '8px' }}>
      <div>
        <button onClick={() => movePosition('up')}>↑</button>
        <button onClick={() => movePosition('down')}>↓</button>
        <input
          value={posName}
          onChange={e => setPosName(e.target.value)}
          onBlur={saveName}
        />
        <button onClick={deletePosition}>Delete</button>
      </div>

      <div style={{ paddingLeft: '16px' }}>
        {candidates.map(candidate => (
          <CandidateItem
            key={candidate.id}
            electionId={electionId}
            positionId={position.id}
            candidate={candidate}
            candidates={candidates}
          />
        ))}
        <button onClick={addCandidate}>+ Add Candidate</button>
      </div>
    </div>
  )
}

// ─── Slide Config ─────────────────────────────────────────────────────────────

function SlideConfig({ label, slide, onSave, showWinnersToggle = false }) {
  const [message, setMessage] = useState(slide.message)
  const [backgroundColor, setBackgroundColor] = useState(slide.backgroundColor)

  return (
    <div style={{ margin: '12px 0' }}>
      <h3>{label}</h3>
      <div>
        <label>Message</label>
        <input
          value={message}
          onChange={e => setMessage(e.target.value)}
          onBlur={() => onSave({ ...slide, message: message.trim() })}
        />
      </div>
      <div>
        <label>Background Color</label>
        <input
          type="color"
          value={backgroundColor}
          onChange={e => setBackgroundColor(e.target.value)}
          onBlur={() => onSave({ ...slide, backgroundColor })}
        />
      </div>
      {showWinnersToggle && (
        <div>
          <label>
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
    <div>
      <button onClick={() => moveCandidate('up')}>↑</button>
      <button onClick={() => moveCandidate('down')}>↓</button>
      <input
        value={candName}
        onChange={e => setCandName(e.target.value)}
        onBlur={saveName}
      />
      <button onClick={deleteCandidate}>Delete</button>
    </div>
  )
}
