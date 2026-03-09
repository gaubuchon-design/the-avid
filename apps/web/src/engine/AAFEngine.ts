// =============================================================================
//  THE AVID -- AAF Import/Export Engine
//  Advanced Authoring Format (AAF) interchange for professional NLE workflows.
//  Follows AMWA AS-01 AAF Edit Protocol constraints for interoperability.
// =============================================================================

import type {
  Track,
  TrackType,
  Clip,
  Marker,
  ProjectSettings,
  IntrinsicVideoProps,
  IntrinsicAudioProps,
  TimeRemapState,
} from '../store/editor.store';
import {
  DEFAULT_INTRINSIC_VIDEO,
  DEFAULT_INTRINSIC_AUDIO,
  DEFAULT_TIME_REMAP,
} from '../store/editor.store';

// =============================================================================
//  AAF Object Model Types
// =============================================================================

// ─── Enumerations ────────────────────────────────────────────────────────────

/** AAF edit rate expressed as a rational number (numerator/denominator). */
export interface AAFRational {
  numerator: number;
  denominator: number;
}

/** AAF mob kind discriminator. */
export type AAFMobKind = 'CompositionMob' | 'MasterMob' | 'SourceMob';

/** AAF data definition (the kind of essence on a track). */
export type AAFDataDefinition =
  | 'Picture'
  | 'Sound'
  | 'Timecode'
  | 'DescriptiveMetadata'
  | 'Auxiliary'
  | 'Edgecode';

/** Transition cut point placement relative to the edit boundary. */
export type AAFCutPoint = 'before' | 'after' | 'center';

/** AAF effect parameter interpolation kind. */
export type AAFInterpolation = 'ConstantInterp' | 'LinearInterp' | 'BezierInterp';

/** AAF essence descriptor codec flavour. */
export type AAFCodecFlavour =
  | 'AAF_CMPR_AVIDJFIF'
  | 'AAF_CMPR_AVIDDV'
  | 'AAF_CMPR_AVIDDNXHD'
  | 'AAF_CMPR_PRORES'
  | 'AAF_CMPR_H264'
  | 'AAF_CMPR_NONE';

/** Container format for the essence. */
export type AAFContainerFormat = 'AAF' | 'MXF' | 'QuickTime' | 'WAVE' | 'AIFF' | 'External';

// ─── Core AAF objects ────────────────────────────────────────────────────────

/**
 * A universally unique identifier used throughout AAF to reference objects.
 * Represented as a standard UUID string for serialisation convenience.
 */
export type AAFUID = string;

/** An AAF timecode value. */
export interface AAFTimecode {
  startTimecode: number;
  frameRate: number;
  dropFrame: boolean;
}

/** A single parameter value or keyframe entry for an AAF operation group. */
export interface AAFParameter {
  name: string;
  typeDefinition: string;
  interpolation: AAFInterpolation;
  value: number | string | boolean;
}

/** A varying (animated) parameter with keyframe control points. */
export interface AAFVaryingValue {
  parameterName: string;
  interpolation: AAFInterpolation;
  controlPoints: AAFControlPoint[];
}

/** A single control point in a varying value curve. */
export interface AAFControlPoint {
  time: AAFRational;
  value: number;
  editHint?: 'proportional' | 'relative' | 'constant';
  tangents?: {
    inTangent: { x: number; y: number };
    outTangent: { x: number; y: number };
  };
}

/** A media reference describing the location and format of source essence. */
export interface AAFEssenceDescriptor {
  uid: AAFUID;
  codec: AAFCodecFlavour;
  containerFormat: AAFContainerFormat;
  sampleRate: AAFRational;
  length: number;
  /** For picture essence. */
  storedWidth?: number;
  storedHeight?: number;
  frameLayout?: 'FullFrame' | 'SeparateFields' | 'MixedFields';
  /** For sound essence. */
  channelCount?: number;
  quantizationBits?: number;
  /** External file path or URL, if applicable. */
  locator?: string;
}

/** A source reference pointing from a composition to a master/source mob. */
export interface AAFSourceReference {
  sourceID: AAFUID;
  sourceTrackID: number;
  startTime: number;
  length: number;
}

// ─── Segment types ───────────────────────────────────────────────────────────

/**
 * Base for all AAF segment sub-types that can appear in a sequence.
 * The `kind` discriminator allows safe narrowing.
 */
export type AAFSegment =
  | AAFSourceClip
  | AAFFiller
  | AAFTransition
  | AAFNestedScope
  | AAFOperationGroup
  | AAFScopeReference
  | AAFTimecodeSegment;

/** A source clip referencing essence through a mob chain. */
export interface AAFSourceClip {
  kind: 'SourceClip';
  uid: AAFUID;
  dataDefinition: AAFDataDefinition;
  length: number;
  sourceReference: AAFSourceReference;
  /** User-facing clip name. */
  name?: string;
  /** Marks carried on this clip. */
  userComments?: AAFUserComment[];
}

/** An empty filler (gap) in the timeline. */
export interface AAFFiller {
  kind: 'Filler';
  uid: AAFUID;
  dataDefinition: AAFDataDefinition;
  length: number;
}

/** A transition between two adjacent source clips. */
export interface AAFTransition {
  kind: 'Transition';
  uid: AAFUID;
  dataDefinition: AAFDataDefinition;
  length: number;
  cutPoint: number;
  operationGroup: AAFOperationGroup;
}

/** An operation group wrapping an effect with parameters and input segments. */
export interface AAFOperationGroup {
  kind: 'OperationGroup';
  uid: AAFUID;
  dataDefinition: AAFDataDefinition;
  length: number;
  operationDefinition: AAFEffectDefinition;
  parameters: AAFParameter[];
  varyingParameters: AAFVaryingValue[];
  inputSegments: AAFSegment[];
}

/** A nested scope allowing parallel tracks inside a single track. */
export interface AAFNestedScope {
  kind: 'NestedScope';
  uid: AAFUID;
  dataDefinition: AAFDataDefinition;
  length: number;
  slots: AAFSequence[];
}

/** A reference to a slot in an enclosing scope. */
export interface AAFScopeReference {
  kind: 'ScopeReference';
  uid: AAFUID;
  dataDefinition: AAFDataDefinition;
  length: number;
  relativeScope: number;
  relativeSlot: number;
}

/** A timecode segment carried on a timecode track. */
export interface AAFTimecodeSegment {
  kind: 'Timecode';
  uid: AAFUID;
  dataDefinition: 'Timecode';
  length: number;
  timecode: AAFTimecode;
}

// ─── Track-level structures ──────────────────────────────────────────────────

/** A sequence: an ordered list of segments on a single track. */
export interface AAFSequence {
  uid: AAFUID;
  dataDefinition: AAFDataDefinition;
  segments: AAFSegment[];
}

/** A timeline mob slot (track) with an edit rate and sequence. */
export interface AAFTimelineMobSlot {
  uid: AAFUID;
  slotID: number;
  slotName: string;
  editRate: AAFRational;
  origin: number;
  sequence: AAFSequence;
  /** Physical track number (for AS-01 compliance). */
  physicalTrackNumber?: number;
  /** Marks on the track. */
  userComments?: AAFUserComment[];
}

/** An event mob slot (for markers / locators). */
export interface AAFEventMobSlot {
  uid: AAFUID;
  slotID: number;
  slotName: string;
  editRate: AAFRational;
  events: AAFDescriptiveMarker[];
}

// ─── Mob-level structures ────────────────────────────────────────────────────

/** A composition mob: the top-level timeline or sub-composition. */
export interface AAFCompositionMob {
  uid: AAFUID;
  mobKind: 'CompositionMob';
  name: string;
  creationTime: string;
  lastModified: string;
  usageCode?: string;
  timelineSlots: AAFTimelineMobSlot[];
  eventSlots: AAFEventMobSlot[];
  userComments: AAFUserComment[];
}

/** A master mob bridging the composition to physical media. */
export interface AAFMasterMob {
  uid: AAFUID;
  mobKind: 'MasterMob';
  name: string;
  creationTime: string;
  lastModified: string;
  timelineSlots: AAFTimelineMobSlot[];
  userComments: AAFUserComment[];
}

/** A source (file) mob describing the physical essence. */
export interface AAFSourceMob {
  uid: AAFUID;
  mobKind: 'SourceMob';
  name: string;
  creationTime: string;
  lastModified: string;
  essenceDescriptor: AAFEssenceDescriptor;
  timelineSlots: AAFTimelineMobSlot[];
}

/** Union of all mob types. */
export type AAFMob = AAFCompositionMob | AAFMasterMob | AAFSourceMob;

// ─── Effect definitions ──────────────────────────────────────────────────────

/** An AAF operation definition describing an effect or transition algorithm. */
export interface AAFEffectDefinition {
  uid: AAFUID;
  name: string;
  description?: string;
  dataDefinition: AAFDataDefinition;
  isTimeWarp: boolean;
  numberInputs: number;
  /** Well-known AAF effect category. */
  category?: string;
}

// ─── Markers ─────────────────────────────────────────────────────────────────

/** An AAF descriptive marker (locator) carrying user metadata. */
export interface AAFDescriptiveMarker {
  uid: AAFUID;
  position: number;
  length: number;
  comment: string;
  colour?: { red: number; green: number; blue: number };
  userComments: AAFUserComment[];
}

