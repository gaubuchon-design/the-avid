// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — NEXIS Storage Store (NX-01, NX-02)
//  Zustand + Immer store for Avid NEXIS shared storage: workspace browsing,
//  bin-level locking, write targets, co-presence, cache management, and
//  MediaServices job tracking.
// ═══════════════════════════════════════════════════════════════════════════

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type {
  NEXISConnectionStatus,
  NEXISWorkspace,
  NEXISStorageGroup,
  NEXISMediaEntry,
  NEXISBinLock,
  NEXISCoPresenceUser,
  NEXISMediaServicesJob,
  NEXISWriteTarget,
  CacheEntry,
  CacheStats,
} from '@mcua/core';

// ─── State ─────────────────────────────────────────────────────────────────

interface NEXISState {
  // Connection
  connectionStatus: NEXISConnectionStatus;
  isConnected: boolean;
  hostname: string | null;
  lastError: string | null;

  // Workspaces
  workspaces: NEXISWorkspace[];
  activeWorkspaceId: string | null;
  storageGroups: NEXISStorageGroup[];

  // Media Browsing
  mediaPaths: NEXISMediaEntry[];
  selectedMediaId: string | null;

  // Bin Locking
  binLocks: NEXISBinLock[];

  // Write Targets
  writeTargets: NEXISWriteTarget[];

  // Co-Presence
  coPresenceUsers: NEXISCoPresenceUser[];

  // MediaServices Jobs
  mediaServicesJobs: NEXISMediaServicesJob[];

  // Cache (NX-02)
  cacheEntries: CacheEntry[];
  cacheStats: CacheStats;

  // Storage Usage (aggregate)
  storageUsed: number;  // bytes
  storageTotal: number; // bytes

  // UI
  showWorkspaceBrowser: boolean;
  showCachePanel: boolean;
  showMediaServicesPanel: boolean;
  activeNexisTab: 'workspaces' | 'cache' | 'media-services' | 'co-presence';
}

// ─── Actions ───────────────────────────────────────────────────────────────

interface NEXISActions {
  // Connection
  connectWorkspace: (hostname: string) => void;
  disconnectWorkspace: () => void;
  setConnectionStatus: (status: NEXISConnectionStatus) => void;
  setLastError: (error: string | null) => void;

  // Workspaces
  setWorkspaces: (workspaces: NEXISWorkspace[]) => void;
  selectWorkspace: (id: string | null) => void;
  setStorageGroups: (groups: NEXISStorageGroup[]) => void;

  // Media Browsing
  setMediaPaths: (entries: NEXISMediaEntry[]) => void;
  selectMedia: (id: string | null) => void;

  // Bin Locking
  lockPath: (binId: string, binName: string) => void;
  unlockPath: (binId: string) => void;
  setBinLocks: (locks: NEXISBinLock[]) => void;

  // Write Targets
  setWriteTargets: (targets: NEXISWriteTarget[]) => void;
  setDefaultWriteTarget: (workspaceId: string, purpose: NEXISWriteTarget['purpose']) => void;

  // Co-Presence
  setCoPresenceUsers: (users: NEXISCoPresenceUser[]) => void;
  updateCoPresenceUser: (userId: string, patch: Partial<NEXISCoPresenceUser>) => void;

  // MediaServices
  addMediaServicesJob: (job: NEXISMediaServicesJob) => void;
  updateMediaServicesJob: (jobId: string, patch: Partial<NEXISMediaServicesJob>) => void;
  removeMediaServicesJob: (jobId: string) => void;

  // Cache
  refreshCache: () => void;
  setCacheEntries: (entries: CacheEntry[]) => void;
  updateCacheEntry: (id: string, patch: Partial<CacheEntry>) => void;
  setCacheStats: (stats: CacheStats) => void;

  // UI
  toggleWorkspaceBrowser: () => void;
  toggleCachePanel: () => void;
  toggleMediaServicesPanel: () => void;
  setActiveNexisTab: (tab: NEXISState['activeNexisTab']) => void;
}

// ─── Default Cache Stats ───────────────────────────────────────────────────

const DEFAULT_CACHE_STATS: CacheStats = {
  totalCapacityBytes: 100 * 1024 * 1024 * 1024, // 100 GB
  usedBytes: 0,
  freeBytes: 100 * 1024 * 1024 * 1024,
  entryCount: 0,
  pinnedCount: 0,
  hitRate: 0,
  missRate: 0,
  totalHits: 0,
  totalMisses: 0,
  averageFetchTimeMs: 0,
  bandwidthUsageMbps: 0,
};

// ─── Store ─────────────────────────────────────────────────────────────────

