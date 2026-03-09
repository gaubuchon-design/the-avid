// =============================================================================
//  THE AVID -- Workspace / Toolset Management Engine
// =============================================================================
//
// Implements Avid Media Composer's Workspace management system:
//  - 5 built-in workspaces (Source/Record, Effects, Color Correction,
//    Audio Mixing, Full Screen)
//  - Custom workspace creation, save, delete
//  - Panel layout management (position, size, visibility, z-order)
//  - Workspace import/export for sharing configurations
//  - Panel toggle and visibility queries
//  - Reset to default workspace
//
// =============================================================================

import { useEditorStore } from '../store/editor.store';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Panel types available in the workspace layout. */
export type WorkspacePanelType =
  | 'source-monitor'
  | 'record-monitor'
  | 'timeline'
  | 'bins'
  | 'effects-palette'
  | 'audio-mixer'
  | 'color-correction'
  | 'markers'
  | 'inspector'
  | 'project'
  | 'console'
  | 'title-tool'
  | 'command-palette';

/** Configuration for a single panel in the workspace. */
export interface PanelConfig {
  id: string;
  type: WorkspacePanelType;
  x: number;           // % position from left
  y: number;           // % position from top
  width: number;       // % size width
  height: number;      // % size height
  visible: boolean;
  order: number;       // z-order (higher = on top)
}

/** A complete workspace layout definition. */
export interface WorkspaceLayout {
  id: string;
  name: string;
  panels: PanelConfig[];
  isBuiltIn: boolean;
}

/** Identifiers for the 5 built-in workspace presets. */
export type BuiltInWorkspace =
  | 'source-record'
  | 'effects'
  | 'color-correction'
  | 'audio-mixing'
  | 'full-screen';

// ─── Helpers ────────────────────────────────────────────────────────────────

let workspaceIdCounter = 0;
function genWorkspaceId(): string {
  return `ws_${++workspaceIdCounter}_${Date.now().toString(36)}`;
}

let panelIdCounter = 0;
function genPanelId(): string {
  return `pnl_${++panelIdCounter}_${Date.now().toString(36)}`;
}

/**
 * Deep-clone a workspace layout.
 */
function cloneLayout(layout: WorkspaceLayout): WorkspaceLayout {
  return {
    ...layout,
    panels: layout.panels.map((p) => ({ ...p })),
  };
}

// ─── Built-in Workspace Definitions ─────────────────────────────────────────

/**
 * Source/Record -- default editing layout.
 *
 * Two monitors side by side on top, full-width timeline on bottom,
 * bins and inspector in a side column.
 */
function createSourceRecordWorkspace(): WorkspaceLayout {
  return {
    id: 'builtin-source-record',
    name: 'Source/Record',
    isBuiltIn: true,
    panels: [
      { id: 'pnl-src',  type: 'source-monitor',  x: 0,  y: 0,  width: 38, height: 50, visible: true,  order: 1 },
      { id: 'pnl-rec',  type: 'record-monitor',  x: 38, y: 0,  width: 38, height: 50, visible: true,  order: 1 },
      { id: 'pnl-insp', type: 'inspector',        x: 76, y: 0,  width: 24, height: 50, visible: true,  order: 1 },
      { id: 'pnl-tl',   type: 'timeline',         x: 0,  y: 50, width: 76, height: 50, visible: true,  order: 1 },
      { id: 'pnl-bins', type: 'bins',             x: 76, y: 50, width: 24, height: 50, visible: true,  order: 1 },
      { id: 'pnl-efx',  type: 'effects-palette',  x: 0,  y: 0,  width: 24, height: 50, visible: false, order: 0 },
      { id: 'pnl-mix',  type: 'audio-mixer',      x: 0,  y: 0,  width: 24, height: 50, visible: false, order: 0 },
      { id: 'pnl-cc',   type: 'color-correction', x: 0,  y: 0,  width: 24, height: 50, visible: false, order: 0 },
      { id: 'pnl-mkr',  type: 'markers',          x: 0,  y: 0,  width: 24, height: 50, visible: false, order: 0 },
      { id: 'pnl-prj',  type: 'project',          x: 0,  y: 0,  width: 24, height: 50, visible: false, order: 0 },
      { id: 'pnl-con',  type: 'console',          x: 0,  y: 0,  width: 24, height: 30, visible: false, order: 0 },
      { id: 'pnl-ttl',  type: 'title-tool',       x: 0,  y: 0,  width: 50, height: 50, visible: false, order: 0 },
      { id: 'pnl-cmd',  type: 'command-palette',  x: 25, y: 10, width: 50, height: 30, visible: false, order: 10 },
    ],
  };
}