/** A single user comment key/value pair. */
export interface AAFUserComment {
  name: string;
  value: string;
}

// ─── Top-level AAF document ──────────────────────────────────────────────────

/** The root of a parsed AAF file: the Header object. */
export interface AAFHeader {
  byteOrder: 'LittleEndian' | 'BigEndian';
  lastModified: string;
  version: { major: number; minor: number };
  objectModelVersion: number;
  operationalPattern?: string;
  identifications: AAFIdentification[];
}

/** An identification record describing the application that wrote the file. */
export interface AAFIdentification {
  companyName: string;
  productName: string;
  productVersionString: string;
  platform: string;
  generationUID: AAFUID;
  date: string;
}

/** Complete parsed AAF composition ready for import/export. */
export interface AAFDocument {
  header: AAFHeader;
  compositionMob: AAFCompositionMob;
  masterMobs: AAFMasterMob[];
  sourceMobs: AAFSourceMob[];
  effectDefinitions: AAFEffectDefinition[];
  dictionary: AAFDictionaryEntry[];
}

/** An entry in the AAF meta-dictionary for custom classes/types. */
export interface AAFDictionaryEntry {
  uid: AAFUID;
  name: string;
  description?: string;
}

// ─── Project-level metadata for the timeline import/export bridge ────────────

/** The timeline data bundle passed between the app and the AAF engine. */
export interface AAFTimelineData {
  projectName: string;
  projectSettings: ProjectSettings;
  tracks: Track[];
  markers: Marker[];
  effectInstances?: AAFClipEffectBinding[];
}

/** Binds a set of AAF-serialised effect parameters to a clip ID. */
export interface AAFClipEffectBinding {
  clipId: string;
  effects: {
    definitionId: string;
    params: Record<string, number | string | boolean>;
    enabled: boolean;
  }[];
}

// =============================================================================
//  Well-Known AAF Effect UIDs (AS-01 compliant subset)
// =============================================================================

const WELL_KNOWN_EFFECTS: Record<string, AAFEffectDefinition> = {
  dissolve: {
    uid: 'urn:smpte:ul:060e2b34.04010101.01010200.00000000',
    name: 'Cross Dissolve',
    dataDefinition: 'Picture',
    isTimeWarp: false,
    numberInputs: 2,
    category: 'Transition',
  },
  smpteWipe: {
    uid: 'urn:smpte:ul:060e2b34.04010101.01010500.00000000',
    name: 'SMPTE Wipe',
    dataDefinition: 'Picture',
    isTimeWarp: false,
    numberInputs: 2,
    category: 'Transition',
  },
  audioDissolve: {
    uid: 'urn:smpte:ul:060e2b34.04010101.01010300.00000000',
    name: 'Audio Dissolve',
    dataDefinition: 'Sound',
    isTimeWarp: false,
    numberInputs: 2,
    category: 'Transition',
  },
  videoSpeedControl: {
    uid: 'urn:smpte:ul:060e2b34.04010101.01010900.00000000',
    name: 'Video Speed Control',
    dataDefinition: 'Picture',
    isTimeWarp: true,
    numberInputs: 1,
    category: 'Effect',
  },
  monoAudioGain: {
    uid: 'urn:smpte:ul:060e2b34.04010101.01010c00.00000000',
    name: 'Mono Audio Gain',
    dataDefinition: 'Sound',
    isTimeWarp: false,
    numberInputs: 1,
    category: 'Effect',
  },
  monoAudioPan: {
    uid: 'urn:smpte:ul:060e2b34.04010101.01010d00.00000000',
    name: 'Mono Audio Pan',
    dataDefinition: 'Sound',
    isTimeWarp: false,
    numberInputs: 1,
    category: 'Effect',
  },
  videoFlip: {
    uid: 'urn:smpte:ul:060e2b34.04010101.01010a00.00000000',
    name: 'Video Flip',
    dataDefinition: 'Picture',
    isTimeWarp: false,
    numberInputs: 1,
    category: 'Effect',
  },
  videoPosition: {
    uid: 'urn:smpte:ul:060e2b34.04010101.01010b00.00000000',
    name: 'Video Position',
    dataDefinition: 'Picture',
    isTimeWarp: false,
    numberInputs: 1,
    category: 'Effect',
  },
  videoOpacity: {
    uid: 'urn:smpte:ul:060e2b34.04010101.01010e00.00000000',
    name: 'Video Opacity',
    dataDefinition: 'Picture',
    isTimeWarp: false,
    numberInputs: 1,
    category: 'Effect',
  },
};

// =============================================================================
//  Helpers
// =============================================================================

/** Generate a pseudo-random UUID v4 string. */
function generateUID(): AAFUID {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Create an AAFRational from a floating-point frame rate. */
function rationalFromFPS(fps: number): AAFRational {
  // Handle common NTSC rates precisely.
  if (Math.abs(fps - 23.976) < 0.01) return { numerator: 24000, denominator: 1001 };
  if (Math.abs(fps - 29.97) < 0.01) return { numerator: 30000, denominator: 1001 };
  if (Math.abs(fps - 59.94) < 0.01) return { numerator: 60000, denominator: 1001 };
  // Integer rates.
  if (Number.isInteger(fps)) return { numerator: fps, denominator: 1 };
  // Fallback: approximate with millisecond precision.
  const denom = 1000;
  return { numerator: Math.round(fps * denom), denominator: denom };
}

/** Convert a rational to a floating-point number. */
function rationalToFloat(r: AAFRational): number {
  return r.denominator === 0 ? 0 : r.numerator / r.denominator;
}

/** Convert seconds to edit-unit count at a given rational edit rate. */
function secondsToEditUnits(seconds: number, editRate: AAFRational): number {
  return Math.round(seconds * rationalToFloat(editRate));
}

/** Convert edit-unit count back to seconds at a given rational edit rate. */
function editUnitsToSeconds(units: number, editRate: AAFRational): number {
  const rate = rationalToFloat(editRate);
  return rate === 0 ? 0 : units / rate;
}

/** ISO-8601 timestamp for AAF creation/modification fields. */
function isoTimestamp(): string {
  return new Date().toISOString();
}

/** Map the app's TrackType to an AAF data definition. */
function trackTypeToDataDef(type: TrackType): AAFDataDefinition {
  switch (type) {
    case 'VIDEO':
    case 'EFFECT':
    case 'GRAPHIC':
      return 'Picture';
    case 'AUDIO':
      return 'Sound';
    case 'SUBTITLE':
      return 'DescriptiveMetadata';
    default:
      return 'Picture';
  }
}

/** Map an AAF data definition back to the app's TrackType. */
function dataDefToTrackType(dataDef: AAFDataDefinition): TrackType {
  switch (dataDef) {
    case 'Picture':
      return 'VIDEO';
    case 'Sound':
      return 'AUDIO';
    case 'DescriptiveMetadata':
      return 'SUBTITLE';
    default:
      return 'VIDEO';
  }
}

/** Map the app's clip type string to an AAF data definition. */
function clipTypeToDataDef(type: Clip['type']): AAFDataDefinition {
  switch (type) {
    case 'video':
    case 'effect':
      return 'Picture';
    case 'audio':
      return 'Sound';
    case 'subtitle':
      return 'DescriptiveMetadata';
    default:
      return 'Picture';
  }
}

/** Parse a CSS hex colour (#rrggbb) into an RGB triple (0-255). */
function hexToRGB(hex: string): { red: number; green: number; blue: number } {
  const h = hex.replace('#', '');
  return {
    red: parseInt(h.substring(0, 2), 16) || 0,
    green: parseInt(h.substring(2, 4), 16) || 0,
    blue: parseInt(h.substring(4, 6), 16) || 0,
  };
}

/** Convert an RGB triple back to a CSS hex colour. */
function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return (
    '#' +
    clamp(r).toString(16).padStart(2, '0') +
    clamp(g).toString(16).padStart(2, '0') +
    clamp(b).toString(16).padStart(2, '0')
  );
}

// =============================================================================
//  AAF Export (App Timeline -> AAF Object Model -> Binary)
// =============================================================================

/**
 * Convert the application's timeline data into a fully populated AAF object model.
 *
 * The export follows AMWA AS-01 constraints:
 * - One top-level Composition Mob with timeline slots for each track.
 * - Master Mobs bridging composition clips to Source Mobs.
 * - Source Mobs carrying essence descriptors with external locators.
 * - Timecode track on the composition mob.
 * - Descriptive markers for timeline markers.
 *
 * @param timeline The app's timeline data to export.
 * @returns A complete AAFDocument ready for binary serialisation.
 */
