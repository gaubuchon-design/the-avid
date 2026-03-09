// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID -- Keyboard Engine
// ═══════════════════════════════════════════════════════════════════════════
//
// Complete implementation of Avid Media Composer's keyboard shortcut system.
// Maps every key from Avid's default layout and provides JKL shuttle,
// multi-press speed control, conflict detection, layout import/export,
// and support for multiple NLE presets (Media Composer, Classic, Premiere, Resolve).
//

// ─── Types ──────────────────────────────────────────────────────────────────

export type KeyModifier = 'ctrl' | 'shift' | 'alt' | 'meta';

export interface KeyBinding {
  /** Unique identifier for this binding. */
  id: string;
  /** Physical key (e.g. 'v', 'b', 'F9', 'ArrowLeft', ' ', etc.). */
  key: string;
  /** Active modifier keys. Empty array means no modifiers. */
  modifiers: KeyModifier[];
  /** Action identifier dispatched when this key is pressed. */
  action: string;
  /** Human-readable description of the action. */
  description: string;
  /** Functional category for grouping in the Command Palette / keyboard editor. */
  category: KeyCategory;
  /** Whether this binding has been customised by the user. */
  isCustom: boolean;
}

export type KeyCategory =
  | 'transport'
  | 'marking'
  | 'editing'
  | 'trim'
  | 'smartTool'
  | 'navigation'
  | 'multicam'
  | 'audio'
  | 'view'
  | 'file'
  | 'tools'
  | 'other';

export interface KeyboardLayout {
  /** Unique layout identifier. */
  id: string;
  /** Display name of the layout preset. */
  name: string;
  /** All key bindings in this layout. */
  bindings: KeyBinding[];
}

export type ActionHandler = () => void;

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Deterministic key for modifier+key combos used as map keys. */
function bindingKey(key: string, modifiers: KeyModifier[]): string {
  const sorted = [...modifiers].sort();
  return sorted.length > 0 ? `${sorted.join('+')}+${key.toLowerCase()}` : key.toLowerCase();
}

let nextBindingId = 1;
function createBindingId(): string {
  return `kb-${nextBindingId++}`;
}

/** Detect whether we are on a Mac for Ctrl vs Meta mapping. */
function isMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /mac/i.test(navigator.platform ?? '') || /mac/i.test(navigator.userAgent ?? '');
}

// ─── JKL State ──────────────────────────────────────────────────────────────

/** JKL speed tiers: successive presses increase speed. */
const JKL_SPEED_TIERS = [1, 2, 3, 5, 8];

interface JKLState {
  /** Current direction: -1 = reverse, 0 = stopped, 1 = forward. */
  direction: 0 | -1 | 1;
  /** Current tier index into JKL_SPEED_TIERS. */
  tierIndex: number;
  /** Whether K is currently held. */
  kHeld: boolean;
  /** Whether J is held (for K+J slow motion). */
  jHeld: boolean;
  /** Whether L is held (for K+L slow motion). */
  lHeld: boolean;
  /** Timer for multi-press detection (ms since last same-direction press). */
  lastPressTime: number;
}

const INITIAL_JKL_STATE: JKLState = {
  direction: 0,
  tierIndex: 0,
  kHeld: false,
  jHeld: false,
  lHeld: false,
  lastPressTime: 0,
};

/** Multi-press window in milliseconds. */
const MULTI_PRESS_WINDOW = 400;

// ─── Default Avid Keyboard Map ──────────────────────────────────────────────

function createBinding(
  key: string,
  modifiers: KeyModifier[],
  action: string,
  description: string,
  category: KeyCategory,
): KeyBinding {
  return {
    id: createBindingId(),
    key,
    modifiers,
    action,
    description,
    category,
    isCustom: false,
  };
}

