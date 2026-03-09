/**
 * System capability detection for the render agent.
 *
 * Detects GPU, CPU, memory, FFmpeg codecs, hardware acceleration,
 * and available storage to report to the coordinator.
 */

import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface WorkerCapabilities {
  gpuVendor: string;
  gpuName: string;
  vramMB: number;
  cpuCores: number;
  memoryGB: number;
  availableCodecs: string[];
  ffmpegVersion: string;
  maxConcurrentJobs: number;
  hwAccel: string[];
}

/**
 * Detect system capabilities for the render agent.
 * Probes GPU, CPU, memory, FFmpeg codecs, and disk space.
 */
export async function detectCapabilities(): Promise<WorkerCapabilities> {
  const [gpu, cpu, ffmpeg] = await Promise.all([
    detectGPU(),
    detectCPU(),
    detectFFmpeg(),
  ]);

  // Max concurrent jobs: 1 per 4 CPU cores, minimum 1
  const maxConcurrentJobs = Math.max(1, Math.floor(cpu.cores / 4));

  return {
    gpuVendor: gpu.vendor,
    gpuName: gpu.name,
    vramMB: gpu.vramMB,
    cpuCores: cpu.cores,
    memoryGB: cpu.memoryGB,
    availableCodecs: ffmpeg.codecs,
    ffmpegVersion: ffmpeg.version,
    maxConcurrentJobs,
    hwAccel: ffmpeg.hwAccel,
  };
}

/** GPU detection result. */
interface GPUInfo {
  vendor: string;
  name: string;
  vramMB: number;
}

/** Detect GPU information. Tries nvidia-smi, then macOS system_profiler, then lspci. */
async function detectGPU(): Promise<GPUInfo> {
  // Try NVIDIA first
  try {
    const { stdout } = await execFileAsync('nvidia-smi', [
      '--query-gpu=name,memory.total',
      '--format=csv,noheader,nounits',
    ]);
    const parts = stdout.trim().split(',').map((s) => s.trim());
    if (parts.length >= 2) {
      return {
        vendor: 'NVIDIA',
        name: parts[0],
        vramMB: parseInt(parts[1], 10) || 0,
      };
    }
  } catch { /* not available */ }

  // Try macOS system_profiler
  if (process.platform === 'darwin') {
    try {
      const { stdout } = await execFileAsync('system_profiler', ['SPDisplaysDataType', '-json']);
      const data = JSON.parse(stdout);
      const displays = data?.SPDisplaysDataType ?? [];
      if (displays.length > 0) {
        const gpu = displays[0];
        const name = gpu.sppci_model ?? 'Unknown GPU';
        const vendor = name.toLowerCase().includes('apple') ? 'Apple'
          : name.toLowerCase().includes('amd') ? 'AMD'
          : name.toLowerCase().includes('intel') ? 'Intel'
          : 'Unknown';
        const vramStr = gpu.sppci_vram ?? gpu['spdisplays_vram'] ?? '0';
        const vramMB = parseInt(String(vramStr).replace(/[^\d]/g, ''), 10) || 0;
        return { vendor, name, vramMB };
      }
    } catch { /* not available */ }
  }

  // Try lspci on Linux
  if (process.platform === 'linux') {
    try {
      const { stdout } = await execFileAsync('lspci', ['-v']);
      const vgaLine = stdout.split('\n').find((l) => l.includes('VGA'));
      if (vgaLine) {
        const vendor = vgaLine.includes('NVIDIA') ? 'NVIDIA'
          : vgaLine.includes('AMD') ? 'AMD'
          : vgaLine.includes('Intel') ? 'Intel'
          : 'Unknown';
        return { vendor, name: vgaLine.split(':').pop()?.trim() ?? 'Unknown', vramMB: 0 };
      }
    } catch { /* not available */ }
  }

  return { vendor: 'unknown', name: 'No GPU detected', vramMB: 0 };
}

/** CPU and memory detection. */
interface CPUInfo {
  cores: number;
  memoryGB: number;
}

function detectCPU(): CPUInfo {
  return {
    cores: os.cpus().length,
    memoryGB: Math.round((os.totalmem() / (1024 ** 3)) * 10) / 10,
  };
}

/** FFmpeg detection result. */
interface FFmpegInfo {
  version: string;
  codecs: string[];
  hwAccel: string[];
}

/** Detect FFmpeg version, available codecs, and hardware acceleration methods. */
async function detectFFmpeg(): Promise<FFmpegInfo> {
  let version = 'unknown';
  const codecs: string[] = [];
  const hwAccel: string[] = [];

  // Get version
  try {
    const { stdout } = await execFileAsync('ffmpeg', ['-version']);
    const match = stdout.match(/ffmpeg version (\S+)/);
    if (match) version = match[1];
  } catch {
    return { version: 'not installed', codecs: [], hwAccel: [] };
  }

  // Get available encoders
  try {
    const { stdout } = await execFileAsync('ffmpeg', ['-codecs', '-hide_banner']);
    const encoderNames = [
      'libx264', 'libx265', 'prores_ks', 'dnxhd', 'libsvtav1', 'libvpx-vp9',
      'h264_nvenc', 'hevc_nvenc', 'h264_videotoolbox', 'hevc_videotoolbox',
      'prores_videotoolbox', 'h264_vaapi', 'hevc_vaapi', 'vp9_vaapi', 'av1_vaapi',
      'aac', 'pcm_s16le', 'pcm_s24le', 'libopus', 'libvorbis',
    ];
    for (const name of encoderNames) {
      if (stdout.includes(name)) {
        codecs.push(name);
      }
    }
  } catch { /* ignore */ }

  // Detect HW acceleration
  try {
    const { stdout } = await execFileAsync('ffmpeg', ['-hwaccels', '-hide_banner']);
    if (stdout.includes('cuda') || stdout.includes('nvdec')) hwAccel.push('nvenc');
    if (stdout.includes('videotoolbox')) hwAccel.push('videotoolbox');
    if (stdout.includes('vaapi')) hwAccel.push('vaapi');
  } catch { /* ignore */ }

  return { version, codecs, hwAccel };
}

/**
 * Get available disk space in bytes for a given path.
 * Uses `df -k` to determine free space.
 */
export async function getAvailableDiskSpace(dirPath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync('df', ['-k', dirPath]);
    const lines = stdout.trim().split('\n');
    if (lines.length >= 2) {
      const parts = lines[1].split(/\s+/);
      // df -k: Filesystem 1K-blocks Used Available Use% Mounted
      const availableKB = parseInt(parts[3], 10);
      if (!isNaN(availableKB)) {
        return availableKB * 1024;
      }
    }
  } catch { /* ignore */ }
  return 0;
}