export function exportToAAF(timeline: AAFTimelineData): AAFDocument {
  const now = isoTimestamp();
  const editRate = rationalFromFPS(timeline.projectSettings.frameRate);
  const masterMobs: AAFMasterMob[] = [];
  const sourceMobs: AAFSourceMob[] = [];
  const effectDefs: AAFEffectDefinition[] = Object.values(WELL_KNOWN_EFFECTS);
  const usedEffectDefs = new Set<string>();

  // Build a lookup of clip effect bindings.
  const effectBindings = new Map<string, AAFClipEffectBinding['effects']>();
  if (timeline.effectInstances) {
    for (const binding of timeline.effectInstances) {
      effectBindings.set(binding.clipId, binding.effects);
    }
  }

  // ── Create master/source mob pairs for each unique clip asset ────────────
  const assetMobMap = new Map<string, { masterMob: AAFMasterMob; sourceMob: AAFSourceMob }>();

  function getOrCreateMobPair(clip: Clip, dataDef: AAFDataDefinition): { masterUID: AAFUID; sourceUID: AAFUID } {
    const assetKey = clip.assetId || clip.id;
    if (assetMobMap.has(assetKey)) {
      const pair = assetMobMap.get(assetKey)!;
      return { masterUID: pair.masterMob.uid, sourceUID: pair.sourceMob.uid };
    }

    const sourceUID = generateUID();
    const masterUID = generateUID();
    const totalDuration = (clip.endTime - clip.startTime) + clip.trimStart + clip.trimEnd;

    // Source Mob (physical media).
    const sourceMob: AAFSourceMob = {
      uid: sourceUID,
      mobKind: 'SourceMob',
      name: clip.name,
      creationTime: now,
      lastModified: now,
      essenceDescriptor: {
        uid: generateUID(),
        codec: dataDef === 'Sound' ? 'AAF_CMPR_NONE' : 'AAF_CMPR_AVIDDNXHD',
        containerFormat: 'External',
        sampleRate: dataDef === 'Sound' ? { numerator: 48000, denominator: 1 } : editRate,
        length: secondsToEditUnits(totalDuration, editRate),
        ...(dataDef === 'Picture' && {
          storedWidth: timeline.projectSettings.width,
          storedHeight: timeline.projectSettings.height,
          frameLayout: 'FullFrame' as const,
        }),
        ...(dataDef === 'Sound' && {
          channelCount: 2,
          quantizationBits: 24,
        }),
        locator: clip.assetId ? `media://${clip.assetId}` : undefined,
      },
      timelineSlots: [
        {
          uid: generateUID(),
          slotID: 1,
          slotName: dataDef === 'Sound' ? 'A1' : 'V1',
          editRate,
          origin: 0,
          sequence: {
            uid: generateUID(),
            dataDefinition: dataDef,
            segments: [
              {
                kind: 'SourceClip',
                uid: generateUID(),
                dataDefinition: dataDef,
                length: secondsToEditUnits(totalDuration, editRate),
                sourceReference: {
                  sourceID: '00000000-0000-0000-0000-000000000000',
                  sourceTrackID: 0,
                  startTime: 0,
                  length: secondsToEditUnits(totalDuration, editRate),
                },
              } satisfies AAFSourceClip,
            ],
          },
        },
      ],
    };

    // Master Mob (bridge).
    const masterMob: AAFMasterMob = {
      uid: masterUID,
      mobKind: 'MasterMob',
      name: clip.name,
      creationTime: now,
      lastModified: now,
      timelineSlots: [
        {
          uid: generateUID(),
          slotID: 1,
          slotName: dataDef === 'Sound' ? 'A1' : 'V1',
          editRate,
          origin: 0,
          sequence: {
            uid: generateUID(),
            dataDefinition: dataDef,
            segments: [
              {
                kind: 'SourceClip',
                uid: generateUID(),
                dataDefinition: dataDef,
                length: secondsToEditUnits(totalDuration, editRate),
                sourceReference: {
                  sourceID: sourceUID,
                  sourceTrackID: 1,
                  startTime: 0,
                  length: secondsToEditUnits(totalDuration, editRate),
                },
              } satisfies AAFSourceClip,
            ],
          },
        },
      ],
      userComments: [],
    };

    sourceMobs.push(sourceMob);
    masterMobs.push(masterMob);
    assetMobMap.set(assetKey, { masterMob, sourceMob });

    return { masterUID, sourceUID };
  }

  // ── Build composition timeline slots from app tracks ────────────────────
  const compositionSlots: AAFTimelineMobSlot[] = [];
  let nextSlotID = 1;

  // Timecode track (AS-01 requirement).
  const tcSlot: AAFTimelineMobSlot = {
    uid: generateUID(),
    slotID: nextSlotID++,
    slotName: 'TC1',
    editRate,
    origin: 0,
    physicalTrackNumber: 1,
    sequence: {
      uid: generateUID(),
      dataDefinition: 'Timecode',
      segments: [
        {
          kind: 'Timecode',
          uid: generateUID(),
          dataDefinition: 'Timecode',
          length: secondsToEditUnits(computeTimelineDuration(timeline.tracks), editRate),
          timecode: {
            startTimecode: 0,
            frameRate: Math.round(rationalToFloat(editRate)),
            dropFrame: Math.abs(rationalToFloat(editRate) - 29.97) < 0.05,
          },
        } satisfies AAFTimecodeSegment,
      ],
    },
  };
  compositionSlots.push(tcSlot);

  // Sort tracks by sortOrder for deterministic output.
  const sortedTracks = [...timeline.tracks].sort((a, b) => a.sortOrder - b.sortOrder);

  for (const track of sortedTracks) {
    const dataDef = trackTypeToDataDef(track.type);
    const segments: AAFSegment[] = [];
    const sortedClips = [...track.clips].sort((a, b) => a.startTime - b.startTime);

    let cursor = 0; // current position in edit units

    for (const clip of sortedClips) {
      const clipStartEU = secondsToEditUnits(clip.startTime, editRate);
      const clipLenEU = secondsToEditUnits(clip.endTime - clip.startTime, editRate);
      const trimStartEU = secondsToEditUnits(clip.trimStart, editRate);

      // Insert filler gap if there is space before this clip.
      if (clipStartEU > cursor) {
        segments.push({
          kind: 'Filler',
          uid: generateUID(),
          dataDefinition: dataDef,
          length: clipStartEU - cursor,
        } satisfies AAFFiller);
      }

      // Get or create mob pair for this clip's asset.
      const { masterUID } = getOrCreateMobPair(clip, dataDef);

      // Build the source clip segment.
      const sourceClip: AAFSourceClip = {
        kind: 'SourceClip',
        uid: generateUID(),
        dataDefinition: dataDef,
        length: clipLenEU,
        sourceReference: {
          sourceID: masterUID,
          sourceTrackID: 1,
          startTime: trimStartEU,
          length: clipLenEU,
        },
        name: clip.name,
        userComments: buildClipComments(clip),
      };

      // Wrap clip in operation groups for intrinsic effects if needed.
      const wrappedSegment = wrapClipWithEffects(
        sourceClip,
        clip,
        dataDef,
        clipLenEU,
        effectBindings.get(clip.id),
        usedEffectDefs,
      );

      segments.push(wrappedSegment);
      cursor = clipStartEU + clipLenEU;
    }

    const slot: AAFTimelineMobSlot = {
      uid: generateUID(),
      slotID: nextSlotID++,
      slotName: track.name,
      editRate,
      origin: 0,
      physicalTrackNumber: nextSlotID - 1,
      sequence: {
        uid: generateUID(),
        dataDefinition: dataDef,
        segments,
      },
      userComments: buildTrackComments(track),
    };

    compositionSlots.push(slot);
  }

  // ── Build event slots for markers ────────────────────────────────────────
  const eventSlots: AAFEventMobSlot[] = [];

  if (timeline.markers.length > 0) {
    const markerEvents: AAFDescriptiveMarker[] = timeline.markers.map((m) => ({
      uid: generateUID(),
      position: secondsToEditUnits(m.time, editRate),
      length: 0,
      comment: m.label,
      colour: hexToRGB(m.color),
      userComments: [
        { name: '_markerId', value: m.id },
      ],
    }));

    eventSlots.push({
      uid: generateUID(),
      slotID: nextSlotID++,
      slotName: 'Markers',
      editRate,
      events: markerEvents,
    });
  }

  // ── Assemble document ────────────────────────────────────────────────────
  const compositionMob: AAFCompositionMob = {
    uid: generateUID(),
    mobKind: 'CompositionMob',
    name: timeline.projectName,
    creationTime: now,
    lastModified: now,
    usageCode: 'Usage_TopLevel',
    timelineSlots: compositionSlots,
    eventSlots,
    userComments: [
      { name: '_projectWidth', value: String(timeline.projectSettings.width) },
      { name: '_projectHeight', value: String(timeline.projectSettings.height) },
      { name: '_projectFrameRate', value: String(timeline.projectSettings.frameRate) },
      { name: '_projectFormat', value: timeline.projectSettings.exportFormat },
      { name: '_exportedBy', value: 'The Avid' },
      { name: '_exportVersion', value: '1.0.0' },
    ],
  };

  const document: AAFDocument = {
    header: {
      byteOrder: 'LittleEndian',
      lastModified: now,
      version: { major: 1, minor: 2 },
      objectModelVersion: 1,
      operationalPattern: 'AAFEditProtocol',
      identifications: [
        {
          companyName: 'The Avid',
          productName: 'The Avid Web Editor',
          productVersionString: '1.0.0',
          platform: typeof navigator !== 'undefined' ? navigator.userAgent : 'Node.js',
          generationUID: generateUID(),
          date: now,
        },
      ],
    },
    compositionMob,
    masterMobs,
    sourceMobs,
    effectDefinitions: effectDefs.filter(
      (d) => usedEffectDefs.has(d.uid) || usedEffectDefs.size === 0,
    ),
    dictionary: [],
  };

  return document;
}

