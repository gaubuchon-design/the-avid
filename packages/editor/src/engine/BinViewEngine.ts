// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID -- Bin View Engine
// ═══════════════════════════════════════════════════════════════════════════
//
// Implements Avid Media Composer's Bin management including:
//  - Text View:   Spreadsheet-style list with configurable columns
//  - Frame View:  Thumbnail grid with drag-to-arrange
//  - Script View: Two-pane script + clip association
//  - Sorting:     Single- and multi-column sort
//  - Sifting:     Multi-criteria filtering (AND/OR)
//  - SuperBin:    Tabbed multi-bin container
//  - Bin Views:   Saved column configurations
//  - Bin Ops:     Lock, duplicate, print
//

import { useEditorStore } from '../store/editor.store';
import type { MediaAsset, Bin } from '../store/editor.store';

// ─── Types ──────────────────────────────────────────────────────────────────

export type BinViewMode = 'text' | 'frame' | 'script';

export interface BinColumn {
  id: string;
  name: string;
  field: string;
  width: number;
  visible: boolean;
  sortable: boolean;
  isCustom: boolean;
  type: 'string' | 'number' | 'date' | 'duration' | 'boolean' | 'color';
}

export interface BinSortState {
  columns: { field: string; direction: 'asc' | 'desc' }[];
}

export interface BinSiftCriterion {
  column: string;
  operator:
    | 'contains'
    | 'equals'
    | 'startsWith'
    | 'endsWith'
    | 'greaterThan'
    | 'lessThan'
    | 'between'
    | 'isEmpty'
    | 'isNotEmpty';
  value: string;
  value2?: string;
}

export interface BinSiftState {
  criteria: BinSiftCriterion[];
  mode: 'and' | 'or';
  active: boolean;
}

export interface FrameViewItem {
  assetId: string;
  x: number;
  y: number;
  thumbnailSize: 'small' | 'medium' | 'large';
}

export interface ScriptViewEntry {
  assetId: string;
  scriptText: string;
  pageNumber?: number;
  sceneNumber?: string;
}

export interface BinViewState {
  binId: string;
  viewMode: BinViewMode;
  columns: BinColumn[];
  sort: BinSortState;
  sift: BinSiftState;
  selectedAssetIds: string[];
  frameViewItems: FrameViewItem[];
  scriptEntries: ScriptViewEntry[];
  thumbnailSize: 'small' | 'medium' | 'large';
}

export interface BinView {
  id: string;
  name: string;
  columns: BinColumn[];
  sort: BinSortState;
}

export interface SuperBin {
  id: string;
  name: string;
  binIds: string[];
  activeBinId: string;
}

// ─── Thumbnail Dimensions ────────────────────────────────────────────────

const THUMBNAIL_SIZES: Record<'small' | 'medium' | 'large', { width: number; height: number }> = {
  small:  { width: 80,  height: 60  },
  medium: { width: 120, height: 90  },
  large:  { width: 200, height: 150 },
};

// ─── Default Columns ────────────────────────────────────────────────────

