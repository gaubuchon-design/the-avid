// ─── Brand Store ─────────────────────────────────────────────────────────────
// Zustand + Immer store for brand & marketing state. Central state management
// for brand kits, locked templates, variant engine, compliance, DAM, campaigns,
// ad validation, localization, creative agent, and performance analytics.

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import {
  BrandKitManager,
  LockedTemplateEngine,
  VariantEngine,
  BrandComplianceAgent,
  DAMConnector,
  CampaignManager,
  AdUnitValidator,
  LocalizationAgent,
  CreativeAgent,
  PerformanceAnalytics,
} from '@mcua/core';
import type {
  BrandKit,
  BrandPanelTab,
  LockedTemplate,
  OverrideRequest,
  VariantDefinition,
  VariantResult,
  MasterVariantLink,
  ComplianceReport,
  DAMConnection,
  DAMAsset,
  CampaignProject,
  Deliverable,
  DeliverableStatus,
  AdValidationResult,
  LocalizationRequest,
  CreativeAgentJob,
  CreativeBrief,
  PerformanceData,
  PerformanceInsight,
} from '@mcua/core';
// Exported from AdUnitValidator.ts and LocalizationAgent.ts respectively
import type { VideoMetadata, LocalizationOptions } from '@mcua/core';

// ─── State Interface ─────────────────────────────────────────────────────────

interface BrandState {
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
  isGeneratingVariants: boolean;

  // Compliance
  complianceReports: ComplianceReport[];
  isRunningCompliance: boolean;

  // DAM
  damConnections: DAMConnection[];
  damSearchResults: DAMAsset[];
  isDamSearching: boolean;
  isDamConnecting: boolean;

  // Campaigns
  campaigns: CampaignProject[];
  activeCampaignId: string | null;

  // Ad Validation
  adValidationResults: AdValidationResult[];
  isValidatingAds: boolean;

  // Localization
  localizationRequests: LocalizationRequest[];
  isLocalizing: boolean;

  // Creative Agent
  creativeJobs: CreativeAgentJob[];
  isCreativeRunning: boolean;

  // Performance
  performanceData: PerformanceData[];
  performanceInsights: PerformanceInsight[];
  isFetchingAnalytics: boolean;

  // Error state
  error: string | null;

  // UI State
  activeBrandPanel: BrandPanelTab;
  showBrandPanel: boolean;
}

// ─── Actions Interface ───────────────────────────────────────────────────────

interface BrandActions {
  // UI
  setActiveBrandPanel: (tab: BrandPanelTab) => void;
  toggleBrandPanel: () => void;

  // Brand Kits
  loadBrandKits: (orgId: string) => void;
  createBrandKit: (orgId: string, name: string) => void;
  setActiveBrandKit: (id: string | null) => void;
  deleteBrandKit: (id: string) => void;
  seedDemoBrandKit: (orgId: string) => void;

  // Templates
  loadTemplates: (brandKitId?: string) => void;
  createTemplate: (name: string, brandKitId: string) => void;
  lockElement: (templateId: string, elementId: string) => void;
  unlockElement: (templateId: string, elementId: string) => void;
  requestOverride: (templateId: string, elementId: string, reason: string) => void;
  reviewOverride: (requestId: string, decision: 'approved' | 'rejected') => void;

  // Variants
  loadVariants: () => void;
  createVariantDefinition: (name: string, lang: string, changes: VariantDefinition['changes'], market?: string) => void;
  generateAllVariants: (masterSequenceId: string) => void;

  // Compliance
  runComplianceScan: (projectId: string, durationSeconds: number) => void;
  loadComplianceReports: (projectId?: string) => void;

  // DAM
  loadDamConnections: () => void;
  connectDam: (connectionId: string) => void;
  disconnectDam: (connectionId: string) => void;
  searchDam: (query: string, provider?: DAMConnection['provider']) => void;
  clearDamSearch: () => void;