// ─── Export helpers ───────────────────────────────────────────────────────────

/** Build user comment entries capturing clip intrinsic properties. */
function buildClipComments(clip: Clip): AAFUserComment[] {
  const comments: AAFUserComment[] = [];

  if (clip.color) {
    comments.push({ name: '_clipColor', value: clip.color });
  }

  // Preserve intrinsic video properties that do not map directly to AAF.
  const iv = clip.intrinsicVideo;
  if (iv.opacity !== 100) comments.push({ name: '_opacity', value: String(iv.opacity) });
  if (iv.scaleX !== 100) comments.push({ name: '_scaleX', value: String(iv.scaleX) });
  if (iv.scaleY !== 100) comments.push({ name: '_scaleY', value: String(iv.scaleY) });
  if (iv.positionX !== 0) comments.push({ name: '_positionX', value: String(iv.positionX) });
  if (iv.positionY !== 0) comments.push({ name: '_positionY', value: String(iv.positionY) });
  if (iv.rotation !== 0) comments.push({ name: '_rotation', value: String(iv.rotation) });
  if (iv.anchorX !== 0) comments.push({ name: '_anchorX', value: String(iv.anchorX) });
  if (iv.anchorY !== 0) comments.push({ name: '_anchorY', value: String(iv.anchorY) });

  // Intrinsic audio.
  const ia = clip.intrinsicAudio;
  if (ia.volume !== 0) comments.push({ name: '_audioVolume', value: String(ia.volume) });
  if (ia.pan !== 0) comments.push({ name: '_audioPan', value: String(ia.pan) });

  // Time remap.
  if (clip.timeRemap.enabled) {
    comments.push({ name: '_timeRemapEnabled', value: 'true' });
    comments.push({ name: '_timeRemapBlending', value: clip.timeRemap.frameBlending });
    comments.push({ name: '_timeRemapPitchCorrection', value: String(clip.timeRemap.pitchCorrection) });
    if (clip.timeRemap.keyframes.length > 0) {
      comments.push({
        name: '_timeRemapKeyframes',
        value: JSON.stringify(clip.timeRemap.keyframes),
      });
    }
  }

  if (clip.assetId) {
    comments.push({ name: '_assetId', value: clip.assetId });
  }

  return comments;
}

/** Build user comment entries for track metadata. */
function buildTrackComments(track: Track): AAFUserComment[] {
  const comments: AAFUserComment[] = [
    { name: '_trackId', value: track.id },
    { name: '_trackType', value: track.type },
    { name: '_trackColor', value: track.color },
    { name: '_trackSortOrder', value: String(track.sortOrder) },
  ];
  if (track.muted) comments.push({ name: '_trackMuted', value: 'true' });
  if (track.locked) comments.push({ name: '_trackLocked', value: 'true' });
  if (track.solo) comments.push({ name: '_trackSolo', value: 'true' });
  if (track.volume !== 1) comments.push({ name: '_trackVolume', value: String(track.volume) });
  return comments;
}

/**
 * Wrap a source clip in AAF operation groups representing intrinsic effects
 * and any user-applied effects from the effects engine.
 */
function wrapClipWithEffects(
  sourceClip: AAFSourceClip,
  clip: Clip,
  dataDef: AAFDataDefinition,
  lengthEU: number,
  clipEffects: AAFClipEffectBinding['effects'] | undefined,
  usedEffectDefs: Set<string>,
): AAFSegment {
  let currentSegment: AAFSegment = sourceClip;

  // Audio gain/pan wrapping.
  if (dataDef === 'Sound') {
    const ia = clip.intrinsicAudio;
    if (ia.volume !== 0) {
      const gainDef = WELL_KNOWN_EFFECTS['monoAudioGain'];
      usedEffectDefs.add(gainDef.uid);
      // Convert dB to linear gain for AAF.
      const linearGain = Math.pow(10, ia.volume / 20);
      currentSegment = {
        kind: 'OperationGroup',
        uid: generateUID(),
        dataDefinition: dataDef,
        length: lengthEU,
        operationDefinition: gainDef,
        parameters: [
          { name: 'Level', typeDefinition: 'Rational', interpolation: 'ConstantInterp', value: linearGain },
        ],
        varyingParameters: [],
        inputSegments: [currentSegment],
      };
    }
    if (ia.pan !== 0) {
      const panDef = WELL_KNOWN_EFFECTS['monoAudioPan'];
      usedEffectDefs.add(panDef.uid);
      // Convert -100..100 to 0..1 for AAF (0.5 = center).
      const panValue = (ia.pan + 100) / 200;
      currentSegment = {
        kind: 'OperationGroup',
        uid: generateUID(),
        dataDefinition: dataDef,
        length: lengthEU,
        operationDefinition: panDef,
        parameters: [
          { name: 'Pan', typeDefinition: 'Rational', interpolation: 'ConstantInterp', value: panValue },
        ],
        varyingParameters: [],
        inputSegments: [currentSegment],
      };
    }
  }

  // Video opacity wrapping.
  if (dataDef === 'Picture') {
    const iv = clip.intrinsicVideo;
    if (iv.opacity !== 100) {
      const opacityDef = WELL_KNOWN_EFFECTS['videoOpacity'];
      usedEffectDefs.add(opacityDef.uid);
      currentSegment = {
        kind: 'OperationGroup',
        uid: generateUID(),
        dataDefinition: dataDef,
        length: lengthEU,
        operationDefinition: opacityDef,
        parameters: [
          { name: 'Opacity', typeDefinition: 'Rational', interpolation: 'ConstantInterp', value: iv.opacity / 100 },
        ],
        varyingParameters: [],
        inputSegments: [currentSegment],
      };
    }

    // Time remap (speed control).
    if (clip.timeRemap.enabled && clip.timeRemap.keyframes.length >= 2) {
      const speedDef = WELL_KNOWN_EFFECTS['videoSpeedControl'];
      usedEffectDefs.add(speedDef.uid);
      const controlPoints: AAFControlPoint[] = clip.timeRemap.keyframes.map((kf) => ({
        time: { numerator: Math.round(kf.timelineTime * 1000), denominator: 1000 },
        value: kf.sourceTime,
        editHint: 'proportional' as const,
        ...(kf.interpolation === 'bezier' && kf.bezierIn && kf.bezierOut
          ? {
              tangents: {
                inTangent: kf.bezierIn,
                outTangent: kf.bezierOut,
              },
            }
          : {}),
      }));
      currentSegment = {
        kind: 'OperationGroup',
        uid: generateUID(),
        dataDefinition: dataDef,
        length: lengthEU,
        operationDefinition: speedDef,
        parameters: [],
        varyingParameters: [
          {
            parameterName: 'SpeedRatio',
            interpolation: 'BezierInterp',
            controlPoints,
          },
        ],
        inputSegments: [currentSegment],
      };
    }
  }

  // User-applied effects from the effects engine (stored as generic operation groups).
  if (clipEffects && clipEffects.length > 0) {
    for (const fx of clipEffects) {
      if (!fx.enabled) continue;
      const fxDef: AAFEffectDefinition = {
        uid: `urn:the-avid:effect:${fx.definitionId}`,
        name: fx.definitionId,
        dataDefinition: dataDef,
        isTimeWarp: false,
        numberInputs: 1,
        category: 'Effect',
      };
      usedEffectDefs.add(fxDef.uid);
      const params: AAFParameter[] = Object.entries(fx.params).map(([name, value]) => ({
        name,
        typeDefinition: typeof value === 'number' ? 'Rational' : typeof value === 'boolean' ? 'Boolean' : 'String',
        interpolation: 'ConstantInterp' as AAFInterpolation,
        value,
      }));
      currentSegment = {
        kind: 'OperationGroup',
        uid: generateUID(),
        dataDefinition: dataDef,
        length: lengthEU,
        operationDefinition: fxDef,
        parameters: params,
        varyingParameters: [],
        inputSegments: [currentSegment],
      };
    }
  }

  return currentSegment;
}

/** Compute the total timeline duration in seconds from all tracks/clips. */
function computeTimelineDuration(tracks: Track[]): number {
  let maxEnd = 0;
  for (const track of tracks) {
    for (const clip of track.clips) {
      if (clip.endTime > maxEnd) maxEnd = clip.endTime;
    }
  }
  return maxEnd || 1;
}

// =============================================================================
//  AAF Binary Serialisation (Structured Storage Format Emulation)
// =============================================================================

/**
 * AAF files use a Microsoft Structured Storage (compound document) container.
 * A full implementation requires a complete OLE/COM binary file format writer.
 *
 * This implementation produces a simplified but parseable binary representation
 * suitable for browser environments. The format is:
 *
 *   [AAF Magic (16 bytes)]
 *   [Header sector (JSON-encoded AAF document)]
 *   [Directory entries for mob objects]
 *
 * For production interchange, this output should be piped through a native AAF
 * SDK (e.g. via a server endpoint) to produce a fully compliant Structured
 * Storage file.
 */

/** Magic bytes identifying a simplified AAF file from this engine. */
const AAF_MAGIC = new Uint8Array([
  0x00, 0x41, 0x41, 0x46, // .AAF
  0x42, 0x45, 0x47, 0x49, // BEGI
  0x4e, 0x00, 0x00, 0x00, // N...
  0x01, 0x02, 0x00, 0x00, // version 1.2
]);

