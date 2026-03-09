/**
 * @fileoverview Tests for Phase 8 -- Pro Tools Shared Automation Bridge.
 *
 * Covers:
 * - {@link ProToolsBridge}: dialogue cleanup, loudness prep, temp music,
 *   export, handoff with job tracking
 * - {@link SharedJobHistory}: recording, filtering, stats, export
 * - {@link HandoffManager}: MC -> PT -> MC round trip
 * - Workflow integration: combined cleanup + prep + handoff pipeline
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MockProToolsAdapter } from '../../MockProToolsAdapter';
import { ProToolsBridge } from '../ProToolsBridge';
import { SharedJobHistory, type JobHistoryEntry } from '../SharedJobHistory';
import { HandoffManager } from '../HandoffManager';
import { runDialogueCleanup } from '../DialogueCleanupWorkflow';
import { runLoudnessPrep } from '../LoudnessPrepWorkflow';
import { placeTempMusic } from '../TempMusicWorkflow';

// ---------------------------------------------------------------------------
// SharedJobHistory
// ---------------------------------------------------------------------------

describe('SharedJobHistory', () => {
  let history: SharedJobHistory;

  beforeEach(() => {
    history = new SharedJobHistory();
  });

  it('records and retrieves jobs', () => {
    const entry: JobHistoryEntry = {
      id: 'j1',
      type: 'dialogue-cleanup',
      status: 'completed',
      startedAt: '2026-01-01T00:00:00Z',
      completedAt: '2026-01-01T00:00:01Z',
      durationMs: 1_000,
    };
    history.recordJob(entry);
    const jobs = history.getHistory();
    expect(jobs.length).toBe(1);
    expect(jobs[0].id).toBe('j1');
  });

  it('replaces an entry with the same id', () => {
    history.recordJob({
      id: 'j1',
      type: 'loudness-prep',
      status: 'running',
      startedAt: '2026-01-01T00:00:00Z',
    });
    history.recordJob({
      id: 'j1',
      type: 'loudness-prep',
      status: 'completed',
      startedAt: '2026-01-01T00:00:00Z',
      completedAt: '2026-01-01T00:00:02Z',
      durationMs: 2_000,
    });
    const jobs = history.getHistory();
    expect(jobs.length).toBe(1);
    expect(jobs[0].status).toBe('completed');
  });

  it('filters by type', () => {
    history.recordJob({ id: 'j1', type: 'dialogue-cleanup', status: 'completed', startedAt: '' });
    history.recordJob({ id: 'j2', type: 'loudness-prep', status: 'completed', startedAt: '' });
    history.recordJob({ id: 'j3', type: 'dialogue-cleanup', status: 'failed', startedAt: '' });

    const cleanups = history.getHistory({ type: 'dialogue-cleanup' });
    expect(cleanups.length).toBe(2);
    expect(cleanups.every((j) => j.type === 'dialogue-cleanup')).toBe(true);
  });

  it('filters by status', () => {
    history.recordJob({ id: 'j1', type: 'export', status: 'completed', startedAt: '' });
    history.recordJob({ id: 'j2', type: 'export', status: 'failed', startedAt: '' });

    const failed = history.getHistory({ status: 'failed' });
    expect(failed.length).toBe(1);
    expect(failed[0].id).toBe('j2');
  });

  it('computes stats correctly', () => {
    history.recordJob({ id: 'j1', type: 'dialogue-cleanup', status: 'completed', startedAt: '', durationMs: 100 });
    history.recordJob({ id: 'j2', type: 'dialogue-cleanup', status: 'completed', startedAt: '', durationMs: 200 });
    history.recordJob({ id: 'j3', type: 'loudness-prep', status: 'failed', startedAt: '' });
    history.recordJob({ id: 'j4', type: 'export', status: 'running', startedAt: '' });

    const stats = history.getStats();
    expect(stats.total).toBe(4);
    expect(stats.byType['dialogue-cleanup']).toBe(2);
    expect(stats.byType['loudness-prep']).toBe(1);
    expect(stats.byType['export']).toBe(1);
    expect(stats.byStatus['completed']).toBe(2);
    expect(stats.byStatus['failed']).toBe(1);
    expect(stats.byStatus['running']).toBe(1);
    expect(stats.avgDurationMs).toBe(150);
  });

  it('exports to valid JSON', () => {
    history.recordJob({ id: 'j1', type: 'handoff', status: 'completed', startedAt: '' });
    const json = history.exportJSON();
    const parsed = JSON.parse(json) as JobHistoryEntry[];
    expect(parsed.length).toBe(1);
    expect(parsed[0].id).toBe('j1');
  });
});

// ---------------------------------------------------------------------------
// HandoffManager
// ---------------------------------------------------------------------------

describe('HandoffManager', () => {
  let manager: HandoffManager;

  beforeEach(() => {
    manager = new HandoffManager();
  });

  it('handoffToProTools creates a completed entry', async () => {
    const { entry } = await manager.handoffToProTools('seq_001', ['A1', 'A2']);
    expect(entry.status).toBe('completed');
    expect(entry.direction).toBe('mc-to-pt');
    expect(entry.trackCount).toBe(2);
    expect(entry.resultId).toBeDefined();
  });

  it('receiveFromProTools creates a completed entry', async () => {
    const { entry } = await manager.receiveFromProTools('ptsession_123');
    expect(entry.status).toBe('completed');
    expect(entry.direction).toBe('pt-to-mc');
    expect(entry.resultId).toBeDefined();
  });

  it('round trip MC -> PT -> MC records both entries', async () => {
    const forward = await manager.handoffToProTools('seq_001', ['A1']);
    const back = await manager.receiveFromProTools(forward.entry.resultId!);

    const history = manager.getHandoffHistory();
    expect(history.length).toBe(2);
    // Most recent first
    expect(history[0].direction).toBe('pt-to-mc');
    expect(history[1].direction).toBe('mc-to-pt');

    expect(back.entry.direction).toBe('pt-to-mc');
  });

  it('getPendingHandoffs is empty when all are completed', async () => {
    await manager.handoffToProTools('seq_001', ['A1']);
    expect(manager.getPendingHandoffs().length).toBe(0);
  });

  it('throws when no tracks are provided', async () => {
    await expect(
      manager.handoffToProTools('seq_001', []),
    ).rejects.toThrow('At least one track');
  });
});

// ---------------------------------------------------------------------------
// Dialogue Cleanup Workflow
// ---------------------------------------------------------------------------

describe('runDialogueCleanup', () => {
  it('returns before and after metrics', async () => {
    const result = await runDialogueCleanup(['trk_01', 'trk_02'], {
      aggressiveness: 0.5,
      targetLufs: -24,
    });
    expect(result.denoised).toBe(true);
    expect(result.normalizedLoudness).toBe(true);
    expect(result.removedSilence).toBe(true);
    expect(result.beforeMetrics.lufs).toBeLessThan(0);
    expect(result.afterMetrics.lufs).toBeLessThan(0);
  });

  it('warns on high aggressiveness', async () => {
    const result = await runDialogueCleanup(['trk_01'], {
      aggressiveness: 0.95,
    });
    expect(result.warnings.some((w) => w.includes('aggressiveness'))).toBe(true);
  });

  it('throws with zero tracks', async () => {
    await expect(runDialogueCleanup([])).rejects.toThrow('At least one track');
  });
});

// ---------------------------------------------------------------------------
// Loudness Prep Workflow
// ---------------------------------------------------------------------------

describe('runLoudnessPrep', () => {
  it('normalizes to the target LUFS', async () => {
    const result = await runLoudnessPrep(['trk_01'], -24);
    expect(result.success).toBe(true);
    expect(result.targetLufs).toBe(-24);
    // After should be close to target
    expect(Math.abs(result.after.integratedLufs - (-24))).toBeLessThan(1);
  });

  it('warns on high target LUFS', async () => {
    const result = await runLoudnessPrep(['trk_01'], -10);
    expect(result.warnings.some((w) => w.includes('broadcast specs'))).toBe(true);
  });

  it('throws with zero tracks', async () => {
    await expect(runLoudnessPrep([], -24)).rejects.toThrow('At least one track');
  });
});

// ---------------------------------------------------------------------------
// Temp Music Workflow
// ---------------------------------------------------------------------------

describe('placeTempMusic', () => {
  it('places a music track', async () => {
    const result = await placeTempMusic({
      mood: 'upbeat',
      genre: 'ambient',
      duration: 60,
    });
    expect(result.success).toBe(true);
    expect(result.trackName).toBeDefined();
    expect(result.durationSec).toBeLessThanOrEqual(60);
  });

  it('handles missing mood/genre by falling back', async () => {
    const result = await placeTempMusic({});
    expect(result.success).toBe(true);
    expect(result.trackName).toBeDefined();
  });

  it('warns when duration exceeds track length', async () => {
    const result = await placeTempMusic({ duration: 99_999 });
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// ProToolsBridge -- integration
// ---------------------------------------------------------------------------

describe('ProToolsBridge', () => {
  let bridge: ProToolsBridge;
  let mock: MockProToolsAdapter;

  beforeEach(async () => {
    mock = new MockProToolsAdapter();
    bridge = new ProToolsBridge(mock);
    // Open a session for most tests.
    await bridge.openSession('/sessions/test_show.ptx');
  });

  it('opens a session and reports info', async () => {
    const info = await bridge.getSessionInfo();
    expect(info.name).toBe('test_show');
    expect(info.sampleRate).toBe(48_000);
  });

  it('throws when no session is open', async () => {
    const fresh = new ProToolsBridge(new MockProToolsAdapter());
    await expect(fresh.getSessionInfo()).rejects.toThrow('No Pro Tools session');
  });

  it('runDialogueCleanup records a job', async () => {
    const result = await bridge.runDialogueCleanup(
      ['A1', 'A2'],
      {
        noiseFloor: -60,
        deReverb: true,
        deEss: false,
        aggressiveness: 0.5,
      },
    );
    expect(result.success).toBe(true);

    const jobs = bridge.getJobHistory();
    expect(jobs.length).toBeGreaterThanOrEqual(1);
    const cleanup = jobs.find((j) => j.type === 'dialogue-cleanup');
    expect(cleanup).toBeDefined();
    expect(cleanup!.status).toBe('completed');
    expect(cleanup!.durationMs).toBeGreaterThan(0);
  });

  it('runLoudnessPrep records a job', async () => {
    const result = await bridge.runLoudnessPrep(['A1'], -24);
    expect(result.success).toBe(true);

    const jobs = bridge.getJobHistory();
    const prep = jobs.find((j) => j.type === 'loudness-prep');
    expect(prep).toBeDefined();
    expect(prep!.status).toBe('completed');
  });

  it('placeTempMusic records a job', async () => {
    const result = await bridge.placeTempMusic({
      moodTags: ['upbeat', 'ambient'],
      duration: 60,
      targetLUFS: -24,
      autoDuck: true,
    });
    expect(result.success).toBe(true);

    const jobs = bridge.getJobHistory();
    const music = jobs.find((j) => j.type === 'temp-music');
    expect(music).toBeDefined();
    expect(music!.status).toBe('completed');
  });

  it('exportMix records a job', async () => {
    const result = await bridge.exportMix('WAV', { bitDepth: 24 });
    expect(result.success).toBe(true);

    const jobs = bridge.getJobHistory();
    const exp = jobs.find((j) => j.type === 'export');
    expect(exp).toBeDefined();
    expect(exp!.status).toBe('completed');
  });

  it('handoffToProTools records a handoff job', async () => {
    const fresh = new ProToolsBridge(new MockProToolsAdapter());
    const result = await fresh.handoffToProTools('seq_001', ['A1', 'A2']);
    expect(result.success).toBe(true);
    expect(result.trackCount).toBe(2);

    const jobs = fresh.getJobHistory();
    const handoff = jobs.find((j) => j.type === 'handoff');
    expect(handoff).toBeDefined();
    expect(handoff!.status).toBe('completed');
  });

  it('receiveFromProTools records a handoff job', async () => {
    const info = await bridge.getSessionInfo();
    const result = await bridge.receiveFromProTools(info.sessionId);
    expect(result.success).toBe(true);

    const jobs = bridge.getJobHistory();
    const handoff = jobs.find((j) => j.type === 'handoff');
    expect(handoff).toBeDefined();
  });

  it('getActiveJobs returns only running/pending jobs', async () => {
    // After a completed job, active should be empty.
    await bridge.runLoudnessPrep(['A1'], -24);
    const active = bridge.getActiveJobs();
    expect(active.length).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Workflow integration -- combined cleanup + prep + handoff
  // -----------------------------------------------------------------------

  it('full pipeline: cleanup -> loudness -> export -> handoff', { timeout: 30_000 }, async () => {
    // Cleanup
    await bridge.runDialogueCleanup(['A1', 'A2'], {
      noiseFloor: -60,
      deReverb: true,
      deEss: false,
      aggressiveness: 0.6,
    });

    // Loudness prep
    await bridge.runLoudnessPrep(['A1', 'A2'], -24);

    // Export mix
    const exportResult = await bridge.exportMix('WAV', { bitDepth: 24 });
    expect(exportResult.success).toBe(true);

    // Receive back into MC
    const session = await bridge.getSessionInfo();
    const receiveResult = await bridge.receiveFromProTools(session.sessionId);
    expect(receiveResult.success).toBe(true);

    // Verify all jobs were recorded.
    const jobs = bridge.getJobHistory();
    expect(jobs.length).toBe(4);

    const stats = bridge.getSharedJobHistory().getStats();
    expect(stats.total).toBe(4);
    expect(stats.byType['dialogue-cleanup']).toBe(1);
    expect(stats.byType['loudness-prep']).toBe(1);
    expect(stats.byType['export']).toBe(1);
    expect(stats.byType['handoff']).toBe(1);
    expect(stats.avgDurationMs).toBeGreaterThan(0);
  });
});
