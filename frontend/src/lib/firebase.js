import { initializeApp, getApps } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const required = ['apiKey', 'authDomain', 'projectId', 'appId'];
const missing = required.filter((key) => !firebaseConfig[key]);
if (missing.length) {
  throw new Error(`Missing Firebase configuration: ${missing.join(', ')}. Copy frontend/.env.example to frontend/.env and add your Firebase web app settings.`);
}

export const firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
export const authPersistenceReady = setPersistence(firebaseAuth, browserLocalPersistence);