  // Campaigns
  loadCampaigns: () => void;
  setActiveCampaign: (id: string | null) => void;
  updateDeliverableStatus: (campaignId: string, deliverableId: string, status: DeliverableStatus) => void;
  seedDemoCampaign: () => void;

  // Ad Validation
  validateForPlatform: (video: VideoMetadata, platform: string) => void;
  validateForAllPlatforms: (video: VideoMetadata) => void;
  clearValidationResults: () => void;

  // Localization
  localize: (options: LocalizationOptions) => void;

  // Creative Agent
  runCreativePipeline: (brief: CreativeBrief) => void;

  // Performance Analytics
  fetchPerformanceData: (videoId: string, platforms: PerformanceData['platform'][]) => void;

  // Seed all demo data
  seedAllDemoData: (orgId: string) => void;

  // Error & Reset
  clearError: () => void;
  resetStore: () => void;
}

// ─── Initial State ───────────────────────────────────────────────────────────

const INITIAL_STATE: BrandState = {
  brandKits: [],
  activeBrandKitId: null,
  templates: [],
  overrideRequests: [],
  variantDefinitions: [],
  variantResults: [],
  masterVariantLinks: [],
  isGeneratingVariants: false,
  complianceReports: [],
  isRunningCompliance: false,
  damConnections: [],
  damSearchResults: [],
  isDamSearching: false,
  isDamConnecting: false,
  campaigns: [],
  activeCampaignId: null,
  adValidationResults: [],
  isValidatingAds: false,
  localizationRequests: [],
  isLocalizing: false,
  creativeJobs: [],
  isCreativeRunning: false,
  performanceData: [],
  performanceInsights: [],
  isFetchingAnalytics: false,
  error: null,
  activeBrandPanel: 'brand-kit',
  showBrandPanel: false,
};

// ─── Store Creation ──────────────────────────────────────────────────────────

