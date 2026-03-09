// ─── Sports Production Module ─────────────────────────────────────────────────
// Barrel export for all sports production features.
//
// Note: CameraAngle was renamed to SportsCameraAngle to avoid collision with
// the editing/MultiCamSyncEngine CameraAngle interface. A backward-compatible
// alias is re-exported below.

export * from './types';
export type { SportsCameraAngle as CameraAngle } from './types';
export { GrowingFileEngine, createGrowingFileEngine } from './GrowingFileEngine';
export type { GrowingFileEvent, GrowingFileListener, GrowingFileEngineConfig } from './GrowingFileEngine';
export { EVSConnector, createEVSConnector } from './EVSConnector';
export type { EVSEvent, EVSListener, EVSClipFilter } from './EVSConnector';
export { SportsHighlightsEngine, createSportsHighlightsEngine } from './SportsHighlightsEngine';
export type { HighlightsEvent, HighlightsListener, HighlightsEngineConfig } from './SportsHighlightsEngine';
export { StatsDataBridge, createStatsDataBridge } from './StatsDataBridge';
export type { StatsEvent_Bridge, StatsListener, LiveDataEntry } from './StatsDataBridge';
export { SportsGraphicsRegistry, createSportsGraphicsRegistry } from './SportsGraphics';
export { HFREngine, createHFREngine, calculateAutoSpeed, calculateRetimeDuration, interpolateSpeed, evaluateSpeedRamp } from './HFREngine';
export type { HFREvent, HFRListener } from './HFREngine';
export { PackageBuilder, createPackageBuilder } from './PackageBuilder';
export type { PackageEvent, PackageListener } from './PackageBuilder';
export { PartialExporter, createPartialExporter } from './PartialExporter';
export type { PartialExportEvent, PartialExportListener, PartialExporterConfig } from './PartialExporter';
