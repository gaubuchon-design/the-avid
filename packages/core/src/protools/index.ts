// ─── Pro Tools Integration — Barrel Export ──────────────────────────────────
// Re-exports all Pro Tools integration modules:
//   - ProToolsSessionBridge (PT-05): Real-time collaboration
//   - ProToolsAAFExporter (PT-01): Timeline-to-AAF export
//   - ProToolsAAFImporter (PT-02): Revised AAF import
//   - MarkerSync (PT-04): Bidirectional marker sync
//   - MediaCentralBridge (PT-03): Direct sequence transfer
//
// Collision notes:
//   AAFClipDescriptor, AAFMarkerDescriptor, and AAFExportOptions are aliased
//   with a `ProTools` prefix to avoid collisions with identically-named types
//   in the media/AAFExporter module.
// ─────────────────────────────────────────────────────────────────────────────

export * from './ProToolsSessionBridge';

// ── AAF Exporter (PT-01) ────────────────────────────────────────────────────
// Collision-safe aliases for types that share names with media/AAFExporter.
export {
  // Aliased types (collision with media/AAFExporter)
  type AAFClipDescriptor as ProToolsAAFClipDescriptor,
  type AAFMarkerDescriptor as ProToolsAAFMarkerDescriptor,
  type AAFExportOptions as ProToolsAAFExportOptions,

  // Non-colliding types
  type AAFHandleSize,
  type AAFChannelAssignment,
  type AAFBitDepth,
  type AAFAutomationPoint,
  type AAFAutomationEnvelope,
  type AAFRenderedEffect,
  type AAFTrackDescriptor,
  type AAFExportResult,

  // Classes & functions
  ProToolsAAFExporter,
  createAAFExporter,
  exportProjectToAAF,
} from './ProToolsAAFExporter';

export * from './ProToolsAAFImporter';
export * from './MarkerSync';
export * from './MediaCentralBridge';
