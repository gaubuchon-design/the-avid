import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { exportEngine } from '../../engine/ExportEngine';

describe('ExportEngine', () => {
  afterEach(() => {
    exportEngine.getActiveJobs().forEach((job) => exportEngine.cancelExport(job.id));
    vi.restoreAllMocks();
  });

  // ── Presets ────────────────────────────────────────────────────────────

  describe('presets', () => {
    it('getPresets() returns all presets', () => {
      const presets = exportEngine.getPresets();
      expect(presets.length).toBe(15);
    });

    it('getPresets(category) filters by category', () => {
      const broadcast = exportEngine.getPresets('broadcast');
      expect(broadcast.length).toBe(3);
      broadcast.forEach((p) => expect(p.category).toBe('broadcast'));

      const streaming = exportEngine.getPresets('streaming');
      expect(streaming.length).toBe(4);
      streaming.forEach((p) => expect(p.category).toBe('streaming'));

      const social = exportEngine.getPresets('social');
      expect(social.length).toBe(4);
      social.forEach((p) => expect(p.category).toBe('social'));

      const archive = exportEngine.getPresets('archive');
      expect(archive.length).toBe(2);

      const custom = exportEngine.getPresets('custom');
      expect(custom.length).toBe(2);
    });

    it('getPreset(id) returns matching preset', () => {
      const preset = exportEngine.getPreset('stream-h264-1080p');
      expect(preset).toBeDefined();
      expect(preset!.name).toBe('H.264 1080p High');
      expect(preset!.format).toBe('h264');
      expect(preset!.resolution.width).toBe(1920);
      expect(preset!.resolution.height).toBe(1080);
    });

    it('getPreset() returns undefined for unknown ID', () => {
      expect(exportEngine.getPreset('nonexistent')).toBeUndefined();
    });
  });

  // ── Subscribe/Unsubscribe ──────────────────────────────────────────────

  describe('subscribe', () => {
    it('subscribe/unsubscribe pattern works', () => {
      const listener = vi.fn();
      const unsub = exportEngine.subscribe(listener);

      // Start an export to trigger notification
      const job = exportEngine.startExport('stream-h264-1080p', 'local');
      expect(listener).toHaveBeenCalled();

      const callCount = listener.mock.calls.length;
      unsub();

      // Cleanup
      exportEngine.cancelExport(job.id);
    });
  });

  // ── Jobs ───────────────────────────────────────────────────────────────

  describe('jobs', () => {
    it('startExport() creates job with encoding status', () => {
      const job = exportEngine.startExport('stream-h264-1080p', 'local');
      expect(job).toBeDefined();
      expect(job.status).toBe('encoding');
      expect(job.progress).toBe(0);
      expect(job.presetId).toBe('stream-h264-1080p');
      expect(job.id).toBeTruthy();
      expect(job.startedAt).toBeGreaterThan(0);

      // Cleanup
      exportEngine.cancelExport(job.id);
    });

    it('cancelExport() sets job to failed', () => {
      const job = exportEngine.startExport('stream-h264-1080p', 'local');
      exportEngine.cancelExport(job.id);
      const cancelled = exportEngine.getJob(job.id);
      expect(cancelled).toBeDefined();
      expect(cancelled!.status).toBe('failed');
      expect(cancelled!.error).toBe('Cancelled by user');
    });

    it('getJob() returns undefined for unknown job', () => {
      expect(exportEngine.getJob('nonexistent')).toBeUndefined();
    });

    it('getActiveJobs() returns all jobs sorted by most recent', () => {
      const j1 = exportEngine.startExport('stream-h264-1080p', 'local');
      const j2 = exportEngine.startExport('stream-h264-4k', 'local');
      const jobs = exportEngine.getActiveJobs();
      expect(jobs.length).toBeGreaterThanOrEqual(2);
      // Should be sorted by startedAt descending
      if (jobs.length >= 2) {
        expect(jobs[0]!.startedAt).toBeGreaterThanOrEqual(jobs[1]!.startedAt);
      }

      // Cleanup
      exportEngine.cancelExport(j1.id);
      exportEngine.cancelExport(j2.id);
    });

    it('passes audio sources into real export and stores muxed track metadata', async () => {
      const createObjectURL = vi
        .spyOn(URL, 'createObjectURL')
        .mockReturnValue('blob:mock-audio-export');
      const revokeObjectURL = vi
        .spyOn(URL, 'revokeObjectURL')
        .mockImplementation(() => undefined);
      const appendSpy = vi.spyOn(document.body, 'appendChild');
      const removeSpy = vi.spyOn(document.body, 'removeChild');

      const startRealExport = vi
        .spyOn(exportEngine, 'startRealExport')
        .mockResolvedValue({
          blob: new Blob(['muxed-export'], { type: 'video/webm' }),
          mimeType: 'video/webm;codecs=vp9,opus',
          audioTrackCount: 2,
        });

      const canvas = { captureStream: vi.fn() } as unknown as HTMLCanvasElement;
      const fakeAudioTrack = { kind: 'audio' } as MediaStreamTrack;
      const audioStream = {
        getAudioTracks: () => [fakeAudioTrack],
      } as unknown as MediaStream;

      const job = exportEngine.startExport('custom-webm-vp9', 'local', {
        canvas,
        duration: 1,
        audioSources: [{ stream: audioStream, label: 'mix-main' }],
      });

      await Promise.resolve();

      expect(startRealExport).toHaveBeenCalledWith(
        canvas,
        1,
        30,
        [{ stream: audioStream, label: 'mix-main' }],
        expect.any(Function),
      );

      const completed = exportEngine.getJob(job.id);
      expect(completed).toBeDefined();
      expect(completed!.status).toBe('completed');
      expect(completed!.audio).toEqual({
        requestedSources: 1,
        muxedTrackCount: 2,
      });

      expect(createObjectURL).toHaveBeenCalled();
      expect(revokeObjectURL).toHaveBeenCalledTimes(0);
      expect(appendSpy).toHaveBeenCalled();
      expect(removeSpy).toHaveBeenCalled();
    });

    it('adds encoder handoff metadata when preset container is not webm', async () => {
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-handoff-export');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
      vi.spyOn(document.body, 'appendChild');
      vi.spyOn(document.body, 'removeChild');

      vi.spyOn(exportEngine, 'startRealExport').mockResolvedValue({
        blob: new Blob(['handoff-export'], { type: 'video/webm' }),
        mimeType: 'video/webm;codecs=vp9,opus',
        audioTrackCount: 1,
      });

      const canvas = { captureStream: vi.fn() } as unknown as HTMLCanvasElement;
      const job = exportEngine.startExport('stream-h264-1080p', 'local', {
        canvas,
        duration: 1,
      });

      await Promise.resolve();

      const completed = exportEngine.getJob(job.id);
      expect(completed).toBeDefined();
      expect(completed!.status).toBe('completed');
      expect(completed!.encoderHandoff).toBeDefined();
      expect(completed!.encoderHandoff!.targetFormat).toBe('h264');
      expect(completed!.encoderHandoff!.targetContainer).toBe('mp4');
      expect(completed!.encoderHandoff!.targetAudioCodec).toBe('aac');
      expect(completed!.encoderHandoff!.sourceMimeType).toContain('video/webm');
      expect(completed!.outputPath).toMatch(/\.webm$/);
    });
  });

  // ── Captions ───────────────────────────────────────────────────────────

  describe('captions', () => {
    it('exportCaptions(srt) produces valid SRT format', () => {
      const srt = exportEngine.exportCaptions('srt');
      expect(srt).toContain('1\n');
      expect(srt).toContain('-->');
      // SRT uses comma for milliseconds
      expect(srt).toMatch(/\d{2}:\d{2}:\d{2},\d{3}/);
      expect(srt).toContain('The morning light crept through the blinds.');
    });

    it('exportCaptions(vtt) produces valid WebVTT format', () => {
      const vtt = exportEngine.exportCaptions('vtt');
      expect(vtt).toMatch(/^WEBVTT/);
      expect(vtt).toContain('-->');
      // VTT uses period for milliseconds
      expect(vtt).toMatch(/\d{2}:\d{2}:\d{2}\.\d{3}/);
      expect(vtt).toContain('The morning light crept through the blinds.');
    });

    it('exportCaptions(scc) produces valid SCC format', () => {
      const scc = exportEngine.exportCaptions('scc');
      expect(scc).toMatch(/^Scenarist_SCC V1\.0/);
      expect(scc).toMatch(/\d{2}:\d{2}:\d{2}:\d{2}/);
      expect(scc).toContain('9420 9420');
    });

    it('exportCaptions(ttml) produces valid TTML XML', () => {
      const ttml = exportEngine.exportCaptions('ttml');
      expect(ttml).toContain('<?xml version="1.0"');
      expect(ttml).toContain('<tt xmlns="http://www.w3.org/ns/ttml">');
      expect(ttml).toContain('<body>');
      expect(ttml).toContain('<p begin=');
      expect(ttml).toContain('end=');
      expect(ttml).toContain('</tt>');
    });

    it('exportCaptions with unknown format returns empty string', () => {
      expect(exportEngine.exportCaptions('unknown' as any)).toBe('');
    });
  });
});