/** Sector size for the structured storage emulation. */
const SECTOR_SIZE = 4096;

/**
 * Serialise an AAFDocument to an ArrayBuffer mimicking AAF Structured Storage.
 *
 * @param document The fully populated AAF document.
 * @returns An ArrayBuffer containing the serialised AAF data.
 */
export function serializeAAF(document: AAFDocument): ArrayBuffer {
  const encoder = new TextEncoder();

  // ── Encode JSON payload ──────────────────────────────────────────────────
  const jsonPayload = JSON.stringify(document, null, 0);
  const payloadBytes = encoder.encode(jsonPayload);

  // ── Build Structured Storage header ──────────────────────────────────────
  //
  // Structured Storage header layout (simplified):
  //   offset 0x00: magic (16 bytes)
  //   offset 0x10: minor version (2 bytes)
  //   offset 0x12: major version (2 bytes)
  //   offset 0x14: byte order (2 bytes, 0xFFFE = little-endian)
  //   offset 0x16: sector size power (2 bytes, 12 = 4096)
  //   offset 0x18: mini-sector size power (2 bytes, 6 = 64)
  //   offset 0x1A: reserved (6 bytes)
  //   offset 0x20: total sectors for directory (4 bytes)
  //   offset 0x24: first directory sector SECID (4 bytes)
  //   offset 0x28: reserved (4 bytes)
  //   offset 0x2C: minimum stream size (4 bytes, default 4096)
  //   offset 0x30: first mini-FAT SECID (4 bytes, 0xFFFFFFFE = none)
  //   offset 0x34: total mini-FAT sectors (4 bytes)
  //   offset 0x38: first DIFAT SECID (4 bytes, 0xFFFFFFFE = none)
  //   offset 0x3C: total DIFAT sectors (4 bytes)
  //   offset 0x40: DIFAT array (436 bytes, 109 entries)

  const headerSize = 512;
  const payloadSectors = Math.ceil(payloadBytes.length / SECTOR_SIZE);
  const totalSize = headerSize + payloadSectors * SECTOR_SIZE;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // Write magic.
  bytes.set(AAF_MAGIC, 0);

  // Minor/major version.
  view.setUint16(0x10, 2, true);   // minor
  view.setUint16(0x12, 4, true);   // major (Structured Storage v4)

  // Byte order: little-endian.
  view.setUint16(0x14, 0xfffe, true);

  // Sector size power: 2^12 = 4096.
  view.setUint16(0x16, 12, true);

  // Mini-sector size power: 2^6 = 64.
  view.setUint16(0x18, 6, true);

  // Total directory sectors.
  view.setUint32(0x20, 1, true);

  // First directory sector SECID (sector 0 = right after header).
  view.setUint32(0x24, 0, true);

  // Minimum stream size for mini-stream.
  view.setUint32(0x2c, SECTOR_SIZE, true);

  // No mini-FAT.
  view.setUint32(0x30, 0xfffffffe, true);
  view.setUint32(0x34, 0, true);

  // No DIFAT.
  view.setUint32(0x38, 0xfffffffe, true);
  view.setUint32(0x3c, 0, true);

  // Fill DIFAT array with end-of-chain.
  for (let i = 0; i < 109; i++) {
    view.setUint32(0x40 + i * 4, 0xfffffffe, true);
  }

  // Sector 0 starts at offset 512.
  // Write payload length as the first 8 bytes of the data area, then the payload.
  const dataOffset = headerSize;
  // Length prefix (8 bytes, little-endian 64-bit).
  view.setUint32(dataOffset, payloadBytes.length & 0xffffffff, true);
  view.setUint32(dataOffset + 4, Math.floor(payloadBytes.length / 0x100000000), true);

  // Copy payload.
  bytes.set(payloadBytes, dataOffset + 8);

  return buffer;
}

// =============================================================================
//  AAF Binary Parsing (Structured Storage -> AAF Object Model)
// =============================================================================

/** Error thrown when AAF parsing encounters invalid or unsupported data. */
export class AAFParseError extends Error {
  constructor(message: string, public readonly offset?: number) {
    super(message);
    this.name = 'AAFParseError';
  }
}

/**
 * Parse an AAF binary file (ArrayBuffer) into the AAF object model.
 *
 * Handles both the simplified format produced by this engine and performs
 * basic Structured Storage header validation for files from other sources.
 *
 * @param buffer The raw bytes of the AAF file.
 * @returns A fully parsed AAFDocument.
 * @throws AAFParseError if the file is invalid or unreadable.
 */
export function parseAAF(buffer: ArrayBuffer): AAFDocument {
  if (buffer.byteLength < 512) {
    throw new AAFParseError('Buffer too small to be a valid AAF file (< 512 bytes).');
  }

  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // ── Validate magic ──────────────────────────────────────────────────────
  const magicMatch = AAF_MAGIC.every((b, i) => bytes[i] === b);
  const isOLEMagic =
    bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0 &&
    bytes[4] === 0xa1 && bytes[5] === 0xb1 && bytes[6] === 0x1a && bytes[7] === 0xe1;

  if (!magicMatch && !isOLEMagic) {
    throw new AAFParseError(
      'Invalid magic bytes. Expected AAF or OLE Structured Storage signature.',
      0,
    );
  }

  // ── Parse our simplified format ─────────────────────────────────────────
  if (magicMatch) {
    return parseSimplifiedAAF(buffer, view, bytes);
  }

  // ── Parse OLE Structured Storage container ──────────────────────────────
  return parseOLEStructuredStorage(buffer, view, bytes);
}

/**
 * Parse the simplified JSON-payload format produced by `serializeAAF`.
 */
function parseSimplifiedAAF(
  _buffer: ArrayBuffer,
  view: DataView,
  bytes: Uint8Array,
): AAFDocument {
  const headerSize = 512;
  const dataOffset = headerSize;

  // Read payload length.
  const payloadLengthLo = view.getUint32(dataOffset, true);
  const payloadLengthHi = view.getUint32(dataOffset + 4, true);
  const payloadLength = payloadLengthHi * 0x100000000 + payloadLengthLo;

  if (payloadLength <= 0 || dataOffset + 8 + payloadLength > bytes.length) {
    throw new AAFParseError(
      `Invalid payload length: ${payloadLength} (file size: ${bytes.length}).`,
      dataOffset,
    );
  }

  const payloadBytes = bytes.slice(dataOffset + 8, dataOffset + 8 + payloadLength);
  const decoder = new TextDecoder('utf-8');
  const jsonString = decoder.decode(payloadBytes);

  let parsed: any;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err) {
    throw new AAFParseError(
      `Failed to parse AAF JSON payload: ${err instanceof Error ? err.message : String(err)}`,
      dataOffset + 8,
    );
  }

  return validateAAFDocument(parsed);
}

/**
 * Attempt to parse a real OLE Structured Storage file and extract the AAF
 * composition tree. This is a best-effort implementation suitable for reading
 * simple AAF files in the browser. Complex files with many streams may require
 * a server-side AAF SDK.
 */
function parseOLEStructuredStorage(
  buffer: ArrayBuffer,
  view: DataView,
  _bytes: Uint8Array,
): AAFDocument {
  // Read header fields.
  const byteOrderMark = view.getUint16(0x1c, true);
  const isLittleEndian = byteOrderMark === 0xfffe;
  const sectorSizePower = view.getUint16(0x1e, true);
  const sectorSize = 1 << sectorSizePower;
  const firstDirSecID = view.getUint32(0x30, true);

  // Seek to the first directory sector.
  const dirOffset = 512 + firstDirSecID * sectorSize;

  if (dirOffset >= buffer.byteLength) {
    throw new AAFParseError(
      'First directory sector offset exceeds file size. File may be truncated.',
      dirOffset,
    );
  }

  // In a full OLE parser we would walk the directory tree looking for the
  // AAF content stream. For now, attempt to locate a JSON payload embedded
  // by our engine as a fallback, or scan for recognisable AAF class names.

  // Scan for JSON object start (heuristic for files that embed a JSON stream).
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const fullText = decoder.decode(buffer);
  const jsonStart = fullText.indexOf('{"header"');

  if (jsonStart >= 0) {
    // Find the matching closing brace.
    let depth = 0;
    let jsonEnd = jsonStart;
    for (let i = jsonStart; i < fullText.length; i++) {
      if (fullText[i] === '{') depth++;
      else if (fullText[i] === '}') {
        depth--;
        if (depth === 0) {
          jsonEnd = i + 1;
          break;
        }
      }
    }

    try {
      const parsed = JSON.parse(fullText.substring(jsonStart, jsonEnd));
      return validateAAFDocument(parsed);
    } catch {
      // Fall through to error.
    }
  }

  throw new AAFParseError(
    'Unable to parse OLE Structured Storage AAF content. ' +
    'This file may require a native AAF SDK for full parsing. ' +
    `Container: ${isLittleEndian ? 'LE' : 'BE'}, sector size: ${sectorSize}.`,
  );
}

/**
 * Validate and normalise a parsed JSON object into a well-typed AAFDocument.
 * Fills in missing fields with sensible defaults.
 */
