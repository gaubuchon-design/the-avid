/**
 * GPU detection and hardware acceleration management for desktop.
 *
 * Supports all major GPU vendors and their native SDK acceleration paths:
 *   - NVIDIA: NVENC (encode), NVDEC/CUVID (decode), CUDA (compute)
 *   - AMD:    AMF (encode on Windows), VCN (decode), VA-API (Linux), OpenCL (compute)
 *   - Intel:  QSV via Media SDK / oneVPL (encode + decode), VA-API (Linux)
 *   - Apple:  VideoToolbox (encode + decode), Metal (compute)
 *   - Qualcomm (Windows ARM): MediaCodec / D3D11VA
 *
 * Also detects CPU architecture (x64 vs arm64) for Windows ARM and Apple Silicon.
 */
import { app } from 'electron';
import os from 'node:os';

export interface GPUInfo {
  vendor: 'nvidia' | 'amd' | 'intel' | 'apple' | 'qualcomm' | 'unknown';
  renderer: string;
  driverVersion: string;
  hasHardwareEncode: boolean;
  hasHardwareDecode: boolean;
  hasCUDA: boolean;
  hasOpenCL: boolean;
  /** Whether VA-API is available (Linux AMD/Intel/NVIDIA open-source). */
  hasVAAPI: boolean;
  /** Best FFmpeg hwaccel API for this platform+GPU combination. */
  hwAccelAPI: 'nvenc' | 'videotoolbox' | 'amf' | 'qsv' | 'vaapi' | 'mediacodec' | 'none';
  /** CPU architecture (important for Windows ARM / Apple Silicon). */
  cpuArch: 'x64' | 'arm64' | 'ia32' | 'unknown';
  vram: number; // MB
  supportedCodecs: {
    encode: string[];
    decode: string[];
  };
}

let cachedGPUInfoPromise: Promise<GPUInfo> | null = null;

/** Detect the host CPU architecture. */
function detectCPUArch(): GPUInfo['cpuArch'] {
  const arch = os.arch();
  if (arch === 'x64') return 'x64';
  if (arch === 'arm64') return 'arm64';
  if (arch === 'ia32') return 'ia32';
  return 'unknown';
}

/** Detect host OS platform. */
function detectPlatform(): 'darwin' | 'win32' | 'linux' | 'unknown' {
  const p = os.platform();
  if (p === 'darwin' || p === 'win32' || p === 'linux') return p;
  return 'unknown';
}

