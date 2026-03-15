// =============================================================================
//  THE AVID -- OpenTimelineIO Round-Trip Engine
// =============================================================================
//
//  Implements a full OTIO import/export pipeline conforming to the OpenTimelineIO
//  specification (https://opentimeline.io). Provides:
//    - Complete OTIO schema type system with OTIO_SCHEMA versioning
//    - Export from internal editor data model to OTIO JSON
//    - Import from OTIO JSON back to editor data model
//    - Serialization / deserialization helpers
//    - Adapter stubs for future EDL, FCP XML, and AAF conversions
//
//  All OTIO objects carry "OTIO_SCHEMA" version headers matching the official
//  spec (e.g. "Timeline.1", "Clip.2", "Track.1", "RationalTime.1").
// =============================================================================

import type {
  Clip as AppClip,
  Track as AppTrack,
  Marker as AppMarker,
  TrackType,
} from '../store/editor.store';

// ─── OTIO Schema Types ──────────────────────────────────────────────────────

/**
 * Rational time representation matching OTIO's RationalTime schema.
 * Stores a value counted in ticks of `rate` per second.
 */
export interface OTIORationalTime {
  OTIO_SCHEMA: 'RationalTime.1';
  value: number;
  rate: number;
}

/**
 * A half-open time range: [start_time, start_time + duration).
 */
export interface OTIOTimeRange {
  OTIO_SCHEMA: 'TimeRange.1';
  start_time: OTIORationalTime;
  duration: OTIORationalTime;
}

/**
 * Linear time transform: maps source time to target time via offset + scale.
 */
export interface OTIOTimeTransform {
  OTIO_SCHEMA: 'TimeTransform.1';
  offset: OTIORationalTime;
  scale: number;
  rate: number;
}

// ─── Marker ─────────────────────────────────────────────────────────────────

/** Marker colour constants matching the OTIO MarkerColor enum. */
export type OTIOMarkerColor =
  | 'RED'
  | 'PINK'
  | 'ORANGE'
  | 'YELLOW'
  | 'GREEN'
  | 'CYAN'
  | 'BLUE'
  | 'PURPLE'
  | 'MAGENTA'
  | 'BLACK'
  | 'WHITE';

export interface OTIOMarker {
  OTIO_SCHEMA: 'Marker.2';
  name: string;
  color: OTIOMarkerColor;
  marked_range: OTIOTimeRange;
  metadata: Record<string, unknown>;
}

// ─── Media References ───────────────────────────────────────────────────────

export interface OTIOExternalReference {
  OTIO_SCHEMA: 'ExternalReference.1';
  target_url: string;
  available_range: OTIOTimeRange | null;
  available_image_bounds: null;
  metadata: Record<string, unknown>;
}

export interface OTIOMissingReference {
  OTIO_SCHEMA: 'MissingReference.1';
  available_range: OTIOTimeRange | null;
  available_image_bounds: null;
  metadata: Record<string, unknown>;
}

export interface OTIOGeneratorReference {
  OTIO_SCHEMA: 'GeneratorReference.1';
  generator_kind: string;
  parameters: Record<string, unknown>;
  available_range: OTIOTimeRange | null;
  available_image_bounds: null;
  metadata: Record<string, unknown>;
}

export type OTIOMediaReference =
  | OTIOExternalReference
  | OTIOMissingReference
  | OTIOGeneratorReference;

// ─── Effects ────────────────────────────────────────────────────────────────

export interface OTIOEffect {
  OTIO_SCHEMA: 'Effect.1';
  name: string;
  effect_name: string;
  metadata: Record<string, unknown>;
}

export interface OTIOLinearTimeWarp {
  OTIO_SCHEMA: 'LinearTimeWarp.1';
  name: string;
  effect_name: string;
  time_scalar: number;
  metadata: Record<string, unknown>;
}

export interface OTIOFreezeFrame {
  OTIO_SCHEMA: 'FreezeFrame.1';
  name: string;
  effect_name: string;
  time_scalar: 0;
  metadata: Record<string, unknown>;
}

