// ─── Brand Store ─────────────────────────────────────────────────────────────
// Zustand + Immer store for brand & marketing state. Central state management
// for brand kits, locked templates, variant engine, compliance, DAM, campaigns,
// ad validation, localization, creative agent, and performance analytics.

import { create } from 'zustand';
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
}

// ─── Store Creation ──────────────────────────────────────────────────────────

export const useBrandStore = create<BrandState & BrandActions>()(
  immer((set, get) => ({
    // ── Initial State ──────────────────────────────────────────────────────

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
    activeBrandPanel: 'brand-kit',
    showBrandPanel: false,

    // ── UI Actions ─────────────────────────────────────────────────────────

    setActiveBrandPanel: (tab) => set((s) => {
      s.activeBrandPanel = tab;
    }),

    toggleBrandPanel: () => set((s) => {
      s.showBrandPanel = !s.showBrandPanel;
    }),

    // ── Brand Kit Actions ──────────────────────────────────────────────────

    loadBrandKits: (orgId) => set((s) => {
      s.brandKits = BrandKitManager.listBrandKits(orgId);
    }),

    createBrandKit: (orgId, name) => set((s) => {
      const kit = BrandKitManager.createBrandKit(orgId, name);
      s.brandKits.push(kit);
      s.activeBrandKitId = kit.id;
    }),

    setActiveBrandKit: (id) => set((s) => {
      s.activeBrandKitId = id;
    }),

    deleteBrandKit: (id) => set((s) => {
      BrandKitManager.deleteBrandKit(id);
      s.brandKits = s.brandKits.filter((k) => k.id !== id);
      if (s.activeBrandKitId === id) s.activeBrandKitId = null;
    }),

    seedDemoBrandKit: (orgId) => set((s) => {
      const kit = BrandKitManager.seedDemoBrandKit(orgId);
      s.brandKits.push(kit);
      s.activeBrandKitId = kit.id;
    }),

    // ── Template Actions ───────────────────────────────────────────────────

    loadTemplates: (brandKitId) => set((s) => {
      s.templates = LockedTemplateEngine.listTemplates(brandKitId);
      s.overrideRequests = LockedTemplateEngine.listOverrideRequests();
    }),

    createTemplate: (name, brandKitId) => set((s) => {
      const template = LockedTemplateEngine.createTemplate(name, brandKitId, [], [], 'current-user');
      s.templates.push(template);
    }),

    lockElement: (templateId, elementId) => set((s) => {
      const updated = LockedTemplateEngine.lockElement(templateId, elementId);
      const idx = s.templates.findIndex((t) => t.id === templateId);
      if (idx >= 0) s.templates[idx] = updated;
    }),

    unlockElement: (templateId, elementId) => set((s) => {
      const updated = LockedTemplateEngine.unlockElement(templateId, elementId);
      const idx = s.templates.findIndex((t) => t.id === templateId);
      if (idx >= 0) s.templates[idx] = updated;
    }),

    requestOverride: (templateId, elementId, reason) => set((s) => {
      const request = LockedTemplateEngine.requestOverride(templateId, elementId, 'current-user', reason);
      s.overrideRequests.push(request);
    }),

    reviewOverride: (requestId, decision) => set((s) => {
      const updated = LockedTemplateEngine.reviewOverride(requestId, decision, 'brand-admin');
      const idx = s.overrideRequests.findIndex((r) => r.id === requestId);
      if (idx >= 0) s.overrideRequests[idx] = updated;
      // Refresh templates in case an override was approved
      if (decision === 'approved') {
        s.templates = LockedTemplateEngine.listTemplates();
      }
    }),

    // ── Variant Actions ────────────────────────────────────────────────────

    loadVariants: () => set((s) => {
      s.variantDefinitions = VariantEngine.listVariantDefinitions();
      s.variantResults = VariantEngine.listVariantResults();
      s.masterVariantLinks = VariantEngine.listMasterVariantLinks();
    }),

    createVariantDefinition: (name, lang, changes, market) => set((s) => {
      const def = VariantEngine.createVariantDefinition(name, lang, changes, market);
      s.variantDefinitions.push(def);
    }),

    generateAllVariants: (masterSequenceId) => {
      set((s) => { s.isGeneratingVariants = true; });
      VariantEngine.generateAllVariants(masterSequenceId).then((results) => {
        set((s) => {
          s.variantResults = results;
          s.masterVariantLinks = VariantEngine.listMasterVariantLinks(masterSequenceId);
          s.isGeneratingVariants = false;
        });
      }).catch(() => {
        set((s) => { s.isGeneratingVariants = false; });
      });
    },

    // ── Compliance Actions ──────────────────────────────────────────────────

    runComplianceScan: (projectId, durationSeconds) => {
      const { activeBrandKitId, brandKits } = get();
      const brandKit = brandKits.find((k) => k.id === activeBrandKitId);
      if (!brandKit) return;

      set((s) => { s.isRunningCompliance = true; });
      BrandComplianceAgent.runComplianceScan({ projectId, brandKit, durationSeconds }).then(
        (report) => {
          set((s) => {
            s.complianceReports.unshift(report);
            s.isRunningCompliance = false;
          });
        },
      ).catch(() => {
        set((s) => { s.isRunningCompliance = false; });
      });
    },

    loadComplianceReports: (projectId) => set((s) => {
      s.complianceReports = BrandComplianceAgent.listComplianceReports(projectId);
    }),

    // ── DAM Actions ────────────────────────────────────────────────────────

    loadDamConnections: () => set((s) => {
      s.damConnections = DAMConnector.listConnections();
    }),

    connectDam: (connectionId) => {
      set((s) => { s.isDamConnecting = true; });
      DAMConnector.connect(connectionId).then((conn) => {
        set((s) => {
          const idx = s.damConnections.findIndex((c) => c.id === connectionId);
          if (idx >= 0) s.damConnections[idx] = conn;
          s.isDamConnecting = false;
        });
      }).catch(() => {
        set((s) => { s.isDamConnecting = false; });
      });
    },

    disconnectDam: (connectionId) => {
      DAMConnector.disconnect(connectionId).then((conn) => {
        set((s) => {
          const idx = s.damConnections.findIndex((c) => c.id === connectionId);
          if (idx >= 0) s.damConnections[idx] = conn;
        });
      });
    },

    searchDam: (query, provider) => {
      set((s) => { s.isDamSearching = true; });
      DAMConnector.searchAssets({ query, provider }).then((results) => {
        set((s) => {
          s.damSearchResults = results;
          s.isDamSearching = false;
        });
      }).catch(() => {
        set((s) => { s.isDamSearching = false; });
      });
    },

    clearDamSearch: () => set((s) => {
      s.damSearchResults = [];
    }),

    // ── Campaign Actions ───────────────────────────────────────────────────

    loadCampaigns: () => set((s) => {
      s.campaigns = CampaignManager.listCampaigns();
    }),

    setActiveCampaign: (id) => set((s) => {
      s.activeCampaignId = id;
    }),

    updateDeliverableStatus: (campaignId, deliverableId, status) => set((s) => {
      CampaignManager.updateDeliverableStatus(campaignId, deliverableId, status);
      const updated = CampaignManager.getCampaign(campaignId);
      if (updated) {
        const idx = s.campaigns.findIndex((c) => c.id === campaignId);
        if (idx >= 0) s.campaigns[idx] = updated;
      }
    }),

    seedDemoCampaign: () => set((s) => {
      const { activeBrandKitId } = get();
      if (!activeBrandKitId) return;
      const campaign = CampaignManager.seedDemoCampaign(activeBrandKitId);
      s.campaigns.push(campaign);
      s.activeCampaignId = campaign.id;
    }),

    // ── Ad Validation Actions ──────────────────────────────────────────────

    validateForPlatform: (video, platform) => set((s) => {
      s.isValidatingAds = true;
      s.adValidationResults = AdUnitValidator.validateForPlatform(video, platform as any);
      s.isValidatingAds = false;
    }),

    validateForAllPlatforms: (video) => set((s) => {
      s.isValidatingAds = true;
      s.adValidationResults = AdUnitValidator.validateForAllPlatforms(video);
      s.isValidatingAds = false;
    }),

    clearValidationResults: () => set((s) => {
      s.adValidationResults = [];
    }),

    // ── Localization Actions ───────────────────────────────────────────────

    localize: (options) => {
      set((s) => { s.isLocalizing = true; });
      LocalizationAgent.localize(options).then((request) => {
        set((s) => {
          s.localizationRequests.push(request);
          s.isLocalizing = false;
        });
      }).catch(() => {
        set((s) => { s.isLocalizing = false; });
      });
    },

    // ── Creative Agent Actions ─────────────────────────────────────────────

    runCreativePipeline: (brief) => {
      const { activeBrandKitId, brandKits } = get();
      const brandKit = brandKits.find((k) => k.id === activeBrandKitId);
      if (!brandKit) return;

      set((s) => { s.isCreativeRunning = true; });
      CreativeAgent.runCreativePipeline({ brief, brandKit }).then((job) => {
        set((s) => {
          s.creativeJobs.push(job);
          s.isCreativeRunning = false;
        });
      }).catch(() => {
        set((s) => { s.isCreativeRunning = false; });
      });
    },

    // ── Performance Analytics Actions ──────────────────────────────────────

    fetchPerformanceData: (videoId, platforms) => {
      set((s) => { s.isFetchingAnalytics = true; });
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
          });
        },
      ).catch(() => {
        set((s) => { s.isFetchingAnalytics = false; });
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
      });

      // Seed performance data asynchronously
      PerformanceAnalytics.seedDemoPerformanceData().then((data) => {
        const insights: PerformanceInsight[] = [];
        for (const d of data) {
          insights.push(...PerformanceAnalytics.analyzePerformance(d));
        }
        set((s) => {
          s.performanceData = data;
          s.performanceInsights = insights;
        });
      });
    },
  })),
);
