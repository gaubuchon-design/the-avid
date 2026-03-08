import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import {
  ColorNode,
  ColorConnection,
  colorEngine,
} from '../engine/ColorEngine';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ColorViewTab =
  | 'wheels'
  | 'curves'
  | 'huesat'
  | 'qualification'
  | 'nodeGraph';

interface ColorState {
  nodes: ColorNode[];
  connections: ColorConnection[];
  selectedNodeId: string | null;
  activeView: ColorViewTab;
  looks: { id: string; name: string; thumbnail?: string }[];
  stills: { id: string; name: string; frame: number }[];
  abWipeEnabled: boolean;
  abWipePosition: number;
}

interface ColorActions {
  selectNode: (id: string | null) => void;
  setActiveView: (view: ColorViewTab) => void;
  toggleABWipe: () => void;
  setABWipePosition: (position: number) => void;
  syncFromEngine: () => void;
  addNode: (type: ColorNode['type']) => void;
  removeNode: (id: string) => void;
  saveLook: (name: string) => void;
  loadLook: (id: string) => void;
  saveStill: (name: string) => void;
}

// ─── Store ─────────────────────────────────────────────────────────────────────

export const useColorStore = create<ColorState & ColorActions>()(
  immer((set) => ({
    // Initial state — synced from engine
    nodes: colorEngine.getAllNodes(),
    connections: colorEngine.getConnections(),
    selectedNodeId: null,
    activeView: 'wheels',
    looks: [],
    stills: [],
    abWipeEnabled: false,
    abWipePosition: 50,

    // Actions
    selectNode: (id) =>
      set((s) => {
        s.selectedNodeId = id;
      }),

    setActiveView: (view) =>
      set((s) => {
        s.activeView = view;
      }),

    toggleABWipe: () =>
      set((s) => {
        s.abWipeEnabled = !s.abWipeEnabled;
      }),

    setABWipePosition: (position) =>
      set((s) => {
        s.abWipePosition = Math.max(0, Math.min(100, position));
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
      // sync handled by engine subscription
    },

    removeNode: (id) => {
      colorEngine.removeNode(id);
    },

    saveLook: (name) => {
      colorEngine.saveLook(name);
    },

    loadLook: (id) => {
      colorEngine.loadLook(id);
    },

    saveStill: (name) => {
      // Stub: save a placeholder still
      colorEngine.saveStill(name, '');
    },
  }))
);

// Wire up engine -> store sync
colorEngine.subscribe(() => {
  useColorStore.getState().syncFromEngine();
});