export type OTIOEffectType = OTIOEffect | OTIOLinearTimeWarp | OTIOFreezeFrame;

// ─── Composable Items (children of a Track) ─────────────────────────────────

export interface OTIOClip {
  OTIO_SCHEMA: 'Clip.2';
  name: string;
  source_range: OTIOTimeRange | null;
  media_reference: OTIOMediaReference;
  effects: OTIOEffectType[];
  markers: OTIOMarker[];
  enabled: boolean;
  metadata: Record<string, unknown>;
}

export interface OTIOGap {
  OTIO_SCHEMA: 'Gap.1';
  name: string;
  source_range: OTIOTimeRange;
  effects: OTIOEffectType[];
  markers: OTIOMarker[];
  enabled: boolean;
  metadata: Record<string, unknown>;
}

export interface OTIOTransition {
  OTIO_SCHEMA: 'Transition.1';
  name: string;
  transition_type: string;
  in_offset: OTIORationalTime;
  out_offset: OTIORationalTime;
  metadata: Record<string, unknown>;
}

export type OTIOComposable = OTIOClip | OTIOGap | OTIOTransition;

// ─── Track ──────────────────────────────────────────────────────────────────

/** OTIO track kind mirrors the spec's string enum. */
export type OTIOTrackKind = 'Video' | 'Audio';

export interface OTIOTrack {
  OTIO_SCHEMA: 'Track.1';
  name: string;
  kind: OTIOTrackKind;
  children: OTIOComposable[];
  source_range: OTIOTimeRange | null;
  effects: OTIOEffectType[];
  markers: OTIOMarker[];
  enabled: boolean;
  metadata: Record<string, unknown>;
}

// ─── Stack & Timeline ───────────────────────────────────────────────────────

export interface OTIOStack {
  OTIO_SCHEMA: 'Stack.1';
  name: string;
  children: OTIOTrack[];
  source_range: OTIOTimeRange | null;
  effects: OTIOEffectType[];
  markers: OTIOMarker[];
  enabled: boolean;
  metadata: Record<string, unknown>;
}

export interface OTIOTimeline {
  OTIO_SCHEMA: 'Timeline.1';
  name: string;
  global_start_time: OTIORationalTime | null;
  tracks: OTIOStack;
  metadata: Record<string, unknown>;
}

// ─── Helpers: RationalTime / TimeRange constructors ─────────────────────────

/**
 * Create an OTIORationalTime from a value and rate.
 * @param value  Tick count (e.g. frame number, or seconds * rate).
 * @param rate   Timebase in ticks-per-second (e.g. 24, 29.97, 48000).
 */
export function rationalTime(value: number, rate: number): OTIORationalTime {
  return { OTIO_SCHEMA: 'RationalTime.1', value, rate };
}

/**
 * Create an OTIOTimeRange from start time and duration.
 */
export function timeRange(
  startTime: OTIORationalTime,
  duration: OTIORationalTime,
): OTIOTimeRange {
  return { OTIO_SCHEMA: 'TimeRange.1', start_time: startTime, duration };
}

/**
 * Create a TimeTransform.
 */
export function timeTransform(
  offset: OTIORationalTime,
  scale: number,
  rate: number,
): OTIOTimeTransform {
  return { OTIO_SCHEMA: 'TimeTransform.1', offset, scale, rate };
}

/**
 * Convert seconds to RationalTime at a given frame rate.
 * Values are rounded to the nearest frame.
 */
function secondsToRational(seconds: number, rate: number): OTIORationalTime {
  return rationalTime(Math.round(seconds * rate), rate);
}

/**
 * Convert a RationalTime back to seconds.
 */
function rationalToSeconds(rt: OTIORationalTime): number {
  if (rt.rate === 0) return 0;
  return rt.value / rt.rate;
}

// ─── Colour mapping ─────────────────────────────────────────────────────────

