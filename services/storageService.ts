
import { UserProfile, Document, Message, DocumentChunk } from '../types';

const DB_NAME = 'PI_Brain';
const DB_VERSION = 4; // Bumped version for index verification
const DOC_STORE = 'documents';
const CHUNK_STORE = 'chunks';
const CHAT_STORE = 'chats';

export const storageService = {
  saveProfile: (profile: UserProfile): void => {
    localStorage.setItem('pi_profile', JSON.stringify(profile));
  },

  getProfile: (): UserProfile => {
    const saved = localStorage.getItem('pi_profile');
    return saved ? JSON.parse(saved) : {
      name: '', role: '', company: '', bio: '',
      technicalStack: [], interests: [], lastUpdated: Date.now()
    };
  },

  initDB: (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const transaction = (event.target as IDBOpenDBRequest).transaction;

        // Documents Store
        if (!db.objectStoreNames.contains(DOC_STORE)) {
          db.createObjectStore(DOC_STORE, { keyPath: 'id' });
        }

        // Chunks Store + Index
        let chunkStore;
        if (!db.objectStoreNames.contains(CHUNK_STORE)) {
          chunkStore = db.createObjectStore(CHUNK_STORE, { keyPath: 'id' });
        } else {
          chunkStore = transaction!.objectStore(CHUNK_STORE);
        }
        
        if (!chunkStore.indexNames.contains('docId')) {
          chunkStore.createIndex('docId', 'docId', { unique: false });
        }

        // Chat Store
        if (!db.objectStoreNames.contains(CHAT_STORE)) {
          db.createObjectStore(CHAT_STORE, { keyPath: 'id' });
        }
      };
    });
  },

  saveChat: async (messages: Message[]): Promise<void> => {
    const db = await storageService.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(CHAT_STORE, 'readwrite');
      const store = transaction.objectStore(CHAT_STORE);
      store.clear();
      messages.forEach(msg => store.put(msg));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  },

  getChat: async (): Promise<Message[]> => {
    const db = await storageService.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(CHAT_STORE, 'readonly');
      const store = transaction.objectStore(CHAT_STORE);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result.sort((a, b: any) => a.timestamp - b.timestamp));
      request.onerror = () => reject(request.error);
    });
  },

  saveDocument: async (doc: Document, chunks: DocumentChunk[]): Promise<void> => {
    const db = await storageService.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([DOC_STORE, CHUNK_STORE], 'readwrite');
      const docStore = transaction.objectStore(DOC_STORE);
      const chunkStore = transaction.objectStore(CHUNK_STORE);
      docStore.put(doc);
      chunks.forEach(chunk => chunkStore.put(chunk));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  },

  getDocuments: async (): Promise<Document[]> => {
    const db = await storageService.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DOC_STORE, 'readonly');
      const store = transaction.objectStore(DOC_STORE);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  getChunks: async (): Promise<DocumentChunk[]> => {
    const db = await storageService.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(CHUNK_STORE, 'readonly');
      const store = transaction.objectStore(CHUNK_STORE);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  deleteDocument: async (id: string): Promise<void> => {
    const db = await storageService.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([DOC_STORE, CHUNK_STORE], 'readwrite');
      const docStore = transaction.objectStore(DOC_STORE);
      const chunkStore = transaction.objectStore(CHUNK_STORE);
      const chunkIndex = chunkStore.index('docId');

      // Delete the document entry
      docStore.delete(id);

      // Find and delete all related chunks
      const request = chunkIndex.getAllKeys(id);
      request.onsuccess = () => {
        const keys = request.result;
        keys.forEach(key => chunkStore.delete(key));
      };

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
};
