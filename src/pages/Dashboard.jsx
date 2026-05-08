import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, onSnapshot, addDoc, deleteDoc, updateDoc, doc, serverTimestamp, getDocs, orderBy } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { db, auth } from '../firebase'
import { useAuth } from '../context/AuthContext'

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [elections, setElections] = useState([])

  // Listen to all elections owned by this admin in real time
  useEffect(() => {
    const q = query(
      collection(db, 'elections'),
      where('adminId', '==', user.uid)
    )

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      setElections(data)
    }, (err) => {
      console.error('Elections query failed:', err)
    })

    return unsubscribe
  }, [user.uid])

  async function createElection() {
    // Create a new blank election document in Firestore
    const docRef = await addDoc(collection(db, 'elections'), {
      adminId: user.uid,
      name: 'Untitled Election',
      status: 'draft',
      roomCode: null,
      currentPositionId: null,
      currentPositionStatus: null,
      welcomeSlide: { message: 'Welcome! Voting will begin shortly.', backgroundColor: '#1a1a2e' },
      pendingSlide: { message: 'Results coming soon...', backgroundColor: '#1a1a2e' },
      endSlide: { message: 'Thank you for voting!', backgroundColor: '#1a1a2e', showWinners: true },
      createdAt: serverTimestamp(),
      lastActiveAt: serverTimestamp(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    })

    // Navigate straight to the editor for the new election
    navigate(`/election/${docRef.id}`)
  }

  async function duplicateElection(election) {
    // Copy the election document as a new draft
    const newElectionRef = await addDoc(collection(db, 'elections'), {
      adminId: user.uid,
      name: `${election.name} (Copy)`,
      status: 'draft',
      roomCode: null,
      currentPositionId: null,
      currentPositionStatus: null,
      welcomeSlide: election.welcomeSlide,
      pendingSlide: election.pendingSlide,
      endSlide: election.endSlide,
      createdAt: serverTimestamp(),
      lastActiveAt: serverTimestamp(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    })

    // Copy all positions and their candidates
    const positionsSnap = await getDocs(
      query(collection(db, 'elections', election.id, 'positions'), orderBy('order'))
    )

    for (const posDoc of positionsSnap.docs) {
      const posData = posDoc.data()
      const newPosRef = await addDoc(
        collection(db, 'elections', newElectionRef.id, 'positions'),
        { name: posData.name, order: posData.order, status: 'not_started', winnerIds: [] }
      )

      // Copy candidates with vote counts reset to 0
      const candidatesSnap = await getDocs(
        query(collection(db, 'elections', election.id, 'positions', posDoc.id, 'candidates'), orderBy('order'))
      )
      for (const candDoc of candidatesSnap.docs) {
        const candData = candDoc.data()
        await addDoc(
          collection(db, 'elections', newElectionRef.id, 'positions', newPosRef.id, 'candidates'),
          { name: candData.name, order: candData.order, voteCount: 0 }
        )
      }
    }

  }

  async function handleSignOut() {
    await signOut(auth)
    navigate('/login')
  }

  return (
    <div>
      <nav className="uc-nav">
        <img className="uc-nav-logo" src="/uchicago-logo.png" alt="University of Chicago" />
        <span className="uc-nav-title">UChicago Vote</span>
        <div className="uc-nav-actions">
          <button className="btn" style={{ background: 'rgba(255,255,255,.15)', color: '#fff', border: '1px solid rgba(255,255,255,.35)', fontSize: 15 }} onClick={createElection}>
            + New Election
          </button>
          <button className="btn btn-ghost" style={{ color: 'rgba(255,255,255,.75)', fontSize: 15 }} onClick={handleSignOut}>
            Sign Out
          </button>
        </div>
      </nav>

    <div className="page-wide">
      <div className="page-header">
        <h1>My Elections</h1>
        <button className="btn btn-primary" onClick={createElection}>+ New Election</button>
      </div>

      {elections.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '56px 28px' }}>
          <p style={{ fontSize: 20, color: 'var(--text-muted)', marginBottom: 20 }}>
            No elections yet. Create one to get started.
          </p>
          <button className="btn btn-primary btn-lg" onClick={createElection}>
            + Create your first election
          </button>
        </div>
      )}

      <div>
        {elections.map(election => (
          <ElectionCard
            key={election.id}
            election={election}
            onEdit={() => navigate(`/election/${election.id}`)}
            onResume={() => navigate(`/live/${election.id}`)}
            onStart={async () => {
              const posSnap = await getDocs(collection(db, 'elections', election.id, 'positions'))
              if (posSnap.empty) {
                alert('Add at least one position before starting.')
                return
              }
              const code = Array.from({ length: 4 }, () =>
                String.fromCharCode(65 + Math.floor(Math.random() * 26))
              ).join('')
              await updateDoc(doc(db, 'elections', election.id), {
                status: 'live',
                roomCode: code,
                lastActiveAt: serverTimestamp(),
              })
              navigate(`/live/${election.id}`)
            }}
            onDuplicate={() => duplicateElection(election)}
            onRename={async (newName) => {
              await updateDoc(doc(db, 'elections', election.id), { name: newName })
            }}
            onDelete={async () => {
              if (window.confirm(`Delete "${election.name}"? This cannot be undone.`)) {
                await deleteDoc(doc(db, 'elections', election.id))
              }
            }}
          />
        ))}
      </div>
    </div>
    </div>
  )
}

function ElectionCard({ election, onEdit, onResume, onStart, onDuplicate, onRename, onDelete }) {
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(election.name)

  function startRename() {
    setRenameValue(election.name)
    setIsRenaming(true)
  }

  function commitRename() {
    setIsRenaming(false)
    if (renameValue.trim() && renameValue.trim() !== election.name) {
      onRename(renameValue.trim())
    }
  }

  return (
    <div className="election-card">
      <div className="election-card-info">
        {isRenaming ? (
          <input
            className="input-inline election-card-name"
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') setIsRenaming(false)
            }}
            autoFocus
          />
        ) : (
          <div className="election-card-name">{election.name}</div>
        )}
        <div className="election-card-meta">
          <span className={`badge badge-${election.status}`}>{election.status}</span>
          {election.roomCode && (
            <span className="room-code-pill">{election.roomCode}</span>
          )}
        </div>
      </div>

      <div className="election-card-actions">
        {election.status === 'draft' && (
          <>
            <button className="btn btn-primary" onClick={onStart}>Start</button>
            <button className="btn btn-secondary" onClick={onEdit}>Edit</button>
          </>
        )}
        {election.status === 'live' && (
          <>
            <button className="btn btn-primary" onClick={onResume}>Resume</button>
            <button className="btn btn-secondary" onClick={onEdit}>Edit</button>
          </>
        )}
        {election.status === 'ended' && (
          <>
            <button className="btn btn-primary" onClick={onResume}>Results</button>
            <button className="btn btn-secondary" onClick={onEdit}>Edit</button>
          </>
        )}
        <button className="btn btn-secondary" onClick={onDuplicate}>Duplicate</button>
        <button className="btn btn-secondary" onClick={startRename}>Rename</button>
        <button className="btn btn-ghost" onClick={onDelete} style={{ color: 'var(--danger)' }}>
          Delete
        </button>
      </div>
    </div>
  )
}
