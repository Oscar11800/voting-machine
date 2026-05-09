import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getDatabase } from 'firebase/database'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'voting-machine-8ebdf',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

console.log('[FIREBASE] config:', {
  projectId: firebaseConfig.projectId || 'MISSING',
  databaseURL: firebaseConfig.databaseURL || 'MISSING',
  authDomain: firebaseConfig.authDomain || 'MISSING',
})
const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)

const voterApp = initializeApp(firebaseConfig, 'voter')
export const voterAuth = getAuth(voterApp)
export const voterDb = getFirestore(voterApp)

export const db = getFirestore(app)
export const rtdb = getDatabase(app)