function validateAAFDocument(raw: any): AAFDocument {
  if (!raw || typeof raw !== 'object') {
    throw new AAFParseError('Parsed AAF content is not an object.');
  }

  // Header.
  const header: AAFHeader = {
    byteOrder: raw.header?.byteOrder ?? 'LittleEndian',
    lastModified: raw.header?.lastModified ?? isoTimestamp(),
    version: {
      major: raw.header?.version?.major ?? 1,
      minor: raw.header?.version?.minor ?? 2,
    },
    objectModelVersion: raw.header?.objectModelVersion ?? 1,
    operationalPattern: raw.header?.operationalPattern,
    identifications: Array.isArray(raw.header?.identifications) ? raw.header.identifications : [],
  };

  // Composition mob.
  if (!raw.compositionMob || typeof raw.compositionMob !== 'object') {
    throw new AAFParseError('AAF document missing compositionMob.');
  }

  const compositionMob = raw.compositionMob as AAFCompositionMob;
  if (!compositionMob.uid) compositionMob.uid = generateUID();
  if (!compositionMob.mobKind) compositionMob.mobKind = 'CompositionMob';
  if (!compositionMob.timelineSlots) compositionMob.timelineSlots = [];
  if (!compositionMob.eventSlots) compositionMob.eventSlots = [];
  if (!compositionMob.userComments) compositionMob.userComments = [];

  return {
    header,
    compositionMob,
    masterMobs: Array.isArray(raw.masterMobs) ? raw.masterMobs : [],
    sourceMobs: Array.isArray(raw.sourceMobs) ? raw.sourceMobs : [],
    effectDefinitions: Array.isArray(raw.effectDefinitions) ? raw.effectDefinitions : [],
    dictionary: Array.isArray(raw.dictionary) ? raw.dictionary : [],
  };
}

// =============================================================================
//  AAF Import (AAF Object Model -> App Timeline)
// =============================================================================

/**
 * Convert a parsed AAF document into the application's timeline data.
 *
 * Reconstructs tracks, clips, markers, and effect bindings from the AAF
 * composition mob, master mobs, and source mobs.
 *
 * @param document The parsed AAFDocument to import.
 * @returns Timeline data ready to load into the editor store.
 */
export function importFromAAF(document: AAFDocument): AAFTimelineData {
  const comp = document.compositionMob;
  const editRate = resolveCompositionEditRate(comp);
  const masterMobLookup = new Map<AAFUID, AAFMasterMob>();
  const sourceMobLookup = new Map<AAFUID, AAFSourceMob>();

  for (const mm of document.masterMobs) masterMobLookup.set(mm.uid, mm);
  for (const sm of document.sourceMobs) sourceMobLookup.set(sm.uid, sm);

  // ── Extract project settings from composition comments ──────────────────
  const projectSettings = extractProjectSettings(comp);

  // ── Build tracks and clips ──────────────────────────────────────────────
  const tracks: Track[] = [];
  const effectInstances: AAFClipEffectBinding[] = [];
  let trackSortOrder = 0;

  for (const slot of comp.timelineSlots) {
    // Skip timecode tracks.
    if (slot.sequence.dataDefinition === 'Timecode') continue;

    const trackType = resolveTrackType(slot);
    const trackMeta = extractTrackMetadata(slot);
    const trackId = trackMeta.trackId || generateUID();
    const clips: Clip[] = [];
    let cursor = 0; // position in edit units

    for (const segment of slot.sequence.segments) {
      const result = importSegment(
        segment,
        cursor,
        editRate,
        trackId,
        trackType,
        masterMobLookup,
        sourceMobLookup,
      );

      cursor += getSegmentLength(segment);

      if (result.clip) {
        clips.push(result.clip);
        if (result.effects && result.effects.length > 0) {
          effectInstances.push({
            clipId: result.clip.id,
            effects: result.effects,
          });
        }
      }
    }

    tracks.push({
      id: trackId,
      name: slot.slotName,
      type: trackMeta.trackType ?? trackType,
      sortOrder: trackMeta.sortOrder ?? trackSortOrder++,
      muted: trackMeta.muted,
      locked: trackMeta.locked,
      solo: trackMeta.solo,
      volume: trackMeta.volume,
      clips,
      color: trackMeta.color,
    });
  }

  // ── Build markers from event slots ──────────────────────────────────────
  const markers: Marker[] = [];

  for (const eventSlot of comp.eventSlots) {
    for (const event of eventSlot.events) {
      const markerId =
        event.userComments?.find((c) => c.name === '_markerId')?.value || generateUID();
      markers.push({
        id: markerId,
        time: editUnitsToSeconds(event.position, editRate),
        label: event.comment,
        color: event.colour ? rgbToHex(event.colour.red, event.colour.green, event.colour.blue) : '#f0a500',
      });
    }
  }

  return {
    projectName: comp.name || 'Imported Project',
    projectSettings,
    tracks,
    markers,
    effectInstances: effectInstances.length > 0 ? effectInstances : undefined,
  };
}

// ─── Import helpers ──────────────────────────────────────────────────────────

/** Determine the composition's edit rate from the first non-timecode track. */
function resolveCompositionEditRate(comp: AAFCompositionMob): AAFRational {
  for (const slot of comp.timelineSlots) {
    if (slot.sequence.dataDefinition !== 'Timecode') {
      return slot.editRate;
    }
  }
  // Fallback: check timecode tracks, then default.
  if (comp.timelineSlots.length > 0) {
    return comp.timelineSlots[0].editRate;
  }
  return { numerator: 24, denominator: 1 };
}

/** Extract project settings from composition mob user comments. */
function extractProjectSettings(comp: AAFCompositionMob): ProjectSettings {
  const getComment = (name: string): string | undefined =>
    comp.userComments.find((c) => c.name === name)?.value;

  return {
    width: parseInt(getComment('_projectWidth') || '1920', 10),
    height: parseInt(getComment('_projectHeight') || '1080', 10),
    frameRate: parseFloat(getComment('_projectFrameRate') || '23.976'),
    exportFormat: getComment('_projectFormat') || 'h264',
  };
}

/** Track metadata extracted from user comments. */
interface TrackMetadata {
  trackId?: string;
  trackType?: TrackType;
  color: string;
  sortOrder?: number;
  muted: boolean;
  locked: boolean;
  solo: boolean;
  volume: number;
}

/** Extract track metadata from a timeline mob slot's user comments. */
function extractTrackMetadata(slot: AAFTimelineMobSlot): TrackMetadata {
  const comments = slot.userComments || [];
  const get = (name: string): string | undefined =>
    comments.find((c) => c.name === name)?.value;

  return {
    trackId: get('_trackId'),
    trackType: get('_trackType') as TrackType | undefined,
    color: get('_trackColor') || '#5b6ef4',
    sortOrder: get('_trackSortOrder') ? parseInt(get('_trackSortOrder')!, 10) : undefined,
    muted: get('_trackMuted') === 'true',
    locked: get('_trackLocked') === 'true',
    solo: get('_trackSolo') === 'true',
    volume: get('_trackVolume') ? parseFloat(get('_trackVolume')!) : 1,
  };
}

/** Determine the track type from an AAF slot. */
function resolveTrackType(slot: AAFTimelineMobSlot): TrackType {
  return dataDefToTrackType(slot.sequence.dataDefinition);
}

/** Result of importing a single AAF segment. */
interface ImportSegmentResult {
  clip: Clip | null;
  effects: AAFClipEffectBinding['effects'];
}

/**
 * Recursively import an AAF segment, unwrapping operation groups to find
 * the innermost source clip and collecting effect parameters along the way.
 */
function importSegment(
  segment: AAFSegment,
  cursorEU: number,
  editRate: AAFRational,
  trackId: string,
  trackType: TrackType,
  masterMobs: Map<AAFUID, AAFMasterMob>,
  sourceMobs: Map<AAFUID, AAFSourceMob>,
): ImportSegmentResult {
  switch (segment.kind) {
    case 'Filler':
      return { clip: null, effects: [] };

    case 'SourceClip':
      return {
        clip: buildClipFromSourceClip(
          segment,
          cursorEU,
          editRate,
          trackId,
          trackType,
          masterMobs,
          sourceMobs,
        ),
        effects: [],
      };

    case 'OperationGroup':
      return importOperationGroup(
        segment,
        cursorEU,
        editRate,
        trackId,
        trackType,
        masterMobs,
        sourceMobs,
      );

    case 'Transition':
      // Transitions are not directly mapped to clips; they modify adjacent clips.
      // For now, skip them. A more complete importer would adjust trim values.
      return { clip: null, effects: [] };

    case 'NestedScope':
      // Import the first slot of a nested scope.
      if (segment.slots.length > 0) {
        for (const innerSeg of segment.slots[0].segments) {
          const result = importSegment(
            innerSeg,
            cursorEU,
            editRate,
            trackId,
            trackType,
            masterMobs,
            sourceMobs,
          );
          if (result.clip) return result;
        }
      }
      return { clip: null, effects: [] };

    case 'Timecode':
    case 'ScopeReference':
    default:
      return { clip: null, effects: [] };
  }
}

/**
 * Import an OperationGroup by peeling off effect layers and recursing
 * into the input segment chain.
 */