async function detectGPUUncached(): Promise<GPUInfo> {
  const cpuArch = detectCPUArch();
  const platform = detectPlatform();

  // Default to software fallback
  const info: GPUInfo = {
    vendor: 'unknown',
    renderer: 'Software Renderer',
    driverVersion: '',
    hasHardwareEncode: false,
    hasHardwareDecode: false,
    hasCUDA: false,
    hasOpenCL: false,
    hasVAAPI: false,
    hwAccelAPI: 'none',
    cpuArch,
    vram: 0,
    supportedCodecs: { encode: ['libx264', 'libx265', 'libsvtav1'], decode: ['h264', 'hevc', 'av1'] },
  };

  if (typeof app?.getGPUInfo !== 'function') {
    return info;
  }

  try {
    // Parse GPU info from Chromium
    const gpuInfo = await app.getGPUInfo('complete') as any;

    if (gpuInfo && typeof gpuInfo === 'object') {
      const gpu = gpuInfo.gpuDevice?.[0];
      if (gpu) {
        info.renderer = gpu.deviceString || gpu.description || 'Unknown GPU';
        info.driverVersion = gpu.driverVersion || '';
        info.vram = gpu.gpuMemoryBufferSizeMB || 0;

        const vendorId = gpu.vendorId || 0;
        const deviceString = (
          info.renderer +
          ' ' +
          (gpu.vendorString || '')
        ).toLowerCase();

        // ── NVIDIA ────────────────────────────────────────────────────
        if (
          vendorId === 0x10de ||
          deviceString.includes('nvidia') ||
          deviceString.includes('geforce') ||
          deviceString.includes('rtx') ||
          deviceString.includes('gtx') ||
          deviceString.includes('quadro') ||
          deviceString.includes('tesla')
        ) {
          info.vendor = 'nvidia';
          info.hasHardwareEncode = true; // NVENC
          info.hasHardwareDecode = true; // NVDEC
          info.hasCUDA = true;
          info.hasOpenCL = true;
          info.hwAccelAPI = platform === 'linux' ? 'vaapi' : 'nvenc';
          if (platform === 'linux') info.hasVAAPI = true;
          info.supportedCodecs.encode = [
            'h264_nvenc',
            'hevc_nvenc',
            'av1_nvenc',
            'libx264',
            'libx265',
            'libsvtav1',
          ];
          info.supportedCodecs.decode = [
            'h264_cuvid',
            'hevc_cuvid',
            'av1_cuvid',
            'vp9_cuvid',
            'h264',
            'hevc',
            'av1',
          ];

        // ── AMD ───────────────────────────────────────────────────────
        } else if (
          vendorId === 0x1002 ||
          deviceString.includes('amd') ||
          deviceString.includes('radeon') ||
          deviceString.includes('rx ')
        ) {
          info.vendor = 'amd';
          info.hasHardwareEncode = true;
          info.hasHardwareDecode = true;
          info.hasOpenCL = true;

          if (platform === 'win32') {
            // Windows: AMF for encode, D3D11VA for decode
            info.hwAccelAPI = 'amf';
            info.supportedCodecs.encode = [
              'h264_amf',
              'hevc_amf',
              'av1_amf',
              'libx264',
              'libx265',
              'libsvtav1',
            ];
            info.supportedCodecs.decode = [
              'h264',
              'hevc',
              'av1',
              'vp9',
            ];
          } else if (platform === 'linux') {
            // Linux: VA-API (Mesa RADV/radeonsi)
            info.hwAccelAPI = 'vaapi';
            info.hasVAAPI = true;
            info.supportedCodecs.encode = [
              'h264_vaapi',
              'hevc_vaapi',
              'av1_vaapi',
              'libx264',
              'libx265',
              'libsvtav1',
            ];
            info.supportedCodecs.decode = [
              'h264',
              'hevc',
              'av1',
              'vp9',
            ];
          } else {
            // macOS (eGPU) — limited AMD support
            info.hwAccelAPI = 'none';
            info.supportedCodecs.encode = ['libx264', 'libx265', 'libsvtav1'];
            info.supportedCodecs.decode = ['h264', 'hevc'];
          }

        // ── Intel ─────────────────────────────────────────────────────
        } else if (
          vendorId === 0x8086 ||
          deviceString.includes('intel') ||
          deviceString.includes('iris') ||
          deviceString.includes('uhd graphics') ||
          deviceString.includes('hd graphics') ||
          deviceString.includes('arc ')
        ) {
          info.vendor = 'intel';
          info.hasHardwareEncode = true;
          info.hasHardwareDecode = true;

          if (platform === 'linux') {
            // Linux: VA-API via iHD/i965 driver
            info.hwAccelAPI = 'vaapi';
            info.hasVAAPI = true;
            info.supportedCodecs.encode = [
              'h264_vaapi',
              'hevc_vaapi',
              'av1_vaapi',
              'vp9_vaapi',
              'libx264',
              'libx265',
              'libsvtav1',
            ];
          } else {
            // Windows/macOS: QSV via Media SDK / oneVPL
            info.hwAccelAPI = 'qsv';
            info.supportedCodecs.encode = [
              'h264_qsv',
              'hevc_qsv',
              'av1_qsv',
              'vp9_qsv',
              'libx264',
              'libx265',
              'libsvtav1',
            ];
          }
          info.supportedCodecs.decode = [
            'h264_qsv',
            'hevc_qsv',
            'av1_qsv',
            'vp9_qsv',
            'h264',
            'hevc',
            'av1',
          ];

        // ── Apple Silicon / Apple GPU ─────────────────────────────────
        } else if (
          deviceString.includes('apple') ||
          deviceString.includes('m1') ||
          deviceString.includes('m2') ||
          deviceString.includes('m3') ||
          deviceString.includes('m4')
        ) {
          info.vendor = 'apple';
          info.hasHardwareEncode = true; // VideoToolbox
          info.hasHardwareDecode = true;
          info.hwAccelAPI = 'videotoolbox';
          info.supportedCodecs.encode = [
            'h264_videotoolbox',
            'hevc_videotoolbox',
            'prores_videotoolbox',
            'libx264',
            'libx265',
            'libsvtav1',
          ];
          info.supportedCodecs.decode = [
            'h264',
            'hevc',
            'prores',
            'av1', // Apple Silicon M3+ has AV1 decode
            'vp9',
          ];

        // ── Qualcomm Adreno (Windows ARM) ─────────────────────────────
        } else if (
          deviceString.includes('qualcomm') ||
          deviceString.includes('adreno') ||
          deviceString.includes('snapdragon')
        ) {
          info.vendor = 'qualcomm';
          info.hasHardwareEncode = true;
          info.hasHardwareDecode = true;
          info.hwAccelAPI = 'mediacodec';
          info.supportedCodecs.encode = [
            'h264_mediacodec',
            'hevc_mediacodec',
            'libx264',
            'libx265',
          ];
          info.supportedCodecs.decode = [
            'h264_mediacodec',
            'hevc_mediacodec',
            'h264',
            'hevc',
          ];

        // ── Windows ARM with undetected GPU — try D3D11VA ─────────────
        } else if (platform === 'win32' && cpuArch === 'arm64') {
          info.vendor = 'qualcomm'; // Most likely Snapdragon X
          info.hasHardwareDecode = true;
          info.hwAccelAPI = 'mediacodec';
          info.supportedCodecs.decode = ['h264', 'hevc'];
        }
      }
    }
  } catch (err) {
    console.warn('[GPU] Failed to detect GPU info:', err);
  }

  return info;
}