/**
 * Effects -- effects palette prominent alongside monitors and timeline.
 */
function createEffectsWorkspace(): WorkspaceLayout {
  return {
    id: 'builtin-effects',
    name: 'Effects',
    isBuiltIn: true,
    panels: [
      { id: 'pnl-src',  type: 'source-monitor',  x: 0,  y: 0,  width: 30, height: 45, visible: true,  order: 1 },
      { id: 'pnl-rec',  type: 'record-monitor',  x: 30, y: 0,  width: 30, height: 45, visible: true,  order: 1 },
      { id: 'pnl-efx',  type: 'effects-palette',  x: 60, y: 0,  width: 40, height: 55, visible: true,  order: 2 },
      { id: 'pnl-insp', type: 'inspector',        x: 60, y: 55, width: 40, height: 45, visible: true,  order: 1 },
      { id: 'pnl-tl',   type: 'timeline',         x: 0,  y: 45, width: 60, height: 55, visible: true,  order: 1 },
      { id: 'pnl-bins', type: 'bins',             x: 0,  y: 0,  width: 24, height: 50, visible: false, order: 0 },
      { id: 'pnl-mix',  type: 'audio-mixer',      x: 0,  y: 0,  width: 24, height: 50, visible: false, order: 0 },
      { id: 'pnl-cc',   type: 'color-correction', x: 0,  y: 0,  width: 24, height: 50, visible: false, order: 0 },
      { id: 'pnl-mkr',  type: 'markers',          x: 0,  y: 0,  width: 24, height: 50, visible: false, order: 0 },
      { id: 'pnl-prj',  type: 'project',          x: 0,  y: 0,  width: 24, height: 50, visible: false, order: 0 },
      { id: 'pnl-con',  type: 'console',          x: 0,  y: 0,  width: 24, height: 30, visible: false, order: 0 },
      { id: 'pnl-ttl',  type: 'title-tool',       x: 0,  y: 0,  width: 50, height: 50, visible: false, order: 0 },
      { id: 'pnl-cmd',  type: 'command-palette',  x: 25, y: 10, width: 50, height: 30, visible: false, order: 10 },
    ],
  };
}

/**
 * Color Correction -- three-monitor layout with colour wheels and scopes.
 */
function createColorCorrectionWorkspace(): WorkspaceLayout {
  return {
    id: 'builtin-color-correction',
    name: 'Color Correction',
    isBuiltIn: true,
    panels: [
      { id: 'pnl-src',  type: 'source-monitor',   x: 0,  y: 0,  width: 25, height: 40, visible: true,  order: 1 },
      { id: 'pnl-rec',  type: 'record-monitor',   x: 25, y: 0,  width: 25, height: 40, visible: true,  order: 1 },
      { id: 'pnl-cc',   type: 'color-correction',  x: 50, y: 0,  width: 50, height: 60, visible: true,  order: 2 },
      { id: 'pnl-tl',   type: 'timeline',          x: 0,  y: 40, width: 50, height: 60, visible: true,  order: 1 },
      { id: 'pnl-insp', type: 'inspector',         x: 50, y: 60, width: 50, height: 40, visible: true,  order: 1 },
      { id: 'pnl-bins', type: 'bins',              x: 0,  y: 0,  width: 24, height: 50, visible: false, order: 0 },
      { id: 'pnl-efx',  type: 'effects-palette',   x: 0,  y: 0,  width: 24, height: 50, visible: false, order: 0 },
      { id: 'pnl-mix',  type: 'audio-mixer',       x: 0,  y: 0,  width: 24, height: 50, visible: false, order: 0 },
      { id: 'pnl-mkr',  type: 'markers',           x: 0,  y: 0,  width: 24, height: 50, visible: false, order: 0 },
      { id: 'pnl-prj',  type: 'project',           x: 0,  y: 0,  width: 24, height: 50, visible: false, order: 0 },
      { id: 'pnl-con',  type: 'console',           x: 0,  y: 0,  width: 24, height: 30, visible: false, order: 0 },
      { id: 'pnl-ttl',  type: 'title-tool',        x: 0,  y: 0,  width: 50, height: 50, visible: false, order: 0 },
      { id: 'pnl-cmd',  type: 'command-palette',   x: 25, y: 10, width: 50, height: 30, visible: false, order: 10 },
    ],
  };
}