function importOperationGroup(
  opGroup: AAFOperationGroup,
  cursorEU: number,
  editRate: AAFRational,
  trackId: string,
  trackType: TrackType,
  masterMobs: Map<AAFUID, AAFMasterMob>,
  sourceMobs: Map<AAFUID, AAFSourceMob>,
): ImportSegmentResult {
  const collectedEffects: AAFClipEffectBinding['effects'] = [];
  let intrinsicOverrides: Partial<{
    opacity: number;
    volume: number;
    pan: number;
    timeRemap: TimeRemapState;
  }> = {};

  // Check if this operation group represents a well-known intrinsic effect.
  const opDef = opGroup.operationDefinition;

  if (opDef.uid === WELL_KNOWN_EFFECTS['videoOpacity']?.uid) {
    const opacityParam = opGroup.parameters.find((p) => p.name === 'Opacity');
    if (opacityParam && typeof opacityParam.value === 'number') {
      intrinsicOverrides.opacity = opacityParam.value * 100;
    }
  } else if (opDef.uid === WELL_KNOWN_EFFECTS['monoAudioGain']?.uid) {
    const levelParam = opGroup.parameters.find((p) => p.name === 'Level');
    if (levelParam && typeof levelParam.value === 'number') {
      // Convert linear gain back to dB.
      intrinsicOverrides.volume = levelParam.value > 0 ? 20 * Math.log10(levelParam.value) : -60;
    }
  } else if (opDef.uid === WELL_KNOWN_EFFECTS['monoAudioPan']?.uid) {
    const panParam = opGroup.parameters.find((p) => p.name === 'Pan');
    if (panParam && typeof panParam.value === 'number') {
      // Convert 0..1 back to -100..100.
      intrinsicOverrides.pan = panParam.value * 200 - 100;
    }
  } else if (opDef.uid === WELL_KNOWN_EFFECTS['videoSpeedControl']?.uid) {
    const speedVarying = opGroup.varyingParameters.find((p) => p.parameterName === 'SpeedRatio');
    if (speedVarying && speedVarying.controlPoints.length >= 2) {
      intrinsicOverrides.timeRemap = {
        enabled: true,
        keyframes: speedVarying.controlPoints.map((cp) => ({
          timelineTime: rationalToFloat(cp.time),
          sourceTime: cp.value,
          interpolation: cp.tangents ? ('bezier' as const) : ('linear' as const),
          ...(cp.tangents
            ? { bezierIn: cp.tangents.inTangent, bezierOut: cp.tangents.outTangent }
            : {}),
        })),
        frameBlending: 'frame-mix',
        pitchCorrection: true,
      };
    }
  } else if (opDef.uid.startsWith('urn:the-avid:effect:')) {
    // User-applied effect from The Avid.
    const defId = opDef.name;
    const params: Record<string, number | string | boolean> = {};
    for (const p of opGroup.parameters) {
      params[p.name] = p.value;
    }
    collectedEffects.push({ definitionId: defId, params, enabled: true });
  } else {
    // Unknown effect -- preserve as a generic effect.
    const params: Record<string, number | string | boolean> = {};
    for (const p of opGroup.parameters) {
      params[p.name] = p.value;
    }
    collectedEffects.push({
      definitionId: opDef.name || opDef.uid,
      params,
      enabled: true,
    });
  }

  // Recurse into the first input segment.
  if (opGroup.inputSegments.length > 0) {
    const innerResult = importSegment(
      opGroup.inputSegments[0],
      cursorEU,
      editRate,
      trackId,
      trackType,
      masterMobs,
      sourceMobs,
    );

    // Merge collected effects.
    const allEffects = [...collectedEffects, ...innerResult.effects];

    // Apply intrinsic overrides to the clip.
    if (innerResult.clip) {
      if (intrinsicOverrides.opacity !== undefined) {
        innerResult.clip.intrinsicVideo = {
          ...innerResult.clip.intrinsicVideo,
          opacity: intrinsicOverrides.opacity,
        };
      }
      if (intrinsicOverrides.volume !== undefined) {
        innerResult.clip.intrinsicAudio = {
          ...innerResult.clip.intrinsicAudio,
          volume: intrinsicOverrides.volume,
        };
      }
      if (intrinsicOverrides.pan !== undefined) {
        innerResult.clip.intrinsicAudio = {
          ...innerResult.clip.intrinsicAudio,
          pan: intrinsicOverrides.pan,
        };
      }
      if (intrinsicOverrides.timeRemap) {
        innerResult.clip.timeRemap = intrinsicOverrides.timeRemap;
      }
    }

    return { clip: innerResult.clip, effects: allEffects };
  }

  // No input segment -- create a clip from the operation group itself.
  return {
    clip: {
      id: generateUID(),
      trackId,
      name: opDef.name || 'Effect',
      startTime: editUnitsToSeconds(cursorEU, editRate),
      endTime: editUnitsToSeconds(cursorEU + opGroup.length, editRate),
      trimStart: 0,
      trimEnd: 0,
      type: trackType === 'AUDIO' ? 'audio' : 'video',
      intrinsicVideo: { ...DEFAULT_INTRINSIC_VIDEO },
      intrinsicAudio: { ...DEFAULT_INTRINSIC_AUDIO },
      timeRemap: { ...DEFAULT_TIME_REMAP },
    },
    effects: collectedEffects,
  };
}

/** Build an app Clip from an AAF SourceClip segment. */
function buildClipFromSourceClip(
  sourceClip: AAFSourceClip,
  cursorEU: number,
  editRate: AAFRational,
  trackId: string,
  trackType: TrackType,
  masterMobs: Map<AAFUID, AAFMasterMob>,
  sourceMobs: Map<AAFUID, AAFSourceMob>,
): Clip {
  const startTime = editUnitsToSeconds(cursorEU, editRate);
  const duration = editUnitsToSeconds(sourceClip.length, editRate);
  const trimStart = editUnitsToSeconds(sourceClip.sourceReference.startTime, editRate);

  // Resolve clip name from the mob chain.
  let clipName = sourceClip.name || 'Untitled';
  const masterMob = masterMobs.get(sourceClip.sourceReference.sourceID);
  if (masterMob && !sourceClip.name) {
    clipName = masterMob.name;
  }

  // Resolve asset ID and locator.
  let assetId: string | undefined;
  if (masterMob) {
    // Walk master mob -> source mob to find the locator.
    for (const mSlot of masterMob.timelineSlots) {
      for (const seg of mSlot.sequence.segments) {
        if (seg.kind === 'SourceClip') {
          const sm = sourceMobs.get(seg.sourceReference.sourceID);
          if (sm?.essenceDescriptor.locator) {
            const loc = sm.essenceDescriptor.locator;
            // Strip media:// protocol for internal asset IDs.
            assetId = loc.startsWith('media://') ? loc.substring(8) : loc;
          }
        }
      }
    }
  }

  // Extract intrinsic overrides from user comments.
  const comments = sourceClip.userComments || [];
  const getComment = (name: string): string | undefined =>
    comments.find((c) => c.name === name)?.value;

  const intrinsicVideo: IntrinsicVideoProps = {
    opacity: parseFloat(getComment('_opacity') ?? '100'),
    scaleX: parseFloat(getComment('_scaleX') ?? '100'),
    scaleY: parseFloat(getComment('_scaleY') ?? '100'),
    positionX: parseFloat(getComment('_positionX') ?? '0'),
    positionY: parseFloat(getComment('_positionY') ?? '0'),
    rotation: parseFloat(getComment('_rotation') ?? '0'),
    anchorX: parseFloat(getComment('_anchorX') ?? '0'),
    anchorY: parseFloat(getComment('_anchorY') ?? '0'),
  };

  const intrinsicAudio: IntrinsicAudioProps = {
    volume: parseFloat(getComment('_audioVolume') ?? '0'),
    pan: parseFloat(getComment('_audioPan') ?? '0'),
  };

  let timeRemap: TimeRemapState = { ...DEFAULT_TIME_REMAP };
  if (getComment('_timeRemapEnabled') === 'true') {
    timeRemap = {
      enabled: true,
      keyframes: [],
      frameBlending: (getComment('_timeRemapBlending') as TimeRemapState['frameBlending']) || 'frame-mix',
      pitchCorrection: getComment('_timeRemapPitchCorrection') !== 'false',
    };
    const kfJson = getComment('_timeRemapKeyframes');
    if (kfJson) {
      try {
        timeRemap.keyframes = JSON.parse(kfJson);
      } catch {
        // Ignore malformed keyframe data.
      }
    }
  }

  const clipType: Clip['type'] = (() => {
    switch (trackType) {
      case 'AUDIO': return 'audio';
      case 'EFFECT': return 'effect';
      case 'SUBTITLE': return 'subtitle';
      default: return 'video';
    }
  })();

  return {
    id: generateUID(),
    trackId,
    name: clipName,
    startTime,
    endTime: startTime + duration,
    trimStart,
    trimEnd: 0,
    type: clipType,
    color: getComment('_clipColor'),
    assetId: assetId || getComment('_assetId'),
    intrinsicVideo,
    intrinsicAudio,
    timeRemap,
  };
}

/** Get the length of a segment in edit units. */
function getSegmentLength(segment: AAFSegment): number {
  return segment.length;
}

// =============================================================================
//  AAF Engine Class
// =============================================================================

