import {
  getAudioChannelCountForLayout,
  pickDominantAudioChannelLayout,
  type AudioChannelLayout,
} from '../audio/channelLayout';
import type {
  AudioBusDefinition,
  AudioInsertDefinition,
  AudioProcessingContext,
  AudioStemRole,
  AudioBusMeteringMode,
  AudioBusRole,
  AudioBusSendDefinition,
} from './NLEPortContracts';

export interface AudioTrackRoutingDescriptor {
  trackId: string;
  trackName: string;
  layout: AudioChannelLayout;
  channelCount: number;
  clipLayouts: AudioChannelLayout[];
}

export interface AudioMixTopology {
  buses: AudioBusDefinition[];
  dominantLayout: AudioChannelLayout;
  sourceLayouts: AudioChannelLayout[];
  containsContainerizedAudio: boolean;
  printMasterBusId: string;
  monitoringBusId: string;
  routingWarnings: string[];
  processingWarnings: string[];
}

export interface AudioBusProcessingContextSummary {
  context: AudioProcessingContext;
  activeStages: AudioInsertDefinition[];
  bypassedStages: AudioInsertDefinition[];
}

export interface AudioBusProcessingPolicySummary {
  preview: AudioBusProcessingContextSummary;
  print: AudioBusProcessingContextSummary;
  requiresDedicatedPreviewRender: boolean;
  requiresDedicatedPrintRender: boolean;
}

export type AudioPreviewExecutionMode = 'direct-monitor' | 'buffered-preview-cache';
export type AudioPrintExecutionMode = 'live-print-safe' | 'offline-print-render';

export interface AudioBusExecutionPolicySummary {
  previewMode: AudioPreviewExecutionMode;
  printMode: AudioPrintExecutionMode;
  previewReasonKinds: AudioInsertDefinition['kind'][];
  printReasonKinds: AudioInsertDefinition['kind'][];
}

function uniqueLayouts(values: AudioChannelLayout[]): AudioChannelLayout[] {
  return Array.from(new Set(values));
}

function uniqueStrings<T extends string>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function createSend(
  sourceBusId: string,
  targetBusId: string,
  purpose: AudioBusSendDefinition['purpose'],
  layout: AudioChannelLayout,
  gainDb = 0,
): AudioBusSendDefinition {
  return {
    id: `${sourceBusId}-to-${targetBusId}`,
    targetBusId,
    mode: 'post-fader',
    gainDb,
    purpose,
    layout,
  };
}

function createBus(
  id: string,
  name: string,
  role: AudioBusRole,
  stemRole: AudioStemRole,
  layout: AudioChannelLayout,
  sourceTrackIds: string[],
  sourceLayouts: AudioChannelLayout[],
  meteringMode: AudioBusMeteringMode,
  sendTargets: AudioBusSendDefinition[] = [],
  processingChain: AudioInsertDefinition[] = [],
): AudioBusDefinition {
  return {
    id,
    name,
    role,
    stemRole,
    layout,
    channelCount: getAudioChannelCountForLayout(layout),
    sourceTrackIds,
    sourceLayouts,
    meteringMode,
    sendTargets,
    processingChain,
  };
}

function createInsert(
  busId: string,
  slot: number,
  kind: AudioInsertDefinition['kind'],
  name: string,
  placement: AudioInsertDefinition['placement'] = 'bus',
  latencyMs = 0.4,
  appliesDuring: AudioInsertDefinition['appliesDuring'] = 'both',
): AudioInsertDefinition {
  return {
    id: `${busId}-${kind}-${slot}`,
    name,
    kind,
    placement,
    appliesDuring,
    slot,
    enabled: true,
    latencyMs,
  };
}

export function resolveAudioBusProcessingChain(
  bus: Pick<AudioBusDefinition, 'processingChain'>,
  context: AudioProcessingContext,
): AudioInsertDefinition[] {
  return (bus.processingChain ?? []).filter((stage) => (
    stage.enabled
      && (stage.appliesDuring === 'both' || stage.appliesDuring === context)
  ));
}

