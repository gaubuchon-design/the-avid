// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — Pro Tools Bridge Store (PT-01 through PT-05)
//  Zustand + Immer store for Pro Tools session bridge state: session
//  management, marker sync, AAF import/export, co-presence, and CRDT.
// ═══════════════════════════════════════════════════════════════════════════

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type {
  SessionBridgeStatus,
  RippleEvent,
  PlayheadState,
  InlineComment,
  CoPresenceUser,
  CRDTOperation,
  SessionDivergence,
  MarkerSyncStatus,
  MarkerMapping,
  MarkerConflict,
  MarkerSyncDirection,
  MarkerSyncMode,
  AAFImportStatus,
  AAFDiffEntry,
} from '@mcua/core';

// ─── Local Types ───────────────────────────────────────────────────────────

type AAFExportStatus = 'idle' | 'exporting' | 'complete' | 'error';

interface AAFImportJob {
  id: string;
  fileName: string;
  status: AAFImportStatus;
  progress: number;
  diff: AAFDiffEntry[];
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

interface AAFExportJob {
  id: string;
  fileName: string;
  status: AAFExportStatus;
  progress: number;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

// ─── State ─────────────────────────────────────────────────────────────────

interface ProToolsState {
  // Session Bridge
  sessionId: string | null;
  bridgeStatus: SessionBridgeStatus;
  isConnected: boolean;

  // Participants
  participants: CoPresenceUser[];

  // Playhead
  localPlayhead: PlayheadState;
  remotePlayhead: PlayheadState | null;
  playheadSyncEnabled: boolean;

  // Ripple Propagation
  rippleBuffer: RippleEvent[];
  ripplePropagationEnabled: boolean;

  // Markers
  markerSyncStatus: MarkerSyncStatus;
  markerMappings: MarkerMapping[];
  markerConflicts: MarkerConflict[];
  markerSyncDirection: MarkerSyncDirection;
  markerSyncMode: MarkerSyncMode;
  lastMarkerSyncAt: string | null;

  // Inline Comments
  comments: InlineComment[];

  // CRDT
  crdtLog: CRDTOperation[];
  divergence: SessionDivergence | null;

  // AAF Import / Export
  aafImportJobs: AAFImportJob[];
  aafExportJobs: AAFExportJob[];

  // UI
  showSessionPanel: boolean;
  showMarkerSyncPanel: boolean;
  showCommentsPanel: boolean;
  activeProToolsTab: 'session' | 'markers' | 'aaf' | 'comments';
  lastError: string | null;
}

// ─── Actions ───────────────────────────────────────────────────────────────

interface ProToolsActions {
  // Session
  connectSession: (sessionId: string, participants?: CoPresenceUser[]) => void;
  disconnectSession: () => void;
  setBridgeStatus: (status: SessionBridgeStatus) => void;

  // Participants
  setParticipants: (participants: CoPresenceUser[]) => void;
  updateParticipant: (userId: string, patch: Partial<CoPresenceUser>) => void;

  // Playhead
  updateLocalPlayhead: (time: number, isPlaying: boolean) => void;
  setRemotePlayhead: (state: PlayheadState | null) => void;
  togglePlayheadSync: () => void;

  // Ripple
  addRippleEvent: (event: RippleEvent) => void;
  clearRippleBuffer: () => void;
  toggleRipplePropagation: () => void;

  // Markers
  syncMarkers: () => void;
  setMarkerSyncStatus: (status: MarkerSyncStatus) => void;
  setMarkerMappings: (mappings: MarkerMapping[]) => void;
  setMarkerConflicts: (conflicts: MarkerConflict[]) => void;
  setMarkerSyncDirection: (direction: MarkerSyncDirection) => void;
  setMarkerSyncMode: (mode: MarkerSyncMode) => void;

  // Comments
  addComment: (comment: InlineComment) => void;
  resolveComment: (commentId: string) => void;
  setComments: (comments: InlineComment[]) => void;

  // CRDT
  appendCRDTOperation: (op: CRDTOperation) => void;
  setDivergence: (divergence: SessionDivergence | null) => void;
  clearCRDTLog: () => void;

  // AAF
  importAAF: (job: AAFImportJob) => void;
  updateAAFImportJob: (id: string, patch: Partial<AAFImportJob>) => void;
  exportAAF: (job: AAFExportJob) => void;
  updateAAFExportJob: (id: string, patch: Partial<AAFExportJob>) => void;