export const useBrandStore = create<BrandState & BrandActions>()(
  devtools(
    immer((set, get) => ({
      // ── Initial State ──────────────────────────────────────────────────────
      ...INITIAL_STATE,

      // ── UI Actions ─────────────────────────────────────────────────────────

      setActiveBrandPanel: (tab) => set((s) => {
        s.activeBrandPanel = tab;
      }, false, 'brand/setActiveBrandPanel'),

      toggleBrandPanel: () => set((s) => {
        s.showBrandPanel = !s.showBrandPanel;
      }, false, 'brand/toggleBrandPanel'),

      // ── Brand Kit Actions ──────────────────────────────────────────────────

      loadBrandKits: (orgId) => set((s) => {
        s.brandKits = BrandKitManager.listBrandKits(orgId);
      }, false, 'brand/loadBrandKits'),

      createBrandKit: (orgId, name) => set((s) => {
        const kit = BrandKitManager.createBrandKit(orgId, name);
        s.brandKits.push(kit);
        s.activeBrandKitId = kit.id;
      }, false, 'brand/createBrandKit'),

      setActiveBrandKit: (id) => set((s) => {
        s.activeBrandKitId = id;
      }, false, 'brand/setActiveBrandKit'),

      deleteBrandKit: (id) => set((s) => {
        BrandKitManager.deleteBrandKit(id);
        s.brandKits = s.brandKits.filter((k) => k.id !== id);
        if (s.activeBrandKitId === id) s.activeBrandKitId = null;
      }, false, 'brand/deleteBrandKit'),

      seedDemoBrandKit: (orgId) => set((s) => {
        const kit = BrandKitManager.seedDemoBrandKit(orgId);
        s.brandKits.push(kit);
        s.activeBrandKitId = kit.id;
      }, false, 'brand/seedDemoBrandKit'),

      // ── Template Actions ───────────────────────────────────────────────────

      loadTemplates: (brandKitId) => set((s) => {
        s.templates = LockedTemplateEngine.listTemplates(brandKitId);
        s.overrideRequests = LockedTemplateEngine.listOverrideRequests();
      }, false, 'brand/loadTemplates'),

      createTemplate: (name, brandKitId) => set((s) => {
        const template = LockedTemplateEngine.createTemplate(name, brandKitId, [], [], 'current-user');
        s.templates.push(template);
      }, false, 'brand/createTemplate'),

      lockElement: (templateId, elementId) => set((s) => {
        const updated = LockedTemplateEngine.lockElement(templateId, elementId);
        const idx = s.templates.findIndex((t) => t.id === templateId);
        if (idx >= 0) s.templates[idx] = updated;
      }, false, 'brand/lockElement'),

      unlockElement: (templateId, elementId) => set((s) => {
        const updated = LockedTemplateEngine.unlockElement(templateId, elementId);
        const idx = s.templates.findIndex((t) => t.id === templateId);
        if (idx >= 0) s.templates[idx] = updated;
      }, false, 'brand/unlockElement'),

      requestOverride: (templateId, elementId, reason) => set((s) => {
        const request = LockedTemplateEngine.requestOverride(templateId, elementId, 'current-user', reason);
        s.overrideRequests.push(request);
      }, false, 'brand/requestOverride'),

      reviewOverride: (requestId, decision) => set((s) => {
        const updated = LockedTemplateEngine.reviewOverride(requestId, decision, 'brand-admin');
        const idx = s.overrideRequests.findIndex((r) => r.id === requestId);
        if (idx >= 0) s.overrideRequests[idx] = updated;
        // Refresh templates in case an override was approved
        if (decision === 'approved') {
          s.templates = LockedTemplateEngine.listTemplates();
        }
      }, false, 'brand/reviewOverride'),

      // ── Variant Actions ────────────────────────────────────────────────────

      loadVariants: () => set((s) => {
        s.variantDefinitions = VariantEngine.listVariantDefinitions();
        s.variantResults = VariantEngine.listVariantResults();
        s.masterVariantLinks = VariantEngine.listMasterVariantLinks();
      }, false, 'brand/loadVariants'),

      createVariantDefinition: (name, lang, changes, market) => set((s) => {
        const def = VariantEngine.createVariantDefinition(name, lang, changes, market);
        s.variantDefinitions.push(def);
      }, false, 'brand/createVariantDefinition'),

      generateAllVariants: (masterSequenceId) => {
        set((s) => { s.isGeneratingVariants = true; s.error = null; }, false, 'brand/generateAllVariants/pending');
        VariantEngine.generateAllVariants(masterSequenceId).then((results) => {
          set((s) => {
            s.variantResults = results;
            s.masterVariantLinks = VariantEngine.listMasterVariantLinks(masterSequenceId);
            s.isGeneratingVariants = false;
          }, false, 'brand/generateAllVariants/fulfilled');
        }).catch((err: unknown) => {
          const message = err instanceof Error ? err.message : 'Variant generation failed';
          set((s) => { s.isGeneratingVariants = false; s.error = message; }, false, 'brand/generateAllVariants/rejected');
        });
      },

      // ── Compliance Actions ──────────────────────────────────────────────────

      runComplianceScan: (projectId, durationSeconds) => {
        const { activeBrandKitId, brandKits } = get();
        const brandKit = brandKits.find((k) => k.id === activeBrandKitId);
        if (!brandKit) return;

        set((s) => { s.isRunningCompliance = true; s.error = null; }, false, 'brand/runComplianceScan/pending');
        BrandComplianceAgent.runComplianceScan({ projectId, brandKit, durationSeconds }).then(
          (report) => {
            set((s) => {
              s.complianceReports.unshift(report);
              s.isRunningCompliance = false;
            }, false, 'brand/runComplianceScan/fulfilled');
          },
        ).catch((err: unknown) => {
          const message = err instanceof Error ? err.message : 'Compliance scan failed';
          set((s) => { s.isRunningCompliance = false; s.error = message; }, false, 'brand/runComplianceScan/rejected');
        });
      },

      loadComplianceReports: (projectId) => set((s) => {
        s.complianceReports = BrandComplianceAgent.listComplianceReports(projectId);
      }, false, 'brand/loadComplianceReports'),

      // ── DAM Actions ────────────────────────────────────────────────────────

      loadDamConnections: () => set((s) => {
        s.damConnections = DAMConnector.listConnections();
      }, false, 'brand/loadDamConnections'),

      connectDam: (connectionId) => {
        set((s) => { s.isDamConnecting = true; s.error = null; }, false, 'brand/connectDam/pending');
        DAMConnector.connect(connectionId).then((conn) => {
          set((s) => {
            const idx = s.damConnections.findIndex((c) => c.id === connectionId);
            if (idx >= 0) s.damConnections[idx] = conn;
            s.isDamConnecting = false;
          }, false, 'brand/connectDam/fulfilled');
        }).catch((err: unknown) => {
          const message = err instanceof Error ? err.message : 'DAM connection failed';
          set((s) => { s.isDamConnecting = false; s.error = message; }, false, 'brand/connectDam/rejected');
        });
      },

      disconnectDam: (connectionId) => {
        DAMConnector.disconnect(connectionId).then((conn) => {
          set((s) => {
            const idx = s.damConnections.findIndex((c) => c.id === connectionId);
            if (idx >= 0) s.damConnections[idx] = conn;
          }, false, 'brand/disconnectDam/fulfilled');
        }).catch((err: unknown) => {
          const message = err instanceof Error ? err.message : 'DAM disconnect failed';
          set((s) => { s.error = message; }, false, 'brand/disconnectDam/rejected');
        });
      },

      searchDam: (query, provider) => {
        set((s) => { s.isDamSearching = true; s.error = null; }, false, 'brand/searchDam/pending');
        DAMConnector.searchAssets({ query, provider }).then((results) => {
          set((s) => {
            s.damSearchResults = results;
            s.isDamSearching = false;
          }, false, 'brand/searchDam/fulfilled');
        }).catch((err: unknown) => {
          const message = err instanceof Error ? err.message : 'DAM search failed';
          set((s) => { s.isDamSearching = false; s.error = message; }, false, 'brand/searchDam/rejected');
        });
      },

      clearDamSearch: () => set((s) => {
        s.damSearchResults = [];
      }, false, 'brand/clearDamSearch'),

      // ── Campaign Actions ───────────────────────────────────────────────────

      loadCampaigns: () => set((s) => {
        s.campaigns = CampaignManager.listCampaigns();
      }, false, 'brand/loadCampaigns'),

      setActiveCampaign: (id) => set((s) => {
        s.activeCampaignId = id;
      }, false, 'brand/setActiveCampaign'),

      updateDeliverableStatus: (campaignId, deliverableId, status) => set((s) => {
        CampaignManager.updateDeliverableStatus(campaignId, deliverableId, status);
        const updated = CampaignManager.getCampaign(campaignId);
        if (updated) {
          const idx = s.campaigns.findIndex((c) => c.id === campaignId);
          if (idx >= 0) s.campaigns[idx] = updated;
        }
      }, false, 'brand/updateDeliverableStatus'),

      seedDemoCampaign: () => set((s) => {
        const { activeBrandKitId } = get();
        if (!activeBrandKitId) return;
        const campaign = CampaignManager.seedDemoCampaign(activeBrandKitId);
        s.campaigns.push(campaign);
        s.activeCampaignId = campaign.id;
      }, false, 'brand/seedDemoCampaign'),

      // ── Ad Validation Actions ──────────────────────────────────────────────

      validateForPlatform: (video, platform) => set((s) => {
        s.isValidatingAds = true;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- store platform type widened for flexibility
        s.adValidationResults = AdUnitValidator.validateForPlatform(video, platform as any);
        s.isValidatingAds = false;
      }, false, 'brand/validateForPlatform'),

      validateForAllPlatforms: (video) => set((s) => {
        s.isValidatingAds = true;
        s.adValidationResults = AdUnitValidator.validateForAllPlatforms(video);
        s.isValidatingAds = false;
      }, false, 'brand/validateForAllPlatforms'),

      clearValidationResults: () => set((s) => {
        s.adValidationResults = [];
      }, false, 'brand/clearValidationResults'),

      // ── Localization Actions ───────────────────────────────────────────────

      localize: (options) => {
        set((s) => { s.isLocalizing = true; s.error = null; }, false, 'brand/localize/pending');
        LocalizationAgent.localize(options).then((request) => {
          set((s) => {
            s.localizationRequests.push(request);
            s.isLocalizing = false;
          }, false, 'brand/localize/fulfilled');
        }).catch((err: unknown) => {
          const message = err instanceof Error ? err.message : 'Localization failed';
          set((s) => { s.isLocalizing = false; s.error = message; }, false, 'brand/localize/rejected');
        });
      },

      // ── Creative Agent Actions ─────────────────────────────────────────────

      runCreativePipeline: (brief) => {
        const { activeBrandKitId, brandKits } = get();
        const brandKit = brandKits.find((k) => k.id === activeBrandKitId);
        if (!brandKit) return;

        set((s) => { s.isCreativeRunning = true; s.error = null; }, false, 'brand/runCreativePipeline/pending');
        CreativeAgent.runCreativePipeline({ brief, brandKit }).then((job) => {
          set((s) => {
            s.creativeJobs.push(job);
            s.isCreativeRunning = false;
          }, false, 'brand/runCreativePipeline/fulfilled');
        }).catch((err: unknown) => {
          const message = err instanceof Error ? err.message : 'Creative pipeline failed';
          set((s) => { s.isCreativeRunning = false; s.error = message; }, false, 'brand/runCreativePipeline/rejected');
        });
      },

      // ── Performance Analytics Actions ──────────────────────────────────────

      fetchPerformanceData: (videoId, platforms) => {
        set((s) => { s.isFetchingAnalytics = true; s.error = null; }, false, 'brand/fetchPerformanceData/pending');
        const dateRange = { start: '2026-01-01', end: '2026-03-08' };
        PerformanceAnalytics.fetchAllPlatformData(videoId, platforms, dateRange).then(
          (data) => {
            set((s) => {
              s.performanceData.push(...data);
              // Generate insights
              for (const d of data) {
                const insights = PerformanceAnalytics.analyzePerformance(d);
                s.performanceInsights.push(...insights);
              }
              s.isFetchingAnalytics = false;
            }, false, 'brand/fetchPerformanceData/fulfilled');
          },
        ).catch((err: unknown) => {
          const message = err instanceof Error ? err.message : 'Analytics fetch failed';
          set((s) => { s.isFetchingAnalytics = false; s.error = message; }, false, 'brand/fetchPerformanceData/rejected');
        });
      },

      // ── Seed All Demo Data ─────────────────────────────────────────────────

      seedAllDemoData: (orgId) => {
        // Brand Kit
        const kit = BrandKitManager.seedDemoBrandKit(orgId);

        // Templates
        const templates = LockedTemplateEngine.seedDemoTemplates(kit.id);

        // Variants
        const variants = VariantEngine.seedDemoVariants();

        // DAM Connections
        const connections = DAMConnector.seedDemoConnections();

        // Campaign
        const campaign = CampaignManager.seedDemoCampaign(kit.id);

        // Creative Brief
        CreativeAgent.seedDemoBrief(kit.id);

        set((s) => {
          s.brandKits = [kit];
          s.activeBrandKitId = kit.id;
          s.templates = templates;
          s.variantDefinitions = variants;
          s.damConnections = connections;
          s.campaigns = [campaign];
          s.activeCampaignId = campaign.id;
          s.showBrandPanel = true;
        }, false, 'brand/seedAllDemoData');

        // Seed performance data asynchronously
        PerformanceAnalytics.seedDemoPerformanceData().then((data) => {
          const insights: PerformanceInsight[] = [];
          for (const d of data) {
            insights.push(...PerformanceAnalytics.analyzePerformance(d));
          }
          set((s) => {
            s.performanceData = data;
            s.performanceInsights = insights;
          }, false, 'brand/seedAllDemoData/performance');
        });
      },

      // ── Error & Reset ──────────────────────────────────────────────────────

      clearError: () => set((s) => {
        s.error = null;
      }, false, 'brand/clearError'),

      resetStore: () => set(() => ({
        ...INITIAL_STATE,
      }), true, 'brand/resetStore'),
    })),
    { name: 'BrandStore', enabled: process.env["NODE_ENV"] === 'development' },
  )
);

