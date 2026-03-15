import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import {
  ColorNode,
  ColorConnection,
  PrimaryParams,
  NodeParams,
  colorEngine,
} from '../engine/ColorEngine';
import { getStoreDevtoolsOptions } from '../lib/runtimeEnvironment';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ColorViewTab =
  | 'primary'
  | 'log'
  | 'curves'
  | 'huesat'
  | 'qualifier'
  | 'windows'
  | 'nodeGraph'
  | 'pipeline';

export type WheelMode = 'primary' | 'log';

export type CurveType =
  | 'custom'
  | 'hueVsHue'
  | 'hueVsSat'
  | 'hueVsLum'
  | 'lumVsSat'
  | 'satVsSat'
  | 'satVsLum';

export type ScopeType = 'waveform' | 'vectorscope' | 'histogram' | 'parade';
export type ScopePosition = 'pre' | 'post';

export interface PowerWindow {
  id: string;
  type: 'circle' | 'linear' | 'polygon' | 'gradient';
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
  width: number;
  height: number;
  rotation: number;
  softness: number;
  invert: boolean;
  enabled: boolean;
  points?: { x: number; y: number }[]; // for polygon
}

interface ColorState {
  // Node graph
  nodes: ColorNode[];
  connections: ColorConnection[];
  selectedNodeId: string | null;

  // View state
  activeView: ColorViewTab;
  wheelMode: WheelMode;
  curveType: CurveType;

  // Scopes
  scopeType: ScopeType;
  scopePosition: ScopePosition;

  // Qualifier state
  qualifierShowMatte: boolean;
  qualifierMatteMode: 'highlight' | 'bw' | 'result';

  // Power windows
  powerWindows: PowerWindow[];
  selectedWindowId: string | null;

  // Gallery
  looks: { id: string; name: string; thumbnail?: string }[];
  stills: { id: string; name: string; frame: number }[];

  // A/B wipe
  abWipeEnabled: boolean;
  abWipePosition: number;

  // GPU status
  gpuReady: boolean;
  processingMode: 'gpu' | 'cpu';

  // Color pipeline management
  sourceColorSpace: 'rec709' | 'rec2020' | 'dci-p3' | 'aces-linear' | 'aces-cct' | 'srgb' | null;
  workingColorSpace: 'rec709' | 'rec2020' | 'dci-p3' | 'aces-cct';
  displayTransform: 'sdr-rec709' | 'hdr-pq' | 'hdr-hlg';
  pipelineMismatch: boolean;
  pipelineAutoDetect: boolean;
}

interface ColorActions {
  selectNode: (id: string | null) => void;
  setActiveView: (view: ColorViewTab) => void;
  setWheelMode: (mode: WheelMode) => void;
  setCurveType: (type: CurveType) => void;
  setScopeType: (type: ScopeType) => void;
  setScopePosition: (pos: ScopePosition) => void;
  toggleABWipe: () => void;
  setABWipePosition: (position: number) => void;
  setQualifierShowMatte: (show: boolean) => void;
  setQualifierMatteMode: (mode: 'highlight' | 'bw' | 'result') => void;
  syncFromEngine: () => void;
  addNode: (type: ColorNode['type']) => void;
  removeNode: (id: string) => void;
  updateNodeParams: (id: string, params: Partial<NodeParams>) => void;
  saveLook: (name: string) => void;
  loadLook: (id: string) => void;
  saveStill: (name: string) => void;
  addPowerWindow: (type: PowerWindow['type']) => void;
  removePowerWindow: (id: string) => void;
  updatePowerWindow: (id: string, updates: Partial<PowerWindow>) => void;
  selectPowerWindow: (id: string | null) => void;
  setGPUReady: (ready: boolean, mode: 'gpu' | 'cpu') => void;
  setSourceColorSpace: (cs: ColorState['sourceColorSpace']) => void;
  setWorkingColorSpace: (cs: ColorState['workingColorSpace']) => void;
  setDisplayTransform: (dt: ColorState['displayTransform']) => void;
  setPipelineAutoDetect: (auto: boolean) => void;
  computePipelineMismatch: () => void;
  resetStore: () => void;
}

// ─── Store ─────────────────────────────────────────────────────────────────────

let windowIdCounter = 0;

