import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore'
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
    <div>
      <div>
        <h1>My Elections</h1>
        <button onClick={handleSignOut}>Sign Out</button>
      </div>

      <button onClick={createElection}>+ New Election</button>

      {elections.length === 0 && (
        <p>No elections yet. Create one to get started.</p>
      )}

      <ul>
        {elections.map(election => (
          <ElectionCard
            key={election.id}
            election={election}
            onEdit={() => navigate(`/election/${election.id}`)}
            onResume={() => navigate(`/live/${election.id}`)}
          />
        ))}
      </ul>
    </div>
  )
}

function ElectionCard({ election, onEdit, onResume }) {
  return (
    <li>
      <strong>{election.name}</strong>
      <span> — {election.status}</span>
      {election.status === 'draft' && (
        <button onClick={onEdit}>Edit</button>
      )}
      {election.status === 'live' && (
        <button onClick={onResume}>Resume</button>
      )}
    </li>
  )
}