/** Map CSS/hex colour strings to the closest OTIO MarkerColor enum value. */
function cssColorToOTIOMarkerColor(color: string): OTIOMarkerColor {
  const lower = color.toLowerCase().replace(/[^a-z]/g, '');
  const map: Record<string, OTIOMarkerColor> = {
    red: 'RED',
    pink: 'PINK',
    orange: 'ORANGE',
    yellow: 'YELLOW',
    green: 'GREEN',
    cyan: 'CYAN',
    blue: 'BLUE',
    purple: 'PURPLE',
    magenta: 'MAGENTA',
    black: 'BLACK',
    white: 'WHITE',
  };
  if (map[lower]) return map[lower];

  // Hex colour heuristic: parse hue from hex and bucket into closest named colour
  if (color.startsWith('#') && color.length >= 7) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);

    // Achromatic
    if (max - min < 30) {
      return max < 80 ? 'BLACK' : max > 200 ? 'WHITE' : 'GREEN';
    }

    let hue = 0;
    if (max === r) hue = ((g - b) / (max - min)) * 60;
    else if (max === g) hue = (2 + (b - r) / (max - min)) * 60;
    else hue = (4 + (r - g) / (max - min)) * 60;
    if (hue < 0) hue += 360;

    if (hue < 15) return 'RED';
    if (hue < 45) return 'ORANGE';
    if (hue < 75) return 'YELLOW';
    if (hue < 165) return 'GREEN';
    if (hue < 195) return 'CYAN';
    if (hue < 255) return 'BLUE';
    if (hue < 285) return 'PURPLE';
    if (hue < 330) return 'MAGENTA';
    return 'RED';
  }

  return 'GREEN'; // fallback
}

/** Map an OTIO MarkerColor to a hex CSS colour for the app. */
function otioMarkerColorToCSS(color: OTIOMarkerColor): string {
  const map: Record<OTIOMarkerColor, string> = {
    RED: '#ff4444',
    PINK: '#ff69b4',
    ORANGE: '#ff8c00',
    YELLOW: '#ffd700',
    GREEN: '#22c55e',
    CYAN: '#00bcd4',
    BLUE: '#3b82f6',
    PURPLE: '#8b5cf6',
    MAGENTA: '#d946ef',
    BLACK: '#1a1a1a',
    WHITE: '#f5f5f5',
  };
  return map[color] ?? '#22c55e';
}

// ─── Track type mapping ─────────────────────────────────────────────────────

function appTrackTypeToOTIOKind(type: TrackType): OTIOTrackKind {
  switch (type) {
    case 'VIDEO':
    case 'EFFECT':
    case 'SUBTITLE':
    case 'GRAPHIC':
      return 'Video';
    case 'AUDIO':
      return 'Audio';
    default:
      return 'Video';
  }
}

function otioKindToAppTrackType(kind: OTIOTrackKind): TrackType {
  return kind === 'Audio' ? 'AUDIO' : 'VIDEO';
}

// ─── Export ─────────────────────────────────────────────────────────────────

/**
 * Compute the effective speed scalar from time-remap keyframes.
 * Returns 1.0 for standard speed, 0 for freeze frames, or the linear ratio
 * derived from the first two keyframes.
 */
function computeTimeScalar(clip: AppClip): number {
  if (!clip.timeRemap.enabled || clip.timeRemap.keyframes.length < 2) {
    return 1.0;
  }

  const kf = clip.timeRemap.keyframes;
  const first = kf[0];
  const last = kf[kf.length - 1];
  const timelineDelta = last!.timelineTime! - first!.timelineTime!;
  const sourceDelta = last!.sourceTime! - first!.sourceTime!;

  if (timelineDelta === 0) return 1.0;
  if (sourceDelta === 0) return 0; // freeze

  return sourceDelta / timelineDelta;
}

/**
 * Build OTIO effects list from an app clip's properties.
 * Includes a LinearTimeWarp when the clip has non-unity speed, or a
 * FreezeFrame when the speed scalar is zero.
 */