export const useColorStore = create<ColorState & ColorActions>()(
  devtools(
    immer((set) => ({
      // Initial state — synced from engine
      nodes: colorEngine.getAllNodes(),
      connections: colorEngine.getConnections(),
      selectedNodeId: null,
      activeView: 'primary' as const,
      wheelMode: 'primary' as const,
      curveType: 'custom' as const,
      scopeType: 'waveform' as const,
      scopePosition: 'post' as const,
      qualifierShowMatte: false,
      qualifierMatteMode: 'highlight' as const,
      powerWindows: [] as PowerWindow[],
      selectedWindowId: null as string | null,
      looks: [] as { id: string; name: string; thumbnail?: string }[],
      stills: [] as { id: string; name: string; frame: number }[],
      abWipeEnabled: false,
      abWipePosition: 50,
      gpuReady: false,
      processingMode: 'cpu' as const,
      sourceColorSpace: null,
      workingColorSpace: 'rec709' as const,
      displayTransform: 'sdr-rec709' as const,
      pipelineMismatch: false,
      pipelineAutoDetect: true,

      // Actions
      selectNode: (id) =>
        set(
          (s) => {
            s.selectedNodeId = id;
          },
          false,
          'color/selectNode'
        ),

      setActiveView: (view) =>
        set(
          (s) => {
            s.activeView = view;
          },
          false,
          'color/setActiveView'
        ),

      setWheelMode: (mode) =>
        set(
          (s) => {
            s.wheelMode = mode;
          },
          false,
          'color/setWheelMode'
        ),

      setCurveType: (type) =>
        set(
          (s) => {
            s.curveType = type;
          },
          false,
          'color/setCurveType'
        ),

      setScopeType: (type) =>
        set(
          (s) => {
            s.scopeType = type;
          },
          false,
          'color/setScopeType'
        ),

      setScopePosition: (pos) =>
        set(
          (s) => {
            s.scopePosition = pos;
          },
          false,
          'color/setScopePosition'
        ),

      toggleABWipe: () =>
        set(
          (s) => {
            s.abWipeEnabled = !s.abWipeEnabled;
          },
          false,
          'color/toggleABWipe'
        ),

      setABWipePosition: (position) =>
        set(
          (s) => {
            s.abWipePosition = Math.max(0, Math.min(100, position));
          },
          false,
          'color/setABWipePosition'
        ),

      setQualifierShowMatte: (show) =>
        set(
          (s) => {
            s.qualifierShowMatte = show;
          },
          false,
          'color/setQualifierShowMatte'
        ),

      setQualifierMatteMode: (mode) =>
        set(
          (s) => {
            s.qualifierMatteMode = mode;
          },
          false,
          'color/setQualifierMatteMode'
        ),

      syncFromEngine: () =>
        set(
          (s) => {
            s.nodes = colorEngine.getAllNodes();
            s.connections = colorEngine.getConnections();
            s.looks = colorEngine.getLooks().map((l) => ({
              id: l.id,
              name: l.name,
              thumbnail: l.thumbnail,
            }));
            s.stills = colorEngine.getStills().map((st) => ({
              id: st.id,
              name: st.name,
              frame: st.frame,
            }));
          },
          false,
          'color/syncFromEngine'
        ),

      addNode: (type) => {
        colorEngine.addNode(type);
        set(
          (s) => {
            s.nodes = colorEngine.getAllNodes();
            s.connections = colorEngine.getConnections();
          },
          false,
          'color/addNode'
        );
      },

      removeNode: (id) => {
        colorEngine.removeNode(id);
        set(
          (s) => {
            s.nodes = colorEngine.getAllNodes();
            s.connections = colorEngine.getConnections();
            if (s.selectedNodeId === id) s.selectedNodeId = null;
          },
          false,
          'color/removeNode'
        );
      },

      updateNodeParams: (id, params) => {
        colorEngine.updateNodeParams(id, params);
        set(
          (s) => {
            s.nodes = colorEngine.getAllNodes();
          },
          false,
          'color/updateNodeParams'
        );
      },

      saveLook: (name) => {
        colorEngine.saveLook(name);
        set(
          (s) => {
            s.looks = colorEngine.getLooks().map((l) => ({
              id: l.id,
              name: l.name,
              thumbnail: l.thumbnail,
            }));
          },
          false,
          'color/saveLook'
        );
      },

      loadLook: (id) => {
        colorEngine.loadLook(id);
        set(
          (s) => {
            s.nodes = colorEngine.getAllNodes();
            s.connections = colorEngine.getConnections();
          },
          false,
          'color/loadLook'
        );
      },

      saveStill: (name) => {
        colorEngine.saveStill(name, '');
        set(
          (s) => {
            s.stills = colorEngine.getStills().map((st) => ({
              id: st.id,
              name: st.name,
              frame: st.frame,
            }));
          },
          false,
          'color/saveStill'
        );
      },

      addPowerWindow: (type) =>
        set(
          (s) => {
            const id = `pw_${++windowIdCounter}_${Date.now().toString(36)}`;
            s.powerWindows.push({
              id,
              type,
              centerX: 0.5,
              centerY: 0.5,
              radiusX: 0.25,
              radiusY: 0.25,
              width: 0.5,
              height: 0.5,
              rotation: 0,
              softness: 0.1,
              invert: false,
              enabled: true,
            });
            s.selectedWindowId = id;
          },
          false,
          'color/addPowerWindow'
        ),

      removePowerWindow: (id) =>
        set(
          (s) => {
            s.powerWindows = s.powerWindows.filter((w) => w.id !== id);
            if (s.selectedWindowId === id) s.selectedWindowId = null;
          },
          false,
          'color/removePowerWindow'
        ),

      updatePowerWindow: (id, updates) =>
        set(
          (s) => {
            const win = s.powerWindows.find((w) => w.id === id);
            if (win) Object.assign(win, updates);
          },
          false,
          'color/updatePowerWindow'
        ),

      selectPowerWindow: (id) =>
        set(
          (s) => {
            s.selectedWindowId = id;
          },
          false,
          'color/selectPowerWindow'
        ),

      setGPUReady: (ready, mode) =>
        set(
          (s) => {
            s.gpuReady = ready;
            s.processingMode = mode;
          },
          false,
          'color/setGPUReady'
        ),

      setSourceColorSpace: (cs) =>
        set(
          (s) => {
            s.sourceColorSpace = cs;
            s.pipelineMismatch = cs != null && cs !== s.workingColorSpace;
          },
          false,
          'color/setSourceColorSpace'
        ),

      setWorkingColorSpace: (cs) =>
        set(
          (s) => {
            s.workingColorSpace = cs;
            s.pipelineMismatch = s.sourceColorSpace != null && s.sourceColorSpace !== cs;
          },
          false,
          'color/setWorkingColorSpace'
        ),

      setDisplayTransform: (dt) =>
        set(
          (s) => { s.displayTransform = dt; },
          false,
          'color/setDisplayTransform'
        ),

      setPipelineAutoDetect: (auto) =>
        set(
          (s) => { s.pipelineAutoDetect = auto; },
          false,
          'color/setPipelineAutoDetect'
        ),

      computePipelineMismatch: () =>
        set(
          (s) => {
            s.pipelineMismatch = s.sourceColorSpace != null && s.sourceColorSpace !== s.workingColorSpace;
          },
          false,
          'color/computePipelineMismatch'
        ),

      resetStore: () =>
        set(
          (s) => {
            s.nodes = colorEngine.getAllNodes();
            s.connections = colorEngine.getConnections();
            s.selectedNodeId = null;
            s.activeView = 'primary';
            s.wheelMode = 'primary';
            s.curveType = 'custom';
            s.scopeType = 'waveform';
            s.scopePosition = 'post';
            s.qualifierShowMatte = false;
            s.qualifierMatteMode = 'highlight';
            s.powerWindows = [];
            s.selectedWindowId = null;
            s.looks = [];
            s.stills = [];
            s.abWipeEnabled = false;
            s.abWipePosition = 50;
            s.sourceColorSpace = null;
            s.workingColorSpace = 'rec709';
            s.displayTransform = 'sdr-rec709';
            s.pipelineMismatch = false;
            s.pipelineAutoDetect = true;
          },
          false,
          'color/resetStore'
        ),
    })),
    getStoreDevtoolsOptions('ColorStore')
  )
);

