import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

// ─── Types ──────────────────────────────────────────────────────────────────

// AAF/OMF Export
export type AAFExportFormat = 'aaf' | 'omf';
export type AAFExportStatus = 'idle' | 'exporting' | 'completed' | 'error';

// EDL/ALE/CSV Export
export type InterchangeFormat = 'edl' | 'ale' | 'csv';
export type TimecodeMode = 'non-drop' | 'drop-frame';

// Relink
export type RelinkStatus = 'idle' | 'scanning' | 'reviewing' | 'applying' | 'completed' | 'error';

export interface RelinkProposalUI {
  assetId: string;
  assetName: string;
  candidateCount: number;
  topMatchConfidence: number;
  topMatchPath: string;
  selectedIndex: number | null;
  confirmed: boolean;
}

// Multi-Cam
export type MultiCamViewMode = 'grid' | 'single' | 'split';

export interface MultiCamGroupUI {
  id: string;
  name: string;
  angleCount: number;
  activeAngleIndex: number;
  isLiveSwitching: boolean;
  status: 'syncing' | 'ready' | 'error' | 'editing';
}

// Stem Export
export interface StemUI {
  id: string;
  name: string;
  type: string;
  color: string;
  trackIds: string[];
  enabled: boolean;
}

export type StemExportStatus = 'idle' | 'configuring' | 'exporting' | 'completed' | 'error';

// Bin Lock
export interface BinLockUI {
  binId: string;
  holderName: string;
  holderColor: string;
  isSelf: boolean;
  expiresIn: number;
}

// Sequence Compare
export interface SequenceDiffSummaryUI {
  totalChanges: number;
  clipsAdded: number;
  clipsRemoved: number;
  clipsRepositioned: number;
  durationDelta: number;
}

// Frame Rate
export interface FrameRateWarningUI {
  clipId: string;
  clipName: string;
  sourceRate: number;
  timelineRate: number;
  severity: 'info' | 'warning' | 'error';
}

// ─── State ──────────────────────────────────────────────────────────────────

interface MediaState {
  // AAF/OMF Export
  aafExportStatus: AAFExportStatus;
  aafExportFormat: AAFExportFormat;
  aafExportProgress: number;
  aafExportError: string | null;
  aafIncludeMarkers: boolean;
  aafIncludeEffects: boolean;
  aafEmbedMedia: boolean;

  // EDL/ALE/CSV Export
  interchangeFormat: InterchangeFormat;
  interchangeTimecodeMode: TimecodeMode;
  interchangeExportResult: string | null;

  // Relink
  relinkStatus: RelinkStatus;
  relinkProposals: RelinkProposalUI[];
  relinkProgress: number;
  relinkError: string | null;
  offlineAssetCount: number;

  // Multi-Cam
  multiCamGroups: MultiCamGroupUI[];
  activeMultiCamGroupId: string | null;
  multiCamViewMode: MultiCamViewMode;
  multiCamAudioFollowsVideo: boolean;

  // Stem Export
  stems: StemUI[];
  stemExportStatus: StemExportStatus;
  stemExportProgress: number;
  stemPresetName: string;
  stemFormat: 'wav' | 'aiff';
  stemBitDepth: 16 | 24 | 32;
  stemSampleRate: number;

  // Bin Locking
  binLocks: BinLockUI[];

  // Sequence Compare
  isComparing: boolean;
  comparisonResult: SequenceDiffSummaryUI | null;

  // Frame Rate
  frameRateWarnings: FrameRateWarningUI[];
  showFrameRateIndicators: boolean;

  // UI Panels
  showExportDialog: boolean;
  showRelinkDialog: boolean;
  showMultiCamViewer: boolean;
  showStemExportDialog: boolean;
  showSequenceCompare: boolean;
  activeExportTab: 'aaf' | 'edl' | 'stems' | 'interchange';
}

interface MediaActions {
  // AAF/OMF Export
  setAAFExportFormat: (format: AAFExportFormat) => void;
  setAAFExportStatus: (status: AAFExportStatus) => void;
  setAAFExportProgress: (progress: number) => void;
  setAAFExportError: (error: string | null) => void;
  toggleAAFMarkers: () => void;
  toggleAAFEffects: () => void;
  toggleAAFEmbedMedia: () => void;

