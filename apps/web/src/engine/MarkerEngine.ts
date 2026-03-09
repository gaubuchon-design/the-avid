// =============================================================================
//  THE AVID -- Marker Engine (Avid-style Marker / Locator System)
// =============================================================================
//
// Full implementation of Avid Media Composer's marker/locator workflow including
// color-coded markers, spanned (range) markers, clip vs. sequence scope,
// navigation, import/export, and source-marker copy.
// =============================================================================

import { useEditorStore } from '../store/editor.store';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Avid marker colors matching the Media Composer palette. */
export type MarkerColor =
  | 'red'
  | 'green'
  | 'blue'
  | 'cyan'
  | 'magenta'
  | 'yellow'
  | 'black'
  | 'white';

/** Marker can live on the sequence (TC track) or on a specific clip. */
export type MarkerScope = 'sequence' | 'clip';

/** A timeline or clip marker. */
export interface Marker {
  id: string;
  /** Position in seconds on the timeline (or clip-relative if scope === 'clip'). */
  time: number;
  /** End position for spanned (range) markers. Undefined = point marker. */
  endTime?: number;
  /** Short label displayed on the timeline. */
  label: string;
  /** Detailed comment text (shown in the Marker window). */
  comment: string;
  /** Marker colour from the Avid palette. */
  color: MarkerColor;
  /** Whether the marker is attached to the sequence or to a specific clip. */
  scope: MarkerScope;
  /** Track ID the marker lives on. null = sequence marker (TC track). */
  trackId: string | null;
  /** Clip ID the marker is attached to. null = sequence marker. */
  clipId: string | null;
  /** Display name of the user who created the marker. */
  author?: string;
  /** Unix-epoch milliseconds when the marker was created. */
  createdAt: number;
}

/** Filter criteria for querying markers. */
export interface MarkerFilter {
  colors?: MarkerColor[];
  scope?: MarkerScope;
  trackId?: string;
  textSearch?: string;
}

// ─── Event types ─────────────────────────────────────────────────────────────

