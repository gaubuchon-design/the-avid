// =============================================================================
//  THE AVID — Deliver Store
//  Dedicated Zustand + Immer state for the Deliver page: publishing templates,
//  render queue, export settings, worker registry, and job history.
// =============================================================================

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type {
  PublishingTemplate,
  TemplateCategory,
  RenderJob,
  RenderJobStatus,
  JobPriority,
  WorkerNode,
  WorkerStatus,
  WorkerMetrics,
  WorkerCapabilities,
  ExportSettings,
  SettingsTab,
  RightPanelTab,
  SelectionMode,
  QueueSortBy,
  FarmStats,
} from '../types/deliver.types';
import { DEFAULT_EXPORT_SETTINGS } from '../types/deliver.types';
import { BUILT_IN_TEMPLATES } from '../data/publishing-templates';
import { exportEngine } from '../engine/ExportEngine';

// ─── State Shape ─────────────────────────────────────────────────────────────

interface DeliverState {
  // Templates
  templates: PublishingTemplate[];
  selectedTemplateId: string | null;
  templateSearchQuery: string;
  templateCategoryFilter: TemplateCategory | 'all';
  showTemplateEditor: boolean;

  // Export Settings (center panel)
  exportSettings: ExportSettings;
  settingsTab: SettingsTab;

  // Render Queue
  renderQueue: RenderJob[];
  queueSortBy: QueueSortBy;
  isQueueRunning: boolean;

  // Worker Registry
  workers: WorkerNode[];
  workerFilter: WorkerStatus | 'all';

  // Right panel
  rightPanelTab: RightPanelTab;

  // History
  completedJobs: RenderJob[];

  // Selection
  selectionMode: SelectionMode;

  // Farm stats
  farmStats: FarmStats;

  // Connection
  isConnected: boolean;
}

// ─── Actions ─────────────────────────────────────────────────────────────────

interface DeliverActions {
  // ── Template Management ──────────────────────────────────────────────────
  selectTemplate: (id: string) => void;
  clearTemplateSelection: () => void;
  setTemplateCategoryFilter: (cat: TemplateCategory | 'all') => void;
  setTemplateSearchQuery: (query: string) => void;
  createCustomTemplate: (template: Omit<PublishingTemplate, 'id'>) => string;
  updateCustomTemplate: (id: string, patch: Partial<PublishingTemplate>) => void;
  deleteCustomTemplate: (id: string) => void;
  duplicateTemplate: (id: string) => string;
  setShowTemplateEditor: (show: boolean) => void;

  // ── Export Settings ──────────────────────────────────────────────────────
  updateExportSettings: (patch: Partial<ExportSettings>) => void;
  resetExportSettings: () => void;
  setSettingsTab: (tab: SettingsTab) => void;
  applyPresetToSettings: (presetId: string) => void;
  applyTemplateToSettings: (templateId: string) => void;

  // ── Render Queue ─────────────────────────────────────────────────────────
  addToQueue: (job: Omit<RenderJob, 'id' | 'createdAt' | 'status' | 'segments' | 'assignedNodeIds' | 'progress'>) => string;
  removeFromQueue: (jobId: string) => void;
  clearQueue: () => void;
  reorderQueue: (jobId: string, newIndex: number) => void;
  setJobPriority: (jobId: string, priority: JobPriority) => void;
  pauseJob: (jobId: string) => void;
  resumeJob: (jobId: string) => void;
  cancelJob: (jobId: string) => void;
  updateJobProgress: (jobId: string, progress: number, eta?: number) => void;
  updateJobStatus: (jobId: string, status: RenderJobStatus, error?: string) => void;
  completeJob: (jobId: string, outputPath: string, outputSize?: number) => void;
  startRender: () => void;
  pauseAllJobs: () => void;
  cancelAllJobs: () => void;
  setQueueSortBy: (sort: QueueSortBy) => void;

  // ── Worker Management ────────────────────────────────────────────────────
  addWorker: (node: WorkerNode) => void;
  removeWorker: (nodeId: string) => void;
  updateWorkerStatus: (nodeId: string, status: WorkerStatus) => void;
  updateWorkerProgress: (nodeId: string, progress: number, jobId?: string) => void;
  updateWorkerMetrics: (nodeId: string, metrics: Partial<WorkerMetrics>) => void;
  updateWorkerCapabilities: (nodeId: string, capabilities: WorkerCapabilities) => void;
  updateWorkerHeartbeat: (nodeId: string) => void;
  drainWorker: (nodeId: string) => void;
  setWorkerFilter: (filter: WorkerStatus | 'all') => void;