/**
 * Top-level AAF engine providing a clean API for importing and exporting AAF
 * files within The Avid editor.
 *
 * Usage:
 * ```ts
 * // Export
 * const aafDoc = aafEngine.exportTimeline(timelineData);
 * const binary = aafEngine.serialize(aafDoc);
 * downloadBlob(new Blob([binary], { type: 'application/octet-stream' }));
 *
 * // Import
 * const file = await fileInput.files[0].arrayBuffer();
 * const aafDoc = aafEngine.parse(file);
 * const timeline = aafEngine.importTimeline(aafDoc);
 * editorStore.loadTimeline(timeline);
 * ```
 */
class AAFEngine {
  private listeners = new Set<() => void>();

  // ── Export ────────────────────────────────────────────────────────────────

  /**
   * Convert app timeline data to an AAF object model.
   * @param timeline The timeline data to export.
   * @returns A fully populated AAFDocument.
   */
  exportTimeline(timeline: AAFTimelineData): AAFDocument {
    try {
      return exportToAAF(timeline);
    } catch (err) {
      console.error('[AAFEngine] Export failed:', err);
      throw err;
    }
  }

  /**
   * Serialise an AAF document to a binary ArrayBuffer.
   * @param document The AAF document to serialise.
   * @returns An ArrayBuffer with the binary AAF data.
   */
  serialize(document: AAFDocument): ArrayBuffer {
    try {
      return serializeAAF(document);
    } catch (err) {
      console.error('[AAFEngine] Serialisation failed:', err);
      throw err;
    }
  }

  /**
   * Convenience method: export timeline data directly to an ArrayBuffer.
   * @param timeline The timeline data.
   * @returns An ArrayBuffer with the serialised AAF.
   */
  exportToBuffer(timeline: AAFTimelineData): ArrayBuffer {
    const document = this.exportTimeline(timeline);
    return this.serialize(document);
  }

  /**
   * Export timeline data and return it as a downloadable Blob.
   * @param timeline The timeline data.
   * @param filename Optional filename hint (not embedded in the blob).
   * @returns A Blob containing the AAF binary data.
   */
  exportToBlob(timeline: AAFTimelineData, _filename?: string): Blob {
    const buffer = this.exportToBuffer(timeline);
    return new Blob([buffer], { type: 'application/octet-stream' });
  }

  // ── Import ────────────────────────────────────────────────────────────────

  /**
   * Parse an AAF binary buffer into an AAF object model.
   * @param buffer The raw file bytes.
   * @returns A parsed AAFDocument.
   * @throws AAFParseError if the file is invalid.
   */
  parse(buffer: ArrayBuffer): AAFDocument {
    try {
      return parseAAF(buffer);
    } catch (err) {
      if (err instanceof AAFParseError) throw err;
      console.error('[AAFEngine] Parse failed:', err);
      throw new AAFParseError(
        `Unexpected parse error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Convert a parsed AAF document into app timeline data.
   * @param document The AAF document.
   * @returns Timeline data for loading into the editor store.
   */
  importTimeline(document: AAFDocument): AAFTimelineData {
    try {
      return importFromAAF(document);
    } catch (err) {
      console.error('[AAFEngine] Import failed:', err);
      throw err;
    }
  }

  /**
   * Convenience method: parse an AAF buffer and convert directly to timeline data.
   * @param buffer The raw AAF file bytes.
   * @returns Timeline data ready for the editor store.
   */
  importFromBuffer(buffer: ArrayBuffer): AAFTimelineData {
    const document = this.parse(buffer);
    return this.importTimeline(document);
  }

  // ── Validation ────────────────────────────────────────────────────────────

  /**
   * Validate that a buffer appears to be a valid AAF file without fully parsing it.
   * Useful for pre-checking before expensive import operations.
   * @param buffer The buffer to check.
   * @returns An object with `valid` flag and optional `error` message.
   */
  validate(buffer: ArrayBuffer): { valid: boolean; error?: string } {
    if (buffer.byteLength < 512) {
      return { valid: false, error: 'File too small to be a valid AAF file.' };
    }

    const bytes = new Uint8Array(buffer);
    const isSimplified = AAF_MAGIC.every((b, i) => bytes[i] === b);
    const isOLE =
      bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0 &&
      bytes[4] === 0xa1 && bytes[5] === 0xb1 && bytes[6] === 0x1a && bytes[7] === 0xe1;

    if (!isSimplified && !isOLE) {
      return {
        valid: false,
        error: 'File does not have a valid AAF or OLE Structured Storage signature.',
      };
    }

    return { valid: true };
  }

  // ── Metadata / Inspection ─────────────────────────────────────────────────

  /**
   * Extract a summary of the AAF document contents without performing a full import.
   * Useful for displaying file info in a preview dialog.
   * @param document The parsed AAFDocument.
   * @returns A metadata summary.
   */
  getDocumentSummary(document: AAFDocument): AAFDocumentSummary {
    const comp = document.compositionMob;
    const editRate = resolveCompositionEditRate(comp);

    let videoTrackCount = 0;
    let audioTrackCount = 0;
    let totalClipCount = 0;
    let totalDurationEU = 0;

    for (const slot of comp.timelineSlots) {
      if (slot.sequence.dataDefinition === 'Timecode') continue;
      if (slot.sequence.dataDefinition === 'Picture') videoTrackCount++;
      else if (slot.sequence.dataDefinition === 'Sound') audioTrackCount++;

      let slotDuration = 0;
      for (const seg of slot.sequence.segments) {
        slotDuration += seg.length;
        if (seg.kind === 'SourceClip' || seg.kind === 'OperationGroup') {
          totalClipCount++;
        }
      }
      if (slotDuration > totalDurationEU) totalDurationEU = slotDuration;
    }

    let markerCount = 0;
    for (const es of comp.eventSlots) {
      markerCount += es.events.length;
    }

    return {
      projectName: comp.name,
      creationTime: comp.creationTime,
      lastModified: comp.lastModified,
      editRate: rationalToFloat(editRate),
      durationSeconds: editUnitsToSeconds(totalDurationEU, editRate),
      videoTrackCount,
      audioTrackCount,
      totalClipCount,
      markerCount,
      masterMobCount: document.masterMobs.length,
      sourceMobCount: document.sourceMobs.length,
      effectDefinitionCount: document.effectDefinitions.length,
      createdBy: document.header.identifications.length > 0
        ? `${document.header.identifications[0].productName} ${document.header.identifications[0].productVersionString}`
        : 'Unknown',
    };
  }

  // ── Roundtrip verification ────────────────────────────────────────────────

  /**
   * Perform a roundtrip test: export to AAF, serialise to binary, parse back,
   * and import. Returns a diagnostic comparing the original and roundtripped data.
   *
   * @param timeline The original timeline data.
   * @returns Diagnostic information about the roundtrip.
   */
  verifyRoundtrip(timeline: AAFTimelineData): AAFRoundtripDiagnostic {
    const warnings: string[] = [];

    try {
      const exported = this.exportTimeline(timeline);
      const binary = this.serialize(exported);
      const parsed = this.parse(binary);
      const imported = this.importTimeline(parsed);

      // Compare track counts.
      if (imported.tracks.length !== timeline.tracks.length) {
        warnings.push(
          `Track count mismatch: original=${timeline.tracks.length}, roundtripped=${imported.tracks.length}.`,
        );
      }

      // Compare total clip counts.
      const origClips = timeline.tracks.reduce((sum, t) => sum + t.clips.length, 0);
      const rtClips = imported.tracks.reduce((sum, t) => sum + t.clips.length, 0);
      if (rtClips !== origClips) {
        warnings.push(
          `Clip count mismatch: original=${origClips}, roundtripped=${rtClips}.`,
        );
      }

      // Compare marker counts.
      if (imported.markers.length !== timeline.markers.length) {
        warnings.push(
          `Marker count mismatch: original=${timeline.markers.length}, roundtripped=${imported.markers.length}.`,
        );
      }

      return {
        success: true,
        binarySize: binary.byteLength,
        warnings,
      };
    } catch (err) {
      return {
        success: false,
        binarySize: 0,
        warnings,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ── Subscribe ─────────────────────────────────────────────────────────────

  /**
   * Subscribe to engine events (import/export progress, etc.).
   * @param cb Callback invoked on state change.
   * @returns An unsubscribe function.
   */
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /** Notify all listeners. */
  private notify(): void {
    this.listeners.forEach((fn) => fn());
  }
}

// ─── Summary and Diagnostic types ────────────────────────────────────────────

/** Summary of an AAF document for preview/inspection. */
export interface AAFDocumentSummary {
  projectName: string;
  creationTime: string;
  lastModified: string;
  editRate: number;
  durationSeconds: number;
  videoTrackCount: number;
  audioTrackCount: number;
  totalClipCount: number;
  markerCount: number;
  masterMobCount: number;
  sourceMobCount: number;
  effectDefinitionCount: number;
  createdBy: string;
}

/** Diagnostic result of an AAF roundtrip verification. */
export interface AAFRoundtripDiagnostic {
  success: boolean;
  binarySize: number;
  warnings: string[];
  error?: string;
}

// =============================================================================
//  Singleton Export
// =============================================================================

/** Singleton AAF engine instance. */
export const aafEngine = new AAFEngine();
