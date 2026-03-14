import { describe, expect, it } from 'vitest';
import {
  NLE_PARITY_EXECUTION_PHASES,
  NLE_PORT_CONTRACTS,
  getNLEParityExecutionPhase,
  getNLEParityGapScaffold,
  listNLEParityGapIds,
  listNLEParityGapScaffolds,
} from '../parity';

describe('NLE parity scaffold', () => {
  it('covers the expected parity gaps', () => {
    expect(listNLEParityGapIds()).toEqual([
      'decode-playback-pipeline',
      'gpu-compositing-engine',
      'aaf-omf-xml-interchange',
      'realtime-multi-stream-playback',
      'professional-audio-mixing',
      'motion-effects-titler',
      'media-management-workflows',
      'edl-change-list-workflows',
      'multi-cam-editing',
    ]);
  });

  it('only references known contract identifiers', () => {
    const knownContracts = new Set<string>(NLE_PORT_CONTRACTS);

    for (const gap of listNLEParityGapScaffolds()) {
      for (const contractId of gap.contractIds) {
        expect(knownContracts.has(contractId)).toBe(true);
      }
    }
  });

  it('assigns each parity gap to exactly one execution phase', () => {
    const phasedGapIds = NLE_PARITY_EXECUTION_PHASES.flatMap((phase) => [...phase.gapIds]);
    const uniquePhasedGapIds = [...new Set(phasedGapIds)].sort();
    const gapIds = [...listNLEParityGapIds()].sort();

    expect(uniquePhasedGapIds).toEqual(gapIds);
    expect(phasedGapIds).toHaveLength(gapIds.length);
  });

  it('supports gap lookup and phase lookup', () => {
    const gap = getNLEParityGapScaffold('realtime-multi-stream-playback');

    expect(gap?.title).toBe('Real-Time Multi-Stream Playback');
    expect(getNLEParityExecutionPhase('realtime-multi-stream-playback')?.phase).toBe('Phase 2');
  });
});
