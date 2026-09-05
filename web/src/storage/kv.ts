/**
 * The tiny key-value contract the browser backend is built on. IndexedDB at
 * runtime; a Map in tests, so the backend's logic is exercised without a
 * browser.
 */
export interface KeyValueStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  keys(prefix?: string): Promise<string[]>;
}

export class MemoryStore implements KeyValueStore {
  private readonly map = new Map<string, string>();
  async get(key: string) {
    return this.map.get(key);
  }
  async set(key: string, value: string) {
    this.map.set(key, value);
  }
  async delete(key: string) {
    this.map.delete(key);
  }
  async keys(prefix = '') {
    return [...this.map.keys()].filter((key) => key.startsWith(prefix)).sort();
  }
}

const DB_NAME = 'agent-skiller';
const DB_VERSION = 1;
const STORE = 'kv';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open IndexedDB.'));
    request.onblocked = () => reject(new Error('IndexedDB is blocked by another tab.'));
  });
}

function settle<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

export class IndexedDbStore implements KeyValueStore {
  private database: Promise<IDBDatabase> | null = null;

  private db(): Promise<IDBDatabase> {
    this.database ??= openDatabase();
    return this.database;
  }

  private async store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    return (await this.db()).transaction(STORE, mode).objectStore(STORE);
  }

  async get(key: string): Promise<string | undefined> {
    const value = await settle((await this.store('readonly')).get(key));
    return typeof value === 'string' ? value : undefined;
  }

  async set(key: string, value: string): Promise<void> {
    await settle((await this.store('readwrite')).put(value, key));
  }

  async delete(key: string): Promise<void> {
    await settle((await this.store('readwrite')).delete(key));
  }

  async keys(prefix = ''): Promise<string[]> {
    const all = await settle((await this.store('readonly')).getAllKeys());
    return all.map(String).filter((key) => key.startsWith(prefix)).sort();
  }

  /** Structured-cloneable values (a directory handle) go in beside the strings. */
  async getRaw<T>(key: string): Promise<T | undefined> {
    return (await settle((await this.store('readonly')).get(key))) as T | undefined;
  }

  async setRaw(key: string, value: unknown): Promise<void> {
    await settle((await this.store('readwrite')).put(value, key));
  }
}

export function indexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined';
  } catch {
    return false;
  }
}