function buildClipEffects(clip: AppClip): OTIOEffectType[] {
  const effects: OTIOEffectType[] = [];
  const scalar = computeTimeScalar(clip);

  if (scalar === 0) {
    effects.push({
      OTIO_SCHEMA: 'FreezeFrame.1',
      name: 'FreezeFrame',
      effect_name: 'FreezeFrame',
      time_scalar: 0,
      metadata: {},
    });
  } else if (Math.abs(scalar - 1.0) > 0.001) {
    effects.push({
      OTIO_SCHEMA: 'LinearTimeWarp.1',
      name: 'LinearTimeWarp',
      effect_name: 'LinearTimeWarp',
      time_scalar: scalar,
      metadata: {},
    });
  }

  return effects;
}

/**
 * Convert a single app Clip to an OTIOClip with media reference and effects.
 */
function appClipToOTIO(clip: AppClip, frameRate: number): OTIOClip {
  const duration = clip.endTime - clip.startTime;
  const sourceRange = timeRange(
    secondsToRational(clip.trimStart, frameRate),
    secondsToRational(duration, frameRate),
  );

  const mediaReference: OTIOMediaReference = clip.assetId
    ? {
        OTIO_SCHEMA: 'ExternalReference.1',
        target_url: clip.assetId,
        available_range: timeRange(
          secondsToRational(0, frameRate),
          secondsToRational(clip.trimStart + duration + clip.trimEnd, frameRate),
        ),
        available_image_bounds: null,
        metadata: {},
      }
    : {
        OTIO_SCHEMA: 'MissingReference.1',
        available_range: null,
        available_image_bounds: null,
        metadata: {},
      };

  return {
    OTIO_SCHEMA: 'Clip.2',
    name: clip.name,
    source_range: sourceRange,
    media_reference: mediaReference,
    effects: buildClipEffects(clip),
    markers: [],
    enabled: true,
    metadata: {
      'the-avid': {
        clipId: clip.id,
        trackId: clip.trackId,
        type: clip.type,
        color: clip.color ?? null,
        intrinsicVideo: clip.intrinsicVideo,
        intrinsicAudio: clip.intrinsicAudio,
        timeRemap: clip.timeRemap,
      },
    },
  };
}

/**
 * Convert an app Marker to an OTIOMarker.
 * Markers are given a zero-duration range at the marker time.
 */
function appMarkerToOTIO(marker: AppMarker, frameRate: number): OTIOMarker {
  return {
    OTIO_SCHEMA: 'Marker.2',
    name: marker.label,
    color: cssColorToOTIOMarkerColor(marker.color),
    marked_range: timeRange(
      secondsToRational(marker.time, frameRate),
      rationalTime(0, frameRate),
    ),
    metadata: {
      'the-avid': {
        markerId: marker.id,
        originalColor: marker.color,
      },
    },
  };
}

/**
 * Build the list of OTIO composable items for a single track.
 * Inserts Gap items to fill spaces between clips so that the track's
 * children form a contiguous timeline.
 */
function buildTrackChildren(
  clips: AppClip[],
  frameRate: number,
): OTIOComposable[] {
  const sorted = [...clips].sort((a, b) => a.startTime - b.startTime);
  const children: OTIOComposable[] = [];
  let cursor = 0;

  for (const clip of sorted) {
    // Insert a gap if there is dead space before this clip
    if (clip.startTime > cursor + 1e-6) {
      const gapDuration = clip.startTime - cursor;
      children.push({
        OTIO_SCHEMA: 'Gap.1',
        name: '',
        source_range: timeRange(
          rationalTime(0, frameRate),
          secondsToRational(gapDuration, frameRate),
        ),
        effects: [],
        markers: [],
        enabled: true,
        metadata: {},
      });
    }

    children.push(appClipToOTIO(clip, frameRate));
    cursor = clip.endTime;
  }

  return children;
}

/**
 * Convert an app Track to an OTIOTrack, including gap insertion.
 */
function appTrackToOTIO(track: AppTrack, frameRate: number): OTIOTrack {
  return {
    OTIO_SCHEMA: 'Track.1',
    name: track.name,
    kind: appTrackTypeToOTIOKind(track.type),
    children: buildTrackChildren(track.clips, frameRate),
    source_range: null,
    effects: [],
    markers: [],
    enabled: !track.muted,
    metadata: {
      'the-avid': {
        trackId: track.id,
        type: track.type,
        sortOrder: track.sortOrder,
        locked: track.locked,
        solo: track.solo,
        volume: track.volume,
        color: track.color,
      },
    },
  };
}

