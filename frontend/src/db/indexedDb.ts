export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  summary?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  error?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessageItem[];
  model: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskItem {
  id: number;
  title: string;
  description: string;
  category: string;
  estimated_minutes: number;
  priority: 'High' | 'Medium' | 'Low';
  completed: boolean;
}

export interface TaskPlan {
  id: string;
  title: string;
  objective: string;
  tasks: TaskItem[];
  approved: boolean;
  createdAt: string;
}

export interface LocalDocument {
  id: string;
  filename: string;
  charCount: number;
  estimatedTokens: number;
  pagesCount: number;
  text: string;
  summary?: string;
  createdAt: string;
}

export interface ActivityItem {
  id: string;
  type: 'chat' | 'note' | 'document' | 'plan' | 'system';
  title: string;
  details: string;
  timestamp: string;
}

const DB_NAME = 'OfflineMateDB';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

export function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains('notes')) {
        const notesStore = db.createObjectStore('notes', { keyPath: 'id' });
        notesStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      if (!db.objectStoreNames.contains('chats')) {
        const chatsStore = db.createObjectStore('chats', { keyPath: 'id' });
        chatsStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      if (!db.objectStoreNames.contains('tasks')) {
        const tasksStore = db.createObjectStore('tasks', { keyPath: 'id' });
        tasksStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      if (!db.objectStoreNames.contains('documents')) {
        const docsStore = db.createObjectStore('documents', { keyPath: 'id' });
        docsStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      if (!db.objectStoreNames.contains('activity')) {
        const actStore = db.createObjectStore('activity', { keyPath: 'id' });
        actStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });

  return dbPromise;
}

// --- Generic Helper ---
async function tx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest | void
): Promise<T> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const req = callback(store);

    transaction.oncomplete = () => {
      if (req) resolve((req as IDBRequest).result);
      else resolve(undefined as unknown as T);
    };

    transaction.onerror = () => reject(transaction.error);
  });
}

