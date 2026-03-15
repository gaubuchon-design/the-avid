import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NativeCodecService } from '../NativeCodecService';
import { PixelFormat, HWAccelType } from '../types';
import type { CodecService } from '../CodecService';
import type { ProbeResult, HWAccelReport, CodecVersions, DecodedFrameData } from '../types';
import {
  FULL_CODEC_CAPABILITIES,
  BROWSER_CODEC_CAPABILITIES,
} from '../codecCapabilities';
import { createCodecService } from '../index';

// =============================================================================
//  Mock native addon
// =============================================================================

function createMockProbeResult(overrides?: Partial<ProbeResult>): ProbeResult {
  return {
    videoCodec: 'h264',
    width: 1920,
    height: 1080,
    fps: 23.976,
    duration: 120.5,
    bitDepth: 8,
    hasAlpha: false,
    pixelFormat: 'yuv420p',
    colorSpace: 'bt709',
    colorTransfer: 'bt709',
    colorPrimaries: 'bt709',
    videoBitrate: 20_000_000,
    audioCodec: 'aac',
    audioChannels: 2,
    audioSampleRate: 48000,
    audioBitDepth: 16,
    audioBitrate: 320_000,
    channelLayout: 'stereo',
    containerFormat: 'mp4',
    fileSize: 300_000_000,
    numVideoStreams: 1,
    numAudioStreams: 1,
    numSubtitleStreams: 0,
    timecodeStart: '01:00:00:00',
    reelName: 'A001_C001',
    hwDecodeAvailable: true,
    hwDecodeType: HWAccelType.VIDEOTOOLBOX,
    error: 0,
    errorMessage: '',
    ...overrides,
  };
}

function createMockHWAccelReport(): HWAccelReport {
  return {
    numDevices: 1,
    devices: [{
      type: HWAccelType.VIDEOTOOLBOX,
      name: 'videotoolbox',
      deviceName: 'Apple VideoToolbox',
      supported: true,
      vramBytes: 0,
    }],
    preferredDecode: HWAccelType.VIDEOTOOLBOX,
    preferredEncode: HWAccelType.VIDEOTOOLBOX,
  };
}

function createMockFrameData(overrides?: Partial<DecodedFrameData>): DecodedFrameData {
  const width = overrides?.width ?? 1920;
  const height = overrides?.height ?? 1080;
  return {
    data: new ArrayBuffer(width * height * 4),
    width,
    height,
    stride: width * 4,
    format: PixelFormat.RGBA8,
    timestamp: 0,
    frameNumber: 0,
    keyFrame: true,
    ...overrides,
  };
}

function createMockAddon() {
  return {
    init: vi.fn(() => 0),
    probe: vi.fn(() => createMockProbeResult()),
    queryHwAccel: vi.fn(() => createMockHWAccelReport()),
    decodeFrame: vi.fn(async () => createMockFrameData()),
    decodeRaw: vi.fn(async () => createMockFrameData()),
    isRawSupported: vi.fn((path: string) => path.endsWith('.cr3') || path.endsWith('.arw')),
    versions: vi.fn((): CodecVersions => ({
      ffmpeg: '6.1.1',
      libraw: '0.21.2',
      openexr: '3.2.4',
    })),
  };
}

// =============================================================================
//  NativeCodecService tests (with mocked addon)
// =============================================================================