/**
 * Export the full app timeline state to an OTIOTimeline.
 *
 * @param tracks      Array of app Tracks (from the editor store).
 * @param markers     Array of app Markers (from the editor store).
 * @param projectName Human-readable project name for the timeline.
 * @param frameRate   Timeline frame rate (default 24).
 * @returns A fully formed OTIOTimeline object ready for serialization.
 *
 * @example
 * const otio = exportToOTIO(
 *   editorStore.getState().tracks,
 *   editorStore.getState().markers,
 *   'My Project',
 *   23.976,
 * );
 * const json = serializeOTIO(otio);
 */
export function exportToOTIO(
  tracks: AppTrack[],
  markers: AppMarker[],
  projectName: string,
  frameRate: number = 24,
): OTIOTimeline {
  // Sort tracks by sortOrder so the stack ordering is stable
  const sortedTracks = [...tracks].sort((a, b) => a.sortOrder - b.sortOrder);

  // Convert all timeline markers into OTIO markers for the Stack
  const otioMarkers = markers.map((m) => appMarkerToOTIO(m, frameRate));

  const stack: OTIOStack = {
    OTIO_SCHEMA: 'Stack.1',
    name: 'Tracks',
    children: sortedTracks.map((t) => appTrackToOTIO(t, frameRate)),
    source_range: null,
    effects: [],
    markers: otioMarkers,
    enabled: true,
    metadata: {},
  };

  return {
    OTIO_SCHEMA: 'Timeline.1',
    name: projectName,
    global_start_time: rationalTime(0, frameRate),
    tracks: stack,
    metadata: {
      'the-avid': {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        frameRate,
      },
    },
  };
}

// ─── Import ─────────────────────────────────────────────────────────────────

/** Result of importing an OTIO file into app-native data structures. */
export interface OTIOImportResult {
  projectName: string;
  frameRate: number;
  tracks: AppTrack[];
  markers: AppMarker[];
}

