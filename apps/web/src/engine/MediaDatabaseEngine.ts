// =============================================================================
//  THE AVID — Media Database Engine
//  IndexedDB-backed media index (.mdb equivalent) for tracking ingested media,
//  their locations, metadata, and online/offline status.
// =============================================================================

import type { ExtractedMetadata } from './MediaProbeEngine';

// ─── Types ────────────────────────────────────────────────────────────────────

export type MediaOrgMode = 'organize-index' | 'keep-in-place' | 'custom-location';

export interface ProjectMediaSettings {
  organizationMode: MediaOrgMode;
  customMediaPath?: string;
  generateProxies: boolean;
  proxyResolution: '1/4' | '1/2' | 'full';
}

export const DEFAULT_MEDIA_SETTINGS: ProjectMediaSettings = {
  organizationMode: 'keep-in-place',
  generateProxies: false,
  proxyResolution: '1/2',
};

export interface MediaDatabaseEntry {
  id: string;
  fileName: string;
  originalPath: string;
  managedPath?: string;       // only when organized
  proxyPath?: string;
  objectUrl?: string;         // browser blob URL for playback
  metadata: ExtractedMetadata;
  status: 'online' | 'offline' | 'proxy-only';
  binId?: string;
  addedAt: number;            // timestamp
  lastVerified: number;       // timestamp
}

export interface MediaDatabaseIndex {
  version: number;
  projectId: string;
  entries: MediaDatabaseEntry[];
  settings: ProjectMediaSettings;
  exportedAt: number;
}

// ─── IndexedDB Constants ──────────────────────────────────────────────────────

const DB_NAME = 'avid-media-db';
const DB_VERSION = 1;
const STORE_NAME = 'media-entries';
const SETTINGS_STORE = 'settings';

// ─── Engine ───────────────────────────────────────────────────────────────────

class MediaDatabaseEngineClass {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;
  private listeners = new Set<() => void>();

  /** Initialize the IndexedDB database. */
  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('fileName', 'fileName', { unique: false });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('binId', 'binId', { unique: false });
          store.createIndex('addedAt', 'addedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
          db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onerror = () => reject(request.error);
    });

    return this.initPromise;
  }

  /** Add a media entry to the database. */
  async addEntry(entry: MediaDatabaseEntry): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(entry);
      tx.oncomplete = () => { this.notify(); resolve(); };
      tx.onerror = () => reject(tx.error);
    });
  }

  /** Get a single entry by ID. */
  async getEntry(id: string): Promise<MediaDatabaseEntry | undefined> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /** Remove an entry by ID. */
  async removeEntry(id: string): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => { this.notify(); resolve(); };
      tx.onerror = () => reject(tx.error);
    });
  }

  /** Get all entries. */
  async getAllEntries(): Promise<MediaDatabaseEntry[]> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => reject(req.error);
    });
  }

  /** Query entries by bin. */
  async getEntriesByBin(binId: string): Promise<MediaDatabaseEntry[]> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const idx = tx.objectStore(STORE_NAME).index('binId');
      const req = idx.getAll(binId);
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => reject(req.error);
    });
  }

  /** Query entries by status. */
  async getEntriesByStatus(status: MediaDatabaseEntry['status']): Promise<MediaDatabaseEntry[]> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const idx = tx.objectStore(STORE_NAME).index('status');
      const req = idx.getAll(status);
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => reject(req.error);
    });
  }

  /** Save project media settings. */
  async saveSettings(settings: ProjectMediaSettings): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(SETTINGS_STORE, 'readwrite');
      tx.objectStore(SETTINGS_STORE).put({ key: 'mediaSettings', ...settings });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /** Load project media settings. */
  async loadSettings(): Promise<ProjectMediaSettings> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(SETTINGS_STORE, 'readonly');
      const req = tx.objectStore(SETTINGS_STORE).get('mediaSettings');
      req.onsuccess = () => {
        if (req.result) {
          const { key: _key, ...settings } = req.result;
          resolve(settings as ProjectMediaSettings);
        } else {
          resolve({ ...DEFAULT_MEDIA_SETTINGS });
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Export the entire media index as a JSON object (MDB file equivalent).
   * This can be serialized and shared between projects/systems.
   */
  async exportIndex(projectId: string): Promise<MediaDatabaseIndex> {
    const entries = await this.getAllEntries();
    const settings = await this.loadSettings();
    return {
      version: 1,
      projectId,
      entries,
      settings,
      exportedAt: Date.now(),
    };
  }

  /**
   * Import a media database index (from an MDB file).
   * Merges entries — existing entries with matching IDs are updated.
   */
  async importIndex(index: MediaDatabaseIndex): Promise<number> {
    let count = 0;
    for (const entry of index.entries) {
      // Mark as offline until verified
      await this.addEntry({ ...entry, status: 'offline', lastVerified: Date.now() });
      count++;
    }
    if (index.settings) {
      await this.saveSettings(index.settings);
    }
    return count;
  }

  /**
   * Verify online status of all entries.
   * For browser-based entries with objectUrls, checks if blob still exists.
   */
  async verifyOnlineStatus(): Promise<{ online: number; offline: number }> {
    const entries = await this.getAllEntries();
    let online = 0, offline = 0;

    for (const entry of entries) {
      if (entry.objectUrl) {
        // Blob URLs are valid for the session only
        try {
          const response = await fetch(entry.objectUrl, { method: 'HEAD' });
          if (response.ok) {
            if (entry.status !== 'online') {
              await this.addEntry({ ...entry, status: 'online', lastVerified: Date.now() });
            }
            online++;
          } else {
            if (entry.status !== 'offline') {
              await this.addEntry({ ...entry, status: 'offline', lastVerified: Date.now() });
            }
            offline++;
          }
        } catch {
          if (entry.status !== 'offline') {
            await this.addEntry({ ...entry, status: 'offline', lastVerified: Date.now() });
          }
          offline++;
        }
      } else {
        offline++;
      }
    }

    return { online, offline };
  }

  /** Subscribe to database changes. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((fn) => {
      try { fn(); } catch (err) {
        console.error('[MediaDatabaseEngine] Listener error:', err);
      }
    });
  }

  /** Get entry count. */
  async getCount(): Promise<number> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
}

export const mediaDatabaseEngine = new MediaDatabaseEngineClass();