/**
 * Audio Mixing -- mixer and timeline prominent.
 */
function createAudioMixingWorkspace(): WorkspaceLayout {
  return {
    id: 'builtin-audio-mixing',
    name: 'Audio Mixing',
    isBuiltIn: true,
    panels: [
      { id: 'pnl-rec',  type: 'record-monitor',  x: 0,  y: 0,  width: 40, height: 40, visible: true,  order: 1 },
      { id: 'pnl-mix',  type: 'audio-mixer',      x: 40, y: 0,  width: 60, height: 50, visible: true,  order: 2 },
      { id: 'pnl-tl',   type: 'timeline',         x: 0,  y: 40, width: 40, height: 60, visible: true,  order: 1 },
      { id: 'pnl-insp', type: 'inspector',        x: 40, y: 50, width: 30, height: 50, visible: true,  order: 1 },
      { id: 'pnl-bins', type: 'bins',             x: 70, y: 50, width: 30, height: 50, visible: true,  order: 1 },
      { id: 'pnl-src',  type: 'source-monitor',   x: 0,  y: 0,  width: 30, height: 40, visible: false, order: 0 },
      { id: 'pnl-efx',  type: 'effects-palette',  x: 0,  y: 0,  width: 24, height: 50, visible: false, order: 0 },
      { id: 'pnl-cc',   type: 'color-correction', x: 0,  y: 0,  width: 24, height: 50, visible: false, order: 0 },
      { id: 'pnl-mkr',  type: 'markers',          x: 0,  y: 0,  width: 24, height: 50, visible: false, order: 0 },
      { id: 'pnl-prj',  type: 'project',          x: 0,  y: 0,  width: 24, height: 50, visible: false, order: 0 },
      { id: 'pnl-con',  type: 'console',          x: 0,  y: 0,  width: 24, height: 30, visible: false, order: 0 },
      { id: 'pnl-ttl',  type: 'title-tool',       x: 0,  y: 0,  width: 50, height: 50, visible: false, order: 0 },
      { id: 'pnl-cmd',  type: 'command-palette',  x: 25, y: 10, width: 50, height: 30, visible: false, order: 10 },
    ],
  };
}

/**
 * Full Screen -- maximized monitors with minimal UI.
 */
function createFullScreenWorkspace(): WorkspaceLayout {
  return {
    id: 'builtin-full-screen',
    name: 'Full Screen',
    isBuiltIn: true,
    panels: [
      { id: 'pnl-src',  type: 'source-monitor',  x: 0,  y: 0,  width: 50,  height: 70,  visible: true,  order: 1 },
      { id: 'pnl-rec',  type: 'record-monitor',  x: 50, y: 0,  width: 50,  height: 70,  visible: true,  order: 1 },
      { id: 'pnl-tl',   type: 'timeline',         x: 0,  y: 70, width: 100, height: 30,  visible: true,  order: 1 },
      { id: 'pnl-bins', type: 'bins',             x: 0,  y: 0,  width: 24,  height: 50,  visible: false, order: 0 },
      { id: 'pnl-efx',  type: 'effects-palette',  x: 0,  y: 0,  width: 24,  height: 50,  visible: false, order: 0 },
      { id: 'pnl-mix',  type: 'audio-mixer',      x: 0,  y: 0,  width: 24,  height: 50,  visible: false, order: 0 },
      { id: 'pnl-cc',   type: 'color-correction', x: 0,  y: 0,  width: 24,  height: 50,  visible: false, order: 0 },
      { id: 'pnl-mkr',  type: 'markers',          x: 0,  y: 0,  width: 24,  height: 50,  visible: false, order: 0 },
      { id: 'pnl-insp', type: 'inspector',        x: 0,  y: 0,  width: 24,  height: 50,  visible: false, order: 0 },
      { id: 'pnl-prj',  type: 'project',          x: 0,  y: 0,  width: 24,  height: 50,  visible: false, order: 0 },
      { id: 'pnl-con',  type: 'console',          x: 0,  y: 0,  width: 24,  height: 30,  visible: false, order: 0 },
      { id: 'pnl-ttl',  type: 'title-tool',       x: 0,  y: 0,  width: 50,  height: 50,  visible: false, order: 0 },
      { id: 'pnl-cmd',  type: 'command-palette',  x: 25, y: 10, width: 50,  height: 30,  visible: false, order: 10 },
    ],
  };
}