/** Generate a compact random ID for imported objects. */
function generateId(): string {
  return `otio_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Derive the effective speed scalar from an OTIO clip's effects array.
 * Returns 1.0 (normal speed) if no time-warp effect is present.
 */
function extractTimeScalar(effects: OTIOEffectType[]): number {
  for (const effect of effects) {
    if (
      effect.OTIO_SCHEMA === 'FreezeFrame.1' ||
      effect.OTIO_SCHEMA === 'LinearTimeWarp.1'
    ) {
      return effect.time_scalar;
    }
  }
  return 1.0;
}

/**
 * Convert a single OTIOClip back to an app Clip.
 *
 * @param otioClip  The OTIO clip to import.
 * @param trackId   The parent track ID.
 * @param startTime The absolute start position on the timeline in seconds.
 * @param defaults  Default intrinsic values to merge for new clips.
 */
function otioClipToApp(
  otioClip: OTIOClip,
  trackId: string,
  startTime: number,
): AppClip {
  const meta = (otioClip.metadata?.['the-avid'] ?? {}) as Record<string, any>;

  // Extract source range
  const sourceStart = otioClip.source_range
    ? rationalToSeconds(otioClip.source_range.start_time)
    : 0;
  const duration = otioClip.source_range
    ? rationalToSeconds(otioClip.source_range.duration)
    : 0;

  // Compute trimEnd from available_range if present
  let trimEnd = 0;
  const ref = otioClip.media_reference;
  if (ref && 'available_range' in ref && ref.available_range) {
    const availableDuration = rationalToSeconds(ref.available_range.duration);
    trimEnd = Math.max(0, availableDuration - sourceStart - duration);
  }

  // Determine clip type from metadata or media reference
  const clipType: AppClip['type'] = meta['type'] ?? 'video';

  // Resolve asset URL from external reference
  let assetId: string | undefined;
  if (ref?.OTIO_SCHEMA === 'ExternalReference.1') {
    assetId = ref.target_url;
  }

  // Check for time-warp effects
  const timeScalar = extractTimeScalar(otioClip.effects);
  const hasTimeWarp = Math.abs(timeScalar - 1.0) > 0.001 || timeScalar === 0;

  // Use round-trip metadata if available, otherwise build defaults
  const intrinsicVideo = meta['intrinsicVideo'] ?? {
    opacity: 100,
    scaleX: 100,
    scaleY: 100,
    positionX: 0,
    positionY: 0,
    rotation: 0,
    anchorX: 0,
    anchorY: 0,
  };

  const intrinsicAudio = meta['intrinsicAudio'] ?? {
    volume: 0,
    pan: 0,
  };

  const timeRemap = meta['timeRemap'] ?? {
    enabled: hasTimeWarp,
    keyframes: hasTimeWarp
      ? [
          {
            timelineTime: 0,
            sourceTime: 0,
            interpolation: 'linear' as const,
          },
          {
            timelineTime: duration,
            sourceTime: duration * timeScalar,
            interpolation: 'linear' as const,
          },
        ]
      : [],
    frameBlending: 'frame-mix' as const,
    pitchCorrection: true,
  };

  return {
    id: meta['clipId'] ?? generateId(),
    trackId,
    name: otioClip.name || 'Untitled Clip',
    startTime,
    endTime: startTime + duration,
    trimStart: sourceStart,
    trimEnd,
    type: clipType,
    color: meta['color'] ?? undefined,
    assetId,
    intrinsicVideo,
    intrinsicAudio,
    timeRemap,
  };
}

/**
 * Walk a single OTIOTrack's children, converting clips and accumulating
 * timeline position through gaps and transitions.
 */
function importTrackChildren(
  children: OTIOComposable[],
  trackId: string,
): AppClip[] {
  const clips: AppClip[] = [];
  let cursor = 0;

  for (const child of children) {
    switch (child.OTIO_SCHEMA) {
      case 'Clip.2': {
        const clip = otioClipToApp(child, trackId, cursor);
        clips.push(clip);
        const duration = child.source_range
          ? rationalToSeconds(child.source_range.duration)
          : 0;
        cursor += duration;
        break;
      }

      case 'Gap.1': {
        // Advance cursor by the gap duration
        const gapDuration = rationalToSeconds(child.source_range.duration);
        cursor += gapDuration;
        break;
      }

      case 'Transition.1': {
        // Transitions overlap with adjacent clips; their offsets describe
        // how much they eat into the previous/next item. For import we
        // simply note the transition exists -- the cursor stays unchanged
        // because the transition region overlaps the surrounding items.
        break;
      }

      default:
        // Unknown composable type -- skip it
        break;
    }
  }

  return clips;
}

/**
 * Convert an OTIOTrack to an app Track.
 */
function otioTrackToApp(
  otioTrack: OTIOTrack,
  index: number,
): AppTrack {
  const meta = (otioTrack.metadata?.['the-avid'] ?? {}) as Record<string, any>;
  const trackId = meta['trackId'] ?? generateId();

  const appType: TrackType = meta['type'] ?? otioKindToAppTrackType(otioTrack.kind);

  const clips = importTrackChildren(otioTrack.children, trackId);

  return {
    id: trackId,
    name: otioTrack.name || `Track ${index + 1}`,
    type: appType,
    sortOrder: meta['sortOrder'] ?? index,
    muted: !otioTrack.enabled,
    locked: meta['locked'] ?? false,
    solo: meta['solo'] ?? false,
    volume: meta['volume'] ?? 100,
    clips,
    color: meta['color'] ?? '#3b82f6',
  };
}

/**
 * Convert OTIO Stack-level markers back to app Markers.
 */
function importMarkers(otioMarkers: OTIOMarker[]): AppMarker[] {
  return otioMarkers.map((m) => {
    const meta = (m.metadata?.['the-avid'] ?? {}) as Record<string, any>;
    return {
      id: meta['markerId'] ?? generateId(),
      time: rationalToSeconds(m.marked_range.start_time),
      label: m.name,
      color: meta['originalColor'] ?? otioMarkerColorToCSS(m.color),
    };
  });
}

/**
 * Import an OTIO JSON object (parsed) into app-native data structures.
 *
 * Handles the full OTIO hierarchy: Timeline -> Stack -> Track -> Clip/Gap/Transition.
 * Gaps become empty space between clips. Transitions are noted but do not
 * displace clips. LinearTimeWarp and FreezeFrame effects are converted to
 * the app's TimeRemap system.
 *
 * @param json  The parsed OTIO object (must have OTIO_SCHEMA: "Timeline.1").
 * @returns     An OTIOImportResult containing tracks, markers, and metadata.
 * @throws      Error if the root object is not a valid OTIO Timeline.
 *
 * @example
 * const result = importFromOTIO(JSON.parse(otioJsonString));
 * editorStore.getState().setTracks(result.tracks);
 */
export function importFromOTIO(json: unknown): OTIOImportResult {
  if (!json || typeof json !== 'object') {
    throw new Error('[OTIOEngine] Input is not a valid object.');
  }

  const root = json as Record<string, any>;

  // Validate top-level schema
  if (
    !root['OTIO_SCHEMA'] ||
    !root['OTIO_SCHEMA'].startsWith('Timeline.')
  ) {
    throw new Error(
      `[OTIOEngine] Expected root OTIO_SCHEMA "Timeline.1", got "${root['OTIO_SCHEMA'] ?? 'none'}".`,
    );
  }

  const timeline = root as OTIOTimeline;

  // Determine frame rate from global_start_time or metadata
  const frameRate =
    timeline.global_start_time?.rate ??
    (timeline.metadata?.['the-avid'] as Record<string, any>)?.['frameRate'] ??
    24;

  // Import tracks from the Stack
  const stack = timeline.tracks;
  if (!stack || !Array.isArray(stack.children)) {
    throw new Error('[OTIOEngine] Timeline.tracks.children is missing or not an array.');
  }

  const tracks: AppTrack[] = stack.children.map((otioTrack: OTIOTrack, idx: number) =>
    otioTrackToApp(otioTrack, idx),
  );

  // Import markers from the Stack level
  const markers: AppMarker[] = importMarkers(stack.markers ?? []);

  return {
    projectName: timeline.name || 'Untitled',
    frameRate,
    tracks,
    markers,
  };
}

// ─── Serialization ──────────────────────────────────────────────────────────

/**
 * Serialize an OTIOTimeline to a JSON string suitable for .otio file output.
 *
 * @param otioTimeline The timeline to serialize.
 * @param pretty       Whether to format with indentation (default true).
 * @returns            A JSON string conforming to the OTIO file format.
 *
 * @example
 * const json = serializeOTIO(timeline);
 * // Write `json` to a .otio file
 */
export function serializeOTIO(
  otioTimeline: OTIOTimeline,
  pretty: boolean = true,
): string {
  return JSON.stringify(otioTimeline, null, pretty ? 2 : undefined);
}

/**
 * Deserialize a JSON string into an OTIO object and validate it.
 *
 * @param jsonStr  The raw JSON string from an .otio file.
 * @returns        The parsed OTIOTimeline.
 * @throws         Error if the string is not valid JSON or not an OTIO Timeline.
 *
 * @example
 * const timeline = deserializeOTIO(fs.readFileSync('project.otio', 'utf-8'));
 */
export function deserializeOTIO(jsonStr: string): OTIOTimeline {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    throw new Error(
      `[OTIOEngine] Failed to parse JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const root = parsed as Record<string, any>;
  if (!root?.['OTIO_SCHEMA']?.startsWith('Timeline.')) {
    throw new Error(
      `[OTIOEngine] Root OTIO_SCHEMA is not a Timeline (got "${root?.['OTIO_SCHEMA'] ?? 'none'}").`,
    );
  }

  return root as OTIOTimeline;
}