describe('NativeCodecService', () => {
  let service: NativeCodecService;
  let mockAddon: ReturnType<typeof createMockAddon>;

  beforeEach(() => {
    service = new NativeCodecService();
    mockAddon = createMockAddon();
    // Inject mock addon via init path simulation
    // We access the private field directly for testing
    (service as any).addon = mockAddon;
    (service as any).hwAccelReport = createMockHWAccelReport();
  });

  describe('properties', () => {
    it('reports name as NativeCodecService', () => {
      expect(service.name).toBe('NativeCodecService');
    });

    it('reports isNative as true', () => {
      expect(service.isNative).toBe(true);
    });
  });

  describe('probe', () => {
    it('returns probe result from addon', async () => {
      const result = await service.probe('/path/to/video.mp4');
      expect(mockAddon.probe).toHaveBeenCalledWith('/path/to/video.mp4');
      expect(result.width).toBe(1920);
      expect(result.height).toBe(1080);
      expect(result.videoCodec).toBe('h264');
      expect(result.duration).toBe(120.5);
      expect(result.timecodeStart).toBe('01:00:00:00');
    });

    it('returns color space info from probe', async () => {
      const result = await service.probe('/path/to/hdr.mov');
      expect(result.colorSpace).toBe('bt709');
      expect(result.colorTransfer).toBe('bt709');
      expect(result.colorPrimaries).toBe('bt709');
    });
  });

  describe('decodeFrame', () => {
    it('calls addon with correct parameters', async () => {
      const result = await service.decodeFrame('/path/to/video.mp4', 5.0);
      expect(mockAddon.decodeFrame).toHaveBeenCalledWith('/path/to/video.mp4', {
        timestamp: 5.0,
        outputFormat: PixelFormat.RGBA8,
        hwAccel: HWAccelType.VIDEOTOOLBOX, // auto-selected from report
        targetWidth: 0,
        targetHeight: 0,
      });
      expect(result.width).toBe(1920);
      expect(result.height).toBe(1080);
    });

    it('respects explicit non-NONE HW accel override', async () => {
      await service.decodeFrame('/path/to/video.mp4', 2.0, {
        outputFormat: PixelFormat.YUV422P10,
        hwAccel: HWAccelType.CUDA,
        targetWidth: 960,
        targetHeight: 540,
      });
      expect(mockAddon.decodeFrame).toHaveBeenCalledWith('/path/to/video.mp4', {
        timestamp: 2.0,
        outputFormat: PixelFormat.YUV422P10,
        hwAccel: HWAccelType.CUDA,
        targetWidth: 960,
        targetHeight: 540,
      });
    });

    it('auto-selects HW accel from report when NONE is specified', async () => {
      await service.decodeFrame('/path/to/video.mp4', 1.0, {
        hwAccel: HWAccelType.NONE,
      });
      expect(mockAddon.decodeFrame).toHaveBeenCalledWith('/path/to/video.mp4',
        expect.objectContaining({ hwAccel: HWAccelType.VIDEOTOOLBOX }),
      );
    });
  });

  describe('decodeRaw', () => {
    it('decodes a supported RAW file', async () => {
      const result = await service.decodeRaw('/path/to/photo.cr3');
      expect(mockAddon.isRawSupported).toHaveBeenCalledWith('/path/to/photo.cr3');
      expect(mockAddon.decodeRaw).toHaveBeenCalled();
      expect(result).not.toBeNull();
    });

    it('returns null for unsupported file', async () => {
      const result = await service.decodeRaw('/path/to/video.mp4');
      expect(result).toBeNull();
      expect(mockAddon.decodeRaw).not.toHaveBeenCalled();
    });

    it('passes config options to addon', async () => {
      await service.decodeRaw('/path/to/photo.arw', {
        useCameraWb: false,
        halfSize: true,
        useGpu: true,
        outputBps: 8,
      });
      expect(mockAddon.decodeRaw).toHaveBeenCalledWith('/path/to/photo.arw', {
        useCameraWb: false,
        halfSize: true,
        useGpu: true,
        outputBps: 8,
      });
    });
  });

  describe('isRawSupported', () => {
    it('returns true for supported RAW extensions', () => {
      expect(service.isRawSupported('/path/photo.cr3')).toBe(true);
      expect(service.isRawSupported('/path/photo.arw')).toBe(true);
    });

    it('returns false for non-RAW files', () => {
      expect(service.isRawSupported('/path/video.mp4')).toBe(false);
    });
  });

  describe('decodeImageSequenceFrame', () => {
    it('builds file path from pattern and decodes', async () => {
      await service.decodeImageSequenceFrame(
        {
          directory: '/seq/shot001',
          pattern: 'frame_%04d.exr',
          startFrame: 1001,
          endFrame: 1100,
          fps: 24,
        },
        1042,
      );
      expect(mockAddon.decodeFrame).toHaveBeenCalledWith(
        '/seq/shot001/frame_1042.exr',
        expect.objectContaining({
          timestamp: 0,
          outputFormat: PixelFormat.RGBAF16,
        }),
      );
    });
  });

  describe('encode sessions', () => {
    it('opens and tracks an encode session', async () => {
      const sessionId = await service.openEncodeSession({
        outputPath: '/out/render.mov',
        videoCodec: 'prores_ks',
        container: 'mov',
        width: 1920,
        height: 1080,
        fps: 24,
      });
      expect(sessionId).toMatch(/^enc_/);
    });

    it('rejects writeVideoFrame for unknown session', async () => {
      await expect(
        service.writeVideoFrame('enc_invalid', new ArrayBuffer(100), 1920, 1080, 0),
      ).rejects.toThrow('Encode session enc_invalid not found');
    });

    it('rejects writeAudioSamples for unknown session', async () => {
      await expect(
        service.writeAudioSamples('enc_invalid', new Float32Array(1024), 2, 48000),
      ).rejects.toThrow('Encode session enc_invalid not found');
    });

    it('finalizeEncode removes the session', async () => {
      const sessionId = await service.openEncodeSession({
        outputPath: '/out/render.mov',
        videoCodec: 'libx264',
        container: 'mp4',
        width: 1920,
        height: 1080,
        fps: 24,
      });
      await service.finalizeEncode(sessionId);
      // Session is gone — writeVideoFrame should throw
      await expect(
        service.writeVideoFrame(sessionId, new ArrayBuffer(100), 1920, 1080, 0),
      ).rejects.toThrow();
    });
  });

  describe('queryHWAccel', () => {
    it('returns cached HW accel report', async () => {
      const report = await service.queryHWAccel();
      expect(report.numDevices).toBe(1);
      expect(report.preferredDecode).toBe(HWAccelType.VIDEOTOOLBOX);
      expect(report.devices[0].name).toBe('videotoolbox');
    });
  });

  describe('capabilities', () => {
    it('returns full codec capabilities', () => {
      const caps = service.getCapabilities();
      expect(caps).toBe(FULL_CODEC_CAPABILITIES);
      expect(caps.length).toBeGreaterThan(50);
    });

    it('canDecode returns true for supported codecs', () => {
      expect(service.canDecode('h264')).toBe(true);
      expect(service.canDecode('prores422')).toBe(true);
      expect(service.canDecode('arriraw')).toBe(true);
      expect(service.canDecode('exr')).toBe(true);
    });

    it('canDecode returns false for unknown codecs', () => {
      expect(service.canDecode('nonexistent_codec')).toBe(false);
    });

    it('canEncode returns true for encode-supported codecs', () => {
      expect(service.canEncode('h264')).toBe(true);
      expect(service.canEncode('prores422')).toBe(true);
    });
  });

  describe('versions', () => {
    it('returns version info from addon', () => {
      const versions = service.getVersions();
      expect(versions.ffmpeg).toBe('6.1.1');
      expect(versions.libraw).toBe('0.21.2');
      expect(versions.openexr).toBe('3.2.4');
    });
  });

  describe('uninitialized service', () => {
    it('throws when addon not loaded', async () => {
      const uninit = new NativeCodecService();
      await expect(uninit.probe('/any')).rejects.toThrow('not initialized');
    });
  });
});

