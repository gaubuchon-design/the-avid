// ─── Brand & Marketing Module ────────────────────────────────────────────────
// Barrel export for all brand/marketing features (MK-01 through MK-10).
//
// Types are exported directly for convenient imports.
// Module implementations use namespace-style exports (Module.function())
// which is the pattern consumed by the brand store.

// Direct type exports
export * from './types';

// Re-export specific types from module files not already in types.ts
export type { VideoMetadata } from './AdUnitValidator';
export type { LocalizationOptions } from './LocalizationAgent';

// Namespace re-exports for stores using Module.function() pattern
export * as BrandKitManager from './BrandKitManager';
export * as LockedTemplateEngine from './LockedTemplateEngine';
export * as VariantEngine from './VariantEngine';
export * as BrandComplianceAgent from './BrandComplianceAgent';
export * as DAMConnector from './DAMConnector';
export * as CampaignManager from './CampaignManager';
export * as AdUnitValidator from './AdUnitValidator';
export * as LocalizationAgent from './LocalizationAgent';
export * as CreativeAgent from './CreativeAgent';
export * as PerformanceAnalytics from './PerformanceAnalytics';