function createDefaultColumns(): BinColumn[] {
  return [
    { id: 'col-name',     name: 'Name',     field: 'name',     width: 220, visible: true,  sortable: true,  isCustom: false, type: 'string'   },
    { id: 'col-duration',  name: 'Duration',  field: 'duration',  width: 100, visible: true,  sortable: true,  isCustom: false, type: 'duration' },
    { id: 'col-video',     name: 'Video',     field: 'video',     width: 100, visible: true,  sortable: true,  isCustom: false, type: 'string'   },
    { id: 'col-audio',     name: 'Audio',     field: 'audio',     width: 100, visible: true,  sortable: true,  isCustom: false, type: 'string'   },
    { id: 'col-startTc',   name: 'Start TC',  field: 'startTc',   width: 110, visible: true,  sortable: true,  isCustom: false, type: 'string'   },
    { id: 'col-endTc',     name: 'End TC',    field: 'endTc',     width: 110, visible: true,  sortable: true,  isCustom: false, type: 'string'   },
    { id: 'col-tracks',    name: 'Tracks',    field: 'tracks',    width: 70,  visible: false, sortable: true,  isCustom: false, type: 'number'   },
    { id: 'col-created',   name: 'Created',   field: 'created',   width: 140, visible: false, sortable: true,  isCustom: false, type: 'date'     },
    { id: 'col-modified',  name: 'Modified',  field: 'modified',  width: 140, visible: true,  sortable: true,  isCustom: false, type: 'date'     },
    { id: 'col-color',     name: 'Color',     field: 'color',     width: 70,  visible: false, sortable: false, isCustom: false, type: 'color'    },
    { id: 'col-markIn',    name: 'Mark IN',   field: 'markIn',    width: 110, visible: false, sortable: true,  isCustom: false, type: 'string'   },
    { id: 'col-markOut',   name: 'Mark OUT',  field: 'markOut',   width: 110, visible: false, sortable: true,  isCustom: false, type: 'string'   },
    { id: 'col-comments',  name: 'Comments',  field: 'comments',  width: 200, visible: false, sortable: true,  isCustom: false, type: 'string'   },
    { id: 'col-tags',      name: 'Tags',      field: 'tags',      width: 160, visible: true,  sortable: true,  isCustom: false, type: 'string'   },
    { id: 'col-favorite',  name: 'Favorite',  field: 'favorite',  width: 70,  visible: true,  sortable: true,  isCustom: false, type: 'boolean'  },
    { id: 'col-status',    name: 'Status',    field: 'status',    width: 100, visible: true,  sortable: true,  isCustom: false, type: 'string'   },
    { id: 'col-type',      name: 'Type',      field: 'type',      width: 80,  visible: true,  sortable: true,  isCustom: false, type: 'string'   },
  ];
}

// ─── ID Generation ──────────────────────────────────────────────────────

let _nextId = 0;
function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${(++_nextId).toString(36)}`;
}

// ─── Helpers ────────────────────────────────────────────────────────────

/** Read-only snapshot of the current editor store state. */
function snap() {
  return useEditorStore.getState();
}

/** Recursively find a bin by ID. */
function findBinById(bins: Bin[], binId: string): Bin | null {
  for (const bin of bins) {
    if (bin.id === binId) return bin;
    if (bin.children.length > 0) {
      const child = findBinById(bin.children, binId);
      if (child) return child;
    }
  }
  return null;
}

/** Resolve the asset value for a given column field. */
function resolveFieldValue(
  asset: MediaAsset,
  field: string,
  customValues: Map<string, Map<string, string>>,
): string | number | boolean | null {
  switch (field) {
    case 'name':      return asset.name;
    case 'duration':  return asset.duration ?? 0;
    case 'video':     return asset.type === 'VIDEO' ? 'V1' : '';
    case 'audio':     return asset.type === 'AUDIO' ? 'A1' : (asset.type === 'VIDEO' ? 'A1' : '');
    case 'startTc':   return '00:00:00:00';
    case 'endTc':     return asset.duration != null ? formatDurationToTc(asset.duration) : '00:00:00:00';
    case 'tracks':    return asset.type === 'VIDEO' ? 2 : 1;
    case 'created':   return '';
    case 'modified':  return '';
    case 'color':     return '';
    case 'markIn':    return '';
    case 'markOut':   return '';
    case 'comments':  return '';
    case 'tags':      return asset.tags.join(', ');
    case 'favorite':  return asset.isFavorite;
    case 'status':    return asset.status;
    case 'type':      return asset.type;
    default: {
      // Check custom column values.
      const assetCustom = customValues.get(asset.id);
      if (assetCustom) {
        return assetCustom.get(field) ?? '';
      }
      return '';
    }
  }
}

/** Convert seconds to a simple timecode string HH:MM:SS:FF (assuming 24fps). */
function formatDurationToTc(seconds: number): string {
  const fps = 24;
  const totalFrames = Math.round(seconds * fps);
  const ff = totalFrames % fps;
  const totalSecs = Math.floor(totalFrames / fps);
  const ss = totalSecs % 60;
  const totalMins = Math.floor(totalSecs / 60);
  const mm = totalMins % 60;
  const hh = Math.floor(totalMins / 60);
  return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}:${pad2(ff)}`;
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/** Compare two values for sorting. */
function compareValues(
  a: string | number | boolean | null,
  b: string | number | boolean | null,
  direction: 'asc' | 'desc',
): number {
  if (a == null && b == null) return 0;
  if (a == null) return direction === 'asc' ? -1 : 1;
  if (b == null) return direction === 'asc' ? 1 : -1;

  let result: number;

  if (typeof a === 'boolean' && typeof b === 'boolean') {
    result = (a === b) ? 0 : (a ? -1 : 1);
  } else if (typeof a === 'number' && typeof b === 'number') {
    result = a - b;
  } else {
    result = String(a).localeCompare(String(b), undefined, { sensitivity: 'base', numeric: true });
  }

  return direction === 'asc' ? result : -result;
}

