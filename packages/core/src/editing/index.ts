// ─── Editing Package — Barrel Export ─────────────────────────────────────────
// Re-exports editing engines:
//   - Multi-Camera Sync Engine (FT-04)
// ─────────────────────────────────────────────────────────────────────────────

export {
  // Constants
  MAX_MULTICAM_ANGLES,

  // Types
  type MultiCamSyncMethod,
  type MultiCamGroupStatus,
  type MultiCamAngle,
  type MultiCamGroup,
  type MultiCamSwitchEvent,
  type MultiCamEdit,
  type MultiCamGridLayout,
  type MultiCamCreateOptions,

  // Classes
  MultiCamEngine,
  MultiCamError,
} from './MultiCamEngine';

// ── Multi-Camera Sync Engine (MC-01) — unique exports only ──────────────
// Note: CameraAngle is aliased to avoid collision with sports/types CameraAngle.
export {
  type MultiCamSyncStatus,
  type CameraAngle as MultiCamCameraAngle,
  type SyncPoint,
  type SyncResult,
  MultiCamSyncEngine,
} from './MultiCamSyncEngine';
