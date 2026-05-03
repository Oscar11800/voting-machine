import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth'
import { doc, setDoc } from 'firebase/firestore'
import { auth, db } from '../firebase'

// Converts a username into a fake email Firebase Auth is happy with
function toFakeEmail(username) {
  return `${username.toLowerCase().trim()}@votingapp.com`
}

export default function Login() {
  const navigate = useNavigate()

  // Track which mode we're in
  const [isSignUp, setIsSignUp] = useState(false)

  // Form field values
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  // Error message to show the user if something goes wrong
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault() // stops the browser from reloading the page on form submit
    setError('')

    const email = toFakeEmail(username)

    try {
      if (isSignUp) {
        // Create the Firebase Auth account
        const credential = await createUserWithEmailAndPassword(auth, email, password)

        // Store the real username in Firestore so we can display it later
        await setDoc(doc(db, 'users', credential.user.uid), {
          username: username.trim(),
          createdAt: new Date(),
        })
      } else {
        await signInWithEmailAndPassword(auth, email, password)
      }

      navigate('/dashboard')
    } catch (err) {
      // Firebase error codes are strings like "auth/user-not-found"
      if (err.code === 'auth/email-already-in-use') {
        setError('That username is already taken.')
      } else if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Invalid username or password.')
      } else if (err.code === 'auth/weak-password') {
        setError('Password must be at least 6 characters.')
      } else {
        setError('Something went wrong. Please try again.')
      }
    }
  }

  return (
    <div>
      <h1>{isSignUp ? 'Create Account' : 'Admin Login'}</h1>

      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={e => setUsername(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        <button type="submit">
          {isSignUp ? 'Sign Up' : 'Log In'}
        </button>
      </form>

      {error && <p>{error}</p>}

      <button onClick={() => setIsSignUp(!isSignUp)}>
        {isSignUp ? 'Already have an account? Log in' : "Don't have an account? Sign up"}
      </button>
    </div>
  )
}