type MarkerEventType = 'add' | 'remove' | 'update' | 'navigate';
type MarkerEventCallback = (marker: Marker) => void;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createId(prefix: string): string {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Hex colour for each marker colour (used for export). */
const MARKER_HEX: Record<MarkerColor, string> = {
  red: '#ff0000',
  green: '#00ff00',
  blue: '#0000ff',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  yellow: '#ffff00',
  black: '#000000',
  white: '#ffffff',
};

/** Reverse lookup: closest MarkerColor from a hex string. */
function hexToMarkerColor(hex: string): MarkerColor {
  const norm = hex.toLowerCase().replace(/^#/, '');
  for (const [name, value] of Object.entries(MARKER_HEX)) {
    if (value.replace('#', '') === norm) return name as MarkerColor;
  }
  return 'yellow'; // default fallback
}

// ─── CSV helpers ─────────────────────────────────────────────────────────────

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

// ─── Timecode helpers ────────────────────────────────────────────────────────

function secondsToTimecode(seconds: number, fps = 23.976): string {
  const totalFrames = Math.round(seconds * fps);
  const f = totalFrames % Math.ceil(fps);
  const totalSec = Math.floor(totalFrames / Math.ceil(fps));
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  return (
    String(h).padStart(2, '0') + ':' +
    String(m).padStart(2, '0') + ':' +
    String(s).padStart(2, '0') + ':' +
    String(f).padStart(2, '0')
  );
}

function timecodeToSeconds(tc: string, fps = 23.976): number {
  const parts = tc.split(':').map(Number);
  if (parts.length !== 4) return 0;
  const [h, m, s, f] = parts;
  return h! * 3600 + m! * 60 + s! + f! / Math.ceil(fps);
}

// =============================================================================
//  MarkerEngine
// =============================================================================

/**
 * Avid-style marker / locator engine.
 *
 * Manages a flat list of markers that may be scoped to the sequence (TC track)
 * or to individual clips.  Provides CRUD, query, navigation, colour shortcuts,
 * spanned markers, import/export, and source-marker copy.
 */
export class MarkerEngine {
  /** Internal marker store. */
  private markers: Map<string, Marker> = new Map();
  /** General subscribers (called on any mutation). */
  private listeners = new Set<() => void>();
  /** Per-event subscribers. */
  private eventListeners = new Map<MarkerEventType, Set<MarkerEventCallback>>();

  // ─── Private helpers ────────────────────────────────────────────────────

  /** Read the current playhead position from the editor store. */
  private getPlayheadTime(): number {
    return useEditorStore.getState().playheadTime;
  }

  /** Move the editor-store playhead to a given time. */
  private setPlayheadTime(time: number): void {
    useEditorStore.getState().setPlayhead(time);
  }

  /** Get the topmost selected track ID from the editor store. */
  private getSelectedTrackId(): string | null {
    return useEditorStore.getState().selectedTrackId;
  }

  /** Notify general subscribers. */
  private notify(): void {
    this.listeners.forEach((fn) => {
      try { fn(); } catch (err) { console.error('[MarkerEngine] Subscriber error:', err); }
    });
  }

  /** Emit a typed event. */
  private emit(event: MarkerEventType, marker: Marker): void {
    const cbs = this.eventListeners.get(event);
    if (cbs) {
      cbs.forEach((cb) => {
        try { cb(marker); } catch (err) { console.error(`[MarkerEngine] Event '${event}' listener error:`, err); }
      });
    }
  }

  /** Get a sorted array of all markers by time. */
  private sortedMarkers(): Marker[] {
    return [...this.markers.values()].sort((a, b) => a.time - b.time);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Add a marker at a given time.
   *
   * @param time   Position in seconds.
   * @param options  Optional label, comment, color, trackId, clipId, endTime.
   * @returns The created Marker.
   */
  addMarker(
    time: number,
    options?: {
      label?: string;
      comment?: string;
      color?: MarkerColor;
      trackId?: string;
      clipId?: string;
      endTime?: number;
    },
  ): Marker {
    const isClipScoped = !!(options?.clipId);
    const marker: Marker = {
      id: createId('mkr'),
      time,
      endTime: options?.endTime,
      label: options?.label ?? '',
      comment: options?.comment ?? '',
      color: options?.color ?? 'yellow',
      scope: isClipScoped ? 'clip' : 'sequence',
      trackId: options?.trackId ?? null,
      clipId: options?.clipId ?? null,
      createdAt: Date.now(),
    };
    this.markers.set(marker.id, marker);
    this.emit('add', marker);
    this.notify();
    return marker;
  }

  /**
   * Add a marker at the current playhead position.
   *
   * Uses the topmost selected track from the editor store.  If no track is
   * selected the marker is placed on the sequence (TC track).
   *
   * @param options  Partial Marker overrides.
   * @returns The created Marker.
   */
  addMarkerAtPlayhead(options?: Partial<Marker>): Marker {
    const time = this.getPlayheadTime();
    const trackId = options?.trackId ?? this.getSelectedTrackId();
    return this.addMarker(time, {
      label: options?.label ?? '',
      comment: options?.comment ?? '',
      color: options?.color ?? 'yellow',
      trackId: trackId ?? undefined,
      clipId: options?.clipId ?? undefined,
      endTime: options?.endTime,
    });
  }

  /**
   * Remove a marker by ID.
   * @param markerId  The marker to remove.
   */
  removeMarker(markerId: string): void {
    const marker = this.markers.get(markerId);
    if (!marker) return;
    this.markers.delete(markerId);
    this.emit('remove', marker);
    this.notify();
  }

  /**
   * Update one or more fields of an existing marker.
   * @param markerId  The marker to update.
   * @param patch     Partial fields to merge.
   */
  updateMarker(markerId: string, patch: Partial<Marker>): void {
    const existing = this.markers.get(markerId);
    if (!existing) return;
    const updated: Marker = { ...existing, ...patch, id: markerId };
    this.markers.set(markerId, updated);
    this.emit('update', updated);
    this.notify();
  }

  /**
   * Retrieve a marker by ID.
   * @returns The Marker, or null if not found.
   */
  getMarker(markerId: string): Marker | null {
    return this.markers.get(markerId) ?? null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Query
  // ═══════════════════════════════════════════════════════════════════════════

  /** Get every marker, sorted by time. */
  getAllMarkers(): Marker[] {
    return this.sortedMarkers();
  }

  /**
   * Get markers whose position falls within [startTime, endTime].
   * A spanned marker is included if any part of its range overlaps.
   */
  getMarkersInRange(startTime: number, endTime: number): Marker[] {
    return this.sortedMarkers().filter((m) => {
      const mEnd = m.endTime ?? m.time;
      // Overlap: marker range [m.time, mEnd] intersects [startTime, endTime]
      return mEnd >= startTime && m.time <= endTime;
    });
  }

  /** Get all markers on a specific track. */
  getMarkersForTrack(trackId: string): Marker[] {
    return this.sortedMarkers().filter((m) => m.trackId === trackId);
  }

  /** Get all markers attached to a specific clip. */
  getMarkersForClip(clipId: string): Marker[] {
    return this.sortedMarkers().filter((m) => m.clipId === clipId);
  }

  /** Get all sequence-level (TC track) markers. */
  getSequenceMarkers(): Marker[] {
    return this.sortedMarkers().filter((m) => m.scope === 'sequence');
  }

  /**
   * Filter markers using multiple criteria.
   *
   * @param filter  Filter object with optional colors, scope, trackId, textSearch.
   * @returns Markers matching ALL supplied criteria.
   */
  filterMarkers(filter: MarkerFilter): Marker[] {
    return this.sortedMarkers().filter((m) => {
      if (filter.colors && filter.colors.length > 0 && !filter.colors.includes(m.color)) {
        return false;
      }
      if (filter.scope && m.scope !== filter.scope) {
        return false;
      }
      if (filter.trackId && m.trackId !== filter.trackId) {
        return false;
      }
      if (filter.textSearch) {
        const q = filter.textSearch.toLowerCase();
        const haystack = `${m.label} ${m.comment}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Navigation
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Jump to the next marker after `fromTime` (or current playhead).
   *
   * @param fromTime  Start searching from this time (defaults to playhead).
   * @returns The marker jumped to, or null if none ahead.
   */
  goToNextMarker(fromTime?: number): Marker | null {
    const t = fromTime ?? this.getPlayheadTime();
    const sorted = this.sortedMarkers();
    // Find first marker strictly after current time (with small epsilon for float imprecision)
    const next = sorted.find((m) => m.time > t + 1e-6);
    if (next) {
      this.setPlayheadTime(next.time);
      this.emit('navigate', next);
      this.notify();
    }
    return next ?? null;
  }

  /**
   * Jump to the previous marker before `fromTime` (or current playhead).
   *
   * @param fromTime  Start searching from this time (defaults to playhead).
   * @returns The marker jumped to, or null if none behind.
   */
  goToPrevMarker(fromTime?: number): Marker | null {
    const t = fromTime ?? this.getPlayheadTime();
    const sorted = this.sortedMarkers();
    // Walk backwards to find the first marker strictly before current time
    let prev: Marker | null = null;
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i]!.time < t - 1e-6) {
        prev = sorted[i]!;
        break;
      }
    }
    if (prev) {
      this.setPlayheadTime(prev.time);
      this.emit('navigate', prev);
      this.notify();
    }
    return prev;
  }

  /**
   * Jump the playhead to a specific marker.
   * @param markerId  The marker ID to navigate to.
   */
  goToMarker(markerId: string): void {
    const marker = this.markers.get(markerId);
    if (!marker) return;
    this.setPlayheadTime(marker.time);
    this.emit('navigate', marker);
    this.notify();
  }

  /**
   * Jump to the next marker of a specific colour.
   *
   * @param color     Target colour.
   * @param fromTime  Start searching from this time (defaults to playhead).
   * @returns The marker jumped to, or null.
   */
  goToNextMarkerOfColor(color: MarkerColor, fromTime?: number): Marker | null {
    const t = fromTime ?? this.getPlayheadTime();
    const sorted = this.sortedMarkers();
    const next = sorted.find((m) => m.color === color && m.time > t + 1e-6);
    if (next) {
      this.setPlayheadTime(next.time);
      this.emit('navigate', next);
      this.notify();
    }
    return next ?? null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Colour Shortcuts (Avid F5-F8 equivalents)
  // ═══════════════════════════════════════════════════════════════════════════

  /** Add a red marker at the playhead. */
  addRedMarker(): Marker {
    return this.addMarkerAtPlayhead({ color: 'red' });
  }

  /** Add a green marker at the playhead. */
  addGreenMarker(): Marker {
    return this.addMarkerAtPlayhead({ color: 'green' });
  }

  /** Add a blue marker at the playhead. */
  addBlueMarker(): Marker {
    return this.addMarkerAtPlayhead({ color: 'blue' });
  }

  /** Add a cyan marker at the playhead. */
  addCyanMarker(): Marker {
    return this.addMarkerAtPlayhead({ color: 'cyan' });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Spanned Markers
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create a spanned (range) marker between two times.
   *
   * @param startTime  Start of the range in seconds.
   * @param endTime    End of the range in seconds.
   * @param options    Partial Marker overrides.
   * @returns The created Marker.
   */
  createSpannedMarker(
    startTime: number,
    endTime: number,
    options?: Partial<Marker>,
  ): Marker {
    const effectiveStart = Math.min(startTime, endTime);
    const effectiveEnd = Math.max(startTime, endTime);
    return this.addMarker(effectiveStart, {
      label: options?.label ?? '',
      comment: options?.comment ?? '',
      color: options?.color ?? 'yellow',
      trackId: options?.trackId ?? undefined,
      clipId: options?.clipId ?? undefined,
      endTime: effectiveEnd,
    });
  }

  /**
   * Check whether a marker is spanned (has a non-trivial range).
   * @param markerId  The marker to check.
   * @returns true if spanned, false otherwise.
   */
  isSpanned(markerId: string): boolean {
    const marker = this.markers.get(markerId);
    if (!marker) return false;
    return marker.endTime !== undefined && marker.endTime > marker.time;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Import / Export
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Export all markers in the specified format.
   *
   * @param format  'csv', 'edl', or 'json'.
   * @returns Serialised marker data.
   */
  exportMarkers(format: 'csv' | 'edl' | 'json'): string {
    const all = this.sortedMarkers();

    switch (format) {
      case 'json':
        return JSON.stringify(all, null, 2);

      case 'csv': {
        const header = 'Id,Time,EndTime,Label,Comment,Color,Scope,TrackId,ClipId,Author,CreatedAt';
        const rows = all.map((m) =>
          [
            escapeCsv(m.id),
            String(m.time),
            m.endTime !== undefined ? String(m.endTime) : '',
            escapeCsv(m.label),
            escapeCsv(m.comment),
            m.color,
            m.scope,
            m.trackId ?? '',
            m.clipId ?? '',
            escapeCsv(m.author ?? ''),
            String(m.createdAt),
          ].join(','),
        );
        return [header, ...rows].join('\n');
      }

      case 'edl': {
        // Simplified CMX 3600-style EDL with marker comments
        const lines: string[] = [];
        lines.push('TITLE: MARKER EXPORT');
        lines.push('FCM: NON-DROP FRAME');
        lines.push('');
        all.forEach((m, idx) => {
          const num = String(idx + 1).padStart(3, '0');
          const tcIn = secondsToTimecode(m.time);
          const tcOut = secondsToTimecode(m.endTime ?? m.time);
          lines.push(`${num}  AX       V     C        ${tcIn} ${tcOut} ${tcIn} ${tcOut}`);
          lines.push(`* COLOR: ${m.color.toUpperCase()}`);
          if (m.label) lines.push(`* MARKER: ${m.label}`);
          if (m.comment) lines.push(`* COMMENT: ${m.comment}`);
          lines.push('');
        });
        return lines.join('\n');
      }

      default:
        return JSON.stringify(all, null, 2);
    }
  }

  /**
   * Import markers from serialised data.
   *
   * @param data    The raw string data.
   * @param format  'csv', 'edl', or 'json'.
   * @returns The array of newly created markers.
   */
  importMarkers(data: string, format: 'csv' | 'edl' | 'json'): Marker[] {
    const imported: Marker[] = [];

    switch (format) {
      case 'json': {
        let parsed: any[];
        try {
          parsed = JSON.parse(data);
        } catch {
          console.error('[MarkerEngine] Failed to parse JSON marker data');
          return [];
        }
        if (!Array.isArray(parsed)) return [];
        for (const raw of parsed) {
          const m = this.addMarker(raw.time ?? 0, {
            label: raw.label ?? '',
            comment: raw.comment ?? '',
            color: (raw.color as MarkerColor) ?? 'yellow',
            trackId: raw.trackId ?? undefined,
            clipId: raw.clipId ?? undefined,
            endTime: raw.endTime ?? undefined,
          });
          if (raw.author) this.updateMarker(m.id, { author: raw.author });
          imported.push(this.getMarker(m.id)!);
        }
        break;
      }

      case 'csv': {
        const lines = data.split('\n').filter((l) => l.trim().length > 0);
        // Skip header
        for (let i = 1; i < lines.length; i++) {
          const fields = parseCsvLine(lines[i]!);
          if (fields.length < 6) continue;
          const [, timeStr, endTimeStr, label, comment, color, , trackId, clipId, author] = fields;
          const time = parseFloat(timeStr!);
          if (isNaN(time)) continue;
          const endTime = endTimeStr ? parseFloat(endTimeStr) : undefined;
          const m = this.addMarker(time, {
            label: label ?? '',
            comment: comment ?? '',
            color: (color as MarkerColor) ?? 'yellow',
            trackId: trackId || undefined,
            clipId: clipId || undefined,
            endTime: isNaN(endTime as number) ? undefined : endTime,
          });
          if (author) this.updateMarker(m.id, { author });
          imported.push(this.getMarker(m.id)!);
        }
        break;
      }

      case 'edl': {
        const lines = data.split('\n');
        let pendingTcIn: string | null = null;
        let pendingTcOut: string | null = null;
        let pendingLabel = '';
        let pendingComment = '';
        let pendingColor: MarkerColor = 'yellow';

        const flush = () => {
          if (pendingTcIn !== null) {
            const time = timecodeToSeconds(pendingTcIn);
            const endTime = pendingTcOut ? timecodeToSeconds(pendingTcOut) : undefined;
            const m = this.addMarker(time, {
              label: pendingLabel,
              comment: pendingComment,
              color: pendingColor,
              endTime: (endTime !== undefined && endTime > time) ? endTime : undefined,
            });
            imported.push(m);
          }
          pendingTcIn = null;
          pendingTcOut = null;
          pendingLabel = '';
          pendingComment = '';
          pendingColor = 'yellow';
        };

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('TITLE:') || trimmed.startsWith('FCM:')) continue;

          // Edit line: starts with a number
          if (/^\d{3}\s/.test(trimmed)) {
            flush(); // finish previous marker
            // Extract timecodes (simplified parse: tokens 4 and 5)
            const tokens = trimmed.split(/\s+/);
            if (tokens.length >= 6) {
              pendingTcIn = tokens[4]!;
              pendingTcOut = tokens[5]!;
            }
          } else if (trimmed.startsWith('* COLOR:')) {
            const raw = trimmed.replace('* COLOR:', '').trim().toLowerCase();
            if (raw in MARKER_HEX) pendingColor = raw as MarkerColor;
          } else if (trimmed.startsWith('* MARKER:')) {
            pendingLabel = trimmed.replace('* MARKER:', '').trim();
          } else if (trimmed.startsWith('* COMMENT:')) {
            pendingComment = trimmed.replace('* COMMENT:', '').trim();
          }
        }
        flush(); // last entry
        break;
      }
    }

    return imported;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Source Marker Copy
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Copy all markers from a source clip into the sequence, offset to the
   * clip's timeline position.
   *
   * This mirrors the Avid "Add Markers to Timeline" setting: when a clip is
   * edited into the sequence, its markers are duplicated at the matching
   * timeline positions.
   *
   * @param clipId  The clip whose markers should be copied.
   */
  copySourceMarkersToSequence(clipId: string): void {
    // Find the clip in the editor store to determine its timeline offset
    const state = useEditorStore.getState();
    let targetClipStartTime = 0;
    let found = false;
    for (const track of state.tracks) {
      const clip = track.clips.find((c) => c.id === clipId);
      if (clip) {
        targetClipStartTime = clip.startTime;
        found = true;
        break;
      }
    }
    if (!found) return;

    // Get all markers attached to this clip
    const clipMarkers = this.getMarkersForClip(clipId);
    for (const m of clipMarkers) {
      this.addMarker(targetClipStartTime + m.time, {
        label: m.label,
        comment: m.comment,
        color: m.color,
        // Sequence-level: no trackId / clipId
      });
    }
  }

  /**
   * Get clip-level markers that fall at a given timeline position on a track.
   *
   * Useful for displaying clip markers in the timeline UI: converts clip-
   * relative marker times to absolute timeline positions and returns those
   * that match `time`.
   *
   * @param time     Absolute timeline position in seconds.
   * @param trackId  The track to search on.
   * @returns Markers whose absolute position matches `time` (within 0.01s).
   */
  getClipMarkersAtTimelinePosition(time: number, trackId: string): Marker[] {
    const state = useEditorStore.getState();
    const track = state.tracks.find((t) => t.id === trackId);
    if (!track) return [];

    const results: Marker[] = [];
    for (const clip of track.clips) {
      if (time < clip.startTime || time > clip.endTime) continue;
      const clipMarkers = this.getMarkersForClip(clip.id);
      for (const m of clipMarkers) {
        const absTime = clip.startTime + m.time;
        if (Math.abs(absTime - time) < 0.01) {
          results.push(m);
        }
      }
    }
    return results;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Subscribe
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Subscribe to any marker mutation.
   *
   * @param cb  Callback invoked on any add/remove/update/navigate.
   * @returns An unsubscribe function.
   */
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /**
   * Subscribe to a specific marker event type.
   *
   * @param event  One of 'add', 'remove', 'update', 'navigate'.
   * @param cb     Callback receiving the affected Marker.
   * @returns An unsubscribe function.
   */
  on(event: MarkerEventType, cb: MarkerEventCallback): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(cb);
    return () => {
      this.eventListeners.get(event)?.delete(cb);
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Cleanup
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Remove all markers and clear all subscriptions.
   * Primarily useful for tests and teardown.
   */
  dispose(): void {
    this.markers.clear();
    this.listeners.clear();
    this.eventListeners.clear();
  }
}

/** Singleton marker engine instance. */
export const markerEngine = new MarkerEngine();
