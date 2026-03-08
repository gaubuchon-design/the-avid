/**
 * GPU detection and hardware acceleration management for desktop.
 * Detects NVIDIA (NVENC/NVDEC/CUDA) and AMD (AMF/VCN) capabilities.
 */
import { app } from 'electron';

export interface GPUInfo {
  vendor: 'nvidia' | 'amd' | 'intel' | 'apple' | 'unknown';
  renderer: string;
  driverVersion: string;
  hasHardwareEncode: boolean;
  hasHardwareDecode: boolean;
  hasCUDA: boolean;
  hasOpenCL: boolean;
  vram: number; // MB
  supportedCodecs: {
    encode: string[];
    decode: string[];
  };
}

export async function detectGPU(): Promise<GPUInfo> {
  // Default to software fallback
  const info: GPUInfo = {
    vendor: 'unknown',
    renderer: 'Software Renderer',
    driverVersion: '',
    hasHardwareEncode: false,
    hasHardwareDecode: false,
    hasCUDA: false,
    hasOpenCL: false,
    vram: 0,
    supportedCodecs: { encode: ['libx264', 'libx265'], decode: ['h264', 'hevc'] },
  };

  try {
    // Parse GPU info from Chromium
    const gpuInfo = await app.getGPUInfo('complete') as any;

    if (gpuInfo && typeof gpuInfo === 'object') {
      const gpu = gpuInfo.gpuDevice?.[0];
      if (gpu) {
        info.renderer = gpu.deviceString || gpu.description || 'Unknown GPU';
        info.driverVersion = gpu.driverVersion || '';

        const vendor = gpu.vendorId || 0;
        const deviceString = (
          info.renderer +
          ' ' +
          (gpu.vendorString || '')
        ).toLowerCase();

        if (
          vendor === 0x10de ||
          deviceString.includes('nvidia') ||
          deviceString.includes('geforce') ||
          deviceString.includes('rtx') ||
          deviceString.includes('gtx')
        ) {
          info.vendor = 'nvidia';
          info.hasHardwareEncode = true; // NVENC
          info.hasHardwareDecode = true; // NVDEC
          info.hasCUDA = true;
          info.supportedCodecs.encode = [
            'h264_nvenc',
            'hevc_nvenc',
            'av1_nvenc',
            'libx264',
            'libx265',
          ];
          info.supportedCodecs.decode = [
            'h264_cuvid',
            'hevc_cuvid',
            'av1_cuvid',
            'h264',
            'hevc',
          ];
        } else if (
          vendor === 0x1002 ||
          deviceString.includes('amd') ||
          deviceString.includes('radeon')
        ) {
          info.vendor = 'amd';
          info.hasHardwareEncode = true; // AMF
          info.hasHardwareDecode = true; // VCN
          info.hasOpenCL = true;
          info.supportedCodecs.encode = [
            'h264_amf',
            'hevc_amf',
            'libx264',
            'libx265',
          ];
          info.supportedCodecs.decode = ['h264', 'hevc'];
        } else if (
          vendor === 0x8086 ||
          deviceString.includes('intel')
        ) {
          info.vendor = 'intel';
          info.hasHardwareEncode = true; // QSV
          info.hasHardwareDecode = true;
          info.supportedCodecs.encode = [
            'h264_qsv',
            'hevc_qsv',
            'libx264',
            'libx265',
          ];
          info.supportedCodecs.decode = [
            'h264_qsv',
            'hevc_qsv',
            'h264',
            'hevc',
          ];
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
          info.supportedCodecs.encode = [
            'h264_videotoolbox',
            'hevc_videotoolbox',
            'libx264',
            'libx265',
          ];
          info.supportedCodecs.decode = ['h264', 'hevc', 'prores'];
        }
      }
    }
  } catch (err) {
    console.warn('[GPU] Failed to detect GPU info:', err);
  }

  return info;
}

/** Build FFmpeg hardware acceleration flags based on detected GPU */
export function getHWAccelFlags(gpu: GPUInfo): string[] {
  switch (gpu.vendor) {
    case 'nvidia':
      return ['-hwaccel', 'cuda', '-hwaccel_output_format', 'cuda'];
    case 'amd':
      return ['-hwaccel', 'auto'];
    case 'intel':
      return ['-hwaccel', 'qsv'];
    case 'apple':
      return ['-hwaccel', 'videotoolbox'];
    default:
      return [];
  }
}
