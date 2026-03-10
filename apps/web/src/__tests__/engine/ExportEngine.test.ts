import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  buildExportFramePlan,
  buildExportSnapshotForFrame,
  exportEngine,
  getExportFrameTime,
} from '../../engine/ExportEngine';
import { buildPlaybackSnapshot, buildPlaybackFrameSignature } from '../../engine/PlaybackSnapshot';
import * as playbackSnapshotFrameModule from '../../engine/playbackSnapshotFrame';
import { makeClip } from '../../store/editor.store';

describe('ExportEngine', () => {
  afterEach(() => {
    window.electronAPI = undefined;
    vi.useRealTimers();
    exportEngine.getActiveJobs().forEach((job) => exportEngine.cancelExport(job.id));
    vi.restoreAllMocks();
  });

  const createRenderSource = () => ({
    tracks: [
      {
        id: 'track-v1',
        name: 'V1',
        type: 'VIDEO' as const,
        sortOrder: 0,
        muted: false,
        locked: false,
        solo: false,
        volume: 1,
        color: '#5b6af5',
        clips: [
          makeClip({
            id: 'clip-sequence-export',
            trackId: 'track-v1',
            name: 'Sequence Export Clip',
            startTime: 0,
            endTime: 0.2,
            trimStart: 0,
            trimEnd: 0,
            type: 'video',
            assetId: 'asset-sequence-export',
          }),
        ],
      },
    ],
    subtitleTracks: [],
    titleClips: [],
    showSafeZones: false,
    sequenceSettings: {
      fps: 30,
      width: 1920,
      height: 1080,
    },
    projectSettings: {
      frameRate: 30,
      width: 1920,
      height: 1080,
    },
    sequenceDuration: 0.2,
    inPoint: 0,
    outPoint: 0.2,
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

    it('captures export snapshot and selection metadata on the job', () => {
      const snapshot = buildPlaybackSnapshot({
        tracks: [
          {
            id: 't-v1',
            name: 'V1',
            type: 'VIDEO',
            sortOrder: 0,
            muted: false,
            locked: false,
            solo: false,
            volume: 1,
            color: '#5b6af5',
            clips: [
              makeClip({
                id: 'clip-export',
                trackId: 't-v1',
                name: 'Export Clip',
                startTime: 0,
                endTime: 5,
                trimStart: 0,
                trimEnd: 0,
                type: 'video',
                assetId: 'asset-export',
              }),
            ],
          },
        ],
        subtitleTracks: [],
        titleClips: [],
        playheadTime: 2,
        duration: 5,
        isPlaying: false,
        showSafeZones: false,
        activeMonitor: 'record',
        activeScope: null,
        sequenceSettings: {
          fps: 24,
          width: 1920,
          height: 1080,
        },
        projectSettings: {
          frameRate: 24,
          width: 1920,
          height: 1080,
        },
      }, 'export');

      const job = exportEngine.startExport('stream-h264-1080p', 'local', {
        inFrame: 48,
        outFrame: 120,
        selectionLabel: 'Selected Clips',
        snapshot,
        renderFrameRevision: 'render-revision-1',
        renderProcessing: 'post',
        renderOverlayProcessing: 'post',
        previewImageDataUrl: 'data:image/jpeg;base64,preview',
        duration: 3,
      });
      const storedJob = exportEngine.getJob(job.id);

      expect(storedJob?.selectionLabel).toBe('Selected Clips');
      expect(storedJob?.inFrame).toBe(48);
      expect(storedJob?.outFrame).toBe(120);
      expect(storedJob?.previewClipName).toBe('Export Clip');
      expect(storedJob?.previewFrameNumber).toBe(snapshot.frameNumber);
      expect(storedJob?.snapshotSequenceRevision).toBe(snapshot.sequenceRevision);
      expect(storedJob?.snapshotFrameSignature).toBe(buildPlaybackFrameSignature(snapshot));
      expect(storedJob?.renderFrameRevision).toBe('render-revision-1');
      expect(storedJob?.renderProcessing).toBe('post');
      expect(storedJob?.renderOverlayProcessing).toBe('post');
      expect(storedJob?.previewImageDataUrl).toBe('data:image/jpeg;base64,preview');

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

    it('builds deterministic frame plans and snapshots for real exports', () => {
      const renderSource = createRenderSource();
      const plan = buildExportFramePlan(renderSource, 30);

      expect(plan.outputFps).toBe(30);
      expect(plan.startTime).toBe(0);
      expect(plan.endTime).toBe(0.2);
      expect(plan.frameCount).toBe(6);
      expect(getExportFrameTime(plan, 3)).toBeCloseTo(0.1, 5);

      const snapshot = buildExportSnapshotForFrame(renderSource, plan, 3);
      expect(snapshot.playheadTime).toBeCloseTo(0.1, 5);
      expect(snapshot.duration).toBe(0.2);
      expect(snapshot.fps).toBe(30);
      expect(snapshot.aspectRatio).toBeCloseTo(16 / 9, 5);
      expect(snapshot.activeMonitor).toBe('record');
    });

    it('steps sequence frames for supported browser webm exports', async () => {
      vi.useFakeTimers();

      const renderSource = createRenderSource();
      const mockCanvas = { width: 0, height: 0 } as HTMLCanvasElement;
      const originalCreateElement = document.createElement.bind(document);

      vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
        if (tagName === 'canvas') {
          return mockCanvas;
        }

        const element = originalCreateElement(tagName);
        if (tagName === 'a') {
          element.click = vi.fn();
        }
        return element;
      }) as typeof document.createElement);
      vi.spyOn(exportEngine as unknown as { isBrowserFrameExportSupported: () => boolean }, 'isBrowserFrameExportSupported')
        .mockReturnValue(true);
      vi.spyOn(playbackSnapshotFrameModule, 'renderPlaybackSnapshotFrame').mockReturnValue({
        canvas: mockCanvas,
        frameRevision: 'frame-stepped-export',
        cacheHit: false,
      });
      const startRealExportSpy = vi
        .spyOn(exportEngine, 'startRealExport')
        .mockImplementation(async (_jobId, _canvas, _duration, _fps, onProgress) => {
          onProgress?.(0.2);
          return await new Promise<{ blob: Blob; mimeType: string; audioTrackCount: number }>((resolve) => {
            setTimeout(() => {
              onProgress?.(1);
              resolve({
                blob: new Blob(['webm'], { type: 'video/webm' }),
                mimeType: 'video/webm',
                audioTrackCount: 0,
              });
            }, 250);
          });
        });

      const job = exportEngine.startExport('custom-webm-vp9', 'local', {
        duration: 0.2,
        renderSource,
      });

      await vi.runAllTimersAsync();

      const storedJob = exportEngine.getJob(job.id);
      expect(storedJob?.status).toBe('completed');
      expect(storedJob?.totalFrameCount).toBe(6);
      expect(storedJob?.renderedFrameCount).toBe(6);
      expect(storedJob?.outputPath).toMatch(/\.webm$/);
      expect(startRealExportSpy).toHaveBeenCalledWith(
        job.id,
        mockCanvas,
        0.2,
        30,
        expect.any(Function),
      );
      expect(playbackSnapshotFrameModule.renderPlaybackSnapshotFrame).toHaveBeenCalledTimes(6);
      expect(playbackSnapshotFrameModule.renderPlaybackSnapshotFrame).toHaveBeenCalledWith(expect.objectContaining({
        overlayProcessing: 'post',
      }));
    });

    it('hands non-webm frame-stepped exports to desktop transcode', async () => {
      vi.useFakeTimers();

      const renderSource = createRenderSource();
      const mockCanvas = { width: 0, height: 0 } as HTMLCanvasElement;
      const originalCreateElement = document.createElement.bind(document);
      const transcodeExportArtifact = vi.fn().mockResolvedValue({
        outputPath: '/tmp/transcoded/stream_h264.mp4',
        outputContainer: 'mp4',
        outputVideoCodec: 'libx264',
        outputAudioCodec: 'aac',
      });

      window.electronAPI = {
        transcodeExportArtifact,
      } as unknown as typeof window.electronAPI;

      vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
        if (tagName === 'canvas') {
          return mockCanvas;
        }

        const element = originalCreateElement(tagName);
        if (tagName === 'a') {
          element.click = vi.fn();
        }
        return element;
      }) as typeof document.createElement);
      vi.spyOn(exportEngine as unknown as { isBrowserFrameExportSupported: () => boolean }, 'isBrowserFrameExportSupported')
        .mockReturnValue(true);
      vi.spyOn(playbackSnapshotFrameModule, 'renderPlaybackSnapshotFrame').mockReturnValue({
        canvas: mockCanvas,
        frameRevision: 'frame-stepped-export',
        cacheHit: false,
      });
      vi.spyOn(exportEngine, 'startRealExport').mockImplementation(async (_jobId, _canvas, _duration, _fps, onProgress) => {
        onProgress?.(1);
        return {
          blob: new Blob(['webm'], { type: 'video/webm' }),
          mimeType: 'video/webm',
          audioTrackCount: 0,
        };
      });

      const job = exportEngine.startExport('stream-h264-1080p', 'local', {
        duration: 0.2,
        renderSource,
      });

      await vi.runAllTimersAsync();

      const storedJob = exportEngine.getJob(job.id);
      expect(storedJob?.status).toBe('completed');
      expect(storedJob?.outputPath).toBe('/tmp/transcoded/stream_h264.mp4');
      expect(transcodeExportArtifact).toHaveBeenCalledWith(expect.objectContaining({
        jobId: job.id,
        sourceContainer: 'webm',
        targetContainer: 'mp4',
        targetVideoCodec: 'h264',
        targetAudioCodec: 'aac',
        sourceArtifact: expect.any(Uint8Array),
      }));
      expect(playbackSnapshotFrameModule.renderPlaybackSnapshotFrame).toHaveBeenCalledWith(expect.objectContaining({
        overlayProcessing: 'post',
      }));
    });

    it('passes audio sources into real export and stores muxed track metadata', async () => {
      const createObjectURL = vi
        .spyOn(URL, 'createObjectURL')
        .mockReturnValue('blob:mock-audio-export');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
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
        job.id,
        canvas,
        1,
        30,
        expect.any(Function),
        [{ stream: audioStream, label: 'mix-main' }],
      );

      const completed = exportEngine.getJob(job.id);
      expect(completed).toBeDefined();
      expect(completed!.status).toBe('completed');
      expect(completed!.audio).toEqual({
        requestedSources: 1,
        muxedTrackCount: 2,
      });

      expect(createObjectURL).toHaveBeenCalled();
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
