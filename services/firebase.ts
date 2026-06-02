import { initializeApp, getApps } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyDe8nE1iyF5ldqyIGleiyqRWUZPHAZ296A",
  authDomain: "mundial-d1985.firebaseapp.com",
  databaseURL: "https://mundial-d1985-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "mundial-d1985",
  storageBucket: "mundial-d1985.firebasestorage.app",
  messagingSenderId: "944570763011",
  appId: "1:944570763011:web:01f5bb2bcef1b49a850b36"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const db = getDatabase(app);

export function generateUid(): string {
  return 'u_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