// Wire up engine -> store sync
colorEngine.subscribe(() => {
  useColorStore.getState().syncFromEngine();
});

// Initialize GPU pipeline
colorEngine.initGPU().then(async () => {
  const { colorGradingPipeline } = await import('../engine/color/ColorGradingPipeline');
  useColorStore
    .getState()
    .setGPUReady(colorGradingPipeline.isReady, colorGradingPipeline.processingMode);
});

// ─── Named Selectors ────────────────────────────────────────────────────────

type ColorStoreState = ColorState & ColorActions;

export const selectColorNodes = (state: ColorStoreState) => state.nodes;
export const selectColorConnections = (state: ColorStoreState) => state.connections;
export const selectSelectedNodeId = (state: ColorStoreState) => state.selectedNodeId;
export const selectColorActiveView = (state: ColorStoreState) => state.activeView;
export const selectWheelMode = (state: ColorStoreState) => state.wheelMode;
export const selectCurveType = (state: ColorStoreState) => state.curveType;
export const selectColorScopeType = (state: ColorStoreState) => state.scopeType;
export const selectColorScopePosition = (state: ColorStoreState) => state.scopePosition;
export const selectQualifierShowMatte = (state: ColorStoreState) => state.qualifierShowMatte;
export const selectQualifierMatteMode = (state: ColorStoreState) => state.qualifierMatteMode;
export const selectPowerWindows = (state: ColorStoreState) => state.powerWindows;
export const selectSelectedWindowId = (state: ColorStoreState) => state.selectedWindowId;
export const selectColorLooks = (state: ColorStoreState) => state.looks;
export const selectColorStills = (state: ColorStoreState) => state.stills;
export const selectABWipeEnabled = (state: ColorStoreState) => state.abWipeEnabled;
export const selectABWipePosition = (state: ColorStoreState) => state.abWipePosition;
export const selectGpuReady = (state: ColorStoreState) => state.gpuReady;
export const selectProcessingMode = (state: ColorStoreState) => state.processingMode;
export const selectSelectedColorNode = (state: ColorStoreState) =>
  state.nodes.find((n) => n.id === state.selectedNodeId) ?? null;
export const selectSelectedPowerWindow = (state: ColorStoreState) =>
  state.powerWindows.find((w) => w.id === state.selectedWindowId) ?? null;
export const selectEnabledPowerWindows = (state: ColorStoreState) =>
  state.powerWindows.filter((w) => w.enabled);