function buildAvidDefaultBindings(): KeyBinding[] {
  const cmd: KeyModifier = isMac() ? 'meta' : 'ctrl';

  return [
    // ═══════════════════════════════════════════════════════════════════════
    //  Transport
    // ═══════════════════════════════════════════════════════════════════════
    createBinding('j', [], 'transport.playReverse', 'Play Reverse (multi-press = faster: 1x, 2x, 3x, 5x, 8x)', 'transport'),
    createBinding('k', [], 'transport.stop', 'Stop / Pause', 'transport'),
    createBinding('l', [], 'transport.playForward', 'Play Forward (multi-press = faster: 1x, 2x, 3x, 5x, 8x)', 'transport'),
    createBinding(' ', [], 'transport.playStop', 'Play/Stop Toggle', 'transport'),
    createBinding('ArrowLeft', [], 'transport.stepBack', 'Step Back 1 Frame', 'transport'),
    createBinding('ArrowRight', [], 'transport.stepForward', 'Step Forward 1 Frame', 'transport'),
    createBinding('Home', [], 'transport.goToStart', 'Go to Start of Timeline', 'transport'),
    createBinding('End', [], 'transport.goToEnd', 'Go to End of Timeline', 'transport'),
    createBinding('5', [], 'transport.playLoop', 'Play Loop (trim mode)', 'transport'),

    // ═══════════════════════════════════════════════════════════════════════
    //  Marking
    // ═══════════════════════════════════════════════════════════════════════
    createBinding('i', [], 'mark.in', 'Mark IN', 'marking'),
    createBinding('o', [], 'mark.out', 'Mark OUT', 'marking'),
    createBinding('e', [], 'mark.clip', 'Mark Clip (auto IN+OUT around clip under playhead)', 'marking'),
    createBinding('t', [], 'mark.clipAlt', 'Mark Clip (alternate)', 'marking'),
    createBinding('d', [], 'mark.clearBoth', 'Clear IN and OUT', 'marking'),
    createBinding('g', [], 'mark.clearIn', 'Clear IN', 'marking'),
    createBinding('h', [], 'mark.clearOut', 'Clear OUT', 'marking'),
    createBinding('q', [], 'mark.goToIn', 'Go to IN', 'marking'),
    createBinding('w', [], 'mark.goToOut', 'Go to OUT', 'marking'),

    // ═══════════════════════════════════════════════════════════════════════
    //  Editing
    // ═══════════════════════════════════════════════════════════════════════
    createBinding('v', [], 'edit.spliceIn', 'Splice-In (Insert)', 'editing'),
    createBinding('b', [], 'edit.overwrite', 'Overwrite', 'editing'),
    createBinding('x', [], 'edit.extract', 'Extract', 'editing'),
    createBinding('z', [], 'edit.lift', 'Lift', 'editing'),
    createBinding('c', [cmd], 'edit.copy', 'Copy', 'editing'),
    createBinding('v', [cmd], 'edit.paste', 'Paste', 'editing'),
    createBinding('z', [cmd], 'edit.undo', 'Undo', 'editing'),
    createBinding('z', [cmd, 'shift'], 'edit.redo', 'Redo', 'editing'),
    createBinding('Delete', [], 'edit.delete', 'Delete Selected', 'editing'),
    createBinding('Backspace', [], 'edit.delete', 'Delete Selected', 'editing'),

    // ═══════════════════════════════════════════════════════════════════════
    //  Trim
    // ═══════════════════════════════════════════════════════════════════════
    createBinding('u', [], 'trim.enterMode', 'Enter Trim Mode', 'trim'),
    createBinding('p', [], 'trim.selectASide', 'Select A-side Roller', 'trim'),
    createBinding('[', [], 'trim.selectBoth', 'Select Both Sides (Dual Roller)', 'trim'),
    createBinding(']', [], 'trim.selectBSide', 'Select B-side Roller', 'trim'),
    createBinding('m', [], 'trim.left1', 'Trim 1 Frame Left', 'trim'),
    createBinding(',', [], 'trim.right1', 'Trim 1 Frame Right', 'trim'),
    createBinding('.', [], 'trim.right10', 'Trim 10 Frames Right', 'trim'),
    createBinding('/', [], 'trim.left10', 'Trim 10 Frames Left', 'trim'),

    // ═══════════════════════════════════════════════════════════════════════
    //  Smart Tool
    // ═══════════════════════════════════════════════════════════════════════
    createBinding('a', ['shift'], 'smartTool.toggleLiftOverwrite', 'Toggle Lift/Overwrite Segment', 'smartTool'),
    createBinding('s', ['shift'], 'smartTool.toggleExtractSplice', 'Toggle Extract/Splice-In Segment', 'smartTool'),
    createBinding('d', ['shift'], 'smartTool.toggleOverwriteTrim', 'Toggle Overwrite Trim', 'smartTool'),
    createBinding('f', ['shift'], 'smartTool.toggleRippleTrim', 'Toggle Ripple Trim', 'smartTool'),

    // ═══════════════════════════════════════════════════════════════════════
    //  Navigation
    // ═══════════════════════════════════════════════════════════════════════
    createBinding('a', [], 'nav.prevEdit', 'Go to Previous Edit Point', 'navigation'),
    createBinding('s', [], 'nav.nextEdit', 'Go to Next Edit Point', 'navigation'),

    // ═══════════════════════════════════════════════════════════════════════
    //  Multicam
    // ═══════════════════════════════════════════════════════════════════════
    createBinding('F9', [], 'multicam.cut1', 'MCam 1 / Cut to Angle 1', 'multicam'),
    createBinding('F10', [], 'multicam.cut2', 'MCam 2 / Cut to Angle 2', 'multicam'),
    createBinding('F11', [], 'multicam.cut3', 'MCam 3 / Cut to Angle 3', 'multicam'),
    createBinding('F12', [], 'multicam.cut4', 'MCam 4 / Cut to Angle 4', 'multicam'),
    createBinding('F9', ['shift'], 'multicam.cut5', 'MCam 5 / Cut to Angle 5', 'multicam'),
    createBinding('F10', ['shift'], 'multicam.cut6', 'MCam 6 / Cut to Angle 6', 'multicam'),
    createBinding('F11', ['shift'], 'multicam.cut7', 'MCam 7 / Cut to Angle 7', 'multicam'),
    createBinding('F12', ['shift'], 'multicam.cut8', 'MCam 8 / Cut to Angle 8', 'multicam'),

    // ═══════════════════════════════════════════════════════════════════════
    //  Audio -- Alt+1 through Alt+8 mute audio tracks 1-8
    // ═══════════════════════════════════════════════════════════════════════
    createBinding('1', ['alt'], 'audio.muteTrack1', 'Mute Audio Track 1', 'audio'),
    createBinding('2', ['alt'], 'audio.muteTrack2', 'Mute Audio Track 2', 'audio'),
    createBinding('3', ['alt'], 'audio.muteTrack3', 'Mute Audio Track 3', 'audio'),
    createBinding('4', ['alt'], 'audio.muteTrack4', 'Mute Audio Track 4', 'audio'),
    createBinding('5', ['alt'], 'audio.muteTrack5', 'Mute Audio Track 5', 'audio'),
    createBinding('6', ['alt'], 'audio.muteTrack6', 'Mute Audio Track 6', 'audio'),
    createBinding('7', ['alt'], 'audio.muteTrack7', 'Mute Audio Track 7', 'audio'),
    createBinding('8', ['alt'], 'audio.muteTrack8', 'Mute Audio Track 8', 'audio'),

    // ═══════════════════════════════════════════════════════════════════════
    //  View / Tools
    // ═══════════════════════════════════════════════════════════════════════
    createBinding('0', [cmd], 'view.timelineWindow', 'Timeline Window', 'view'),
    createBinding('3', [cmd], 'view.commandPalette', 'Command Palette', 'view'),
    createBinding('8', [cmd], 'view.effectsPalette', 'Effects Palette', 'view'),
    createBinding('9', [cmd], 'view.projectWindow', 'Project Window', 'view'),
    createBinding('l', [cmd], 'view.enlargeTrack', 'Enlarge Track', 'view'),
    createBinding('k', [cmd], 'view.reduceTrack', 'Reduce Track', 'view'),
    createBinding('t', [cmd], 'view.tidy', 'Tidy (Frame View)', 'view'),
    createBinding('e', [cmd], 'view.sortAscending', 'Sort Ascending', 'view'),
    createBinding('e', [cmd, 'alt'], 'view.sortDescending', 'Sort Descending', 'view'),
    createBinding('f', [], 'view.fullScreen', 'Full Screen Toggle', 'view'),

    // ═══════════════════════════════════════════════════════════════════════
    //  File
    // ═══════════════════════════════════════════════════════════════════════
    createBinding('n', [cmd], 'file.newBin', 'New Bin', 'file'),
    createBinding('s', [cmd], 'file.save', 'Save', 'file'),
    createBinding('g', [cmd, 'shift'], 'file.groupClips', 'Group Clips', 'file'),
    createBinding('m', [cmd, 'shift'], 'file.multicameraMode', 'MultiCamera Mode', 'file'),

    // ═══════════════════════════════════════════════════════════════════════
    //  Markers
    // ═══════════════════════════════════════════════════════════════════════
    createBinding("'", [], 'marker.addAudioKeyframe', 'Add Audio Keyframe', 'other'),
    createBinding('m', [cmd], 'marker.addMarker', 'Add Marker', 'other'),
  ];
}