  // ── Panel Navigation ─────────────────────────────────────────────────────
  setRightPanelTab: (tab: RightPanelTab) => void;
  setSelectionMode: (mode: SelectionMode) => void;

  // ── Farm Stats ───────────────────────────────────────────────────────────
  updateFarmStats: (stats: Partial<FarmStats>) => void;
  setConnected: (connected: boolean) => void;

  // ── History ──────────────────────────────────────────────────────────────
  clearHistory: () => void;
  retryJob: (jobId: string) => string | null;
}

// ─── Default Farm Stats ──────────────────────────────────────────────────────

const DEFAULT_FARM_STATS: FarmStats = {
  nodesOnline: 0,
  nodesTotal: 0,
  nodesBusy: 0,
  queueDepth: 0,
  activeJobs: 0,
  completedToday: 0,
  utilization: 0,
  totalFramesRendered: 0,
  averageFps: 0,
};

// ─── Store ───────────────────────────────────────────────────────────────────

export const useDeliverStore = create<DeliverState & DeliverActions>()(
  immer((set, get) => ({
    // ── Initial State ────────────────────────────────────────────────────────
    templates: BUILT_IN_TEMPLATES,
    selectedTemplateId: null,
    templateSearchQuery: '',
    templateCategoryFilter: 'all',
    showTemplateEditor: false,

    exportSettings: { ...DEFAULT_EXPORT_SETTINGS },
    settingsTab: 'video',

    renderQueue: [],
    queueSortBy: 'priority',
    isQueueRunning: false,

    workers: [],
    workerFilter: 'all',

    rightPanelTab: 'queue',

    completedJobs: [],

    selectionMode: 'full',

    farmStats: { ...DEFAULT_FARM_STATS },
    isConnected: false,

    // ── Template Management ──────────────────────────────────────────────────

    selectTemplate: (id) => set((s) => {
      s.selectedTemplateId = id;
      // Auto-apply template settings
      const tpl = s.templates.find((t) => t.id === id);
      if (tpl?.presetOverrides) {
        Object.assign(s.exportSettings, tpl.presetOverrides);
      }
    }),

    clearTemplateSelection: () => set((s) => {
      s.selectedTemplateId = null;
    }),

    setTemplateCategoryFilter: (cat) => set((s) => { s.templateCategoryFilter = cat; }),
    setTemplateSearchQuery: (q) => set((s) => { s.templateSearchQuery = q; }),

    createCustomTemplate: (template) => {
      const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      set((s) => {
        s.templates.push({ ...template, id } as PublishingTemplate);
      });
      // Persist user-created templates to localStorage
      try {
        const customs = get().templates.filter((t) => !t.isBuiltIn);
        localStorage.setItem('avid:custom-templates', JSON.stringify(customs));
      } catch { /* ignore storage errors */ }
      return id;
    },

    updateCustomTemplate: (id, patch) => set((s) => {
      const tpl = s.templates.find((t) => t.id === id && !t.isBuiltIn);
      if (tpl) Object.assign(tpl, patch);
    }),

    deleteCustomTemplate: (id) => set((s) => {
      s.templates = s.templates.filter((t) => t.id !== id || t.isBuiltIn);
      if (s.selectedTemplateId === id) s.selectedTemplateId = null;
    }),

    duplicateTemplate: (id) => {
      const src = get().templates.find((t) => t.id === id);
      if (!src) return '';
      const newId = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      set((s) => {
        s.templates.push({
          ...JSON.parse(JSON.stringify(src)),
          id: newId,
          name: `${src.name} (Copy)`,
          isBuiltIn: false,
          category: 'custom' as TemplateCategory,
        });
      });
      return newId;
    },

    setShowTemplateEditor: (show) => set((s) => { s.showTemplateEditor = show; }),

    // ── Export Settings ──────────────────────────────────────────────────────

    updateExportSettings: (patch) => set((s) => {
      Object.assign(s.exportSettings, patch);
    }),

    resetExportSettings: () => set((s) => {
      s.exportSettings = { ...DEFAULT_EXPORT_SETTINGS };
    }),

    setSettingsTab: (tab) => set((s) => { s.settingsTab = tab; }),

    applyPresetToSettings: (presetId) => set((s) => {
      const preset = exportEngine.getPreset(presetId);
      if (!preset) return;
      s.exportSettings.videoCodec = preset.format;
      s.exportSettings.resolution = { ...preset.resolution };
      s.exportSettings.frameRate = preset.fps;
      s.exportSettings.bitrate = preset.bitrate;
      s.exportSettings.audioCodec = preset.audioCodec;
      s.exportSettings.audioBitrate = preset.audioBitrate;
      s.exportSettings.container = preset.container;
    }),

    applyTemplateToSettings: (templateId) => set((s) => {
      const tpl = s.templates.find((t) => t.id === templateId);
      if (!tpl) return;
      // Find the encode step's preset
      const encodeStep = tpl.steps.find((step) => step.type === 'encode');
      const presetId = encodeStep?.config?.['presetId'] as string | undefined;
      if (presetId) {
        const preset = exportEngine.getPreset(presetId);
        if (preset) {
          s.exportSettings.videoCodec = preset.format;
          s.exportSettings.resolution = { ...preset.resolution };
          s.exportSettings.frameRate = preset.fps;
          s.exportSettings.bitrate = preset.bitrate;
          s.exportSettings.audioCodec = preset.audioCodec;
          s.exportSettings.audioBitrate = preset.audioBitrate;
          s.exportSettings.container = preset.container;
        }
      }
      // Apply any overrides from the template
      if (tpl.presetOverrides) {
        Object.assign(s.exportSettings, tpl.presetOverrides);
      }
    }),

    // ── Render Queue ─────────────────────────────────────────────────────────

    addToQueue: (jobData) => {
      const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      set((s) => {
        s.renderQueue.push({
          ...jobData,
          id,
          createdAt: Date.now(),
          status: 'pending',
          segments: [],
          assignedNodeIds: [],
          progress: 0,
        } as RenderJob);
      });
      return id;
    },

    removeFromQueue: (jobId) => set((s) => {
      s.renderQueue = s.renderQueue.filter((j) => j.id !== jobId);
    }),

    clearQueue: () => set((s) => {
      // Move non-active jobs to history, keep active ones
      const active = s.renderQueue.filter((j) => j.status === 'encoding' || j.status === 'splitting' || j.status === 'uploading');
      const removed = s.renderQueue.filter((j) => j.status !== 'encoding' && j.status !== 'splitting' && j.status !== 'uploading');
      s.completedJobs.push(...removed);
      s.renderQueue = active;
    }),

    reorderQueue: (jobId, newIndex) => set((s) => {
      const idx = s.renderQueue.findIndex((j) => j.id === jobId);
      if (idx < 0 || idx === newIndex) return;
      const [job] = s.renderQueue.splice(idx, 1);
      s.renderQueue.splice(Math.min(newIndex, s.renderQueue.length), 0, job!);
    }),

    setJobPriority: (jobId, priority) => set((s) => {
      const job = s.renderQueue.find((j) => j.id === jobId);
      if (job) job.priority = priority;
    }),

    pauseJob: (jobId) => set((s) => {
      const job = s.renderQueue.find((j) => j.id === jobId);
      if (job && (job.status === 'encoding' || job.status === 'queued' || job.status === 'pending')) {
        job.status = 'paused';
      }
    }),

    resumeJob: (jobId) => set((s) => {
      const job = s.renderQueue.find((j) => j.id === jobId);
      if (job && job.status === 'paused') {
        job.status = 'queued';
      }
    }),

    cancelJob: (jobId) => set((s) => {
      const job = s.renderQueue.find((j) => j.id === jobId);
      if (job) {
        job.status = 'cancelled';
        job.segments.forEach((seg) => {
          if (seg.status !== 'completed') seg.status = 'cancelled';
        });
      }
    }),

    updateJobProgress: (jobId, progress, eta) => set((s) => {
      const job = s.renderQueue.find((j) => j.id === jobId);
      if (job) {
        job.progress = Math.min(100, Math.max(0, progress));
        if (eta !== undefined) job.estimatedTimeRemaining = eta;
      }
    }),

    updateJobStatus: (jobId, status, error) => set((s) => {
      const job = s.renderQueue.find((j) => j.id === jobId);
      if (job) {
        job.status = status;
        if (error) job.error = error;
        if (status === 'encoding' && !job.startedAt) job.startedAt = Date.now();
      }
    }),

    completeJob: (jobId, outputPath, outputSize) => set((s) => {
      const idx = s.renderQueue.findIndex((j) => j.id === jobId);
      if (idx < 0) return;
      const job = s.renderQueue[idx]!;
      job.status = 'completed';
      job.progress = 100;
      job.completedAt = Date.now();
      job.outputPath = outputPath;
      if (outputSize) job.outputSize = outputSize;
      job.estimatedTimeRemaining = 0;
      // Move to history
      s.completedJobs.unshift({ ...job } as any);
      s.renderQueue.splice(idx, 1);
    }),

    startRender: () => set((s) => {
      s.isQueueRunning = true;
      // Mark pending jobs as queued
      for (const job of s.renderQueue) {
        if (job.status === 'pending') job.status = 'queued';
      }
    }),

    pauseAllJobs: () => set((s) => {
      s.isQueueRunning = false;
      for (const job of s.renderQueue) {
        if (job.status === 'queued' || job.status === 'pending') {
          job.status = 'paused';
        }
      }
    }),

    cancelAllJobs: () => set((s) => {
      s.isQueueRunning = false;
      for (const job of s.renderQueue) {
        if (job.status !== 'completed') {
          job.status = 'cancelled';
        }
      }
    }),

    setQueueSortBy: (sort) => set((s) => { s.queueSortBy = sort; }),

    // ── Worker Management ────────────────────────────────────────────────────

    addWorker: (node) => set((s) => {
      // Avoid duplicates
      if (s.workers.some((w) => w.id === node.id)) return;
      s.workers.push(node);
      s.farmStats.nodesTotal = s.workers.length;
      s.farmStats.nodesOnline = s.workers.filter((w) => w.status !== 'offline').length;
    }),

    removeWorker: (nodeId) => set((s) => {
      s.workers = s.workers.filter((w) => w.id !== nodeId);
      s.farmStats.nodesTotal = s.workers.length;
      s.farmStats.nodesOnline = s.workers.filter((w) => w.status !== 'offline').length;
    }),

    updateWorkerStatus: (nodeId, status) => set((s) => {
      const worker = s.workers.find((w) => w.id === nodeId);
      if (worker) {
        worker.status = status;
        if (status === 'idle') {
          worker.currentJobId = null;
          worker.progress = 0;
        }
      }
      s.farmStats.nodesOnline = s.workers.filter((w) => w.status !== 'offline').length;
      s.farmStats.nodesBusy = s.workers.filter((w) => w.status === 'busy').length;
      s.farmStats.utilization = s.workers.length > 0
        ? Math.round((s.farmStats.nodesBusy / s.farmStats.nodesOnline) * 100) || 0
        : 0;
    }),

    updateWorkerProgress: (nodeId, progress, jobId) => set((s) => {
      const worker = s.workers.find((w) => w.id === nodeId);
      if (worker) {
        worker.progress = progress;
        if (jobId) worker.currentJobId = jobId;
      }
    }),

    updateWorkerMetrics: (nodeId, metrics) => set((s) => {
      const worker = s.workers.find((w) => w.id === nodeId);
      if (worker) Object.assign(worker.metrics, metrics);
    }),

    updateWorkerCapabilities: (nodeId, capabilities) => set((s) => {
      const worker = s.workers.find((w) => w.id === nodeId);
      if (worker) worker.capabilities = capabilities;
    }),

    updateWorkerHeartbeat: (nodeId) => set((s) => {
      const worker = s.workers.find((w) => w.id === nodeId);
      if (worker) worker.lastHeartbeat = Date.now();
    }),

    drainWorker: (nodeId) => set((s) => {
      const worker = s.workers.find((w) => w.id === nodeId);
      if (worker) worker.status = 'draining';
    }),

    setWorkerFilter: (filter) => set((s) => { s.workerFilter = filter; }),

    // ── Panel Navigation ─────────────────────────────────────────────────────

    setRightPanelTab: (tab) => set((s) => { s.rightPanelTab = tab; }),
    setSelectionMode: (mode) => set((s) => { s.selectionMode = mode; }),

    // ── Farm Stats ───────────────────────────────────────────────────────────

    updateFarmStats: (stats) => set((s) => {
      Object.assign(s.farmStats, stats);
    }),

    setConnected: (connected) => set((s) => { s.isConnected = connected; }),

    // ── History ──────────────────────────────────────────────────────────────

    clearHistory: () => set((s) => { s.completedJobs = []; }),

    retryJob: (jobId) => {
      const job = get().completedJobs.find((j) => j.id === jobId);
      if (!job || job.status !== 'failed') return null;
      // Re-add to queue with fresh state
      const newId = get().addToQueue({
        name: job.name,
        templateId: job.templateId,
        presetId: job.presetId,
        priority: job.priority,
        sourceTimelineId: job.sourceTimelineId,
        selectionMode: job.selectionMode,
        inFrame: job.inFrame,
        outFrame: job.outFrame,
        totalFrames: job.totalFrames,
        exportSettings: { ...job.exportSettings },
      });
      return newId;
    },
  })),
);

// ─── Hydrate user-created templates from localStorage ────────────────────────

try {
  const stored = localStorage.getItem('avid:custom-templates');
  if (stored) {
    const customs: PublishingTemplate[] = JSON.parse(stored);
    if (Array.isArray(customs) && customs.length > 0) {
      useDeliverStore.setState((s) => ({
        templates: [...s.templates, ...customs],
      }));
    }
  }
} catch { /* ignore parse errors */ }