export function resolveBypassedAudioBusProcessingChain(
  bus: Pick<AudioBusDefinition, 'processingChain'>,
  context: AudioProcessingContext,
): AudioInsertDefinition[] {
  return (bus.processingChain ?? []).filter((stage) => (
    stage.enabled
      && stage.appliesDuring !== 'both'
      && stage.appliesDuring !== context
  ));
}

export function summarizeAudioBusProcessingPolicy(
  bus: Pick<AudioBusDefinition, 'processingChain'>,
): AudioBusProcessingPolicySummary {
  const preview = {
    context: 'preview' as const,
    activeStages: resolveAudioBusProcessingChain(bus, 'preview'),
    bypassedStages: resolveBypassedAudioBusProcessingChain(bus, 'preview'),
  };
  const print = {
    context: 'print' as const,
    activeStages: resolveAudioBusProcessingChain(bus, 'print'),
    bypassedStages: resolveBypassedAudioBusProcessingChain(bus, 'print'),
  };

  return {
    preview,
    print,
    requiresDedicatedPreviewRender: preview.activeStages.length !== print.activeStages.length
      || preview.bypassedStages.length > 0,
    requiresDedicatedPrintRender: print.activeStages.length !== preview.activeStages.length
      || print.bypassedStages.length > 0,
  };
}

export function summarizeAudioBusExecutionPolicy(
  bus: Pick<AudioBusDefinition, 'processingChain'>,
): AudioBusExecutionPolicySummary {
  const policy = summarizeAudioBusProcessingPolicy(bus);
  const previewReasonKinds: AudioInsertDefinition['kind'][] = uniqueStrings(policy.preview.bypassedStages.map((stage) => stage.kind));
  const printReasonKinds: AudioInsertDefinition['kind'][] = uniqueStrings([
    ...policy.print.activeStages.map((stage) => stage.kind),
    ...policy.print.bypassedStages.map((stage) => stage.kind),
  ]);

  return {
    previewMode: policy.requiresDedicatedPreviewRender ? 'buffered-preview-cache' : 'direct-monitor',
    printMode: policy.requiresDedicatedPrintRender ? 'offline-print-render' : 'live-print-safe',
    previewReasonKinds,
    printReasonKinds,
  };
}