// ─── Named Selectors ────────────────────────────────────────────────────────

type BrandStoreState = BrandState & BrandActions;

export const selectBrandKits = (state: BrandStoreState) => state.brandKits;
export const selectActiveBrandKitId = (state: BrandStoreState) => state.activeBrandKitId;
export const selectActiveBrandKit = (state: BrandStoreState) =>
  state.brandKits.find((k) => k.id === state.activeBrandKitId) ?? null;
export const selectBrandTemplates = (state: BrandStoreState) => state.templates;
export const selectOverrideRequests = (state: BrandStoreState) => state.overrideRequests;
export const selectVariantDefinitions = (state: BrandStoreState) => state.variantDefinitions;
export const selectVariantResults = (state: BrandStoreState) => state.variantResults;
export const selectIsGeneratingVariants = (state: BrandStoreState) => state.isGeneratingVariants;
export const selectComplianceReports = (state: BrandStoreState) => state.complianceReports;
export const selectIsRunningCompliance = (state: BrandStoreState) => state.isRunningCompliance;
export const selectDamConnections = (state: BrandStoreState) => state.damConnections;
export const selectDamSearchResults = (state: BrandStoreState) => state.damSearchResults;
export const selectIsDamSearching = (state: BrandStoreState) => state.isDamSearching;
export const selectCampaigns = (state: BrandStoreState) => state.campaigns;
export const selectActiveCampaignId = (state: BrandStoreState) => state.activeCampaignId;
export const selectActiveCampaign = (state: BrandStoreState) =>
  state.campaigns.find((c) => c.id === state.activeCampaignId) ?? null;
