import { describe, expect, it } from 'vitest';
import {
  buildAudioMixTopology,
  summarizeAudioBusProcessingPolicy,
  type AudioTrackRoutingDescriptor,
} from '../parity/audioMixTopology';

function makeTrack(
  trackId: string,
  trackName: string,
  layout: AudioTrackRoutingDescriptor['layout'],
  clipLayouts: AudioTrackRoutingDescriptor['clipLayouts'] = [layout],
): AudioTrackRoutingDescriptor {
  return {
    trackId,
    trackName,
    layout,
    channelCount: layout === 'mono' ? 1 : layout === 'stereo' ? 2 : layout === '5.1' ? 6 : 8,
    clipLayouts,
  };
}

describe('buildAudioMixTopology', () => {
  it('builds printmaster and fold-down routing for mixed stereo and surround material', () => {
    const topology = buildAudioMixTopology([
      makeTrack('A1', 'Dialogue', 'mono'),
      makeTrack('A2', 'Music', 'stereo'),
      makeTrack('A3', 'Production', '5.1'),
    ]);

    expect(topology.dominantLayout).toBe('5.1');
    expect(topology.printMasterBusId).toBe('printmaster');
    expect(topology.monitoringBusId).toBe('fold-down');
    expect(topology.buses.some((bus) => bus.role === 'dialogue')).toBe(true);
    expect(topology.buses.some((bus) => bus.role === 'music-effects')).toBe(true);
    expect(topology.buses.some((bus) => bus.role === 'surround')).toBe(true);
    expect(topology.buses.some((bus) => bus.role === 'printmaster')).toBe(true);
    expect(topology.buses.some((bus) => bus.role === 'fold-down')).toBe(true);
    expect(topology.buses.find((bus) => bus.role === 'dialogue')?.stemRole).toBe('DX');
    expect(topology.buses.find((bus) => bus.role === 'printmaster')?.stemRole).toBe('PRINTMASTER');
    expect(topology.buses.find((bus) => bus.id === 'master')?.sendTargets?.map((send) => send.targetBusId)).toEqual([
      'printmaster',
      'fold-down',
    ]);
    expect(topology.buses.find((bus) => bus.role === 'printmaster')?.processingChain?.map((stage) => stage.kind)).toEqual([
      'meter',
      'limiter',
    ]);
    expect(topology.buses.find((bus) => bus.role === 'printmaster')?.processingChain?.map((stage) => stage.appliesDuring)).toEqual([
      'print',
      'print',
    ]);
    expect(topology.buses.find((bus) => bus.role === 'fold-down')?.processingChain?.map((stage) => stage.kind)).toEqual([
      'fold-down-matrix',
      'limiter',
    ]);
    expect(topology.buses.find((bus) => bus.role === 'fold-down')?.processingChain?.map((stage) => stage.appliesDuring)).toEqual([
      'both',
      'print',
    ]);
    expect(topology.routingWarnings[0]).toContain('Stereo and surround material');
    expect(topology.processingWarnings[0]).toContain('Fold-down monitoring');
  });

  it('flags tracks that mix incompatible clip layouts', () => {
    const topology = buildAudioMixTopology([
      makeTrack('A1', 'Mixed FX', 'stereo', ['stereo', '5.1']),
    ]);

    expect(topology.routingWarnings).toContain(
      'Track "Mixed FX" contains mixed source layouts (stereo, 5.1); split it before final turnover.',
    );
  });

  it('summarizes preview and print processing policy per bus', () => {
    const topology = buildAudioMixTopology([
      makeTrack('A1', 'Dialogue', 'mono'),
      makeTrack('A2', 'Production', '5.1'),
    ]);

    const printmasterPolicy = summarizeAudioBusProcessingPolicy(
      topology.buses.find((bus) => bus.role === 'printmaster')!,
    );
    const foldDownPolicy = summarizeAudioBusProcessingPolicy(
      topology.buses.find((bus) => bus.role === 'fold-down')!,
    );

    expect(printmasterPolicy.preview.activeStages).toEqual([]);
    expect(printmasterPolicy.print.activeStages.map((stage) => stage.kind)).toEqual(['meter', 'limiter']);
    expect(printmasterPolicy.preview.bypassedStages.map((stage) => stage.kind)).toEqual(['meter', 'limiter']);
    expect(printmasterPolicy.requiresDedicatedPrintRender).toBe(true);
    expect(foldDownPolicy.preview.activeStages.map((stage) => stage.kind)).toEqual(['fold-down-matrix']);
    expect(foldDownPolicy.print.activeStages.map((stage) => stage.kind)).toEqual(['fold-down-matrix', 'limiter']);
    expect(foldDownPolicy.preview.bypassedStages.map((stage) => stage.kind)).toEqual(['limiter']);
  });
});