export function buildAudioMixTopology(trackLayouts: AudioTrackRoutingDescriptor[]): AudioMixTopology {
  const sourceLayouts = uniqueLayouts(
    trackLayouts.flatMap((track) => track.clipLayouts.length > 0 ? track.clipLayouts : [track.layout]),
  );
  const dominantLayout = pickDominantAudioChannelLayout(sourceLayouts);
  const containsContainerizedAudio = trackLayouts.some((track) => track.channelCount > 2);
  const routingWarnings: string[] = [];
  const processingWarnings: string[] = [];

  if (trackLayouts.length === 0) {
    routingWarnings.push('No audio tracks are available for bus compilation.');
  }

  for (const track of trackLayouts) {
    if (track.clipLayouts.length > 1) {
      routingWarnings.push(
        `Track "${track.trackName}" contains mixed source layouts (${track.clipLayouts.join(', ')}); split it before final turnover.`,
      );
    }
  }

  const monoTracks = trackLayouts.filter((track) => track.layout === 'mono');
  const stereoTracks = trackLayouts.filter((track) => track.layout === 'stereo');
  const surroundTracks = trackLayouts.filter((track) => track.layout === '5.1' || track.layout === '7.1');

  if (surroundTracks.length > 0 && stereoTracks.length > 0) {
    routingWarnings.push('Stereo and surround material share the same mix; verify printmaster and fold-down routing.');
  }
  if (containsContainerizedAudio) {
    processingWarnings.push('Fold-down monitoring is derived from multichannel material; validate consumer downmix coefficients before final delivery.');
  }
  if (trackLayouts.some((track) => track.clipLayouts.length > 1)) {
    processingWarnings.push('Mixed-layout source tracks may require split EQ/dynamics treatment before final turnover.');
  }

  const buses: AudioBusDefinition[] = [];
  const masterBusId = 'master';
  const printMasterBusId = 'printmaster';
  const monitoringBusId = containsContainerizedAudio ? 'fold-down' : masterBusId;

  if (monoTracks.length > 0) {
    buses.push(createBus(
      'dialogue',
      'Dialogue',
      'dialogue',
      'DX',
      'mono',
      monoTracks.map((track) => track.trackId),
      uniqueLayouts(monoTracks.flatMap((track) => track.clipLayouts)),
      'ebu-r128',
      [createSend('dialogue', masterBusId, 'submix', 'mono')],
      [
        createInsert('dialogue', 1, 'eq', 'Dialogue EQ'),
        createInsert('dialogue', 2, 'dynamics', 'Dialogue Compressor'),
      ],
    ));
  }

  if (stereoTracks.length > 0) {
    buses.push(createBus(
      'music-effects',
      'Music+Effects',
      'music-effects',
      'MXFX',
      'stereo',
      stereoTracks.map((track) => track.trackId),
      uniqueLayouts(stereoTracks.flatMap((track) => track.clipLayouts)),
      'ebu-r128',
      [createSend('music-effects', masterBusId, 'submix', 'stereo')],
      [
        createInsert('music-effects', 1, 'eq', 'Music+Effects EQ'),
        createInsert('music-effects', 2, 'dynamics', 'Music Bus Compressor'),
      ],
    ));
  }

  if (surroundTracks.length > 0) {
    const surroundLayouts = uniqueLayouts(surroundTracks.flatMap((track) => track.clipLayouts));
    const surroundLayout = pickDominantAudioChannelLayout(surroundLayouts);
    buses.push(createBus(
      'surround',
      'Surround',
      'surround',
      'SURROUND',
      surroundLayout === '7.1' ? '7.1' : '5.1',
      surroundTracks.map((track) => track.trackId),
      surroundLayouts,
      'ebu-r128',
      [createSend('surround', masterBusId, 'submix', surroundLayout === '7.1' ? '7.1' : '5.1')],
      [
        createInsert('surround', 1, 'dynamics', 'Surround Dynamics'),
      ],
    ));
  }

  buses.push(createBus(
    masterBusId,
    'Master',
    'master',
    'FULLMIX',
    dominantLayout,
    trackLayouts.map((track) => track.trackId),
    sourceLayouts,
    'true-peak',
    [
      createSend(masterBusId, printMasterBusId, 'printmaster', dominantLayout),
      ...(containsContainerizedAudio ? [createSend(masterBusId, monitoringBusId, 'fold-down', 'stereo', -3)] : []),
    ],
    [
      createInsert(masterBusId, 1, 'limiter', 'Master Brickwall Limiter', 'bus', 0.4, 'preview'),
    ],
  ));

  buses.push(createBus(
    printMasterBusId,
    'Printmaster',
    'printmaster',
    'PRINTMASTER',
    dominantLayout,
    trackLayouts.map((track) => track.trackId),
    sourceLayouts,
    'ebu-r128',
    [],
    [
      createInsert(printMasterBusId, 1, 'meter', 'Printmaster Loudness Meter', 'output', 0.2, 'print'),
      createInsert(printMasterBusId, 2, 'limiter', 'Printmaster True Peak Limiter', 'output', 0.6, 'print'),
    ],
  ));

  if (containsContainerizedAudio) {
    buses.push(createBus(
      'fold-down',
      'Stereo Fold-Down',
      'fold-down',
      'FOLDDOWN',
      'stereo',
      surroundTracks.map((track) => track.trackId),
      sourceLayouts,
      'true-peak',
      [],
      [
        createInsert('fold-down', 1, 'fold-down-matrix', 'Stereo Fold-Down Matrix', 'output', 0.5, 'both'),
        createInsert('fold-down', 2, 'limiter', 'Fold-Down Limiter', 'output', 0.6, 'print'),
      ],
    ));
  }

  return {
    buses,
    dominantLayout,
    sourceLayouts,
    containsContainerizedAudio,
    printMasterBusId,
    monitoringBusId,
    routingWarnings,
    processingWarnings,
  };
}