// ─── Adapter Stubs ──────────────────────────────────────────────────────────

/**
 * Adapter registry for converting between OTIO and third-party timeline formats.
 * Each adapter provides `toOTIO` and `fromOTIO` hooks. Currently all adapters
 * are stubs that throw "not yet implemented" errors; they serve as extension
 * points for future format support.
 */

export interface OTIOAdapter {
  /** Human-readable adapter name. */
  readonly name: string;
  /** File extension(s) this adapter handles (e.g. ['.edl', '.EDL']). */
  readonly extensions: string[];
  /** Convert external format data to an OTIOTimeline. */
  toOTIO(data: string): OTIOTimeline;
  /** Convert an OTIOTimeline to the external format string. */
  fromOTIO(timeline: OTIOTimeline): string;
}

/** CMX 3600 Edit Decision List adapter (stub). */
export const edlAdapter: OTIOAdapter = {
  name: 'CMX 3600 EDL',
  extensions: ['.edl'],
  toOTIO(_data: string): OTIOTimeline {
    throw new Error('[OTIOEngine] EDL import adapter is not yet implemented.');
  },
  fromOTIO(_timeline: OTIOTimeline): string {
    throw new Error('[OTIOEngine] EDL export adapter is not yet implemented.');
  },
};

/** Final Cut Pro XML (FCPXML) adapter (stub). */
export const fcpxmlAdapter: OTIOAdapter = {
  name: 'Final Cut Pro XML',
  extensions: ['.fcpxml', '.xml'],
  toOTIO(_data: string): OTIOTimeline {
    throw new Error('[OTIOEngine] FCP XML import adapter is not yet implemented.');
  },
  fromOTIO(_timeline: OTIOTimeline): string {
    throw new Error('[OTIOEngine] FCP XML export adapter is not yet implemented.');
  },
};

