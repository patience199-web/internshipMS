import axios from 'axios';
import {
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { firebaseAuth, authPersistenceReady } from './firebase';

const baseURL = (import.meta.env.VITE_FIREBASE_API_URL || '').replace(/\/+$/, '');
export const api = axios.create({
  baseURL,
  timeout: 30000,
});

api.interceptors.request.use(async (config) => {
  if (!baseURL) {
    throw new Error('Firebase API URL is missing. Set VITE_FIREBASE_API_URL in frontend/.env.');
  }
  await authPersistenceReady;
  const current = firebaseAuth.currentUser;
  if (current) {
    const token = await current.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error?.response?.status === 401 && firebaseAuth.currentUser) {
      window.dispatchEvent(new Event('ims:unauthorized'));
    }
    return Promise.reject(error);
  },
);

export const authApi = {
  async login(email, password) {
    await authPersistenceReady;
    await signInWithEmailAndPassword(firebaseAuth, email.trim().toLowerCase(), password);
    try {
      const { data } = await api.get('/auth/me/');
      return data;
    } catch (error) {
      await signOut(firebaseAuth);
      throw error;
    }
  },
  async me() {
    await authPersistenceReady;
    if (!firebaseAuth.currentUser) throw new Error('You are not signed in.');
    return (await api.get('/auth/me/')).data;
  },
  async logout() {
    await signOut(firebaseAuth);
  },
  isAuthenticated() {
    return !!firebaseAuth.currentUser;
  },
};

export const endpoint = (path) => `/${path.replace(/^\/+/, '')}`;
export const getList = async (path, params = {}) => {
  const { data } = await api.get(endpoint(path), { params });
  return Array.isArray(data) ? data : (data.results || []);
};
export const getErrorMessage = (error) => {
  const data = error?.response?.data;
  if (!data) {
    const code = error?.code || '';
    if (code.startsWith('auth/')) {
      const messages = {
        'auth/invalid-credential': 'The email address or password is incorrect.',
        'auth/user-disabled': 'This account has been disabled. Contact your coordinator.',
        'auth/too-many-requests': 'Too many sign-in attempts. Please try again later.',
        'auth/network-request-failed': 'Network error. Check your internet connection and try again.',
      };
      return messages[code] || error?.message || 'Authentication failed. Please try again.';
    }
    return error?.message || 'Something went wrong. Please try again.';
  }
  if (typeof data === 'string') return data;
  if (data.detail) return data.detail;
  return Object.entries(data)
    .map(([field, value]) => `${field.replaceAll('_', ' ')}: ${Array.isArray(value) ? value.join(', ') : typeof value === 'object' ? JSON.stringify(value) : value}`)
    .join(' · ');
};

export async function downloadReport(name, format = 'csv') {
  const response = await api.get(`/reports/${name}/`, { params: { format }, responseType: 'blob' });
  const url = URL.createObjectURL(response.data);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `internship-${name}.${format}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function downloadPrivateFile(filePath, filename = 'attachment') {
  const response = await api.get('/files/download/', {
    params: { path: filePath },
    responseType: 'blob',
  });
  const url = URL.createObjectURL(response.data);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
