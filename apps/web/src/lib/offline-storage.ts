import { openDB, type DBSchema } from 'idb';

interface GamutDB extends DBSchema {
  'feed-cache': {
    key: string;
    value: {
      data: any;
      timestamp: number;
    };
  };
}

const DB_NAME = 'the-gamut-db';
const STORE_NAME = 'feed-cache';
const VERSION = 1;

// Singleton promise to prevent multiple DB connections opening at once
let dbPromise: ReturnType<typeof initDB> | null = null;

const initDB = async () => {
  return openDB<GamutDB>(DB_NAME, VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    },
  });
};

const getDB = () => {
  if (!dbPromise) {
    dbPromise = initDB();
  }
  return dbPromise;
};

const offlineStorage = {
  // Save data to the phone
  save: async (key: string, data: any): Promise<void> => {
    try {
      const db = await getDB();
      const record = {
        data,
        timestamp: Date.now()
      };
      await db.put(STORE_NAME, record, key);
      console.debug(`💾 [Offline] Saved: ${key}`);
    } catch (error) {
      console.warn('Offline Storage Save Error:', error);
    }
  },

  // Get data from the phone
  get: async (key: string): Promise<any | null> => {
    try {
      const db = await getDB();
      const record = await db.get(STORE_NAME, key);
      if (!record) return null;
      
      // Optional: Expire cache after 24 hours
      const age = (Date.now() - record.timestamp) / 1000 / 60 / 60;
      if (age > 24) {
          console.debug(`expired cache for ${key}`);
          return null;
      }
      
      console.debug(`📂 [Offline] Loaded: ${key} (${age.toFixed(1)}h old)`);
      return record.data;
    } catch (error) {
      console.warn('Offline Storage Get Error:', error);
      return null;
    }
  },

  // Clear specific data
  clear: async (key: string): Promise<void> => {
    try {
      const db = await getDB();
      await db.delete(STORE_NAME, key);
    } catch (error) {
      console.warn('Offline Storage Clear Error:', error);
    }
  }
};

export default offlineStorage;