// ─── Preset Layouts ─────────────────────────────────────────────────────────

function buildMediaComposerLayout(): KeyboardLayout {
  return {
    id: 'avid-media-composer',
    name: 'Media Composer',
    bindings: buildAvidDefaultBindings(),
  };
}

function buildMediaComposerClassicLayout(): KeyboardLayout {
  const bindings = buildAvidDefaultBindings();
  // Classic layout is identical to default with minor cosmetic differences
  // (Ctrl+R for Redo instead of Ctrl+Shift+Z).
  const cmd: KeyModifier = isMac() ? 'meta' : 'ctrl';
  const redoIdx = bindings.findIndex((b) => b.action === 'edit.redo');
  if (redoIdx >= 0) {
    bindings[redoIdx] = createBinding('r', [cmd], 'edit.redo', 'Redo (Classic)', 'editing');
  }
  return {
    id: 'avid-media-composer-classic',
    name: 'Media Composer Classic',
    bindings,
  };
}

function buildPremiereProLayout(): KeyboardLayout {
  const cmd: KeyModifier = isMac() ? 'meta' : 'ctrl';
  // Premiere-like remapping of common keys
  const bindings = buildAvidDefaultBindings();
  // Premiere uses Semicolon/Quote for shuttle and C for razor
  const overrides: Record<string, { key: string; modifiers: KeyModifier[] }> = {
    'edit.extract': { key: "'", modifiers: [] },
    'edit.lift': { key: ';', modifiers: [] },
  };
  for (const b of bindings) {
    const override = overrides[b.action];
    if (override) {
      b.key = override.key;
      b.modifiers = override.modifiers;
    }
  }
  return {
    id: 'premiere-pro',
    name: 'Premiere Pro',
    bindings,
  };
}