/** Evaluate a single sift criterion against a field value. */
function matchesCriterion(
  value: string | number | boolean | null,
  criterion: BinSiftCriterion,
): boolean {
  const strVal = value == null ? '' : String(value);
  const numVal = typeof value === 'number' ? value : parseFloat(strVal);

  switch (criterion.operator) {
    case 'contains':
      return strVal.toLowerCase().includes(criterion.value.toLowerCase());
    case 'equals':
      return strVal.toLowerCase() === criterion.value.toLowerCase();
    case 'startsWith':
      return strVal.toLowerCase().startsWith(criterion.value.toLowerCase());
    case 'endsWith':
      return strVal.toLowerCase().endsWith(criterion.value.toLowerCase());
    case 'greaterThan':
      return !isNaN(numVal) && numVal > parseFloat(criterion.value);
    case 'lessThan':
      return !isNaN(numVal) && numVal < parseFloat(criterion.value);
    case 'between': {
      const lo = parseFloat(criterion.value);
      const hi = parseFloat(criterion.value2 ?? criterion.value);
      return !isNaN(numVal) && numVal >= lo && numVal <= hi;
    }
    case 'isEmpty':
      return strVal.trim() === '' || value == null;
    case 'isNotEmpty':
      return strVal.trim() !== '' && value != null;
    default:
      return false;
  }
}

// ─── Engine ─────────────────────────────────────────────────────────────

/**
 * BinViewEngine manages bin display state including Text, Frame, and Script
 * views, multi-column sorting, sifting (filtering), saved bin views,
 * SuperBin (tabbed multi-bin), and bin operations (lock, duplicate, print).
 *
 * State is maintained per-bin (keyed by binId). The engine does not modify
 * the Zustand editor store directly for bin structural changes -- it manages
 * its own overlay state for view configuration, custom column values,
 * selections, and frame positions.
 */
export class BinViewEngine {
  // ─── Internal State ──────────────────────────────────────────────────

  private viewStates: Map<string, BinViewState> = new Map();

  /** Custom column values: assetId -> (columnField -> value). */
  private customColumnValues: Map<string, Map<string, string>> = new Map();

  /** Saved bin views. */
  private savedViews: Map<string, BinView[]> = new Map();

  /** All saved view objects by ID for quick deletion lookup. */
  private allViews: Map<string, BinView> = new Map();

  /** SuperBins. */
  private superBins: Map<string, SuperBin> = new Map();

  /** Locked bins. */
  private lockedBins: Set<string> = new Set();

  /** Subscribers. */
  private listeners: Set<() => void> = new Set();