/** Map from built-in workspace ID to its factory function. */
const BUILT_IN_FACTORIES: Record<BuiltInWorkspace, () => WorkspaceLayout> = {
  'source-record': createSourceRecordWorkspace,
  'effects': createEffectsWorkspace,
  'color-correction': createColorCorrectionWorkspace,
  'audio-mixing': createAudioMixingWorkspace,
  'full-screen': createFullScreenWorkspace,
};

/** Map from built-in ID string to BuiltInWorkspace enum for lookup. */
const BUILT_IN_ID_MAP: Record<string, BuiltInWorkspace> = {
  'builtin-source-record': 'source-record',
  'builtin-effects': 'effects',
  'builtin-color-correction': 'color-correction',
  'builtin-audio-mixing': 'audio-mixing',
  'builtin-full-screen': 'full-screen',
};

// =============================================================================
//  WorkspaceEngine
// =============================================================================

/**
 * Avid-style Workspace / Toolset management engine.
 *
 * Maintains a collection of workspace layouts (both built-in and custom),
 * tracks the currently active workspace, and provides panel-level
 * configuration methods.
 *
 * Uses the editor store for syncing active panel state and provides a
 * subscribe/unsubscribe pattern for UI reactivity.
 */
export class WorkspaceEngine {
  /** All workspace layouts keyed by ID. */
  private workspaces: Map<string, WorkspaceLayout> = new Map();
  /** Currently active workspace ID. */
  private activeWorkspaceId: string;
  /** General subscribers. */
  private listeners = new Set<() => void>();

  constructor() {
    // Initialise with all 5 built-in workspaces
    const sourceRecord = createSourceRecordWorkspace();
    const effects = createEffectsWorkspace();
    const colorCorrection = createColorCorrectionWorkspace();
    const audioMixing = createAudioMixingWorkspace();
    const fullScreen = createFullScreenWorkspace();

    this.workspaces.set(sourceRecord.id, sourceRecord);
    this.workspaces.set(effects.id, effects);
    this.workspaces.set(colorCorrection.id, colorCorrection);
    this.workspaces.set(audioMixing.id, audioMixing);
    this.workspaces.set(fullScreen.id, fullScreen);

    // Default to Source/Record
    this.activeWorkspaceId = sourceRecord.id;
  }

  // ─── Private helpers ──────────────────────────────────────────────────

  /** Notify all subscribers that state has changed. */
  private notify(): void {
    this.listeners.forEach((fn) => {
      try { fn(); } catch (err) { console.error('[WorkspaceEngine] Subscriber error:', err); }
    });
  }

