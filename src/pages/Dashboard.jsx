import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore'
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

  async function handleSignOut() {
    await signOut(auth)
    navigate('/login')
  }

  return (
    <div className="page-wide">
      <div className="page-header">
        <h1>My Elections</h1>
        <div className="row">
          <button className="btn btn-primary" onClick={createElection}>+ New Election</button>
          <button className="btn btn-ghost" onClick={handleSignOut}>Sign Out</button>
        </div>
      </div>

      {elections.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <p style={{ fontSize: 16, color: 'var(--text-muted)', marginBottom: 16 }}>
            No elections yet. Create one to get started.
          </p>
          <button className="btn btn-primary" onClick={createElection}>
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
            onDelete={async () => {
              if (window.confirm(`Delete "${election.name}"? This cannot be undone.`)) {
                await deleteDoc(doc(db, 'elections', election.id))
              }
            }}
          />
        ))}
      </div>
    </div>
  )
}

function ElectionCard({ election, onEdit, onResume, onDelete }) {
  return (
    <div className="election-card">
      <div className="election-card-info">
        <div className="election-card-name">{election.name}</div>
        <div className="election-card-meta">
          <span className={`badge badge-${election.status}`}>{election.status}</span>
          {election.roomCode && (
            <span className="room-code-pill">{election.roomCode}</span>
          )}
        </div>
      </div>

      <div className="election-card-actions">
        {election.status === 'draft' && (
          <button className="btn btn-secondary btn-sm" onClick={onEdit}>Edit</button>
        )}
        {election.status === 'live' && (
          <>
            <button className="btn btn-primary btn-sm" onClick={onResume}>Resume</button>
            <button className="btn btn-secondary btn-sm" onClick={onEdit}>Edit</button>
          </>
        )}
        {election.status === 'ended' && (
          <button className="btn btn-secondary btn-sm" onClick={onEdit}>Results</button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={onDelete} style={{ color: 'var(--danger)' }}>
          Delete
        </button>
      </div>
    </div>
  )
}