export async function detectGPU(): Promise<GPUInfo> {
  if (!cachedGPUInfoPromise) {
    cachedGPUInfoPromise = detectGPUUncached();
  }

  return cachedGPUInfoPromise;
}

/** Build FFmpeg hardware acceleration decode flags based on detected GPU. */
export function getHWAccelFlags(gpu: GPUInfo): string[] {
  switch (gpu.hwAccelAPI) {
    case 'nvenc':
      return ['-hwaccel', 'cuda', '-hwaccel_output_format', 'cuda'];
    case 'amf':
      return ['-hwaccel', 'd3d11va'];
    case 'qsv':
      return ['-hwaccel', 'qsv', '-hwaccel_output_format', 'qsv'];
    case 'vaapi':
      return ['-hwaccel', 'vaapi', '-hwaccel_device', '/dev/dri/renderD128', '-hwaccel_output_format', 'vaapi'];
    case 'videotoolbox':
      return ['-hwaccel', 'videotoolbox'];
    case 'mediacodec':
      return ['-hwaccel', 'mediacodec'];
    default:
      return [];
  }
}

/**
 * Return FFmpeg CLI args for hardware-accelerated encoding of a given codec.
 * Falls back to software encoders when no supported GPU is detected.
 */
export function getHWAccelFFmpegArgs(
  gpu: GPUInfo,
  codec: 'h264' | 'hevc' | 'prores' | 'av1',
): string[] {
  const encoderMap: Record<
    GPUInfo['hwAccelAPI'],
    Partial<Record<'h264' | 'hevc' | 'prores' | 'av1', string[]>>
  > = {
    nvenc: {
      h264: ['-hwaccel', 'cuda', '-c:v', 'h264_nvenc', '-preset', 'p4', '-tune', 'hq'],
      hevc: ['-hwaccel', 'cuda', '-c:v', 'hevc_nvenc', '-preset', 'p4', '-tune', 'hq'],
      av1:  ['-hwaccel', 'cuda', '-c:v', 'av1_nvenc', '-preset', 'p4'],
    },
    videotoolbox: {
      h264: ['-hwaccel', 'videotoolbox', '-c:v', 'h264_videotoolbox', '-realtime', '0'],
      hevc: ['-hwaccel', 'videotoolbox', '-c:v', 'hevc_videotoolbox', '-realtime', '0'],
      prores: ['-hwaccel', 'videotoolbox', '-c:v', 'prores_videotoolbox'],
    },
    amf: {
      h264: ['-hwaccel', 'd3d11va', '-c:v', 'h264_amf', '-quality', 'quality'],
      hevc: ['-hwaccel', 'd3d11va', '-c:v', 'hevc_amf', '-quality', 'quality'],
      av1:  ['-hwaccel', 'd3d11va', '-c:v', 'av1_amf'],
    },
    qsv: {
      h264: ['-hwaccel', 'qsv', '-c:v', 'h264_qsv', '-preset', 'medium'],
      hevc: ['-hwaccel', 'qsv', '-c:v', 'hevc_qsv', '-preset', 'medium'],
      av1:  ['-hwaccel', 'qsv', '-c:v', 'av1_qsv'],
    },
    vaapi: {
      h264: ['-hwaccel', 'vaapi', '-hwaccel_device', '/dev/dri/renderD128', '-c:v', 'h264_vaapi'],
      hevc: ['-hwaccel', 'vaapi', '-hwaccel_device', '/dev/dri/renderD128', '-c:v', 'hevc_vaapi'],
      av1:  ['-hwaccel', 'vaapi', '-hwaccel_device', '/dev/dri/renderD128', '-c:v', 'av1_vaapi'],
    },
    mediacodec: {
      h264: ['-c:v', 'h264_mediacodec'],
      hevc: ['-c:v', 'hevc_mediacodec'],
    },
    none: {},
  };

  const softwareFallback: Record<'h264' | 'hevc' | 'prores' | 'av1', string[]> = {
    h264: ['-c:v', 'libx264'],
    hevc: ['-c:v', 'libx265'],
    prores: ['-c:v', 'prores_ks'],
    av1: ['-c:v', 'libsvtav1'],
  };

  if (!gpu.hasHardwareEncode) {
    return softwareFallback[codec];
  }

  return encoderMap[gpu.hwAccelAPI]?.[codec] ?? softwareFallback[codec];
}

