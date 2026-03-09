// ─── Collab Package — Barrel Export ──────────────────────────────────────────
// Re-exports all types, classes, and utilities from the collaborative
// project structure package.
// ─────────────────────────────────────────────────────────────────────────────

// ── CRDT-based Document Model ───────────────────────────────────────────────
export {
  // Types
  type NodeId,
  type LamportTimestamp,
  type HLC,
  type LWWRegister,
  type GSetEntry,
  type CollabTrackType,
  type CollabTrackData,
  type CollabClipData,
  type ChangeEntry,
  type ChangeOperation,
  type ProjectDocumentSnapshot,

  // Functions
  compareHLC,
  createLWW,
  writeLWW,

  // Classes
  GSet,
  HLClock,
  ProjectDocument,
} from './ProjectDocument';

// ── Sync Protocol ───────────────────────────────────────────────────────────
export {
  // Types
  type VectorClock,
  type SyncMessage,
  type SyncHelloMessage,
  type SyncRequestMessage,
  type SyncResponseMessage,
  type ChangeSetMessage,
  type HeartbeatMessage,
  type AckMessage,
  type FullSnapshotRequestMessage,
  type FullSnapshotResponseMessage,
  type PeerPresence,
  type SyncTransport,
  type SyncSessionConfig,
  type SyncSessionEvents,

  // Functions
  createVectorClock,
  tickVectorClock,
  mergeVectorClocks,
  dominates,
  isConcurrent,
  updateVectorClockFromHLC,

  // Classes
  SyncSession,
} from './SyncProtocol';

// ── Version Manager ─────────────────────────────────────────────────────────
export {
  // Types
  type VersionSnapshot,
  type VersionChainLink,
  type ConflictTarget,
  type ConflictResolution,
  type EditConflict,
  type VersionManagerConfig,
  type RecoveryBundle,
  type SyncStrategy,

  // Classes
  ConflictResolver,
  VersionManager,
} from './VersionManager';

// ── Project Manifest ────────────────────────────────────────────────────────
export {
  // Types
  type ManifestProjectMeta,
  type CollaboratorRole,
  type ManifestCollaborator,
  type ManifestTimelineRef,
  type ManifestMediaType,
  type ManifestAssetStatus,
  type ManifestAssetRef,
  type ManifestVersionEntry,
  type ManifestSummary,
  type ManifestDiff,

  // Interface + namespace (value + type)
  ProjectManifest,

  // Classes
  ManifestBuilder,
} from './ProjectManifest';

// ── Bin Lock Manager (FT-05) ────────────────────────────────────────────────
export {
  // Types
  type BinLockStatus,
  type BinLockReleaseReason,
  type BinLock,
  type BinLockAcquisitionResult,
  type BinLockReleaseResult,
  type BinConflict,
  type BinLockIndicator,
  type BinLockManagerConfig,
  type BinLockManagerEvents,

  // Classes
  BinLockManager,
  BinLockError,
} from './BinLockManager';

// ── Sequence Diff (FT-06) ───────────────────────────────────────────────────
export {
  // Types
  type SequenceChangeType,
  type ChangeSeverity,
  type SequenceChange,
  type SequenceDiffSummary,
  type SequenceDiffResult,
  type SequenceInput,
  type SequenceDiffOptions,

  // Classes
  SequenceDiff,
  SequenceDiffError,
} from './SequenceDiff';