  // UI
  toggleSessionPanel: () => void;
  toggleMarkerSyncPanel: () => void;
  toggleCommentsPanel: () => void;
  setActiveProToolsTab: (tab: ProToolsState['activeProToolsTab']) => void;
  setLastError: (error: string | null) => void;
}

// ─── Store ─────────────────────────────────────────────────────────────────

export const useProToolsStore = create<ProToolsState & ProToolsActions>()(
  immer((set) => ({
    // ── Initial State ───────────────────────────────────────────────────
    sessionId: null,
    bridgeStatus: 'disconnected',
    isConnected: false,

    participants: [],

    localPlayhead: {
      timeSeconds: 0,
      isPlaying: false,
      sourceApp: 'avid',
      timestamp: Date.now(),
    },
    remotePlayhead: null,
    playheadSyncEnabled: true,

    rippleBuffer: [],
    ripplePropagationEnabled: true,

    markerSyncStatus: 'idle',
    markerMappings: [],
    markerConflicts: [],
    markerSyncDirection: 'bidirectional',
    markerSyncMode: 'realtime',
    lastMarkerSyncAt: null,

    comments: [],

    crdtLog: [],
    divergence: null,

    aafImportJobs: [],
    aafExportJobs: [],

    showSessionPanel: true,
    showMarkerSyncPanel: true,
    showCommentsPanel: false,
    activeProToolsTab: 'session',
    lastError: null,

    // ── Session Actions ─────────────────────────────────────────────────

    connectSession: (sessionId, participants) => set((s) => {
      s.sessionId = sessionId;
      s.bridgeStatus = 'connected';
      s.isConnected = true;
      if (participants) {
        s.participants = participants;
      }
      s.lastError = null;
    }),

    disconnectSession: () => set((s) => {
      s.sessionId = null;
      s.bridgeStatus = 'disconnected';
      s.isConnected = false;
      s.participants = [];
      s.remotePlayhead = null;
      s.divergence = null;
    }),

    setBridgeStatus: (status) => set((s) => {
      s.bridgeStatus = status;
      s.isConnected = status === 'connected' || status === 'syncing';
    }),

    // ── Participant Actions ─────────────────────────────────────────────

    setParticipants: (participants) => set((s) => { s.participants = participants; }),

    updateParticipant: (userId, patch) => set((s) => {
      const user = s.participants.find((p) => p.userId === userId);
      if (user) Object.assign(user, patch);
    }),

    // ── Playhead Actions ────────────────────────────────────────────────

    updateLocalPlayhead: (time, isPlaying) => set((s) => {
      s.localPlayhead = {
        timeSeconds: time,
        isPlaying,
        sourceApp: 'avid',
        timestamp: Date.now(),
      };
    }),

    setRemotePlayhead: (state) => set((s) => { s.remotePlayhead = state; }),

    togglePlayheadSync: () => set((s) => {
      s.playheadSyncEnabled = !s.playheadSyncEnabled;
    }),

    // ── Ripple Actions ──────────────────────────────────────────────────

    addRippleEvent: (event) => set((s) => { s.rippleBuffer.push(event); }),

    clearRippleBuffer: () => set((s) => { s.rippleBuffer = []; }),

    toggleRipplePropagation: () => set((s) => {
      s.ripplePropagationEnabled = !s.ripplePropagationEnabled;
    }),

    // ── Marker Actions ──────────────────────────────────────────────────

    syncMarkers: () => set((s) => {
      s.markerSyncStatus = 'syncing';
      s.lastMarkerSyncAt = new Date().toISOString();
    }),

    setMarkerSyncStatus: (status) => set((s) => { s.markerSyncStatus = status; }),

    setMarkerMappings: (mappings) => set((s) => { s.markerMappings = mappings; }),

    setMarkerConflicts: (conflicts) => set((s) => {
      s.markerConflicts = conflicts;
      if (conflicts.length > 0) {
        s.markerSyncStatus = 'conflict';
      }
    }),

    setMarkerSyncDirection: (direction) => set((s) => {
      s.markerSyncDirection = direction;
    }),

    setMarkerSyncMode: (mode) => set((s) => { s.markerSyncMode = mode; }),

    // ── Comment Actions ─────────────────────────────────────────────────

    addComment: (comment) => set((s) => { s.comments.push(comment); }),

    resolveComment: (commentId) => set((s) => {
      const comment = s.comments.find((c) => c.id === commentId);
      if (comment) comment.resolved = true;
    }),

    setComments: (comments) => set((s) => { s.comments = comments; }),

    // ── CRDT Actions ────────────────────────────────────────────────────

    appendCRDTOperation: (op) => set((s) => { s.crdtLog.push(op); }),

    setDivergence: (divergence) => set((s) => {
      s.divergence = divergence;
      if (divergence) {
        s.bridgeStatus = 'diverged';
      }
    }),

    clearCRDTLog: () => set((s) => { s.crdtLog = []; }),

    // ── AAF Actions ─────────────────────────────────────────────────────

    importAAF: (job) => set((s) => { s.aafImportJobs.unshift(job); }),

    updateAAFImportJob: (id, patch) => set((s) => {
      const job = s.aafImportJobs.find((j) => j.id === id);
      if (job) Object.assign(job, patch);
    }),

    exportAAF: (job) => set((s) => { s.aafExportJobs.unshift(job); }),

    updateAAFExportJob: (id, patch) => set((s) => {
      const job = s.aafExportJobs.find((j) => j.id === id);
      if (job) Object.assign(job, patch);
    }),

    // ── UI Actions ──────────────────────────────────────────────────────

    toggleSessionPanel: () => set((s) => { s.showSessionPanel = !s.showSessionPanel; }),

    toggleMarkerSyncPanel: () => set((s) => { s.showMarkerSyncPanel = !s.showMarkerSyncPanel; }),

    toggleCommentsPanel: () => set((s) => { s.showCommentsPanel = !s.showCommentsPanel; }),

    setActiveProToolsTab: (tab) => set((s) => { s.activeProToolsTab = tab; }),

    setLastError: (error) => set((s) => { s.lastError = error; }),
  })),
);
