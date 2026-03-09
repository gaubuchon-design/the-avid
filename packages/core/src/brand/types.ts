// ─── Brand & Marketing Types ─────────────────────────────────────────────────
// Shared type definitions for the brand/marketing module (MK-01 through MK-10).

import type { EditorTrack, EditorClip, EditorMediaAsset } from '../project-library';

// ─── Brand Kit ───────────────────────────────────────────────────────────────

export interface BrandFont {
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  url?: string;
}

export interface BrandTypography {
  heading: BrandFont;
  body: BrandFont;
  caption: BrandFont;
}

export interface BrandSafeArea {
  top: number;    // percentage 0-100
  right: number;
  bottom: number;
  left: number;
}

export interface BrandKit {
  id: string;
  orgId: string;
  brandName: string;
  logoFiles: BrandLogoFile[];
  primaryColors: string[];
  secondaryColors: string[];
  fonts: BrandFont[];
  typography: BrandTypography;
  safeArea: BrandSafeArea;
  voiceTone: string;
  approvedMusicIds: string[];
  prohibitedElements: string[];
  createdAt: string;
  updatedAt: string;
}

export interface BrandLogoFile {
  id: string;
  name: string;
  url: string;
  variant: 'primary' | 'secondary' | 'icon' | 'wordmark' | 'reversed';
  format: 'svg' | 'png' | 'eps';
  minWidth?: number;
  minHeight?: number;
}

// ─── Locked Templates ────────────────────────────────────────────────────────

export type TemplateElementType =
  | 'logo'
  | 'text'
  | 'image'
  | 'video'
  | 'shape'
  | 'endcard'
  | 'lower-third'
  | 'cta';

export interface TemplateElementPosition {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
}

export interface TemplateElement {
  id: string;
  type: TemplateElementType;
  position: TemplateElementPosition;
  locked: boolean;
  editable: boolean;
  content: Record<string, unknown>;
  label?: string;
}