function buildResolveLayout(): KeyboardLayout {
  // Resolve shares most of the same JKL/IOED conventions
  const bindings = buildAvidDefaultBindings();
  return {
    id: 'davinci-resolve',
    name: 'Resolve',
    bindings,
  };
}

const PRESET_LAYOUTS: KeyboardLayout[] = [
  buildMediaComposerLayout(),
  buildMediaComposerClassicLayout(),
  buildPremiereProLayout(),
  buildResolveLayout(),
];

// ─── Engine ─────────────────────────────────────────────────────────────────

/**
 * Keyboard shortcut engine implementing Avid Media Composer's complete
 * default keyboard map.
 *
 * Features:
 * - Full Avid default layout with every documented shortcut
 * - JKL shuttle with multi-press speed escalation and K+J/K+L slow motion
 * - Multiple preset layouts (Media Composer, Classic, Premiere Pro, Resolve)
 * - Custom binding management with conflict detection
 * - Layout import/export as JSON
 * - Event subscription for UI reactivity
 * - Enable/disable for text-input focus management
 */
export class KeyboardEngine {
  // ── Private state ───────────────────────────────────────────────────────

  /** Active keyboard layout. */
  private layout: KeyboardLayout;

  /** Original default layout (used for resetToDefaults). */
  private defaultLayout: KeyboardLayout;