/** Avid Log Exchange (ALE) adapter (stub). */
export const aleAdapter: OTIOAdapter = {
  name: 'Avid Log Exchange',
  extensions: ['.ale'],
  toOTIO(_data: string): OTIOTimeline {
    throw new Error('[OTIOEngine] ALE import adapter is not yet implemented.');
  },
  fromOTIO(_timeline: OTIOTimeline): string {
    throw new Error('[OTIOEngine] ALE export adapter is not yet implemented.');
  },
};

/** Advanced Authoring Format (AAF) adapter (stub). */
export const aafAdapter: OTIOAdapter = {
  name: 'Advanced Authoring Format',
  extensions: ['.aaf'],
  toOTIO(_data: string): OTIOTimeline {
    throw new Error('[OTIOEngine] AAF import adapter is not yet implemented.');
  },
  fromOTIO(_timeline: OTIOTimeline): string {
    throw new Error('[OTIOEngine] AAF export adapter is not yet implemented.');
  },
};

/** Registry of all known adapters, keyed by primary extension. */
export const adapterRegistry: Record<string, OTIOAdapter> = {
  '.edl': edlAdapter,
  '.fcpxml': fcpxmlAdapter,
  '.xml': fcpxmlAdapter,
  '.ale': aleAdapter,
  '.aaf': aafAdapter,
};

/**
 * Find an adapter that handles the given file extension.
 *
 * @param extension  File extension including the dot (e.g. ".edl").
 * @returns          The matching adapter, or undefined if none found.
 *
 * @example
 * const adapter = getAdapterForExtension('.edl');
 * if (adapter) {
 *   const timeline = adapter.toOTIO(edlString);
 * }
 */
export function getAdapterForExtension(extension: string): OTIOAdapter | undefined {
  return adapterRegistry[extension.toLowerCase()];
}

/**
 * List all registered adapter names and their supported extensions.
 *
 * @returns Array of adapter descriptions.
 */
export function listAdapters(): Array<{ name: string; extensions: string[] }> {
  const seen = new Set<string>();
  const result: Array<{ name: string; extensions: string[] }> = [];

  for (const adapter of Object.values(adapterRegistry)) {
    if (!seen.has(adapter.name)) {
      seen.add(adapter.name);
      result.push({ name: adapter.name, extensions: [...adapter.extensions] });
    }
  }

  return result;
}