// =============================================================================
//  Codec Capabilities tests
// =============================================================================

describe('Codec Capabilities', () => {
  describe('FULL_CODEC_CAPABILITIES', () => {
    it('includes video codecs', () => {
      const videoCodecs = FULL_CODEC_CAPABILITIES.filter((c) => c.category === 'video');
      expect(videoCodecs.length).toBeGreaterThan(10);
      const ids = videoCodecs.map((c) => c.codecId);
      expect(ids).toContain('h264');
      expect(ids).toContain('h265');
      expect(ids).toContain('prores422');
      expect(ids).toContain('prores4444');
      expect(ids).toContain('dnxhr');
      expect(ids).toContain('av1');
    });

    it('includes camera RAW formats', () => {
      const rawFormats = FULL_CODEC_CAPABILITIES.filter((c) => c.category === 'raw');
      expect(rawFormats.length).toBeGreaterThan(5);
      const ids = rawFormats.map((c) => c.codecId);
      expect(ids).toContain('arriraw');
      expect(ids).toContain('cr3');
      expect(ids).toContain('dng');
    });

    it('includes image sequence formats', () => {
      const imageFormats = FULL_CODEC_CAPABILITIES.filter((c) => c.category === 'image');
      const ids = imageFormats.map((c) => c.codecId);
      expect(ids).toContain('exr');
      expect(ids).toContain('dpx');
      expect(ids).toContain('tiff');
    });

    it('includes audio codecs', () => {
      const audioCodecs = FULL_CODEC_CAPABILITIES.filter((c) => c.category === 'audio');
      const ids = audioCodecs.map((c) => c.codecId);
      expect(ids).toContain('aac');
      expect(ids).toContain('pcm');
      expect(ids).toContain('flac');
      expect(ids).toContain('opus');
    });

    it('includes container formats', () => {
      const containers = FULL_CODEC_CAPABILITIES.filter((c) => c.category === 'container');
      const ids = containers.map((c) => c.codecId);
      expect(ids).toContain('mp4');
      expect(ids).toContain('mov');
      expect(ids).toContain('mxf');
    });

    it('all entries have required fields', () => {
      for (const cap of FULL_CODEC_CAPABILITIES) {
        expect(cap.codecId).toBeTruthy();
        expect(cap.name).toBeTruthy();
        expect(['video', 'audio', 'image', 'raw', 'container']).toContain(cap.category);
        expect(cap.extensions).toBeInstanceOf(Array);
        expect(['native', 'normalized', 'adapter', 'unsupported']).toContain(cap.decodeTier);
        expect(['native', 'normalized', 'adapter', 'unsupported']).toContain(cap.encodeTier);
        expect(cap.bitDepths).toBeInstanceOf(Array);
      }
    });

    it('ProRes codecs are CPU-encoded (no GPU encode)', () => {
      const prores = FULL_CODEC_CAPABILITIES.find((c) => c.codecId === 'prores422');
      expect(prores?.encodeTier).toBe('native');
      expect(prores?.hwAccelEncode).toBe(false); // ProRes is CPU-only encode
    });

    it('EXR supports high bit depths', () => {
      const exr = FULL_CODEC_CAPABILITIES.find((c) => c.codecId === 'exr');
      expect(exr?.bitDepths).toContain(16);
      expect(exr?.bitDepths).toContain(32);
    });
  });

  describe('BROWSER_CODEC_CAPABILITIES', () => {
    it('is a subset of full capabilities', () => {
      expect(BROWSER_CODEC_CAPABILITIES.length).toBeLessThan(FULL_CODEC_CAPABILITIES.length);
    });

    it('includes browser-supported video codecs', () => {
      const ids = BROWSER_CODEC_CAPABILITIES.map((c) => c.codecId);
      expect(ids).toContain('h264');
      expect(ids).toContain('vp9');
    });

    it('does not include camera RAW formats', () => {
      const rawFormats = BROWSER_CODEC_CAPABILITIES.filter((c) => c.category === 'raw');
      expect(rawFormats.length).toBe(0);
    });
  });
});

// =============================================================================
//  createCodecService factory tests
// =============================================================================

describe('createCodecService', () => {
  it('factory function is exported', () => {
    // In Node test env, createCodecService tries to instantiate
    // BrowserCodecService which references DOM APIs. We verify the
    // function is exported and callable — the actual runtime dispatch
    // is covered by integration tests in the Electron/browser env.
    expect(typeof createCodecService).toBe('function');
  });
});

// =============================================================================
//  Type / enum tests
// =============================================================================

describe('PixelFormat enum', () => {
  it('has expected values', () => {
    expect(PixelFormat.RGBA8).toBe(0);
    expect(PixelFormat.YUV420P).toBe(3);
    expect(PixelFormat.RGBAF32).toBe(9);
    expect(PixelFormat.P010).toBe(12);
  });
});

describe('HWAccelType enum', () => {
  it('has expected values', () => {
    expect(HWAccelType.NONE).toBe(0);
    expect(HWAccelType.VIDEOTOOLBOX).toBe(1);
    expect(HWAccelType.NVDEC).toBe(2);
    expect(HWAccelType.D3D11VA).toBe(6);
    expect(HWAccelType.WEBCODECS).toBe(100);
  });
});
