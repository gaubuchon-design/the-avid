import { describe, expect, it } from 'vitest';
import {
  appendJobLineage,
  coordinatorToWorkerMessageSchema,
  createAssetCapabilityReport,
  createArtifactManifest,
  createRenderExecutionJob,
  createVariantManifest,
  inferMediaSupportTier,
  matchesWorkerToJob,
  normalizeMediaJob,
  normalizeWorkerCapabilityReport,
  parseCoordinatorToWorkerMessage,
  pickVariant,
  renderJobSubmissionSchema,
  workerToCoordinatorMessageSchema,
} from '../index';

describe('media-backend contracts', () => {
  it('materializes a coordinator render submission into a worker assignment payload', () => {
    const submission = renderJobSubmissionSchema.parse({
      name: 'YouTube 4K Master',
      presetId: 'stream-h264-4k',
      priority: 'high',
      sourceTimelineId: 'timeline-main',
      totalFrames: 2400,
      inputUrl: 'file:///tmp/timeline-main.mov',
      outputPath: '/tmp/timeline-main-h264.mp4',
      codec: 'h264',
      exportSettings: {
        bitrate: '20M',
      },
    });

    const workerJob = createRenderExecutionJob('job-render-1', submission);
    const assignment = parseCoordinatorToWorkerMessage({
      type: 'job:assign',
      job: workerJob,
    });

    expect(assignment).toEqual(coordinatorToWorkerMessageSchema.parse({
      type: 'job:assign',
      job: workerJob,
    }));
    if (assignment.type !== 'job:assign') {
      throw new Error('expected job assignment');
    }
    expect(assignment.job.type).toBe('render');
    expect(assignment.job.priority).toBeGreaterThan(50);
    expect(assignment.job.params).toMatchObject({
      presetId: 'stream-h264-4k',
      sourceTimelineId: 'timeline-main',
      totalFrames: 2400,
    });
  });

  it('normalizes legacy worker job kinds and validates worker event payloads', () => {
    const normalized = normalizeMediaJob({
      id: 'job-probe-1',
      type: 'metadata',
      inputUrl: 'file:///tmp/reel-01.mov',
      params: {
        includeStreams: true,
      },
    });

    expect(normalized.type).toBe('probe');

    const workerEvent = workerToCoordinatorMessageSchema.parse({
      type: 'job:progress',
      jobId: normalized.id,
      progress: 42,
      detail: { stage: 'probing' },
    });

    expect(workerEvent.type).toBe('job:progress');
  });

  it('matches workers to shared capability requirements and preserves artifact lineage', () => {
    const worker = normalizeWorkerCapabilityReport({
      gpuVendor: 'NVIDIA',
      gpuName: 'RTX 4090',
      vramMB: 24576,
      cpuCores: 24,
      memoryGB: 64,
      availableCodecs: ['h264', 'h265', 'prores'],
      ffmpegVersion: '7.1',
      maxConcurrentJobs: 4,
      hwAccel: ['nvenc'],
    }, ['render', 'transcode', 'probe']);

    const submission = renderJobSubmissionSchema.parse({
      name: 'Archive Master',
      presetId: 'archive-prores4444xq',
      priority: 'critical',
      sourceTimelineId: 'timeline-archive',
      totalFrames: 1200,
      inputUrl: 'file:///tmp/archive-source.mov',
      outputPath: '/tmp/archive-master.mov',
      codec: 'prores',
      capabilityRequirements: {
        workerKinds: ['render'],
        codecs: ['prores'],
        hwAccel: [],
        minVramMB: 4096,
      },
    });

    const job = createRenderExecutionJob('job-archive-1', submission);
    expect(matchesWorkerToJob(worker, job)).toBe(true);

    const manifest = createArtifactManifest({
      manifestId: 'manifest-1',
      jobId: job.id,
      createdAt: '2026-03-13T12:00:00.000Z',
      artifacts: [
        {
          id: 'artifact-source',
          kind: 'source',
          uri: job.inputUrl,
          createdAt: '2026-03-13T12:00:00.000Z',
          derivedFromArtifactIds: [],
          metadata: {},
        },
        {
          id: 'artifact-delivery',
          kind: 'delivery',
          uri: '/tmp/archive-master.mov',
          createdAt: '2026-03-13T12:05:00.000Z',
          derivedFromArtifactIds: ['artifact-source'],
          metadata: {},
        },
      ],
    });
    const lineage = appendJobLineage(job.lineage ?? {
      rootJobId: job.id,
      entries: [],
    }, {
      jobId: job.id,
      stage: 'render',
      parentJobIds: [],
      inputArtifactIds: ['artifact-source'],
      outputArtifactIds: ['artifact-delivery'],
      createdAt: '2026-03-13T12:05:00.000Z',
      attempt: 1,
      metadata: {},
    });
    const variants = createVariantManifest({
      manifestId: 'variants-1',
      createdAt: '2026-03-13T12:05:00.000Z',
      canonicalArtifactId: 'artifact-source',
      variants: [
        {
          variantId: 'variant-source',
          purpose: 'source',
          artifactId: 'artifact-source',
          container: 'mov',
          videoCodec: 'prores',
          metadata: {},
        },
        {
          variantId: 'variant-playback',
          purpose: 'delivery',
          artifactId: 'artifact-delivery',
          container: 'mov',
          videoCodec: 'prores',
          metadata: {},
        },
      ],
    });

    expect(manifest.artifacts).toHaveLength(2);
    expect(lineage.entries[0]?.outputArtifactIds).toContain('artifact-delivery');
    expect(pickVariant(variants, ['delivery', 'playback'])?.artifactId).toBe('artifact-delivery');
  });

  it('classifies normalized raw video with a ready proxy explicitly across surfaces', () => {
    const supportTier = inferMediaSupportTier({
      assetClass: 'video',
      fileExtension: 'r3d',
      container: 'r3d',
      videoCodec: 'redcode_raw',
      audioCodec: 'pcm_s24le',
      streams: [
        {
          id: 'stream-video',
          index: 0,
          kind: 'video',
          codec: 'redcode_raw',
          frameRate: {
            numerator: 24000,
            denominator: 1001,
            framesPerSecond: 23.976,
          },
          averageFrameRate: {
            numerator: 24000,
            denominator: 1001,
            framesPerSecond: 23.976,
          },
          width: 6144,
          height: 3160,
          disposition: [],
          sideData: [],
          captions: [],
        },
      ],
      variants: [
        {
          id: 'variant-proxy',
          purpose: 'proxy',
          availability: 'ready',
          supportTier: 'normalized',
          container: 'mp4',
          videoCodec: 'h264',
          audioCodec: 'aac',
        },
      ],
    });

    const report = createAssetCapabilityReport({
      assetClass: 'video',
      supportTier,
      fileExtension: 'r3d',
      container: 'r3d',
      videoCodec: 'redcode_raw',
      audioCodec: 'pcm_s24le',
      variants: [
        {
          id: 'variant-proxy',
          purpose: 'proxy',
          availability: 'ready',
          supportTier: 'normalized',
          container: 'mp4',
          videoCodec: 'h264',
          audioCodec: 'aac',
        },
      ],
      streams: [
        {
          id: 'stream-video',
          index: 0,
          kind: 'video',
          codec: 'redcode_raw',
          frameRate: {
            numerator: 24000,
            denominator: 1001,
            framesPerSecond: 23.976,
          },
          averageFrameRate: {
            numerator: 24000,
            denominator: 1001,
            framesPerSecond: 23.976,
          },
          width: 6144,
          height: 3160,
          disposition: [],
          sideData: [],
          captions: [],
        },
      ],
    });

    expect(supportTier).toBe('normalized');
    expect(report.primaryDisposition).toBe('proxy-only');
    expect(report.surfaces.find((surface) => surface.surface === 'desktop')?.disposition).toBe('proxy-only');
    expect(report.surfaces.find((surface) => surface.surface === 'web')?.disposition).toBe('proxy-only');
    expect(report.surfaces.find((surface) => surface.surface === 'worker')?.disposition).toBe('mezzanine-required');
  });

  it('forces HDR or VFR review paths into explicit mezzanine decisions', () => {
    const report = createAssetCapabilityReport({
      assetClass: 'video',
      fileExtension: 'mov',
      container: 'mov',
      videoCodec: 'prores',
      audioCodec: 'pcm_s24le',
      colorDescriptor: {
        colorSpace: 'Rec.2020',
        transfer: 'smpte2084',
        hdrMode: 'pq',
      },
      streams: [
        {
          id: 'stream-video',
          index: 0,
          kind: 'video',
          codec: 'prores',
          frameRate: {
            numerator: 30000,
            denominator: 1001,
            framesPerSecond: 29.97,
          },
          averageFrameRate: {
            numerator: 24000,
            denominator: 1001,
            framesPerSecond: 23.976,
          },
          width: 3840,
          height: 2160,
          colorDescriptor: {
            colorSpace: 'Rec.2020',
            transfer: 'smpte2084',
            hdrMode: 'pq',
          },
          disposition: [],
          sideData: [],
          captions: [],
        },
      ],
      variants: [],
    });

    expect(report.surfaces.find((surface) => surface.surface === 'desktop')?.disposition).toBe('native');
    expect(report.surfaces.find((surface) => surface.surface === 'web')?.disposition).toBe('mezzanine-required');
    expect(report.surfaces.find((surface) => surface.surface === 'mobile')?.disposition).toBe('mezzanine-required');
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.stringContaining('HDR'),
      expect.stringContaining('Variable or mixed frame-rate'),
    ]));
  });

  it('classifies multichannel audio and proprietary protected media honestly', () => {
    const surround = createAssetCapabilityReport({
      assetClass: 'audio',
      fileExtension: 'wav',
      container: 'wav',
      audioCodec: 'pcm_s24le',
      audioChannels: 6,
      audioChannelLayout: '5.1',
      streams: [
        {
          id: 'stream-audio',
          index: 0,
          kind: 'audio',
          codec: 'pcm_s24le',
          audioChannels: 6,
          audioChannelLayout: '5.1',
          sampleRate: 48000,
          disposition: [],
          sideData: [],
          captions: [],
        },
      ],
      variants: [],
    });
    const proprietary = createAssetCapabilityReport({
      assetClass: 'video',
      fileExtension: 'm4p',
      container: 'm4p',
      videoCodec: 'h264',
      streams: [
        {
          id: 'stream-video',
          index: 0,
          kind: 'video',
          codec: 'h264',
          width: 1920,
          height: 1080,
          disposition: [],
          sideData: [],
          captions: [],
        },
      ],
      variants: [],
    });

    expect(surround.surfaces.find((surface) => surface.surface === 'desktop')?.disposition).toBe('native');
    expect(surround.surfaces.find((surface) => surface.surface === 'web')?.disposition).toBe('mezzanine-required');
    expect(proprietary.surfaces.every((surface) => surface.disposition === 'unsupported')).toBe(true);
    expect(proprietary.issues[0]).toContain('protected or proprietary');
  });
});