  // EDL/ALE/CSV
  setInterchangeFormat: (format: InterchangeFormat) => void;
  setInterchangeTimecodeMode: (mode: TimecodeMode) => void;
  setInterchangeExportResult: (result: string | null) => void;

  // Relink
  setRelinkStatus: (status: RelinkStatus) => void;
  setRelinkProposals: (proposals: RelinkProposalUI[]) => void;
  setRelinkProgress: (progress: number) => void;
  setRelinkError: (error: string | null) => void;
  setOfflineAssetCount: (count: number) => void;
  confirmRelinkProposal: (assetId: string, candidateIndex: number) => void;
  confirmAllRelinkProposals: () => void;

  // Multi-Cam
  setMultiCamGroups: (groups: MultiCamGroupUI[]) => void;
  setActiveMultiCamGroup: (groupId: string | null) => void;
  setMultiCamViewMode: (mode: MultiCamViewMode) => void;
  toggleMultiCamAudioFollowsVideo: () => void;
  updateMultiCamGroup: (groupId: string, update: Partial<MultiCamGroupUI>) => void;

  // Stem Export
  setStems: (stems: StemUI[]) => void;
  toggleStemEnabled: (stemId: string) => void;
  setStemExportStatus: (status: StemExportStatus) => void;
  setStemExportProgress: (progress: number) => void;
  setStemPresetName: (name: string) => void;
  setStemFormat: (format: 'wav' | 'aiff') => void;
  setStemBitDepth: (depth: 16 | 24 | 32) => void;
  setStemSampleRate: (rate: number) => void;

  // Bin Locking
  setBinLocks: (locks: BinLockUI[]) => void;
  addBinLock: (lock: BinLockUI) => void;
  removeBinLock: (binId: string) => void;

  // Sequence Compare
  setIsComparing: (comparing: boolean) => void;
  setComparisonResult: (result: SequenceDiffSummaryUI | null) => void;

  // Frame Rate
  setFrameRateWarnings: (warnings: FrameRateWarningUI[]) => void;
  toggleFrameRateIndicators: () => void;

  // UI Panels
  toggleExportDialog: () => void;
  toggleRelinkDialog: () => void;
  toggleMultiCamViewer: () => void;
  toggleStemExportDialog: () => void;
  toggleSequenceCompare: () => void;
  setActiveExportTab: (tab: MediaState['activeExportTab']) => void;

  // Reset
  resetExportState: () => void;
  resetRelinkState: () => void;
  resetStore: () => void;
}

// ─── Initial State ──────────────────────────────────────────────────────────

const INITIAL_MEDIA_STATE: MediaState = {
  aafExportStatus: 'idle',
  aafExportFormat: 'aaf',
  aafExportProgress: 0,
  aafExportError: null,
  aafIncludeMarkers: true,
  aafIncludeEffects: true,
  aafEmbedMedia: false,
  interchangeFormat: 'edl',
  interchangeTimecodeMode: 'non-drop',
  interchangeExportResult: null,
  relinkStatus: 'idle',
  relinkProposals: [],
  relinkProgress: 0,
  relinkError: null,
  offlineAssetCount: 0,
  multiCamGroups: [],
  activeMultiCamGroupId: null,
  multiCamViewMode: 'grid',
  multiCamAudioFollowsVideo: true,
  stems: [],
  stemExportStatus: 'idle',
  stemExportProgress: 0,
  stemPresetName: 'Film/TV Standard',
  stemFormat: 'wav',
  stemBitDepth: 24,
  stemSampleRate: 48000,
  binLocks: [],
  isComparing: false,
  comparisonResult: null,
  frameRateWarnings: [],
  showFrameRateIndicators: true,
  showExportDialog: false,
  showRelinkDialog: false,
  showMultiCamViewer: false,
  showStemExportDialog: false,
  showSequenceCompare: false,
  activeExportTab: 'aaf',
};

// ─── Store ──────────────────────────────────────────────────────────────────

