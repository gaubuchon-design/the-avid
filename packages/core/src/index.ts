// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — Core Package Barrel Export
//  Shared across all platforms (web, server, electron).
//
//  ─── Known Type Aliases & Collision Resolutions ─────────────────────────
//
//  1. AAF Types (media vs protools)
//     - media/AAFExporter exports AAFClipDescriptor, AAFMarkerDescriptor,
//       AAFExportOptions which collide with protools/ProToolsAAFExporter.
//     - media/index.ts aliases them as:
//         CoreAAFClipDescriptor, CoreAAFMarkerDescriptor, CoreAAFExportOptions
//     - protools/index.ts aliases them as:
//         ProToolsAAFClipDescriptor, ProToolsAAFMarkerDescriptor,
//         ProToolsAAFExportOptions
//
//  2. CameraAngle (sports vs editing)
//     - sports/types.ts defines SportsCameraAngle (a string union type for
//       broadcast camera positions). A backward-compat alias CameraAngle is
//       re-exported from sports/index.ts.
//     - editing/MultiCamSyncEngine.ts defines CameraAngle (an interface for
//       multi-cam sync angle metadata). editing/index.ts aliases it as
//       MultiCamCameraAngle.
//
//  3. Caption Types (accessibility inline vs CaptionValidator module)
//     - accessibility/index.ts defines BasicCaptionValidator and
//       BasicCaptionExporter (simple inline implementations).
//     - accessibility/CaptionValidator.ts defines a multi-standard
//       CaptionValidator class, re-exported as MultiStandardCaptionValidator.
//     - Type aliases: CaptionCue -> MultiStandardCaptionCue,
//       CaptionStyle -> MultiStandardCaptionStyle,
//       CaptionValidationResult -> MultiStandardCaptionValidationResult
//
//  4. Brand Module
//     - brand/index.ts exports types directly and modules as namespaces
//       (e.g., BrandKitManager.createBrandKit()) to support the brand store
//       Module.function() pattern.
// ═══════════════════════════════════════════════════════════════════════════

// Core package — shared across all platforms

export * from './types';
export * from './store';
export * from './utils';
export * from './api';
export * from './collab';
export * from './project-library';
export * from './media-helpers';

// ─── Vertical Modules ──────────────────────────────────────────────────────
export * from './news';
export * from './sports';
export * from './brand';
export * from './creator';

// ─── Cross-Cutting Infrastructure ──────────────────────────────────────────
// Media interchange (AAF, EDL, Relink, Stems)
export * from './media';
// Multi-Camera editing
export * from './editing';
// Sequence processing (frame rate mixing)
export * from './sequence';

// Pro Tools integration
export * from './protools';

// NEXIS shared storage
export * from './nexis/NEXISClient';
export * from './nexis/NEXISCacheManager';
export * from './nexis/NEXISAdmin';

// Audio & Broadcast
export * from './audio/BroadcastTrackPresets';
export * from './audio/AudioDescriptionTrack';

// RBAC
export * from './rbac/NewsroomRoles';

// Accessibility
export * from './accessibility';

// AI Agent Infrastructure
export * from './ai/VerticalAgentRegistry';
export * from './ai/AgentMemory';
export * from './ai/PlaybookMarketplace';