// --- Notes API ---
export async function getAllNotes(): Promise<Note[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('notes', 'readonly');
    const store = transaction.objectStore('notes');
    const req = store.getAll();
    req.onsuccess = () => {
      const list = req.result as Note[];
      list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      resolve(list);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveNote(note: Note): Promise<void> {
  await tx('notes', 'readwrite', (store) => store.put(note));
  await addActivity({
    id: 'act_' + Date.now(),
    type: 'note',
    title: `Saved Note: ${note.title}`,
    details: `${note.tags.join(', ')} - ${note.content.slice(0, 80)}`,
    timestamp: new Date().toISOString()
  });
}

export async function deleteNote(id: string): Promise<void> {
  await tx('notes', 'readwrite', (store) => store.delete(id));
  await addActivity({
    id: 'act_' + Date.now(),
    type: 'note',
    title: 'Deleted Note',
    details: `Note ID: ${id}`,
    timestamp: new Date().toISOString()
  });
}

// --- Chat Sessions API ---
export async function getAllChats(): Promise<ChatSession[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readonly');
    const store = transaction.objectStore('chats');
    const req = store.getAll();
    req.onsuccess = () => {
      const list = req.result as ChatSession[];
      list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      resolve(list);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveChat(chat: ChatSession): Promise<void> {
  await tx('chats', 'readwrite', (store) => store.put(chat));
}

export async function deleteChat(id: string): Promise<void> {
  await tx('chats', 'readwrite', (store) => store.delete(id));
}

// --- Task Plans API ---
export async function getAllTaskPlans(): Promise<TaskPlan[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('tasks', 'readonly');
    const store = transaction.objectStore('tasks');
    const req = store.getAll();
    req.onsuccess = () => {
      const list = req.result as TaskPlan[];
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      resolve(list);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveTaskPlanLocal(plan: TaskPlan): Promise<void> {
  await tx('tasks', 'readwrite', (store) => store.put(plan));
  await addActivity({
    id: 'act_' + Date.now(),
    type: 'plan',
    title: `Task Plan: ${plan.title}`,
    details: `${plan.tasks.length} tasks - Approved: ${plan.approved ? 'Yes' : 'Pending'}`,
    timestamp: new Date().toISOString()
  });
}

export async function deleteTaskPlanLocal(id: string): Promise<void> {
  await tx('tasks', 'readwrite', (store) => store.delete(id));
}

// --- Documents API ---
export async function getAllDocuments(): Promise<LocalDocument[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('documents', 'readonly');
    const store = transaction.objectStore('documents');
    const req = store.getAll();
    req.onsuccess = () => {
      const list = req.result as LocalDocument[];
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      resolve(list);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveDocument(doc: LocalDocument): Promise<void> {
  await tx('documents', 'readwrite', (store) => store.put(doc));
  await addActivity({
    id: 'act_' + Date.now(),
    type: 'document',
    title: `Added Document: ${doc.filename}`,
    details: `${doc.charCount} chars, ~${doc.estimatedTokens} tokens`,
    timestamp: new Date().toISOString()
  });
}

export async function deleteDocument(id: string): Promise<void> {
  await tx('documents', 'readwrite', (store) => store.delete(id));
}

// --- Activity Log API ---
export async function getAllActivities(): Promise<ActivityItem[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('activity', 'readonly');
    const store = transaction.objectStore('activity');
    const req = store.getAll();
    req.onsuccess = () => {
      const list = req.result as ActivityItem[];
      list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      resolve(list);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function addActivity(activity: ActivityItem): Promise<void> {
  await tx('activity', 'readwrite', (store) => store.put(activity));
}

export async function clearAllLocalData(): Promise<void> {
  const db = await getDB();
  const stores = ['notes', 'chats', 'tasks', 'documents', 'activity'];
  for (const store of stores) {
    await tx(store, 'readwrite', (s) => s.clear());
  }
}

// --- Settings API ---
export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  try {
    const res = await tx<{ key: string; value: T }>('settings', 'readonly', (store) => store.get(key));
    return res ? res.value : defaultValue;
  } catch {
    return defaultValue;
  }
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await tx('settings', 'readwrite', (store) => store.put({ key, value }));
}

// --- Seed initial demo data for smooth first-run UX ---
export async function initSeedDataIfEmpty(): Promise<void> {
  const notes = await getAllNotes();
  if (notes.length === 0) {
    const now = new Date().toISOString();
    await saveNote({
      id: 'note_seed_1',
      title: 'Welcome to OfflineMate AI',
      content: `# Your AI. Your files. Your device. No internet required.

Welcome to OfflineMate AI! This is a 100% private, local personal agent built for HackOctober.

### Key Capabilities:
- **Level 1 (Browser Offline)**: All your notes, tasks, search, tags, and document storage run inside your browser's IndexedDB. Even without the backend running, you can create and organize notes!
- **Level 2 (Genuine Offline AI)**: Powered by your local Ollama runtime and model (e.g. \`qwen3.5:4b\`). Summarize documents, chat, plan tasks, and ask grounded questions with zero cloud exposure.

Try clicking **"Summarize with AI"** or head over to the **Task Planner** to generate an action schedule from your notes!`,
      tags: ['guide', 'offline', 'getting-started'],
      createdAt: now,
      updatedAt: now
    });

    await saveNote({
      id: 'note_seed_2',
      title: 'Computer Science Final Exam Prep',
      content: `Topics for OS & Distributed Systems:
1. Concurrency control: Deadlocks, Semaphores, Mutexes, and Dining Philosophers.
2. Virtual Memory: Paging algorithms (LRU, FIFO), page faults, TLB caches.
3. Raft Consensus Algorithm: Leader election, log replication, safety guarantees.
4. Local AI Inference: Quantization (Q4_K_M), KV caching, token generation pipelines.`,
      tags: ['study', 'exams', 'cs'],
      createdAt: now,
      updatedAt: now
    });
  }
}