export interface LockedTemplate {
  id: string;
  name: string;
  brandKitId: string;
  elements: TemplateElement[];
  lockedElementIds: string[];
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface OverrideRequest {
  id: string;
  templateId: string;
  elementId: string;
  requestedBy: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
}

// ─── Variant Engine ──────────────────────────────────────────────────────────

export type VariantChangeType =
  | 'subtitle-replace'
  | 'clip-replace'
  | 'endcard-replace'
  | 'music-replace'
  | 'graphic-replace'
  | 'voiceover-replace';

export interface VariantChange {
  type: VariantChangeType;
  params: Record<string, unknown>;
}

export interface VariantDefinition {
  id: string;
  variantName: string;
  languageCode: string;
  market?: string;
  changes: VariantChange[];
}

export interface MasterVariantLink {
  masterId: string;
  variantId: string;
  variantDefinitionId: string;
  createdAt: string;
  lastSyncedAt: string;
}

export type VariantStatus = 'pending' | 'generating' | 'generated' | 'failed';

export interface VariantResult {
  variantDefinitionId: string;
  sequenceId: string;
  status: VariantStatus;
  error?: string;
  generatedAt?: string;
}

// ─── Brand Compliance ────────────────────────────────────────────────────────

export type ComplianceSeverity = 'error' | 'warning' | 'info';
export type ComplianceCategory =
  | 'logo-presence'
  | 'logo-placement'
  | 'logo-size'
  | 'color-palette'
  | 'font-usage'
  | 'prohibited-element'
  | 'safe-area'
  | 'music-rights'
  | 'tone-mismatch';

export type ComplianceOverallStatus = 'pass' | 'fail' | 'warning';

export interface ComplianceFinding {
  id: string;
  frameTime: number;
  severity: ComplianceSeverity;
  category: ComplianceCategory;
  description: string;
  suggestedFix?: string;
  thumbnailUrl?: string;
  autoFixAvailable?: boolean;
}

export interface ComplianceReport {
  id: string;
  projectId: string;
  brandKitId: string;
  findings: ComplianceFinding[];
  overallStatus: ComplianceOverallStatus;
  checkedAt: string;
  duration: number; // seconds it took to scan
  exportBlocked?: boolean;
}

// ─── DAM Connector ───────────────────────────────────────────────────────────

export type DAMProvider =
  | 'BYNDER'
  | 'BRANDFOLDER'
  | 'CANTO'
  | 'AEM'
  | 'CLOUDINARY';

export interface DAMCredentials {
  apiKey?: string;
  apiSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  endpoint?: string;
  expiresAt?: string;
}

export interface DAMConnection {
  id: string;
  provider: DAMProvider;
  credentials: DAMCredentials;
  displayName: string;
  isConnected: boolean;
  lastSyncedAt?: string;
}

export interface DAMAsset {
  id: string;
  externalId: string;
  provider: DAMProvider;
  name: string;
  type: 'VIDEO' | 'AUDIO' | 'IMAGE' | 'DOCUMENT' | 'video' | 'audio' | 'image' | 'document';
  format?: string;
  thumbnailUrl?: string;
  downloadUrl?: string;
  metadata: Record<string, unknown>;
  keywords: string[];
  tags?: string[];
  campaignId?: string;
  usageRights?: DAMUsageRights;
  rightsExpiresAt?: string;
}

export interface DAMUsageRights {
  licensedUntil?: string;
  territories: string[];
  restrictions: string[];
  isExpired: boolean;
}

export interface DAMSearchParams {
  query: string;
  provider?: DAMProvider;
  type?: 'VIDEO' | 'AUDIO' | 'IMAGE' | 'DOCUMENT';
  keywords?: string[];
  limit?: number;
  offset?: number;
}

export interface DAMUploadParams {
  connectionId: string;
  file: { name: string; size: number; type: string; url: string };
  metadata?: Record<string, unknown>;
  campaignId?: string;
}

// ─── Campaign Manager ────────────────────────────────────────────────────────

export type DeliverableStatus =
  | 'brief'
  | 'in-production'
  | 'review'
  | 'approved'
  | 'delivered';

export interface Deliverable {
  id: string;
  name: string;
  type: 'hero' | 'cutdown' | 'social' | 'bumper' | 'pre-roll' | 'display' | 'custom';
  sequenceId?: string;
  status: DeliverableStatus;
  assignedEditor?: string;
  approvalChain: ApprovalStep[];
  platform?: string;
  aspectRatio?: string;
  duration?: number;
  dueDate?: string;
}

export interface ApprovalStep {
  id: string;
  reviewer: string;
  role: string;
  status: 'pending' | 'approved' | 'rejected';
  notes?: string;
  reviewedAt?: string;
}

export interface CampaignProject {
  id: string;
  name: string;
  brief: string;
  startDate: string;
  endDate: string;
  brandKitId: string;
  deliverables: Deliverable[];
  markets: string[];
  tokenBudget: number;
  tokensUsed: number;
  status: 'planning' | 'active' | 'complete' | 'archived';
  createdAt: string;
  updatedAt: string;
}

// ─── Ad Unit Validator ───────────────────────────────────────────────────────

export type AdPlatform =
  | 'META'
  | 'GOOGLE_DV360'
  | 'YOUTUBE'
  | 'LINKEDIN'
  | 'TIKTOK'
  | 'TWITTER';

export interface AdUnitSpec {
  platform: AdPlatform;
  name: string;
  maxFileSize: number;       // bytes
  maxDuration: number;       // seconds
  minDuration?: number;      // seconds
  aspectRatios: string[];    // e.g. "16:9", "1:1", "9:16"
  codecs: string[];          // e.g. "h264", "h265", "vp9"
  audioNormalization: number; // LUFS target e.g. -14
  maxBitrate?: number;       // kbps
  minResolution?: { width: number; height: number };
  maxResolution?: { width: number; height: number };
}

export type AdValidationStatus = 'PASS' | 'FAIL' | 'WARNING';

export interface AdValidationResult {
  platform: AdPlatform;
  specName: string;
  status: AdValidationStatus;
  checks: AdValidationCheck[];
}

export interface AdValidationCheck {
  name: string;
  status: AdValidationStatus;
  actual: string;
  expected: string;
  message: string;
}

// ─── Localization Agent ──────────────────────────────────────────────────────

export interface LocalizationRequest {
  id: string;
  sourceLanguage: string;
  targetLanguages: string[];
  includeVoiceover: boolean;
  includeSubtitles: boolean;
  includeOnScreenText: boolean;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number; // 0-100
  results: LocalizationResult[];
}

export interface LocalizationResult {
  language: string;
  subtitleTrackId?: string;
  voiceoverTrackId?: string;
  onScreenTextReplacements: OnScreenTextReplacement[];
  consistencyScore: number; // 0-1
  warnings: string[];
}

export interface OnScreenTextReplacement {
  frameStart: number;
  frameEnd: number;
  originalText: string;
  translatedText: string;
  position: { x: number; y: number; width: number; height: number };
}

// ─── Creative Agent ──────────────────────────────────────────────────────────

export interface CreativeBrief {
  id: string;
  objective: string;
  audience: string;
  message: string;
  tone: string;
  requiredElements: string[];
  duration: number; // seconds
  platforms: AdPlatform[];
  brandKitId: string;
}

export interface VideoStructureOutline {
  id: string;
  briefId: string;
  sections: VideoSection[];
  estimatedDuration: number;
  suggestedMusic: string[];
  suggestedFootage: SuggestedFootage[];
}

export interface VideoSection {
  order: number;
  label: string;
  description: string;
  duration: number;
  type: 'hook' | 'setup' | 'body' | 'cta' | 'endcard';
  suggestedAssetTags: string[];
}

export interface SuggestedFootage {
  tags: string[];
  source: 'bin' | 'dam';
  assetId?: string;
  confidence: number;
}

export type CreativeAgentStatus =
  | 'parsing-brief'
  | 'generating-outline'
  | 'searching-footage'
  | 'assembling'
  | 'generating-captions'
  | 'complete'
  | 'failed';

export interface CreativeAgentJob {
  id: string;
  briefId: string;
  status: CreativeAgentStatus;
  progress: number;
  outline?: VideoStructureOutline;
  resultSequenceId?: string;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

// ─── Performance Analytics ───────────────────────────────────────────────────

export type AnalyticsPlatform =
  | 'YOUTUBE'
  | 'META'
  | 'GOOGLE_CAMPAIGN_MANAGER'
  | 'LINKEDIN';

export interface PerformanceData {
  id: string;
  videoId: string;
  platform: AnalyticsPlatform;
  views: number;
  completionRate: number;    // 0-1
  ctr: number;               // click-through rate 0-1
  engagementRate: number;    // 0-1
  dateRange: { start: string; end: string };
  fetchedAt: string;
}

export interface PerformanceInsight {
  id: string;
  videoId: string;
  type: 'strength' | 'weakness' | 'opportunity';
  description: string;
  metric: string;
  value: number;
  benchmark: number;
  recommendation?: string;
}

export interface PerformanceComparison {
  videoIds: string[];
  topPerformer: string;
  bottomPerformer: string;
  insights: PerformanceInsight[];
  generatedAt: string;
}

// ─── Aggregate brand store state ─────────────────────────────────────────────

export interface BrandState {
  // Brand Kits
  brandKits: BrandKit[];
  activeBrandKitId: string | null;

  // Locked Templates
  templates: LockedTemplate[];
  overrideRequests: OverrideRequest[];

  // Variants
  variantDefinitions: VariantDefinition[];
  variantResults: VariantResult[];
  masterVariantLinks: MasterVariantLink[];

  // Compliance
  complianceReports: ComplianceReport[];
  isRunningCompliance: boolean;

  // DAM
  damConnections: DAMConnection[];
  damSearchResults: DAMAsset[];
  isDamSearching: boolean;

  // Campaigns
  campaigns: CampaignProject[];
  activeCampaignId: string | null;

  // Ad Validation
  adValidationResults: AdValidationResult[];
  isValidatingAds: boolean;

  // Localization
  localizationRequests: LocalizationRequest[];

  // Creative Agent
  creativeJobs: CreativeAgentJob[];

  // Performance
  performanceData: PerformanceData[];
  performanceInsights: PerformanceInsight[];

  // UI State
  activeBrandPanel: BrandPanelTab;
}

export type BrandPanelTab =
  | 'brand-kit'
  | 'templates'
  | 'variants'
  | 'compliance'
  | 'dam'
  | 'campaigns'
  | 'ad-validator'
  | 'localization'
  | 'creative'
  | 'analytics';
