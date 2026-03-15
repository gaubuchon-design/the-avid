import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractMetadata, setCodecService } from '../../../../services/local-ai-runtime/src/capabilities/metadata-extraction';
import type { CodecService } from '../CodecService';
import { HWAccelType } from '../types';
import type { ProbeResult } from '../types';

// =============================================================================
//  Mock CodecService for metadata extraction tests
// =============================================================================

function createMockCodecService(probeResult: Partial<ProbeResult> = {}): CodecService {
  const defaultProbe: ProbeResult = {
    videoCodec: 'prores',
    width: 4096,
    height: 2160,
    fps: 24,
    duration: 300.5,
    bitDepth: 10,
    hasAlpha: false,
    pixelFormat: 'yuv422p10le',
    colorSpace: 'bt2020',
    colorTransfer: 'smpte2084',
    colorPrimaries: 'bt2020',
    videoBitrate: 500_000_000,
    audioCodec: 'pcm_s24le',
    audioChannels: 6,
    audioSampleRate: 48000,
    audioBitDepth: 24,
    audioBitrate: 6_912_000,
    channelLayout: '5.1',
    containerFormat: 'mov',
    fileSize: 18_750_000_000,
    numVideoStreams: 1,
    numAudioStreams: 1,
    numSubtitleStreams: 0,
    timecodeStart: '01:00:00:00',
    reelName: 'A001_C001_0101AB',
    hwDecodeAvailable: true,
    hwDecodeType: HWAccelType.VIDEOTOOLBOX,
    error: 0,
    errorMessage: '',
    ...probeResult,
  };

  return {
    name: 'MockCodecService',
    isNative: true,
    init: vi.fn(async () => {}),
    dispose: vi.fn(),
    probe: vi.fn(async () => defaultProbe),
    decodeFrame: vi.fn(async () => ({
      data: new ArrayBuffer(0), width: 0, height: 0, stride: 0,
      format: 0, timestamp: 0, frameNumber: 0, keyFrame: true,
    })),
    decodeRaw: vi.fn(async () => null),
    isRawSupported: vi.fn(() => false),
    decodeImageSequenceFrame: vi.fn(async () => ({
      data: new ArrayBuffer(0), width: 0, height: 0, stride: 0,
      format: 0, timestamp: 0, frameNumber: 0, keyFrame: true,
    })),
    openEncodeSession: vi.fn(async () => 'session'),
    writeVideoFrame: vi.fn(async () => {}),
    writeAudioSamples: vi.fn(async () => {}),
    finalizeEncode: vi.fn(async () => {}),
    remux: vi.fn(async () => {}),
    transcode: vi.fn(async () => {}),
    queryHWAccel: vi.fn(async () => ({
      numDevices: 0, devices: [],
      preferredDecode: HWAccelType.NONE,
      preferredEncode: HWAccelType.NONE,
    })),
    getCapabilities: vi.fn(() => []),
    canDecode: vi.fn(() => true),
    canEncode: vi.fn(() => true),
    getVersions: vi.fn(() => ({ ffmpeg: '6.1', libraw: '0.21', openexr: '3.2' })),
  };
}

// =============================================================================
//  Tests
// =============================================================================

describe('extractMetadata with native CodecService', () => {
  let mockService: CodecService;

  beforeEach(() => {
    mockService = createMockCodecService();
    setCodecService(mockService);
  });

  afterEach(() => {
    // Reset to no codec service
    setCodecService(null as unknown as CodecService);
  });

  it('returns real metadata from native probe for video files', async () => {
    const meta = await extractMetadata('/media/shot.mov');
    expect(mockService.probe).toHaveBeenCalledWith('/media/shot.mov');
    expect(meta.codec).toBe('prores');
    expect(meta.resolution).toEqual({ width: 4096, height: 2160 });
    expect(meta.frameRate).toBe(24);
    expect(meta.duration).toBe(300.5);
    expect(meta.format).toBe('mov');
    expect(meta.bitDepth).toBe(10);
    expect(meta.colorSpace).toBe('bt2020');
    expect(meta.colorTransfer).toBe('smpte2084');
    expect(meta.timecodeStart).toBe('01:00:00:00');
    expect(meta.reelName).toBe('A001_C001_0101AB');
    expect(meta.channelLayout).toBe('5.1');
    expect(meta.channels).toBe(6);
    expect(meta.sampleRate).toBe(48000);
  });

  it('returns HDR metadata from native probe', async () => {
    const hdrService = createMockCodecService({
      colorSpace: 'bt2020nc',
      colorTransfer: 'smpte2084',
      colorPrimaries: 'bt2020',
      bitDepth: 10,
    });
    setCodecService(hdrService);

    const meta = await extractMetadata('/media/hdr_clip.mov');
    expect(meta.colorSpace).toBe('bt2020nc');
    expect(meta.colorTransfer).toBe('smpte2084');
    expect(meta.colorPrimaries).toBe('bt2020');
    expect(meta.bitDepth).toBe(10);
  });

  it('returns audio-only metadata when no video streams', async () => {
    const audioService = createMockCodecService({
      videoCodec: '',
      width: 0,
      height: 0,
      fps: 0,
      duration: 180,
      audioCodec: 'flac',
      audioChannels: 2,
      audioSampleRate: 96000,
      containerFormat: 'flac',
    });
    setCodecService(audioService);

    const meta = await extractMetadata('/media/track.flac');
    expect(meta.codec).toBe('flac');
    expect(meta.resolution).toBeUndefined();
    expect(meta.frameRate).toBeUndefined();
    expect(meta.sampleRate).toBe(96000);
    expect(meta.channels).toBe(2);
  });

  it('falls back to extension heuristics when probe fails', async () => {
    const failingService = createMockCodecService({ error: -1 });
    setCodecService(failingService);

    // This will hit the fallback path since error !== 0
    // But stat will throw because the file doesn't exist
    await expect(extractMetadata('/nonexistent/file.mp4')).rejects.toThrow();
  });

  it('returns alpha flag from probe', async () => {
    const alphaService = createMockCodecService({ hasAlpha: true });
    setCodecService(alphaService);

    const meta = await extractMetadata('/media/alpha_clip.mov');
    expect(meta.hasAlpha).toBe(true);
  });
});