  // ═══════════════════════════════════════════════════════════════════════
  //  Subscription
  // ═══════════════════════════════════════════════════════════════════════

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private notify(): void {
    for (const cb of this.listeners) {
      try { cb(); } catch { /* swallow listener errors */ }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  View State Init
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Lazily initialize and return the BinViewState for a given bin.
   * If no state exists yet, it is created with default values.
   */
  private ensureState(binId: string): BinViewState {
    let state = this.viewStates.get(binId);
    if (!state) {
      state = {
        binId,
        viewMode: 'text',
        columns: createDefaultColumns(),
        sort: { columns: [] },
        sift: { criteria: [], mode: 'and', active: false },
        selectedAssetIds: [],
        frameViewItems: [],
        scriptEntries: [],
        thumbnailSize: 'medium',
      };
      this.viewStates.set(binId, state);
    }
    return state;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  View Mode
  // ═══════════════════════════════════════════════════════════════════════

  setViewMode(binId: string, mode: BinViewMode): void {
    const state = this.ensureState(binId);
    if (state.viewMode === mode) return;
    state.viewMode = mode;

    // When switching to frame view, initialize items if needed.
    if (mode === 'frame' && state.frameViewItems.length === 0) {
      this.initFrameViewItems(binId);
    }

    // When switching to script view, initialize entries if needed.
    if (mode === 'script' && state.scriptEntries.length === 0) {
      this.initScriptEntries(binId);
    }

    this.notify();
  }

  getViewMode(binId: string): BinViewMode {
    return this.ensureState(binId).viewMode;
  }

  getViewState(binId: string): BinViewState {
    return { ...this.ensureState(binId) };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Columns (Text View)
  // ═══════════════════════════════════════════════════════════════════════

  getColumns(binId: string): BinColumn[] {
    return [...this.ensureState(binId).columns];
  }

  setColumnVisibility(binId: string, columnId: string, visible: boolean): void {
    const state = this.ensureState(binId);
    const col = state.columns.find((c) => c.id === columnId);
    if (!col) return;

    // Name column is always visible.
    if (col.field === 'name' && !visible) return;

    col.visible = visible;
    this.notify();
  }

  setColumnWidth(binId: string, columnId: string, width: number): void {
    const state = this.ensureState(binId);
    const col = state.columns.find((c) => c.id === columnId);
    if (!col) return;

    col.width = Math.max(30, Math.min(width, 800));
    this.notify();
  }

  reorderColumns(binId: string, newOrder: string[]): void {
    const state = this.ensureState(binId);
    const colMap = new Map(state.columns.map((c) => [c.id, c]));
    const reordered: BinColumn[] = [];

    // Name column always remains first.
    const nameCol = state.columns.find((c) => c.field === 'name');
    if (nameCol) {
      reordered.push(nameCol);
    }

    for (const id of newOrder) {
      if (id === nameCol?.id) continue; // already added
      const col = colMap.get(id);
      if (col) reordered.push(col);
    }

    // Append any remaining columns not in newOrder (defensive).
    for (const col of state.columns) {
      if (!reordered.includes(col)) {
        reordered.push(col);
      }
    }

    state.columns = reordered;
    this.notify();
  }

  addCustomColumn(binId: string, name: string, type: BinColumn['type']): BinColumn {
    const state = this.ensureState(binId);
    const field = `custom_${uid('f')}`;
    const col: BinColumn = {
      id: uid('col'),
      name,
      field,
      width: 120,
      visible: true,
      sortable: true,
      isCustom: true,
      type,
    };
    state.columns.push(col);
    this.notify();
    return { ...col };
  }

  removeCustomColumn(binId: string, columnId: string): void {
    const state = this.ensureState(binId);
    const idx = state.columns.findIndex((c) => c.id === columnId && c.isCustom);
    if (idx === -1) return;

    const col = state.columns[idx];
    state.columns.splice(idx, 1);

    // Remove sort references.
    state.sort.columns = state.sort.columns.filter((s) => s.field !== col!.field!);

    // Remove sift references.
    state.sift.criteria = state.sift.criteria.filter((s) => s.column !== col!.field!);
    if (state.sift.criteria.length === 0) {
      state.sift.active = false;
    }

    // Remove custom column values for this field.
    for (const [, assetMap] of this.customColumnValues) {
      assetMap.delete(col!.field!);
    }

    this.notify();
  }

  setCustomColumnValue(binId: string, assetId: string, columnId: string, value: string): void {
    const state = this.ensureState(binId);
    const col = state.columns.find((c) => c.id === columnId && c.isCustom);
    if (!col) return;

    let assetMap = this.customColumnValues.get(assetId);
    if (!assetMap) {
      assetMap = new Map();
      this.customColumnValues.set(assetId, assetMap);
    }
    assetMap.set(col.field, value);
    this.notify();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Sorting
  // ═══════════════════════════════════════════════════════════════════════

  sortByColumn(binId: string, field: string, direction?: 'asc' | 'desc'): void {
    const state = this.ensureState(binId);
    const col = state.columns.find((c) => c.field === field);
    if (!col || !col.sortable) return;

    // Determine direction: if already sorting by this field, toggle.
    let dir = direction;
    if (!dir) {
      const existing = state.sort.columns.find((s) => s.field === field);
      dir = existing?.direction === 'asc' ? 'desc' : 'asc';
    }

    // Replace all sort columns with this single one.
    state.sort.columns = [{ field, direction: dir }];
    this.notify();
  }

  addSortColumn(binId: string, field: string, direction?: 'asc' | 'desc'): void {
    const state = this.ensureState(binId);
    const col = state.columns.find((c) => c.field === field);
    if (!col || !col.sortable) return;

    const dir = direction ?? 'asc';

    // If already present, update direction; otherwise add.
    const existing = state.sort.columns.find((s) => s.field === field);
    if (existing) {
      existing.direction = dir;
    } else {
      state.sort.columns.push({ field, direction: dir });
    }

    this.notify();
  }

  clearSort(binId: string): void {
    const state = this.ensureState(binId);
    if (state.sort.columns.length === 0) return;
    state.sort.columns = [];
    this.notify();
  }

  getSortState(binId: string): BinSortState {
    return { ...this.ensureState(binId).sort, columns: [...this.ensureState(binId).sort.columns] };
  }

  getAssetsSorted(binId: string): MediaAsset[] {
    const state = this.ensureState(binId);
    const assets = this.getBinAssets(binId);

    if (state.sort.columns.length === 0) return assets;

    return [...assets].sort((a, b) => {
      for (const sortCol of state.sort.columns) {
        const valA = resolveFieldValue(a, sortCol.field, this.customColumnValues);
        const valB = resolveFieldValue(b, sortCol.field, this.customColumnValues);
        const cmp = compareValues(valA, valB, sortCol.direction);
        if (cmp !== 0) return cmp;
      }
      return 0;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Sifting (Filtering)
  // ═══════════════════════════════════════════════════════════════════════

  setSift(binId: string, criteria: BinSiftCriterion[], mode: 'and' | 'or'): void {
    const state = this.ensureState(binId);
    state.sift.criteria = [...criteria];
    state.sift.mode = mode;
    state.sift.active = criteria.length > 0;
    this.notify();
  }

  addSiftCriterion(binId: string, criterion: BinSiftCriterion): void {
    const state = this.ensureState(binId);
    state.sift.criteria.push({ ...criterion });
    state.sift.active = true;
    this.notify();
  }

  removeSiftCriterion(binId: string, index: number): void {
    const state = this.ensureState(binId);
    if (index < 0 || index >= state.sift.criteria.length) return;
    state.sift.criteria.splice(index, 1);
    if (state.sift.criteria.length === 0) {
      state.sift.active = false;
    }
    this.notify();
  }

  clearSift(binId: string): void {
    const state = this.ensureState(binId);
    if (!state.sift.active && state.sift.criteria.length === 0) return;
    state.sift.criteria = [];
    state.sift.active = false;
    this.notify();
  }

  isSifted(binId: string): boolean {
    return this.ensureState(binId).sift.active;
  }

  getSiftState(binId: string): BinSiftState {
    const s = this.ensureState(binId).sift;
    return { criteria: [...s.criteria], mode: s.mode, active: s.active };
  }

  getAssetsSifted(binId: string): MediaAsset[] {
    const state = this.ensureState(binId);
    const assets = this.getBinAssets(binId);

    if (!state.sift.active || state.sift.criteria.length === 0) return assets;

    return assets.filter((asset) => {
      const results = state.sift.criteria.map((criterion) => {
        const val = resolveFieldValue(asset, criterion.column, this.customColumnValues);
        return matchesCriterion(val, criterion);
      });

      return state.sift.mode === 'and'
        ? results.every(Boolean)
        : results.some(Boolean);
    });
  }

  getAssetsFiltered(binId: string): MediaAsset[] {
    const state = this.ensureState(binId);
    let assets = this.getBinAssets(binId);

    // Apply sift first.
    if (state.sift.active && state.sift.criteria.length > 0) {
      assets = assets.filter((asset) => {
        const results = state.sift.criteria.map((criterion) => {
          const val = resolveFieldValue(asset, criterion.column, this.customColumnValues);
          return matchesCriterion(val, criterion);
        });
        return state.sift.mode === 'and'
          ? results.every(Boolean)
          : results.some(Boolean);
      });
    }

    // Apply sort.
    if (state.sort.columns.length > 0) {
      assets = [...assets].sort((a, b) => {
        for (const sortCol of state.sort.columns) {
          const valA = resolveFieldValue(a, sortCol.field, this.customColumnValues);
          const valB = resolveFieldValue(b, sortCol.field, this.customColumnValues);
          const cmp = compareValues(valA, valB, sortCol.direction);
          if (cmp !== 0) return cmp;
        }
        return 0;
      });
    }

    return assets;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Frame View
  // ═══════════════════════════════════════════════════════════════════════

  setFrameViewItemPosition(binId: string, assetId: string, x: number, y: number): void {
    const state = this.ensureState(binId);
    const item = state.frameViewItems.find((i) => i.assetId === assetId);
    if (item) {
      item.x = x;
      item.y = y;
    } else {
      state.frameViewItems.push({
        assetId,
        x,
        y,
        thumbnailSize: state.thumbnailSize,
      });
    }
    this.notify();
  }

  setThumbnailSize(binId: string, size: 'small' | 'medium' | 'large'): void {
    const state = this.ensureState(binId);
    if (state.thumbnailSize === size) return;
    state.thumbnailSize = size;

    // Update all existing frame view items.
    for (const item of state.frameViewItems) {
      item.thumbnailSize = size;
    }

    this.notify();
  }

  /** Auto-arrange frame view items in a grid (Cmd+T). */
  tidyFrameView(binId: string): void {
    const state = this.ensureState(binId);
    const dim = THUMBNAIL_SIZES[state.thumbnailSize];
    const padding = 16;
    const itemWidth = dim.width + padding;
    const itemHeight = dim.height + padding + 24; // 24px for label
    const cols = Math.max(1, Math.floor(800 / itemWidth)); // assume 800px container width

    state.frameViewItems.forEach((item, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      item.x = col * itemWidth + padding;
      item.y = row * itemHeight + padding;
    });

    this.notify();
  }

  /** Enlarge thumbnails (Cmd+L). */
  enlargeFrameView(binId: string): void {
    const state = this.ensureState(binId);
    if (state.thumbnailSize === 'small') {
      this.setThumbnailSize(binId, 'medium');
    } else if (state.thumbnailSize === 'medium') {
      this.setThumbnailSize(binId, 'large');
    }
    // Already large -- no-op.
  }

  /** Reduce thumbnails (Cmd+K). */
  reduceFrameView(binId: string): void {
    const state = this.ensureState(binId);
    if (state.thumbnailSize === 'large') {
      this.setThumbnailSize(binId, 'medium');
    } else if (state.thumbnailSize === 'medium') {
      this.setThumbnailSize(binId, 'small');
    }
    // Already small -- no-op.
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Script View
  // ═══════════════════════════════════════════════════════════════════════

  setScriptText(binId: string, assetId: string, text: string): void {
    const state = this.ensureState(binId);
    const entry = state.scriptEntries.find((e) => e.assetId === assetId);
    if (entry) {
      entry.scriptText = text;
    } else {
      state.scriptEntries.push({ assetId, scriptText: text });
    }
    this.notify();
  }

  setScriptPageNumber(binId: string, assetId: string, page: number): void {
    const state = this.ensureState(binId);
    const entry = state.scriptEntries.find((e) => e.assetId === assetId);
    if (entry) {
      entry.pageNumber = page;
    } else {
      state.scriptEntries.push({ assetId, scriptText: '', pageNumber: page });
    }
    this.notify();
  }

  setScriptSceneNumber(binId: string, assetId: string, scene: string): void {
    const state = this.ensureState(binId);
    const entry = state.scriptEntries.find((e) => e.assetId === assetId);
    if (entry) {
      entry.sceneNumber = scene;
    } else {
      state.scriptEntries.push({ assetId, scriptText: '', sceneNumber: scene });
    }
    this.notify();
  }

  getScriptEntries(binId: string): ScriptViewEntry[] {
    return [...this.ensureState(binId).scriptEntries];
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Bin Views (Saved Column Configs)
  // ═══════════════════════════════════════════════════════════════════════

  saveBinView(binId: string, name: string): BinView {
    const state = this.ensureState(binId);
    const view: BinView = {
      id: uid('bv'),
      name,
      columns: state.columns.map((c) => ({ ...c })),
      sort: { columns: state.sort.columns.map((s) => ({ ...s })) },
    };

    let views = this.savedViews.get(binId);
    if (!views) {
      views = [];
      this.savedViews.set(binId, views);
    }
    views.push(view);
    this.allViews.set(view.id, view);

    this.notify();
    return { ...view };
  }

  loadBinView(binId: string, viewId: string): void {
    const view = this.allViews.get(viewId);
    if (!view) return;

    const state = this.ensureState(binId);
    state.columns = view.columns.map((c) => ({ ...c }));
    state.sort = { columns: view.sort.columns.map((s) => ({ ...s })) };
    this.notify();
  }

  getBinViews(binId: string): BinView[] {
    return (this.savedViews.get(binId) ?? []).map((v) => ({ ...v }));
  }

  deleteBinView(viewId: string): void {
    const view = this.allViews.get(viewId);
    if (!view) return;

    this.allViews.delete(viewId);

    // Remove from per-bin list.
    for (const [, views] of this.savedViews) {
      const idx = views.findIndex((v) => v.id === viewId);
      if (idx !== -1) {
        views.splice(idx, 1);
        break;
      }
    }

    this.notify();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  SuperBin
  // ═══════════════════════════════════════════════════════════════════════

  createSuperBin(binIds: string[], name?: string): SuperBin {
    if (binIds.length === 0) {
      throw new Error('SuperBin requires at least one bin.');
    }

    const id = uid('sb');
    const sb: SuperBin = {
      id,
      name: name ?? `SuperBin ${this.superBins.size + 1}`,
      binIds: [...binIds],
      activeBinId: binIds[0]!,
    };

    this.superBins.set(id, sb);
    this.notify();
    return { ...sb };
  }

  addBinToSuperBin(superBinId: string, binId: string): void {
    const sb = this.superBins.get(superBinId);
    if (!sb) return;
    if (sb.binIds.includes(binId)) return;

    sb.binIds.push(binId);
    this.notify();
  }

  removeBinFromSuperBin(superBinId: string, binId: string): void {
    const sb = this.superBins.get(superBinId);
    if (!sb) return;

    const idx = sb.binIds.indexOf(binId);
    if (idx === -1) return;

    sb.binIds.splice(idx, 1);

    // If the removed bin was the active tab, switch to first remaining.
    if (sb.activeBinId === binId) {
      sb.activeBinId = sb.binIds[0] ?? '';
    }

    // If the super bin is now empty, remove it entirely.
    if (sb.binIds.length === 0) {
      this.superBins.delete(superBinId);
    }

    this.notify();
  }

  getSuperBins(): SuperBin[] {
    return Array.from(this.superBins.values()).map((sb) => ({ ...sb }));
  }

  deleteSuperBin(id: string): void {
    if (!this.superBins.has(id)) return;
    this.superBins.delete(id);
    this.notify();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Selection
  // ═══════════════════════════════════════════════════════════════════════

  selectAsset(binId: string, assetId: string, multi?: boolean): void {
    const state = this.ensureState(binId);

    if (multi) {
      // Toggle: if already selected, deselect; otherwise add.
      const idx = state.selectedAssetIds.indexOf(assetId);
      if (idx !== -1) {
        state.selectedAssetIds.splice(idx, 1);
      } else {
        state.selectedAssetIds.push(assetId);
      }
    } else {
      state.selectedAssetIds = [assetId];
    }

    this.notify();
  }

  selectAll(binId: string): void {
    const state = this.ensureState(binId);
    const assets = this.getBinAssets(binId);
    state.selectedAssetIds = assets.map((a) => a.id);
    this.notify();
  }

  clearSelection(binId: string): void {
    const state = this.ensureState(binId);
    if (state.selectedAssetIds.length === 0) return;
    state.selectedAssetIds = [];
    this.notify();
  }

  getSelectedAssets(binId: string): string[] {
    return [...this.ensureState(binId).selectedAssetIds];
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Bin Operations
  // ═══════════════════════════════════════════════════════════════════════

  duplicateBin(binId: string): string {
    const bin = this.findBin(binId);
    if (!bin) throw new Error(`Bin not found: ${binId}`);

    const newBinId = uid('bin');
    const newName = `${bin.name} Copy`;

    // Add the duplicated bin to the store.
    const state = snap();
    state.addBin(newName, bin.parentId);

    // Copy view state.
    const origState = this.viewStates.get(binId);
    if (origState) {
      const newState: BinViewState = {
        ...origState,
        binId: newBinId,
        columns: origState.columns.map((c) => ({ ...c })),
        sort: { columns: origState.sort.columns.map((s) => ({ ...s })) },
        sift: {
          criteria: origState.sift.criteria.map((c) => ({ ...c })),
          mode: origState.sift.mode,
          active: origState.sift.active,
        },
        selectedAssetIds: [],
        frameViewItems: origState.frameViewItems.map((i) => ({ ...i })),
        scriptEntries: origState.scriptEntries.map((e) => ({ ...e })),
      };
      this.viewStates.set(newBinId, newState);
    }

    this.notify();
    return newBinId;
  }

  lockBin(binId: string): void {
    if (this.lockedBins.has(binId)) return;
    this.lockedBins.add(binId);
    this.notify();
  }

  unlockBin(binId: string): void {
    if (!this.lockedBins.has(binId)) return;
    this.lockedBins.delete(binId);
    this.notify();
  }

  isBinLocked(binId: string): boolean {
    return this.lockedBins.has(binId);
  }

  /**
   * Generate a printable text representation of the bin in its current
   * Text View configuration. Respects column visibility, order, and
   * current sort/sift state.
   */
  printBin(binId: string): string {
    const state = this.ensureState(binId);
    const bin = this.findBin(binId);
    const binName = bin?.name ?? 'Unknown Bin';
    const assets = this.getAssetsFiltered(binId);

    const visibleColumns = state.columns.filter((c) => c.visible);

    const lines: string[] = [];
    lines.push(`═══ ${binName} ═══`);
    lines.push(`View: ${state.viewMode} | Items: ${assets.length}`);
    if (state.sift.active) {
      lines.push(`Sift: ${state.sift.criteria.length} criteria (${state.sift.mode.toUpperCase()})`);
    }
    if (state.sort.columns.length > 0) {
      const sortDesc = state.sort.columns.map((s) => `${s.field} ${s.direction}`).join(', ');
      lines.push(`Sort: ${sortDesc}`);
    }
    lines.push('');

    // Header row.
    const header = visibleColumns.map((c) => c.name.padEnd(Math.min(c.width / 6, 30))).join(' | ');
    lines.push(header);
    lines.push('─'.repeat(header.length));

    // Data rows.
    for (const asset of assets) {
      const row = visibleColumns.map((col) => {
        const val = resolveFieldValue(asset, col.field, this.customColumnValues);
        const strVal = val == null ? '' : String(val);
        return strVal.padEnd(Math.min(col.width / 6, 30));
      }).join(' | ');
      lines.push(row);
    }

    lines.push('');
    lines.push(`Printed: ${new Date().toISOString()}`);

    return lines.join('\n');
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Internal Helpers
  // ═══════════════════════════════════════════════════════════════════════

  /** Get assets for a bin from the editor store. */
  private getBinAssets(binId: string): MediaAsset[] {
    const bin = this.findBin(binId);
    return bin?.assets ?? [];
  }

  /** Find a bin by ID in the editor store. */
  private findBin(binId: string): Bin | null {
    return findBinById(snap().bins, binId);
  }

  /** Initialize frame view items for a bin. */
  private initFrameViewItems(binId: string): void {
    const state = this.ensureState(binId);
    const assets = this.getBinAssets(binId);
    const dim = THUMBNAIL_SIZES[state.thumbnailSize];
    const padding = 16;
    const itemWidth = dim.width + padding;
    const itemHeight = dim.height + padding + 24;
    const cols = Math.max(1, Math.floor(800 / itemWidth));

    state.frameViewItems = assets.map((asset, idx) => ({
      assetId: asset.id,
      x: (idx % cols) * itemWidth + padding,
      y: Math.floor(idx / cols) * itemHeight + padding,
      thumbnailSize: state.thumbnailSize,
    }));
  }

  /** Initialize script view entries for a bin. */
  private initScriptEntries(binId: string): void {
    const state = this.ensureState(binId);
    const assets = this.getBinAssets(binId);

    // Preserve existing entries, add new ones for any missing assets.
    const existingIds = new Set(state.scriptEntries.map((e) => e.assetId));

    for (const asset of assets) {
      if (!existingIds.has(asset.id)) {
        state.scriptEntries.push({
          assetId: asset.id,
          scriptText: '',
        });
      }
    }
  }
}

/** Singleton BinViewEngine instance. */
export const binViewEngine = new BinViewEngine();
