import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import {
  ColorNode,
  ColorConnection,
  PrimaryParams,
  NodeParams,
  colorEngine,
} from '../engine/ColorEngine';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ColorViewTab =
  | 'primary'
  | 'log'
  | 'curves'
  | 'huesat'
  | 'qualifier'
  | 'windows'
  | 'nodeGraph';

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
}

// ─── Store ─────────────────────────────────────────────────────────────────────

let windowIdCounter = 0;

export const useColorStore = create<ColorState & ColorActions>()(
  immer((set) => ({
    // Initial state — synced from engine
    nodes: colorEngine.getAllNodes(),
    connections: colorEngine.getConnections(),
    selectedNodeId: null,
    activeView: 'primary',
    wheelMode: 'primary',
    curveType: 'custom',
    scopeType: 'waveform',
    scopePosition: 'post',
    qualifierShowMatte: false,
    qualifierMatteMode: 'highlight' as const,
    powerWindows: [],
    selectedWindowId: null,
    looks: [],
    stills: [],
    abWipeEnabled: false,
    abWipePosition: 50,
    gpuReady: false,
    processingMode: 'cpu' as const,

    // Actions
    selectNode: (id) =>
      set((s) => {
        s.selectedNodeId = id;
      }),

    setActiveView: (view) =>
      set((s) => {
        s.activeView = view;
      }),

    setWheelMode: (mode) =>
      set((s) => {
        s.wheelMode = mode;
      }),

    setCurveType: (type) =>
      set((s) => {
        s.curveType = type;
      }),

    setScopeType: (type) =>
      set((s) => {
        s.scopeType = type;
      }),

    setScopePosition: (pos) =>
      set((s) => {
        s.scopePosition = pos;
      }),

    toggleABWipe: () =>
      set((s) => {
        s.abWipeEnabled = !s.abWipeEnabled;
      }),

    setABWipePosition: (position) =>
      set((s) => {
        s.abWipePosition = Math.max(0, Math.min(100, position));
      }),

    setQualifierShowMatte: (show) =>
      set((s) => {
        s.qualifierShowMatte = show;
      }),

    setQualifierMatteMode: (mode) =>
      set((s) => {
        s.qualifierMatteMode = mode;
      }),

    syncFromEngine: () =>
      set((s) => {
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
      }),

    addNode: (type) => {
      colorEngine.addNode(type);
    },

    removeNode: (id) => {
      colorEngine.removeNode(id);
    },

    updateNodeParams: (id, params) => {
      colorEngine.updateNodeParams(id, params);
    },

    saveLook: (name) => {
      colorEngine.saveLook(name);
    },

    loadLook: (id) => {
      colorEngine.loadLook(id);
    },

    saveStill: (name) => {
      colorEngine.saveStill(name, '');
    },

    addPowerWindow: (type) =>
      set((s) => {
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
      }),

    removePowerWindow: (id) =>
      set((s) => {
        s.powerWindows = s.powerWindows.filter((w) => w.id !== id);
        if (s.selectedWindowId === id) s.selectedWindowId = null;
      }),

    updatePowerWindow: (id, updates) =>
      set((s) => {
        const win = s.powerWindows.find((w) => w.id === id);
        if (win) Object.assign(win, updates);
      }),

    selectPowerWindow: (id) =>
      set((s) => {
        s.selectedWindowId = id;
      }),

    setGPUReady: (ready, mode) =>
      set((s) => {
        s.gpuReady = ready;
        s.processingMode = mode;
      }),
  }))
);

// Wire up engine -> store sync
colorEngine.subscribe(() => {
  useColorStore.getState().syncFromEngine();
});

// Initialize GPU pipeline
colorEngine.initGPU().then(async () => {
  const { colorGradingPipeline } = await import('../engine/color/ColorGradingPipeline');
  useColorStore.getState().setGPUReady(
    colorGradingPipeline.isReady,
    colorGradingPipeline.processingMode,
  );
});