export const useNexisStore = create<NEXISState & NEXISActions>()(
  immer((set) => ({
    // ── Initial State ───────────────────────────────────────────────────
    connectionStatus: 'disconnected',
    isConnected: false,
    hostname: null,
    lastError: null,

    workspaces: [],
    activeWorkspaceId: null,
    storageGroups: [],

    mediaPaths: [],
    selectedMediaId: null,

    binLocks: [],

    writeTargets: [],

    coPresenceUsers: [],

    mediaServicesJobs: [],

    cacheEntries: [],
    cacheStats: DEFAULT_CACHE_STATS,

    storageUsed: 0,
    storageTotal: 0,

    showWorkspaceBrowser: true,
    showCachePanel: false,
    showMediaServicesPanel: false,
    activeNexisTab: 'workspaces',

    // ── Connection Actions ──────────────────────────────────────────────

    connectWorkspace: (hostname) => set((s) => {
      s.hostname = hostname;
      s.lastError = null;
      // Optimistically mark as connected. In a real implementation,
      // the connection handshake would transition through 'connecting'
      // asynchronously via setConnectionStatus.
      s.connectionStatus = 'connected';
      s.isConnected = true;
    }),

    disconnectWorkspace: () => set((s) => {
      s.connectionStatus = 'disconnected';
      s.isConnected = false;
      s.hostname = null;
      s.workspaces = [];
      s.activeWorkspaceId = null;
      s.binLocks = [];
      s.coPresenceUsers = [];
      s.mediaServicesJobs = [];
    }),

    setConnectionStatus: (status) => set((s) => {
      s.connectionStatus = status;
      s.isConnected = status === 'connected';
    }),

    setLastError: (error) => set((s) => { s.lastError = error; }),

    // ── Workspace Actions ───────────────────────────────────────────────

    setWorkspaces: (workspaces) => set((s) => {
      s.workspaces = workspaces;
      // Recompute aggregate storage
      s.storageTotal = workspaces.reduce((sum, ws) => sum + ws.totalCapacityBytes, 0);
      s.storageUsed = workspaces.reduce((sum, ws) => sum + ws.usedCapacityBytes, 0);
    }),

    selectWorkspace: (id) => set((s) => { s.activeWorkspaceId = id; }),

    setStorageGroups: (groups) => set((s) => { s.storageGroups = groups; }),

    // ── Media Browsing Actions ──────────────────────────────────────────

    setMediaPaths: (entries) => set((s) => { s.mediaPaths = entries; }),

    selectMedia: (id) => set((s) => { s.selectedMediaId = id; }),

    // ── Bin Lock Actions ────────────────────────────────────────────────

    lockPath: (binId, binName) => set((s) => {
      const existing = s.binLocks.findIndex((l) => l.binId === binId);
      const lock: NEXISBinLock = {
        binId,
        binName,
        lockStatus: 'locked-self',
        lockedBy: 'current-user',
        lockedByDisplayName: 'You',
        lockedAt: new Date().toISOString(),
        workspace: s.workspaces.find((w) => w.id === s.activeWorkspaceId)?.name ?? 'default',
      };
      if (existing >= 0) {
        s.binLocks[existing] = lock;
      } else {
        s.binLocks.push(lock);
      }
    }),

    unlockPath: (binId) => set((s) => {
      const lock = s.binLocks.find((l) => l.binId === binId);
      if (lock) {
        lock.lockStatus = 'unlocked';
        lock.lockedBy = null;
        lock.lockedByDisplayName = null;
        lock.lockedAt = null;
      }
    }),

    setBinLocks: (locks) => set((s) => { s.binLocks = locks; }),

    // ── Write Target Actions ────────────────────────────────────────────

    setWriteTargets: (targets) => set((s) => { s.writeTargets = targets; }),

    setDefaultWriteTarget: (workspaceId, purpose) => set((s) => {
      for (const target of s.writeTargets) {
        if (target.purpose === purpose) {
          target.isDefault = target.workspaceId === workspaceId;
        }
      }
    }),

    // ── Co-Presence Actions ─────────────────────────────────────────────

    setCoPresenceUsers: (users) => set((s) => { s.coPresenceUsers = users; }),

    updateCoPresenceUser: (userId, patch) => set((s) => {
      const user = s.coPresenceUsers.find((u) => u.userId === userId);
      if (user) Object.assign(user, patch);
    }),

    // ── MediaServices Actions ───────────────────────────────────────────

    addMediaServicesJob: (job) => set((s) => { s.mediaServicesJobs.unshift(job); }),

    updateMediaServicesJob: (jobId, patch) => set((s) => {
      const job = s.mediaServicesJobs.find((j) => j.id === jobId);
      if (job) Object.assign(job, patch);
    }),

    removeMediaServicesJob: (jobId) => set((s) => {
      s.mediaServicesJobs = s.mediaServicesJobs.filter((j) => j.id !== jobId);
    }),

    // ── Cache Actions ───────────────────────────────────────────────────

    refreshCache: () => set((s) => {
      // Trigger a cache refresh by resetting stats; in real implementation
      // this would call the NEXISCacheManager to re-scan
      s.cacheStats = {
        ...s.cacheStats,
        hitRate: 0,
        missRate: 0,
      };
    }),

    setCacheEntries: (entries) => set((s) => { s.cacheEntries = entries; }),

    updateCacheEntry: (id, patch) => set((s) => {
      const entry = s.cacheEntries.find((e) => e.id === id);
      if (entry) Object.assign(entry, patch);
    }),

    setCacheStats: (stats) => set((s) => { s.cacheStats = stats; }),

    // ── UI Actions ──────────────────────────────────────────────────────

    toggleWorkspaceBrowser: () => set((s) => { s.showWorkspaceBrowser = !s.showWorkspaceBrowser; }),

    toggleCachePanel: () => set((s) => { s.showCachePanel = !s.showCachePanel; }),

    toggleMediaServicesPanel: () => set((s) => {
      s.showMediaServicesPanel = !s.showMediaServicesPanel;
    }),

    setActiveNexisTab: (tab) => set((s) => { s.activeNexisTab = tab; }),
  })),
);
