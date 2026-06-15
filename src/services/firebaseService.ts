import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  query,
  orderBy,
  Timestamp,
  type DocumentData,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyD59qX1rUawRDWBdUXdRNfEEBKTs2vbDtQ',
  authDomain: 'catcgim.firebaseapp.com',
  projectId: 'catcgim',
  messagingSenderId: '503717887651',
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

export type { User };

export interface SavedMemory {
  id: string;
  title: string;
  inputPreview: string;
  html: string;
  createdAt: Date;
}

export function initAuth(onUser: (user: User | null) => void): () => void {
  const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
    onUser(user);
    if (!user) {
      signInAnonymously(auth).catch((err) =>
        console.warn('[Auth] Anonymous sign-in failed:', err)
      );
    }
  });

  const ALLOWED_ORIGINS = ['http://localhost:3000', 'https://portalcgim.netlify.app'];
  const messageHandler = async (event: MessageEvent) => {
    if (!ALLOWED_ORIGINS.includes(event.origin)) return;
    if (event.data?.type !== 'PORTAL_AUTH' || !event.data.customToken) return;
    try {
      await signInWithCustomToken(auth, event.data.customToken);
    } catch (e) {
      console.warn('[SSO] signInWithCustomToken failed:', e);
    }
  };
  window.addEventListener('message', messageHandler);

  return () => {
    unsubscribeAuth();
    window.removeEventListener('message', messageHandler);
  };
}

function memoriesCollection(uid: string) {
  return collection(db, 'memories', uid, 'items');
}

function extractTitle(html: string, fallback: string): string {
  const match = html.match(/<title[^>]*>(.*?)<\/title>/i);
  if (match?.[1]) {
    return match[1].replace('Memória de Reunião - ', '').trim() || fallback;
  }
  return fallback;
}

export async function saveMemory(
  uid: string,
  html: string,
  inputText: string
): Promise<string> {
  const title =
    extractTitle(html, inputText.split('\n')[0].slice(0, 80) || 'Memória sem título');
  const docRef = await addDoc(memoriesCollection(uid), {
    title,
    inputPreview: inputText.slice(0, 300),
    html,
    createdAt: Timestamp.now(),
  });
  return docRef.id;
}

export async function listMemories(uid: string): Promise<SavedMemory[]> {
  const q = query(memoriesCollection(uid), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data() as DocumentData;
    return {
      id: d.id,
      title: data.title as string,
      inputPreview: data.inputPreview as string,
      html: data.html as string,
      createdAt: (data.createdAt as Timestamp).toDate(),
    };
  });
}

export async function deleteMemory(uid: string, memoryId: string): Promise<void> {
  await deleteDoc(doc(db, 'memories', uid, 'items', memoryId));
}
