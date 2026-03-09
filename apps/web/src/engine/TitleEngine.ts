// =============================================================================
//  THE AVID -- Title Engine (Titler+)
// =============================================================================
//
// Complete implementation of Avid Media Composer's Titler+ system for text
// overlays.  Manages title instances containing multiple text objects, styled
// with fonts, colors, shadows, outlines, and background boxes.  Includes a
// template system with built-in presets (lower thirds, center titles, end
// cards, subtitles), and CSS/HTML rendering for live preview.
// =============================================================================

import { useEditorStore } from '../store/editor.store';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Drop-shadow style for a text object. */
export interface TitleShadow {
  enabled: boolean;
  color: string;
  offsetX: number;
  offsetY: number;
  blur: number;
  angle: number;
}

/** Outline (stroke) style for a text object. */
export interface TitleOutline {
  enabled: boolean;
  color: string;
  width: number;
}

/** Background box behind a text object. */
export interface TitleBackground {
  enabled: boolean;
  color: string;
  opacity: number;
  padding: number;
  borderRadius: number;
}

/** A single text object within a title. */
export interface TitleTextObject {
  id: string;
  text: string;
  x: number;                    // position (0-100 % of frame)
  y: number;
  width: number;
  height: number;
  fontFamily: string;
  fontSize: number;              // points
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  textDecoration: 'none' | 'underline';
  textAlign: 'left' | 'center' | 'right';
  color: string;                 // hex
  opacity: number;               // 0-100
  rotation: number;              // degrees
  letterSpacing: number;
  lineHeight: number;
  shadow?: TitleShadow;
  outline?: TitleOutline;
  background?: TitleBackground;
}

/** A title instance on the timeline, containing one or more text objects. */
export interface TitleInstance {
  id: string;
  name: string;
  clipId: string;                // associated timeline clip
  trackId: string;
  startTime: number;
  endTime: number;
  objects: TitleTextObject[];    // multiple text objects per title
  resolution: { width: number; height: number };
  createdAt: number;
  modifiedAt: number;
}

/** Category for title templates. */
export type TitleTemplateCategory = 'lower-third' | 'full-screen' | 'end-card' | 'subtitle' | 'custom';