export const useMediaStore = create<MediaState & MediaActions>()(
  devtools(
    immer((set) => ({
      // Initial state
      ...INITIAL_MEDIA_STATE,

    // Actions - AAF
    setAAFExportFormat: (format) => set((s) => { s.aafExportFormat = format; }),
    setAAFExportStatus: (status) => set((s) => { s.aafExportStatus = status; }),
    setAAFExportProgress: (progress) => set((s) => { s.aafExportProgress = progress; }),
    setAAFExportError: (error) => set((s) => { s.aafExportError = error; }),
    toggleAAFMarkers: () => set((s) => { s.aafIncludeMarkers = !s.aafIncludeMarkers; }),
    toggleAAFEffects: () => set((s) => { s.aafIncludeEffects = !s.aafIncludeEffects; }),
    toggleAAFEmbedMedia: () => set((s) => { s.aafEmbedMedia = !s.aafEmbedMedia; }),

    // Actions - EDL/ALE/CSV
    setInterchangeFormat: (format) => set((s) => { s.interchangeFormat = format; }),
    setInterchangeTimecodeMode: (mode) => set((s) => { s.interchangeTimecodeMode = mode; }),
    setInterchangeExportResult: (result) => set((s) => { s.interchangeExportResult = result; }),

    // Actions - Relink
    setRelinkStatus: (status) => set((s) => { s.relinkStatus = status; }),
    setRelinkProposals: (proposals) => set((s) => { s.relinkProposals = proposals; }),
    setRelinkProgress: (progress) => set((s) => { s.relinkProgress = progress; }),
    setRelinkError: (error) => set((s) => { s.relinkError = error; }),
    setOfflineAssetCount: (count) => set((s) => { s.offlineAssetCount = count; }),
    confirmRelinkProposal: (assetId, candidateIndex) => set((s) => {
      const proposal = s.relinkProposals.find((p) => p.assetId === assetId);
      if (proposal) {
        proposal.selectedIndex = candidateIndex;
        proposal.confirmed = true;
      }
    }),
    confirmAllRelinkProposals: () => set((s) => {
      for (const proposal of s.relinkProposals) {
        if (proposal.candidateCount > 0 && proposal.topMatchConfidence >= 0.85) {
          proposal.selectedIndex = 0;
          proposal.confirmed = true;
        }
      }
    }),

    // Actions - Multi-Cam
    setMultiCamGroups: (groups) => set((s) => { s.multiCamGroups = groups; }),
    setActiveMultiCamGroup: (groupId) => set((s) => { s.activeMultiCamGroupId = groupId; }),
    setMultiCamViewMode: (mode) => set((s) => { s.multiCamViewMode = mode; }),
    toggleMultiCamAudioFollowsVideo: () => set((s) => { s.multiCamAudioFollowsVideo = !s.multiCamAudioFollowsVideo; }),
    updateMultiCamGroup: (groupId, update) => set((s) => {
      const group = s.multiCamGroups.find((g) => g.id === groupId);
      if (group) Object.assign(group, update);
    }),

    // Actions - Stem Export
    setStems: (stems) => set((s) => { s.stems = stems; }),
    toggleStemEnabled: (stemId) => set((s) => {
      const stem = s.stems.find((st) => st.id === stemId);
      if (stem) stem.enabled = !stem.enabled;
    }),
    setStemExportStatus: (status) => set((s) => { s.stemExportStatus = status; }),
    setStemExportProgress: (progress) => set((s) => { s.stemExportProgress = progress; }),
    setStemPresetName: (name) => set((s) => { s.stemPresetName = name; }),
    setStemFormat: (format) => set((s) => { s.stemFormat = format; }),
    setStemBitDepth: (depth) => set((s) => { s.stemBitDepth = depth; }),
    setStemSampleRate: (rate) => set((s) => { s.stemSampleRate = rate; }),

    // Actions - Bin Locking
    setBinLocks: (locks) => set((s) => { s.binLocks = locks; }),
    addBinLock: (lock) => set((s) => {
      const existing = s.binLocks.findIndex((l) => l.binId === lock.binId);
      if (existing >= 0) {
        s.binLocks[existing] = lock;
      } else {
        s.binLocks.push(lock);
      }
    }),
    removeBinLock: (binId) => set((s) => {
      s.binLocks = s.binLocks.filter((l) => l.binId !== binId);
    }),

    // Actions - Sequence Compare
    setIsComparing: (comparing) => set((s) => { s.isComparing = comparing; }),
    setComparisonResult: (result) => set((s) => { s.comparisonResult = result; }),

    // Actions - Frame Rate
    setFrameRateWarnings: (warnings) => set((s) => { s.frameRateWarnings = warnings; }),
    toggleFrameRateIndicators: () => set((s) => { s.showFrameRateIndicators = !s.showFrameRateIndicators; }),

    // Actions - UI Panels
    toggleExportDialog: () => set((s) => { s.showExportDialog = !s.showExportDialog; }),
    toggleRelinkDialog: () => set((s) => { s.showRelinkDialog = !s.showRelinkDialog; }),
    toggleMultiCamViewer: () => set((s) => { s.showMultiCamViewer = !s.showMultiCamViewer; }),
    toggleStemExportDialog: () => set((s) => { s.showStemExportDialog = !s.showStemExportDialog; }),
    toggleSequenceCompare: () => set((s) => { s.showSequenceCompare = !s.showSequenceCompare; }),
    setActiveExportTab: (tab) => set((s) => { s.activeExportTab = tab; }),

    // Reset
    resetExportState: () => set((s) => {
      s.aafExportStatus = 'idle';
      s.aafExportProgress = 0;
      s.aafExportError = null;
      s.interchangeExportResult = null;
      s.stemExportStatus = 'idle';
      s.stemExportProgress = 0;
    }),
    resetRelinkState: () => set((s) => {
      s.relinkStatus = 'idle';
      s.relinkProposals = [];
      s.relinkProgress = 0;
      s.relinkError = null;
    }, false, 'media/resetRelinkState'),

    resetStore: () => set(() => ({
      ...INITIAL_MEDIA_STATE,
    }), true, 'media/resetStore'),
  })),
  { name: 'MediaStore', enabled: process.env["NODE_ENV"] === 'development' },
  )
);