/**
 * Return FFmpeg CLI args for hardware-accelerated decoding.
 * Falls back to an empty array (software decode) when no supported GPU is detected.
 */
export function getHWAccelDecodeArgs(gpu: GPUInfo): string[] {
  if (!gpu.hasHardwareDecode) {
    return [];
  }
  return getHWAccelFlags(gpu);
}

/**
 * Detect the best hardware acceleration API for GPU-accelerated transcription
 * (e.g., Whisper with CUDA or CoreML). Returns null if no suitable API available.
 */
export function getTranscriptionAcceleration(gpu: GPUInfo): {
  backend: 'cuda' | 'coreml' | 'openvino' | 'cpu';
  deviceId?: number;
} {
  if (gpu.hasCUDA) {
    return { backend: 'cuda', deviceId: 0 };
  }
  if (gpu.vendor === 'apple') {
    return { backend: 'coreml' };
  }
  if (gpu.vendor === 'intel' && gpu.hasOpenCL) {
    return { backend: 'openvino' };
  }
  return { backend: 'cpu' };
}

/**
 * Return a summary of detected hardware capabilities for logging / diagnostics.
 */
export function getAccelerationSummary(gpu: GPUInfo): string {
  const lines = [
    `GPU: ${gpu.renderer} (${gpu.vendor})`,
    `Arch: ${gpu.cpuArch} | Driver: ${gpu.driverVersion || 'N/A'}`,
    `VRAM: ${gpu.vram > 0 ? `${gpu.vram} MB` : 'unknown'}`,
    `HW Encode: ${gpu.hasHardwareEncode ? 'YES' : 'no'} | HW Decode: ${gpu.hasHardwareDecode ? 'YES' : 'no'}`,
    `API: ${gpu.hwAccelAPI} | CUDA: ${gpu.hasCUDA} | OpenCL: ${gpu.hasOpenCL} | VA-API: ${gpu.hasVAAPI}`,
    `Encoders: ${gpu.supportedCodecs.encode.join(', ')}`,
    `Decoders: ${gpu.supportedCodecs.decode.join(', ')}`,
  ];
  return lines.join('\n');
}