/** A reusable title template. */
export interface TitleTemplate {
  id: string;
  name: string;
  category: TitleTemplateCategory;
  objects: Omit<TitleTextObject, 'id'>[];
  thumbnail?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createId(prefix: string): string {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Default text object values used when creating new objects. */
const DEFAULT_TEXT_OBJECT: Omit<TitleTextObject, 'id' | 'text'> = {
  x: 50,
  y: 50,
  width: 80,
  height: 20,
  fontFamily: 'Arial',
  fontSize: 48,
  fontWeight: 'normal',
  fontStyle: 'normal',
  textDecoration: 'none',
  textAlign: 'center',
  color: '#ffffff',
  opacity: 100,
  rotation: 0,
  letterSpacing: 0,
  lineHeight: 1.2,
};

/** Escape special characters for HTML rendering. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\n/g, '<br/>');
}

// ─── Built-in Templates ──────────────────────────────────────────────────────

const BUILT_IN_TEMPLATES: TitleTemplate[] = [
  {
    id: 'tpl-lower-third',
    name: 'Lower Third',
    category: 'lower-third',
    objects: [
      {
        text: 'Name',
        x: 10,
        y: 78,
        width: 50,
        height: 8,
        fontFamily: 'Arial',
        fontSize: 36,
        fontWeight: 'bold',
        fontStyle: 'normal',
        textDecoration: 'none',
        textAlign: 'left',
        color: '#ffffff',
        opacity: 100,
        rotation: 0,
        letterSpacing: 0.5,
        lineHeight: 1.2,
        background: {
          enabled: true,
          color: '#000000',
          opacity: 70,
          padding: 12,
          borderRadius: 4,
        },
      },
      {
        text: 'Title',
        x: 10,
        y: 86,
        width: 50,
        height: 6,
        fontFamily: 'Arial',
        fontSize: 24,
        fontWeight: 'normal',
        fontStyle: 'normal',
        textDecoration: 'none',
        textAlign: 'left',
        color: '#cccccc',
        opacity: 100,
        rotation: 0,
        letterSpacing: 0.5,
        lineHeight: 1.2,
        background: {
          enabled: true,
          color: '#000000',
          opacity: 50,
          padding: 8,
          borderRadius: 4,
        },
      },
    ],
  },
  {
    id: 'tpl-center-title',
    name: 'Center Title',
    category: 'full-screen',
    objects: [
      {
        text: 'Title Text',
        x: 50,
        y: 50,
        width: 80,
        height: 20,
        fontFamily: 'Arial',
        fontSize: 72,
        fontWeight: 'bold',
        fontStyle: 'normal',
        textDecoration: 'none',
        textAlign: 'center',
        color: '#ffffff',
        opacity: 100,
        rotation: 0,
        letterSpacing: 2,
        lineHeight: 1.1,
        shadow: {
          enabled: true,
          color: '#000000',
          offsetX: 3,
          offsetY: 3,
          blur: 6,
          angle: 135,
        },
      },
    ],
  },
  {
    id: 'tpl-end-card',
    name: 'End Card',
    category: 'end-card',
    objects: [
      {
        text: 'Directed By',
        x: 50,
        y: 35,
        width: 60,
        height: 8,
        fontFamily: 'Georgia',
        fontSize: 28,
        fontWeight: 'normal',
        fontStyle: 'italic',
        textDecoration: 'none',
        textAlign: 'center',
        color: '#cccccc',
        opacity: 100,
        rotation: 0,
        letterSpacing: 1,
        lineHeight: 1.3,
      },
      {
        text: 'Director Name',
        x: 50,
        y: 45,
        width: 60,
        height: 12,
        fontFamily: 'Georgia',
        fontSize: 48,
        fontWeight: 'bold',
        fontStyle: 'normal',
        textDecoration: 'none',
        textAlign: 'center',
        color: '#ffffff',
        opacity: 100,
        rotation: 0,
        letterSpacing: 2,
        lineHeight: 1.2,
      },
      {
        text: 'Production Company',
        x: 50,
        y: 60,
        width: 60,
        height: 6,
        fontFamily: 'Georgia',
        fontSize: 20,
        fontWeight: 'normal',
        fontStyle: 'normal',
        textDecoration: 'none',
        textAlign: 'center',
        color: '#999999',
        opacity: 100,
        rotation: 0,
        letterSpacing: 3,
        lineHeight: 1.4,
      },
    ],
  },
  {
    id: 'tpl-subtitle',
    name: 'Subtitle',
    category: 'subtitle',
    objects: [
      {
        text: 'Subtitle text',
        x: 50,
        y: 90,
        width: 80,
        height: 8,
        fontFamily: 'Arial',
        fontSize: 32,
        fontWeight: 'normal',
        fontStyle: 'normal',
        textDecoration: 'none',
        textAlign: 'center',
        color: '#ffffff',
        opacity: 100,
        rotation: 0,
        letterSpacing: 0,
        lineHeight: 1.3,
        shadow: {
          enabled: true,
          color: '#000000',
          offsetX: 1,
          offsetY: 1,
          blur: 4,
          angle: 135,
        },
        outline: {
          enabled: true,
          color: '#000000',
          width: 2,
        },
      },
    ],
  },
];

// =============================================================================
//  TitleEngine
// =============================================================================

/**
 * Avid-style title engine (Titler+).
 *
 * Manages title instances with multiple styled text objects, a template system,
 * and CSS/HTML rendering for live preview overlays.  Each title is associated
 * with a clip on a timeline track and can be styled independently.
 *
 * This engine operates as a data-model layer; actual compositing onto the
 * video frame is handled by the playback pipeline.  The engine provides HTML/
 * CSS representations that can be used for real-time preview in the browser.
 */
export class TitleEngine {
  // ─── Internal state ─────────────────────────────────────────────────────

  /** Title instances keyed by ID. */
  private titles = new Map<string, TitleInstance>();
  /** Templates keyed by ID. */
  private templates = new Map<string, TitleTemplate>();
  /** General subscribers. */
  private listeners = new Set<() => void>();
  /** Default resolution for new titles. */
  private defaultResolution = { width: 1920, height: 1080 };

  constructor() {
    for (const tpl of BUILT_IN_TEMPLATES) {
      this.templates.set(tpl.id, tpl);
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────

  /** Notify all subscribers that state has changed. */
  private notify(): void {
    this.listeners.forEach((fn) => {
      try { fn(); } catch (err) { console.error('[TitleEngine] Subscriber error:', err); }
    });
  }

  /** Get the current playhead position from the editor store. */
  private getPlayheadTime(): number {
    return useEditorStore.getState().playheadTime;
  }

  /** Get the selected track ID from the editor store. */
  private getSelectedTrackId(): string | null {
    return useEditorStore.getState().selectedTrackId;
  }

  /**
   * Find the topmost video track in the timeline.
   * Used when creating a title at the playhead with no explicit track.
   */
  private getTopmostVideoTrackId(): string | null {
    const state = useEditorStore.getState();
    const videoTracks = state.tracks
      .filter((t) => t.type === 'VIDEO' || t.type === 'GRAPHIC')
      .sort((a, b) => a.sortOrder - b.sortOrder);
    return videoTracks.length > 0 ? videoTracks[0].id : null;
  }

  /**
   * Create a new TitleTextObject with defaults merged with any overrides.
   */
  private createTextObject(text: string, overrides?: Partial<TitleTextObject>): TitleTextObject {
    return {
      id: createId('txt'),
      text,
      ...DEFAULT_TEXT_OBJECT,
      ...overrides,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Create / Edit
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create a new title on a track within a time range.
   *
   * @param trackId    Track identifier.
   * @param startTime  Start time in seconds.
   * @param endTime    End time in seconds.
   * @param options    Optional name and template to apply.
   * @returns The created TitleInstance.
   */
  createTitle(
    trackId: string,
    startTime: number,
    endTime: number,
    options?: { name?: string; template?: string },
  ): TitleInstance {
    const now = Date.now();

    // Start with an empty objects list
    let objects: TitleTextObject[] = [];

    // If a template is specified, apply it
    if (options?.template) {
      const tpl = this.templates.get(options.template);
      if (tpl) {
        objects = tpl.objects.map((obj) => this.createTextObject(obj.text, obj));
      }
    }

    // If no template was applied, create a default centered text object
    if (objects.length === 0) {
      objects.push(this.createTextObject('Title'));
    }

    const clipId = createId('tclip');

    const title: TitleInstance = {
      id: createId('ttl'),
      name: options?.name ?? 'Untitled',
      clipId,
      trackId,
      startTime: Math.min(startTime, endTime),
      endTime: Math.max(startTime, endTime),
      objects,
      resolution: { ...this.defaultResolution },
      createdAt: now,
      modifiedAt: now,
    };

    this.titles.set(title.id, title);
    this.notify();
    return title;
  }

  /**
   * Create a title on the topmost video track at the current playhead position.
   *
   * @param duration  Duration in seconds (defaults to 5 seconds).
   * @returns The created TitleInstance, or null if no video track exists.
   */
  createTitleAtPlayhead(duration = 5): TitleInstance | null {
    const trackId = this.getTopmostVideoTrackId();
    if (!trackId) {
      console.warn('[TitleEngine] No video track available for title creation');
      return null;
    }

    const playhead = this.getPlayheadTime();
    return this.createTitle(trackId, playhead, playhead + duration, {
      name: 'Title',
    });
  }

  /**
   * Delete a title by ID.
   * @param titleId  The title to delete.
   */
  deleteTitle(titleId: string): void {
    if (this.titles.delete(titleId)) {
      this.notify();
    }
  }

  /**
   * Duplicate a title, creating a new instance with a new ID and all
   * text objects cloned.
   *
   * @param titleId  The title to duplicate.
   * @returns The new TitleInstance.
   */
  duplicateTitle(titleId: string): TitleInstance {
    const original = this.titles.get(titleId);
    if (!original) {
      throw new Error(`[TitleEngine] Title "${titleId}" not found`);
    }

    const now = Date.now();
    const duplicate: TitleInstance = {
      ...original,
      id: createId('ttl'),
      clipId: createId('tclip'),
      name: `${original.name} (Copy)`,
      objects: original.objects.map((obj) => ({
        ...obj,
        id: createId('txt'),
        shadow: obj.shadow ? { ...obj.shadow } : undefined,
        outline: obj.outline ? { ...obj.outline } : undefined,
        background: obj.background ? { ...obj.background } : undefined,
      })),
      resolution: { ...original.resolution },
      createdAt: now,
      modifiedAt: now,
    };

    this.titles.set(duplicate.id, duplicate);
    this.notify();
    return duplicate;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Text Objects
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Add a new text object to an existing title.
   *
   * @param titleId  The title to add the text object to.
   * @param text     The initial text content.
   * @param options  Optional partial overrides for text object properties.
   * @returns The created TitleTextObject.
   */
  addTextObject(
    titleId: string,
    text: string,
    options?: Partial<TitleTextObject>,
  ): TitleTextObject {
    const title = this.titles.get(titleId);
    if (!title) {
      throw new Error(`[TitleEngine] Title "${titleId}" not found`);
    }

    const obj = this.createTextObject(text, options);
    title.objects.push(obj);
    title.modifiedAt = Date.now();
    this.notify();
    return obj;
  }

  /**
   * Update properties of a text object within a title.
   *
   * @param titleId   The title containing the text object.
   * @param objectId  The text object to update.
   * @param patch     Partial properties to merge.
   */
  updateTextObject(titleId: string, objectId: string, patch: Partial<TitleTextObject>): void {
    const title = this.titles.get(titleId);
    if (!title) {
      console.warn(`[TitleEngine] Title "${titleId}" not found`);
      return;
    }

    const objIdx = title.objects.findIndex((o) => o.id === objectId);
    if (objIdx === -1) {
      console.warn(`[TitleEngine] Text object "${objectId}" not found in title "${titleId}"`);
      return;
    }

    // Merge patch while preserving the ID
    title.objects[objIdx] = {
      ...title.objects[objIdx],
      ...patch,
      id: objectId,
    };
    title.modifiedAt = Date.now();
    this.notify();
  }

  /**
   * Remove a text object from a title.
   *
   * @param titleId   The title containing the text object.
   * @param objectId  The text object to remove.
   */
  removeTextObject(titleId: string, objectId: string): void {
    const title = this.titles.get(titleId);
    if (!title) return;

    title.objects = title.objects.filter((o) => o.id !== objectId);
    title.modifiedAt = Date.now();
    this.notify();
  }

  /**
   * Get all text objects for a title.
   *
   * @param titleId  The title to query.
   * @returns Array of TitleTextObjects (cloned).
   */
  getTextObjects(titleId: string): TitleTextObject[] {
    const title = this.titles.get(titleId);
    if (!title) return [];
    return title.objects.map((o) => ({
      ...o,
      shadow: o.shadow ? { ...o.shadow } : undefined,
      outline: o.outline ? { ...o.outline } : undefined,
      background: o.background ? { ...o.background } : undefined,
    }));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Styling
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Set the font family and size for a text object.
   *
   * @param titleId     Title identifier.
   * @param objectId    Text object identifier.
   * @param fontFamily  CSS font-family value.
   * @param fontSize    Font size in points.
   */
  setFont(titleId: string, objectId: string, fontFamily: string, fontSize: number): void {
    this.updateTextObject(titleId, objectId, { fontFamily, fontSize });
  }

  /**
   * Set the fill color for a text object.
   *
   * @param titleId   Title identifier.
   * @param objectId  Text object identifier.
   * @param color     Hex color string (e.g. '#ff0000').
   */
  setColor(titleId: string, objectId: string, color: string): void {
    this.updateTextObject(titleId, objectId, { color });
  }

  /**
   * Set the drop shadow for a text object.
   *
   * @param titleId   Title identifier.
   * @param objectId  Text object identifier.
   * @param shadow    Shadow configuration.
   */
  setShadow(titleId: string, objectId: string, shadow: TitleShadow): void {
    this.updateTextObject(titleId, objectId, { shadow: { ...shadow } });
  }

  /**
   * Set the outline (stroke) for a text object.
   *
   * @param titleId   Title identifier.
   * @param objectId  Text object identifier.
   * @param outline   Outline configuration.
   */
  setOutline(titleId: string, objectId: string, outline: TitleOutline): void {
    this.updateTextObject(titleId, objectId, { outline: { ...outline } });
  }

  /**
   * Set the background box for a text object.
   *
   * @param titleId   Title identifier.
   * @param objectId  Text object identifier.
   * @param bg        Background configuration.
   */
  setBackground(titleId: string, objectId: string, bg: TitleBackground): void {
    this.updateTextObject(titleId, objectId, { background: { ...bg } });
  }

  /**
   * Set the position of a text object.
   *
   * @param titleId   Title identifier.
   * @param objectId  Text object identifier.
   * @param x         Horizontal position (0-100 % of frame width).
   * @param y         Vertical position (0-100 % of frame height).
   */
  setPosition(titleId: string, objectId: string, x: number, y: number): void {
    this.updateTextObject(titleId, objectId, { x, y });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Templates
  // ═══════════════════════════════════════════════════════════════════════════

  /** Get all registered templates. */
  getTemplates(): TitleTemplate[] {
    return Array.from(this.templates.values()).map((tpl) => ({
      ...tpl,
      objects: tpl.objects.map((o) => ({ ...o })),
    }));
  }

  /**
   * Get templates filtered by category.
   * @param category  Template category to filter by.
   */
  getTemplatesByCategory(category: string): TitleTemplate[] {
    return this.getTemplates().filter((tpl) => tpl.category === category);
  }

  /**
   * Save an existing title's layout as a reusable template.
   *
   * @param titleId   The title to use as a template source.
   * @param name      Human-readable template name.
   * @param category  Template category.
   * @returns The created TitleTemplate.
   */
  saveAsTemplate(titleId: string, name: string, category: string): TitleTemplate {
    const title = this.titles.get(titleId);
    if (!title) {
      throw new Error(`[TitleEngine] Title "${titleId}" not found`);
    }

    const tpl: TitleTemplate = {
      id: createId('tpl'),
      name,
      category: category as TitleTemplateCategory,
      objects: title.objects.map((obj) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id, ...rest } = obj;
        return {
          ...rest,
          shadow: obj.shadow ? { ...obj.shadow } : undefined,
          outline: obj.outline ? { ...obj.outline } : undefined,
          background: obj.background ? { ...obj.background } : undefined,
        };
      }),
    };

    this.templates.set(tpl.id, tpl);
    this.notify();
    return tpl;
  }

  /**
   * Apply a template to an existing title, replacing all text objects.
   *
   * @param titleId     The title to apply the template to.
   * @param templateId  The template to apply.
   */
  applyTemplate(titleId: string, templateId: string): void {
    const title = this.titles.get(titleId);
    if (!title) {
      console.warn(`[TitleEngine] Title "${titleId}" not found`);
      return;
    }

    const tpl = this.templates.get(templateId);
    if (!tpl) {
      console.warn(`[TitleEngine] Template "${templateId}" not found`);
      return;
    }

    title.objects = tpl.objects.map((obj) => this.createTextObject(obj.text, obj));
    title.modifiedAt = Date.now();
    this.notify();
  }

  /**
   * Delete a template by ID.
   *
   * Built-in templates (prefixed with 'tpl-') cannot be deleted.
   *
   * @param templateId  The template to delete.
   */
  deleteTemplate(templateId: string): void {
    if (templateId.startsWith('tpl-')) {
      console.warn(`[TitleEngine] Cannot delete built-in template "${templateId}"`);
      return;
    }
    if (this.templates.delete(templateId)) {
      this.notify();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Query
  // ═══════════════════════════════════════════════════════════════════════════

  /** Get a title by ID. */
  getTitle(titleId: string): TitleInstance | null {
    const title = this.titles.get(titleId);
    if (!title) return null;
    return {
      ...title,
      objects: title.objects.map((o) => ({
        ...o,
        shadow: o.shadow ? { ...o.shadow } : undefined,
        outline: o.outline ? { ...o.outline } : undefined,
        background: o.background ? { ...o.background } : undefined,
      })),
      resolution: { ...title.resolution },
    };
  }

  /** Get all titles across all tracks. */
  getAllTitles(): TitleInstance[] {
    return Array.from(this.titles.values())
      .map((t) => this.getTitle(t.id)!)
      .sort((a, b) => a.startTime - b.startTime);
  }

  /** Get all titles on a specific track, sorted by start time. */
  getTitlesForTrack(trackId: string): TitleInstance[] {
    return this.getAllTitles().filter((t) => t.trackId === trackId);
  }

  /**
   * Get the title that is active at a given time on a track.
   *
   * @param trackId  Track identifier.
   * @param time     Time position in seconds.
   * @returns The TitleInstance active at that time, or null.
   */
  getTitleAtTime(trackId: string, time: number): TitleInstance | null {
    for (const title of this.titles.values()) {
      if (title.trackId === trackId && time >= title.startTime && time <= title.endTime) {
        return this.getTitle(title.id);
      }
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Render to CSS / HTML (for preview)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Generate a CSS string for rendering a title overlay in the browser.
   *
   * The CSS uses relative positioning (percentages) so it scales with the
   * preview container.  Each text object gets its own class.
   *
   * @param titleId  The title to render.
   * @returns CSS string, or empty string if title not found.
   */
  renderToCSS(titleId: string): string {
    const title = this.titles.get(titleId);
    if (!title) return '';

    const rules: string[] = [];

    // Container
    rules.push(
      `.title-${titleId} {`,
      '  position: absolute;',
      '  top: 0; left: 0;',
      '  width: 100%; height: 100%;',
      '  pointer-events: none;',
      '  overflow: hidden;',
      '}',
    );

    for (const obj of title.objects) {
      const selector = `.title-${titleId} .text-${obj.id}`;
      const lines: string[] = [];

      lines.push(`${selector} {`);
      lines.push('  position: absolute;');
      lines.push(`  left: ${obj.x}%;`);
      lines.push(`  top: ${obj.y}%;`);
      lines.push('  transform: translate(-50%, -50%)' + (obj.rotation !== 0 ? ` rotate(${obj.rotation}deg)` : '') + ';');
      lines.push(`  width: ${obj.width}%;`);
      lines.push(`  font-family: ${obj.fontFamily}, sans-serif;`);
      lines.push(`  font-size: ${obj.fontSize}pt;`);
      lines.push(`  font-weight: ${obj.fontWeight};`);
      lines.push(`  font-style: ${obj.fontStyle};`);
      lines.push(`  text-decoration: ${obj.textDecoration};`);
      lines.push(`  text-align: ${obj.textAlign};`);
      lines.push(`  color: ${obj.color};`);
      lines.push(`  opacity: ${obj.opacity / 100};`);
      lines.push(`  letter-spacing: ${obj.letterSpacing}px;`);
      lines.push(`  line-height: ${obj.lineHeight};`);
      lines.push('  white-space: pre-wrap;');
      lines.push('  word-wrap: break-word;');

      // Shadow
      if (obj.shadow?.enabled) {
        lines.push(
          `  text-shadow: ${obj.shadow.offsetX}px ${obj.shadow.offsetY}px ${obj.shadow.blur}px ${obj.shadow.color};`,
        );
      }

      // Outline via -webkit-text-stroke (widely supported in modern browsers)
      if (obj.outline?.enabled) {
        lines.push(
          `  -webkit-text-stroke: ${obj.outline.width}px ${obj.outline.color};`,
        );
        lines.push('  paint-order: stroke fill;');
      }

      // Background box
      if (obj.background?.enabled) {
        const bgHex = obj.background.color;
        const bgOpacity = obj.background.opacity / 100;
        // Convert hex to rgba
        const r = parseInt(bgHex.slice(1, 3), 16);
        const g = parseInt(bgHex.slice(3, 5), 16);
        const b = parseInt(bgHex.slice(5, 7), 16);
        lines.push(`  background: rgba(${r}, ${g}, ${b}, ${bgOpacity});`);
        lines.push(`  padding: ${obj.background.padding}px;`);
        lines.push(`  border-radius: ${obj.background.borderRadius}px;`);
      }

      lines.push('}');
      rules.push(lines.join('\n'));
    }

    return rules.join('\n\n');
  }

  /**
   * Generate an HTML string for a title overlay.
   *
   * The HTML includes inline styles so it can be injected directly into a
   * preview container without an external stylesheet.
   *
   * @param titleId  The title to render.
   * @returns HTML string, or empty string if title not found.
   */
  renderToHTML(titleId: string): string {
    const title = this.titles.get(titleId);
    if (!title) return '';

    const objectsHtml = title.objects.map((obj) => {
      const styles: string[] = [];

      styles.push('position: absolute');
      styles.push(`left: ${obj.x}%`);
      styles.push(`top: ${obj.y}%`);
      const transform = 'translate(-50%, -50%)' + (obj.rotation !== 0 ? ` rotate(${obj.rotation}deg)` : '');
      styles.push(`transform: ${transform}`);
      styles.push(`width: ${obj.width}%`);
      styles.push(`font-family: ${obj.fontFamily}, sans-serif`);
      styles.push(`font-size: ${obj.fontSize}pt`);
      styles.push(`font-weight: ${obj.fontWeight}`);
      styles.push(`font-style: ${obj.fontStyle}`);
      styles.push(`text-decoration: ${obj.textDecoration}`);
      styles.push(`text-align: ${obj.textAlign}`);
      styles.push(`color: ${obj.color}`);
      styles.push(`opacity: ${obj.opacity / 100}`);
      styles.push(`letter-spacing: ${obj.letterSpacing}px`);
      styles.push(`line-height: ${obj.lineHeight}`);
      styles.push('white-space: pre-wrap');
      styles.push('word-wrap: break-word');

      if (obj.shadow?.enabled) {
        styles.push(
          `text-shadow: ${obj.shadow.offsetX}px ${obj.shadow.offsetY}px ${obj.shadow.blur}px ${obj.shadow.color}`,
        );
      }

      if (obj.outline?.enabled) {
        styles.push(`-webkit-text-stroke: ${obj.outline.width}px ${obj.outline.color}`);
        styles.push('paint-order: stroke fill');
      }

      if (obj.background?.enabled) {
        const bgHex = obj.background.color;
        const bgOpacity = obj.background.opacity / 100;
        const r = parseInt(bgHex.slice(1, 3), 16);
        const g = parseInt(bgHex.slice(3, 5), 16);
        const b = parseInt(bgHex.slice(5, 7), 16);
        styles.push(`background: rgba(${r}, ${g}, ${b}, ${bgOpacity})`);
        styles.push(`padding: ${obj.background.padding}px`);
        styles.push(`border-radius: ${obj.background.borderRadius}px`);
      }

      const styleAttr = styles.join('; ');
      return `  <div class="text-${obj.id}" style="${styleAttr}">${escapeHtml(obj.text)}</div>`;
    });

    return [
      `<div class="title-${titleId}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; overflow: hidden;">`,
      ...objectsHtml,
      '</div>',
    ].join('\n');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Subscribe
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Subscribe to title engine state changes.
   *
   * @param cb  Callback invoked on any state change.
   * @returns An unsubscribe function.
   */
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Cleanup
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Dispose the engine, clearing all internal state and subscriptions.
   * Primarily useful for tests and teardown.
   */
  dispose(): void {
    this.titles.clear();
    this.listeners.clear();
    // Re-register built-in templates
    this.templates.clear();
    for (const tpl of BUILT_IN_TEMPLATES) {
      this.templates.set(tpl.id, tpl);
    }
  }
}

/** Singleton title engine instance. */
export const titleEngine = new TitleEngine();