// ─── Named Selectors ────────────────────────────────────────────────────────

type MediaStoreState = MediaState & MediaActions;

export const selectAAFExportStatus = (state: MediaStoreState) => state.aafExportStatus;
export const selectAAFExportFormat = (state: MediaStoreState) => state.aafExportFormat;
export const selectAAFExportProgress = (state: MediaStoreState) => state.aafExportProgress;
export const selectAAFExportError = (state: MediaStoreState) => state.aafExportError;
export const selectRelinkStatus = (state: MediaStoreState) => state.relinkStatus;
export const selectRelinkProposals = (state: MediaStoreState) => state.relinkProposals;
export const selectRelinkProgress = (state: MediaStoreState) => state.relinkProgress;
export const selectRelinkError = (state: MediaStoreState) => state.relinkError;
export const selectOfflineAssetCount = (state: MediaStoreState) => state.offlineAssetCount;
export const selectMultiCamGroups = (state: MediaStoreState) => state.multiCamGroups;
export const selectActiveMultiCamGroupId = (state: MediaStoreState) => state.activeMultiCamGroupId;
export const selectMultiCamViewMode = (state: MediaStoreState) => state.multiCamViewMode;
export const selectStems = (state: MediaStoreState) => state.stems;
export const selectStemExportStatus = (state: MediaStoreState) => state.stemExportStatus;
export const selectStemExportProgress = (state: MediaStoreState) => state.stemExportProgress;
export const selectBinLocks = (state: MediaStoreState) => state.binLocks;
export const selectIsComparing = (state: MediaStoreState) => state.isComparing;
export const selectComparisonResult = (state: MediaStoreState) => state.comparisonResult;
export const selectFrameRateWarnings = (state: MediaStoreState) => state.frameRateWarnings;
export const selectShowExportDialog = (state: MediaStoreState) => state.showExportDialog;
export const selectActiveExportTab = (state: MediaStoreState) => state.activeExportTab;
export const selectMediaIsExporting = (state: MediaStoreState) =>
  state.aafExportStatus === 'exporting' || state.stemExportStatus === 'exporting';
export const selectHasRelinkErrors = (state: MediaStoreState) =>
  state.relinkError !== null || state.relinkStatus === 'error';
export const selectConfirmedRelinkCount = (state: MediaStoreState) =>
  state.relinkProposals.filter((p) => p.confirmed).length;
export const selectActiveMultiCamGroup = (state: MediaStoreState) =>
  state.multiCamGroups.find((g) => g.id === state.activeMultiCamGroupId) ?? null;
export const selectEnabledStems = (state: MediaStoreState) =>
  state.stems.filter((s) => s.enabled);
