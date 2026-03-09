// ─── Media Package — Barrel Export ───────────────────────────────────────────
// Re-exports all media interchange engines:
//   - AAF/OMF bidirectional export (FT-01)
//   - EDL/ALE/CSV export (FT-02)
//   - Managed Media / Relink Engine (FT-03)
//   - Audio Stem Export (FT-08)
// ─────────────────────────────────────────────────────────────────────────────

// ── AAF Exporter (FT-01) ────────────────────────────────────────────────────
// Note: AAFClipDescriptor, AAFExportOptions, AAFMarkerDescriptor are aliased
// to avoid collision with identically-named types in ProToolsAAFExporter.
// Import directly from './AAFExporter' if you need the un-aliased versions.
export {
  // Types
  type AAFExportFormat,
  type AAFTimecode,
  type AAFEffectParam,
  type AAFClipDescriptor as CoreAAFClipDescriptor,
  type AAFMarkerDescriptor as CoreAAFMarkerDescriptor,
  type AAFAudioTrackAssignment,
  type AAFExportOptions as CoreAAFExportOptions,
  type AAFComposition,

  // Functions
  secondsToFrames,
  framesToTimecode as aafFramesToTimecode,
  timecodeToString,
  timecodeToFrames,

  // Classes
  AAFExporter,
  AAFExportError,
} from './AAFExporter';

// ── EDL / ALE Exporter (FT-02) ─────────────────────────────────────────────
export {
  // Types
  type TimecodeMode,
  type EDLTransition,
  type EDLEvent,
  type EDLExportOptions,
  type ALEColumn,
  type ALEExportOptions,
  type CSVExportOptions,

  // Functions
  secondsToTimecode,
  framesToTimecode as edlFramesToTimecode,

  // Classes
  EDLExporter,
  EDLExportError,
} from './EDLExporter';

// ── Relink Engine (FT-03) ───────────────────────────────────────────────────
export {
  // Types
  type RelinkAssetStatus,
  type RelinkCandidate,
  type RelinkMatchReason,
  type RelinkProposal,
  type RelinkResult,
  type RelinkEngineConfig,
  type RelinkEngineEvents,

  // Classes
  RelinkEngine,
  RelinkError,
} from './RelinkEngine';

// ── Audio Stem Exporter (FT-08) ─────────────────────────────────────────────
export {
  // Types
  type StemType,
  type StemAudioFormat,
  type StemBitDepth,
  type StemChannelConfig,
  type StemDefinition,
  type StemExportConfig,
  type StemExportJob,
  type StemExportResult,
  type TrackStemAssignment,

  // Classes
  StemExporter,
  StemExportError,
} from './StemExporter';