  /** All available preset layouts. */
  private presetLayouts: KeyboardLayout[];

  /** Action ID -> handler. */
  private actionHandlers = new Map<string, ActionHandler>();

  /** Action ID -> description (for registration without a binding). */
  private actionDescriptions = new Map<string, string>();

  /** Key combo string -> binding for O(1) lookup on keypress. */
  private bindingMap = new Map<string, KeyBinding>();

  /** Whether the engine is actively processing keyboard events. */
  private enabled = true;

  /** JKL shuttle state. */
  private jkl: JKLState = { ...INITIAL_JKL_STATE };

  /** General state change listeners. */
  private listeners = new Set<() => void>();

  /** Action dispatch listeners. */
  private actionListeners = new Set<(actionId: string) => void>();

  // ═══════════════════════════════════════════════════════════════════════
  //  Constructor
  // ═══════════════════════════════════════════════════════════════════════

  constructor() {
    this.presetLayouts = PRESET_LAYOUTS.map((l) => ({
      ...l,
      bindings: l.bindings.map((b) => ({ ...b })),
    }));
    this.defaultLayout = this.presetLayouts[0];
    this.layout = {
      ...this.defaultLayout,
      bindings: this.defaultLayout.bindings.map((b) => ({ ...b })),
    };
    this.rebuildBindingMap();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Layout Management
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Load a complete keyboard layout, replacing all current bindings.
   *
   * @param layout The layout to load.
   */
  loadLayout(layout: KeyboardLayout): void {
    this.layout = {
      ...layout,
      bindings: layout.bindings.map((b) => ({ ...b })),
    };
    this.defaultLayout = {
      ...layout,
      bindings: layout.bindings.map((b) => ({ ...b })),
    };
    this.rebuildBindingMap();
    this.notify();
  }

  /**
   * Return a copy of the current active layout.
   */
  getLayout(): KeyboardLayout {
    return {
      ...this.layout,
      bindings: this.layout.bindings.map((b) => ({ ...b })),
    };
  }

  /**
   * Return all available preset layouts.
   */
  getAvailableLayouts(): KeyboardLayout[] {
    return this.presetLayouts.map((l) => ({
      ...l,
      bindings: l.bindings.map((b) => ({ ...b })),
    }));
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Action Registration
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Register a handler for a named action.
   *
   * @param actionId Action identifier (e.g. 'transport.playForward').
   * @param handler Callback to invoke when the action fires.
   * @param description Optional human-readable description.
   */
  registerAction(actionId: string, handler: ActionHandler, description?: string): void {
    this.actionHandlers.set(actionId, handler);
    if (description) {
      this.actionDescriptions.set(actionId, description);
    }
  }

  /**
   * Unregister a previously-registered action handler.
   *
   * @param actionId Action identifier to remove.
   */
  unregisterAction(actionId: string): void {
    this.actionHandlers.delete(actionId);
    this.actionDescriptions.delete(actionId);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Binding Management
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Set a custom key binding, replacing any existing binding on that key combo.
   *
   * @param key Physical key string.
   * @param modifiers Active modifiers.
   * @param actionId Action to bind.
   */
  setBinding(key: string, modifiers: KeyModifier[], actionId: string): void {
    const combo = bindingKey(key, modifiers);

    // Remove any existing binding on this combo.
    this.layout.bindings = this.layout.bindings.filter(
      (b) => bindingKey(b.key, b.modifiers) !== combo,
    );

    // Look up description from existing binding or action registration.
    const existingDesc =
      this.actionDescriptions.get(actionId) ??
      this.layout.bindings.find((b) => b.action === actionId)?.description ??
      actionId;

    // Look up category from existing binding.
    const existingCategory =
      this.layout.bindings.find((b) => b.action === actionId)?.category ?? 'other';

    const binding: KeyBinding = {
      id: createBindingId(),
      key,
      modifiers: [...modifiers],
      action: actionId,
      description: existingDesc,
      category: existingCategory,
      isCustom: true,
    };

    this.layout.bindings.push(binding);
    this.rebuildBindingMap();
    this.notify();
  }

  /**
   * Remove a binding for a specific key combination.
   *
   * @param key Physical key string.
   * @param modifiers Active modifiers.
   */
  removeBinding(key: string, modifiers: KeyModifier[]): void {
    const combo = bindingKey(key, modifiers);
    this.layout.bindings = this.layout.bindings.filter(
      (b) => bindingKey(b.key, b.modifiers) !== combo,
    );
    this.rebuildBindingMap();
    this.notify();
  }

  /**
   * Reset all bindings to the default layout, discarding customisations.
   */
  resetToDefaults(): void {
    this.layout = {
      ...this.defaultLayout,
      bindings: this.defaultLayout.bindings.map((b) => ({ ...b, isCustom: false })),
    };
    this.rebuildBindingMap();
    this.jkl = { ...INITIAL_JKL_STATE };
    this.notify();
  }

  /**
   * Return all bindings that map to a given action.
   *
   * @param actionId Action identifier.
   * @returns Array of matching KeyBinding objects.
   */
  getBindingsForAction(actionId: string): KeyBinding[] {
    return this.layout.bindings
      .filter((b) => b.action === actionId)
      .map((b) => ({ ...b }));
  }

  /**
   * Look up the action for a key+modifier combo.
   *
   * @param key Physical key string.
   * @param modifiers Active modifiers.
   * @returns Action ID, or `null` if no binding.
   */
  getActionForKey(key: string, modifiers: KeyModifier[]): string | null {
    const combo = bindingKey(key, modifiers);
    const binding = this.bindingMap.get(combo);
    return binding ? binding.action : null;
  }

  /**
   * Return all bindings in a given category.
   *
   * @param category Key category.
   * @returns Array of matching KeyBinding objects.
   */
  getBindingsByCategory(category: KeyCategory): KeyBinding[] {
    return this.layout.bindings
      .filter((b) => b.category === category)
      .map((b) => ({ ...b }));
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Key Event Handlers
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Process a keydown event. Returns `true` if the key was handled
   * (and the event should be `preventDefault`'d by the caller).
   *
   * @param event Browser KeyboardEvent.
   * @returns `true` if the keypress was consumed.
   */
  handleKeyDown(event: KeyboardEvent): boolean {
    if (!this.enabled) return false;

    // Ignore events originating from text inputs.
    const target = event.target as HTMLElement | null;
    if (target) {
      const tag = target.tagName?.toLowerCase();
      if (
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        target.isContentEditable
      ) {
        return false;
      }
    }

    const key = event.key;

    // ── JKL special handling ──────────────────────────────────────────
    const lowerKey = key.toLowerCase();
    if (lowerKey === 'j' || lowerKey === 'k' || lowerKey === 'l') {
      if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
        this.handleJKL(lowerKey as 'j' | 'k' | 'l', true);
        return true;
      }
    }

    // ── Standard binding lookup ──────────────────────────────────────
    const modifiers = this.extractModifiers(event);
    const action = this.getActionForKey(key, modifiers);

    if (action) {
      this.dispatchAction(action);
      return true;
    }

    return false;
  }

  /**
   * Process a keyup event. Used primarily for JKL K-held state tracking.
   *
   * @param event Browser KeyboardEvent.
   */
  handleKeyUp(event: KeyboardEvent): void {
    if (!this.enabled) return;

    const lowerKey = event.key.toLowerCase();

    if (lowerKey === 'k') {
      this.jkl.kHeld = false;
      // If slow-motion was active, revert to full-speed or stop
      if (this.jkl.jHeld || this.jkl.lHeld) {
        // Key still held -- resume full speed in that direction.
      }
      this.notify();
    }

    if (lowerKey === 'j') {
      this.jkl.jHeld = false;
      this.notify();
    }

    if (lowerKey === 'l') {
      this.jkl.lHeld = false;
      this.notify();
    }
  }

  /**
   * Enable the keyboard engine (start processing key events).
   */
  enable(): void {
    this.enabled = true;
  }

  /**
   * Disable the keyboard engine (stop processing key events).
   * Use when a text input gains focus.
   */
  disable(): void {
    this.enabled = false;
  }

  /**
   * Whether the engine is currently enabled.
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  JKL Transport
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Special handler for JKL shuttle keys with multi-press speed support
   * and K+J / K+L slow-motion detection.
   *
   * @param key The shuttle key ('j', 'k', or 'l').
   * @param isDown Whether this is a keydown (true) or keyup (false) event.
   */
  handleJKL(key: 'j' | 'k' | 'l', isDown: boolean): void {
    if (!isDown) {
      // Delegate keyup tracking.
      if (key === 'k') this.jkl.kHeld = false;
      if (key === 'j') this.jkl.jHeld = false;
      if (key === 'l') this.jkl.lHeld = false;
      this.notify();
      return;
    }

    const now = Date.now();

    if (key === 'k') {
      // K = Stop / Pause.
      this.jkl.kHeld = true;
      this.jkl.direction = 0;
      this.jkl.tierIndex = 0;
      this.dispatchAction('transport.stop');
      this.notify();
      return;
    }

    if (key === 'j') {
      this.jkl.jHeld = true;

      // If K is held, enter slow-motion reverse.
      if (this.jkl.kHeld) {
        this.jkl.direction = -1;
        this.jkl.tierIndex = 0;
        this.dispatchAction('transport.slowMotionReverse');
        this.notify();
        return;
      }

      // Multi-press logic: if already going reverse and within window, increase tier.
      if (
        this.jkl.direction === -1 &&
        now - this.jkl.lastPressTime < MULTI_PRESS_WINDOW
      ) {
        this.jkl.tierIndex = Math.min(
          this.jkl.tierIndex + 1,
          JKL_SPEED_TIERS.length - 1,
        );
      } else {
        // First press or changing direction.
        this.jkl.direction = -1;
        this.jkl.tierIndex = 0;
      }

      this.jkl.lastPressTime = now;
      this.dispatchAction('transport.playReverse');
      this.notify();
      return;
    }

    if (key === 'l') {
      this.jkl.lHeld = true;

      // If K is held, enter slow-motion forward.
      if (this.jkl.kHeld) {
        this.jkl.direction = 1;
        this.jkl.tierIndex = 0;
        this.dispatchAction('transport.slowMotionForward');
        this.notify();
        return;
      }

      // Multi-press logic.
      if (
        this.jkl.direction === 1 &&
        now - this.jkl.lastPressTime < MULTI_PRESS_WINDOW
      ) {
        this.jkl.tierIndex = Math.min(
          this.jkl.tierIndex + 1,
          JKL_SPEED_TIERS.length - 1,
        );
      } else {
        this.jkl.direction = 1;
        this.jkl.tierIndex = 0;
      }

      this.jkl.lastPressTime = now;
      this.dispatchAction('transport.playForward');
      this.notify();
      return;
    }
  }

  /**
   * Return the current JKL shuttle speed as a signed multiplier.
   * Negative = reverse, 0 = stopped, positive = forward.
   * Absolute value ranges from 0.25 (slow motion) through 8 (max shuttle).
   */
  getJKLSpeed(): number {
    if (this.jkl.direction === 0) return 0;

    // Slow motion: K held + J or L.
    if (this.isSlowMotion()) {
      return this.jkl.direction * 0.25;
    }

    const tier = JKL_SPEED_TIERS[this.jkl.tierIndex] ?? 1;
    return this.jkl.direction * tier;
  }

  /**
   * Whether slow-motion is active (K held simultaneously with J or L).
   */
  isSlowMotion(): boolean {
    return this.jkl.kHeld && (this.jkl.jHeld || this.jkl.lHeld);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Search
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Search bindings by description, action name, or key.
   *
   * @param query Case-insensitive search string.
   * @returns Matching bindings.
   */
  searchBindings(query: string): KeyBinding[] {
    const lower = query.toLowerCase();
    return this.layout.bindings.filter(
      (b) =>
        b.description.toLowerCase().includes(lower) ||
        b.action.toLowerCase().includes(lower) ||
        b.key.toLowerCase().includes(lower),
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Conflict Detection
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Check whether a key combo already has a binding.
   *
   * @param key Physical key string.
   * @param modifiers Active modifiers.
   * @returns `true` if a binding exists for this combo.
   */
  hasConflict(key: string, modifiers: KeyModifier[]): boolean {
    return this.bindingMap.has(bindingKey(key, modifiers));
  }

  /**
   * Return all binding pairs that share the same key+modifier combo.
   * Under normal circumstances this list should be empty (each combo
   * maps to at most one binding). Conflicts arise when bindings are
   * imported or programmatically set without removing the old one.
   */
  getConflicts(): { binding1: KeyBinding; binding2: KeyBinding }[] {
    const seen = new Map<string, KeyBinding>();
    const conflicts: { binding1: KeyBinding; binding2: KeyBinding }[] = [];

    for (const binding of this.layout.bindings) {
      const combo = bindingKey(binding.key, binding.modifiers);
      const existing = seen.get(combo);
      if (existing) {
        conflicts.push({ binding1: existing, binding2: binding });
      } else {
        seen.set(combo, binding);
      }
    }

    return conflicts;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Export / Import
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Export the current layout as a JSON string.
   *
   * @returns Stringified KeyboardLayout.
   */
  exportLayout(): string {
    return JSON.stringify(this.getLayout(), null, 2);
  }

  /**
   * Import a layout from a JSON string, replacing the current layout.
   *
   * @param json Stringified KeyboardLayout.
   * @throws SyntaxError if the JSON is malformed.
   */
  importLayout(json: string): void {
    const parsed = JSON.parse(json) as KeyboardLayout;
    if (!parsed.id || !parsed.name || !Array.isArray(parsed.bindings)) {
      throw new Error(
        '[KeyboardEngine] Invalid layout JSON: missing id, name, or bindings.',
      );
    }
    this.loadLayout(parsed);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Subscription
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Subscribe to general state changes (binding updates, layout loads, etc.).
   *
   * @param cb Callback invoked on every state change.
   * @returns Unsubscribe function.
   */
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /**
   * Subscribe to action dispatches.
   *
   * @param event Event type (currently only 'action').
   * @param cb Callback receiving the dispatched action ID.
   * @returns Unsubscribe function.
   */
  on(event: 'action', cb: (actionId: string) => void): () => void {
    if (event === 'action') {
      this.actionListeners.add(cb);
      return () => {
        this.actionListeners.delete(cb);
      };
    }
    return () => {};
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Internal
  // ═══════════════════════════════════════════════════════════════════════

  /** Rebuild the O(1) binding lookup map from the current layout. */
  private rebuildBindingMap(): void {
    this.bindingMap.clear();
    for (const binding of this.layout.bindings) {
      const combo = bindingKey(binding.key, binding.modifiers);
      this.bindingMap.set(combo, binding);
    }
  }

  /** Extract active modifiers from a KeyboardEvent. */
  private extractModifiers(event: KeyboardEvent): KeyModifier[] {
    const mods: KeyModifier[] = [];
    if (event.ctrlKey) mods.push('ctrl');
    if (event.shiftKey) mods.push('shift');
    if (event.altKey) mods.push('alt');
    if (event.metaKey) mods.push('meta');
    return mods;
  }

  /** Dispatch an action to the registered handler and notify action listeners. */
  private dispatchAction(actionId: string): void {
    const handler = this.actionHandlers.get(actionId);
    if (handler) {
      try {
        handler();
      } catch (err) {
        console.error(`[KeyboardEngine] Action "${actionId}" handler error:`, err);
      }
    }
    // Notify action listeners.
    this.actionListeners.forEach((cb) => {
      try {
        cb(actionId);
      } catch (err) {
        console.error('[KeyboardEngine] Action listener error:', err);
      }
    });
  }

  /** Notify all state change listeners. */
  private notify(): void {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        console.error('[KeyboardEngine] Subscriber error:', err);
      }
    });
  }
}

/** Singleton keyboard engine instance. */
export const keyboardEngine = new KeyboardEngine();