  /**
   * Sync the editor store's active panel based on the workspace.
   * Maps the most prominent visible panel to the editor store's panel type.
   */
  private syncEditorStorePanel(workspace: WorkspaceLayout): void {
    try {
      const state = useEditorStore.getState();
      // Determine which editor panel type to activate based on prominent panels
      if (workspace.panels.find((p) => p.type === 'color-correction' && p.visible)) {
        state.setActivePanel('color');
      } else if (workspace.panels.find((p) => p.type === 'audio-mixer' && p.visible)) {
        state.setActivePanel('audio');
      } else if (workspace.panels.find((p) => p.type === 'effects-palette' && p.visible)) {
        state.setActivePanel('effects');
      } else {
        state.setActivePanel('edit');
      }
    } catch {
      // Store may not be initialised in tests
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Workspace Queries
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Get all workspace layouts (built-in and custom).
   *
   * @returns Array of WorkspaceLayout objects, built-in first, then custom.
   */
  getWorkspaces(): WorkspaceLayout[] {
    const all = Array.from(this.workspaces.values());
    // Sort: built-in first, then custom alphabetically
    return all.sort((a, b) => {
      if (a.isBuiltIn && !b.isBuiltIn) return -1;
      if (!a.isBuiltIn && b.isBuiltIn) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Get the currently active workspace layout.
   *
   * @returns A copy of the active WorkspaceLayout.
   */
  getActiveWorkspace(): WorkspaceLayout {
    const ws = this.workspaces.get(this.activeWorkspaceId);
    if (!ws) {
      // Fallback: recreate default
      const fallback = createSourceRecordWorkspace();
      this.workspaces.set(fallback.id, fallback);
      this.activeWorkspaceId = fallback.id;
      return cloneLayout(fallback);
    }
    return cloneLayout(ws);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Workspace Activation
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Activate a workspace by its ID.
   *
   * @param id The workspace ID to activate.
   */
  activateWorkspace(id: string): void {
    const ws = this.workspaces.get(id);
    if (!ws) {
      console.warn(`[WorkspaceEngine] Workspace '${id}' not found`);
      return;
    }
    this.activeWorkspaceId = id;
    this.syncEditorStorePanel(ws);
    this.notify();
  }

  /**
   * Activate a built-in workspace by its logical name.
   *
   * @param workspace The built-in workspace to activate.
   */
  activateBuiltIn(workspace: BuiltInWorkspace): void {
    const factory = BUILT_IN_FACTORIES[workspace];
    if (!factory) {
      console.warn(`[WorkspaceEngine] Unknown built-in workspace '${workspace}'`);
      return;
    }

    // Find the existing built-in workspace by matching the canonical ID
    const canonicalId = `builtin-${workspace}`;
    if (this.workspaces.has(canonicalId)) {
      this.activeWorkspaceId = canonicalId;
      this.syncEditorStorePanel(this.workspaces.get(canonicalId)!);
    } else {
      // Re-create it if it was somehow removed
      const ws = factory();
      this.workspaces.set(ws.id, ws);
      this.activeWorkspaceId = ws.id;
      this.syncEditorStorePanel(ws);
    }

    this.notify();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Workspace Create / Save / Delete
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Create a new custom workspace with the default Source/Record layout.
   *
   * @param name Display name for the new workspace.
   * @returns The created WorkspaceLayout.
   */
  createWorkspace(name: string): WorkspaceLayout {
    const base = createSourceRecordWorkspace();
    const ws: WorkspaceLayout = {
      ...base,
      id: genWorkspaceId(),
      name,
      isBuiltIn: false,
      panels: base.panels.map((p) => ({
        ...p,
        id: genPanelId(),
      })),
    };
    this.workspaces.set(ws.id, ws);
    this.notify();
    return cloneLayout(ws);
  }

  /**
   * Save the currently active workspace layout as a new custom workspace.
   *
   * This clones the current layout (including any panel position changes)
   * into a new named workspace.
   *
   * @param name Display name for the saved workspace.
   * @returns The created WorkspaceLayout.
   */
  saveCurrentAsWorkspace(name: string): WorkspaceLayout {
    const current = this.workspaces.get(this.activeWorkspaceId);
    if (!current) {
      return this.createWorkspace(name);
    }

    const ws: WorkspaceLayout = {
      id: genWorkspaceId(),
      name,
      isBuiltIn: false,
      panels: current.panels.map((p) => ({
        ...p,
        id: genPanelId(),
      })),
    };
    this.workspaces.set(ws.id, ws);
    this.notify();
    return cloneLayout(ws);
  }

  /**
   * Delete a workspace by ID.
   *
   * Built-in workspaces cannot be deleted. If the deleted workspace was
   * active, the engine falls back to Source/Record.
   *
   * @param id The workspace ID to delete.
   */
  deleteWorkspace(id: string): void {
    const ws = this.workspaces.get(id);
    if (!ws) {
      console.warn(`[WorkspaceEngine] Workspace '${id}' not found`);
      return;
    }
    if (ws.isBuiltIn) {
      console.warn(`[WorkspaceEngine] Cannot delete built-in workspace '${ws.name}'`);
      return;
    }

    this.workspaces.delete(id);

    // If we deleted the active workspace, fall back to Source/Record
    if (this.activeWorkspaceId === id) {
      this.activeWorkspaceId = 'builtin-source-record';
      const fallback = this.workspaces.get(this.activeWorkspaceId);
      if (fallback) this.syncEditorStorePanel(fallback);
    }

    this.notify();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Panel Management
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Update a panel's configuration within the active workspace.
   *
   * @param panelId The panel ID to update.
   * @param config  Partial panel config to merge.
   */
  updatePanel(panelId: string, config: Partial<PanelConfig>): void {
    const ws = this.workspaces.get(this.activeWorkspaceId);
    if (!ws) return;

    const panel = ws.panels.find((p) => p.id === panelId);
    if (!panel) {
      console.warn(`[WorkspaceEngine] Panel '${panelId}' not found in active workspace`);
      return;
    }

    if (config.x !== undefined) panel.x = config.x;
    if (config.y !== undefined) panel.y = config.y;
    if (config.width !== undefined) panel.width = config.width;
    if (config.height !== undefined) panel.height = config.height;
    if (config.visible !== undefined) panel.visible = config.visible;
    if (config.order !== undefined) panel.order = config.order;

    this.notify();
  }

  /**
   * Toggle visibility of a panel type in the active workspace.
   *
   * If multiple panels of the same type exist, toggles the first one found.
   *
   * @param panelType The panel type to toggle.
   */
  togglePanel(panelType: string): void {
    const ws = this.workspaces.get(this.activeWorkspaceId);
    if (!ws) return;

    const panel = ws.panels.find((p) => p.type === panelType);
    if (!panel) {
      console.warn(`[WorkspaceEngine] Panel type '${panelType}' not found in active workspace`);
      return;
    }

    panel.visible = !panel.visible;
    this.notify();
  }

  /**
   * Check whether a panel type is currently visible in the active workspace.
   *
   * @param panelType The panel type to check.
   * @returns true if at least one panel of that type is visible.
   */
  isPanelVisible(panelType: string): boolean {
    const ws = this.workspaces.get(this.activeWorkspaceId);
    if (!ws) return false;

    return ws.panels.some((p) => p.type === panelType && p.visible);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Reset
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Reset the active workspace to its default state.
   *
   * For built-in workspaces, restores the factory layout. For custom
   * workspaces, restores the Source/Record default layout.
   */
  resetToDefault(): void {
    const ws = this.workspaces.get(this.activeWorkspaceId);
    if (!ws) return;

    if (ws.isBuiltIn) {
      // Find the matching factory and regenerate
      const builtInKey = BUILT_IN_ID_MAP[ws.id];
      if (builtInKey) {
        const factory = BUILT_IN_FACTORIES[builtInKey];
        const fresh = factory();
        this.workspaces.set(ws.id, fresh);
      }
    } else {
      // Reset custom workspace to Source/Record layout, keeping name and ID
      const base = createSourceRecordWorkspace();
      ws.panels = base.panels.map((p) => ({
        ...p,
        id: genPanelId(),
      }));
    }

    const updated = this.workspaces.get(this.activeWorkspaceId);
    if (updated) this.syncEditorStorePanel(updated);
    this.notify();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Import / Export
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Export all custom workspaces as a JSON string.
   *
   * Only custom (non-built-in) workspaces are exported. Built-in workspaces
   * are always available and do not need to be serialised.
   *
   * @returns JSON string of exported workspace layouts.
   */
  exportWorkspaces(): string {
    const custom = Array.from(this.workspaces.values()).filter(
      (ws) => !ws.isBuiltIn,
    );
    return JSON.stringify(custom, null, 2);
  }

  /**
   * Import workspaces from a JSON string.
   *
   * Imported workspaces are added alongside existing ones. If a workspace
   * with the same ID already exists, it is overwritten (unless it is built-in).
   *
   * @param json JSON string of workspace layouts to import.
   */
  importWorkspaces(json: string): void {
    let imported: WorkspaceLayout[];
    try {
      imported = JSON.parse(json);
    } catch {
      console.error('[WorkspaceEngine] Failed to parse workspace JSON');
      return;
    }

    if (!Array.isArray(imported)) {
      console.error('[WorkspaceEngine] Expected an array of workspace layouts');
      return;
    }

    for (const ws of imported) {
      // Validate minimal structure
      if (!ws.id || !ws.name || !Array.isArray(ws.panels)) {
        console.warn('[WorkspaceEngine] Skipping invalid workspace entry');
        continue;
      }

      // Never overwrite built-in workspaces
      const existing = this.workspaces.get(ws.id);
      if (existing?.isBuiltIn) {
        console.warn(`[WorkspaceEngine] Cannot overwrite built-in workspace '${existing.name}'`);
        continue;
      }

      // Ensure imported workspaces are marked as non-built-in
      ws.isBuiltIn = false;

      this.workspaces.set(ws.id, ws);
    }

    this.notify();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Subscribe
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Subscribe to workspace engine state changes.
   *
   * @param cb Callback invoked on any mutation.
   * @returns An unsubscribe function.
   */
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Cleanup
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Remove all workspaces and clear listeners.
   * Primarily useful for tests and teardown.
   */
  dispose(): void {
    this.workspaces.clear();
    this.listeners.clear();
  }
}

/** Singleton workspace engine instance. */
export const workspaceEngine = new WorkspaceEngine();