export const selectAdValidationResults = (state: BrandStoreState) => state.adValidationResults;
export const selectLocalizationRequests = (state: BrandStoreState) => state.localizationRequests;
export const selectCreativeJobs = (state: BrandStoreState) => state.creativeJobs;
export const selectPerformanceData = (state: BrandStoreState) => state.performanceData;
export const selectPerformanceInsights = (state: BrandStoreState) => state.performanceInsights;
export const selectBrandError = (state: BrandStoreState) => state.error;
export const selectActiveBrandPanel = (state: BrandStoreState) => state.activeBrandPanel;
export const selectShowBrandPanel = (state: BrandStoreState) => state.showBrandPanel;
export const selectHasActiveBrandKit = (state: BrandStoreState) => state.activeBrandKitId !== null;
export const selectBrandIsLoading = (state: BrandStoreState) =>
  state.isGeneratingVariants || state.isRunningCompliance || state.isDamSearching ||
  state.isDamConnecting || state.isValidatingAds || state.isLocalizing ||
  state.isCreativeRunning || state.isFetchingAnalytics;
export const selectPendingOverrides = (state: BrandStoreState) =>
  state.overrideRequests.filter((r) => r.status === 'pending');
export const selectConnectedDamProviders = (state: BrandStoreState) =>
  state.damConnections.filter((c) => c.isConnected);
