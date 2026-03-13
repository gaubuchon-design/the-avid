import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, copyFile, mkdir, open, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import {
  buildAudioMixTopology,
  flattenAssets,
  getAudioChannelCountForLayout,
  getMediaAssetPrimaryPath,
  normalizeAudioChannelLayoutLabel,
  pickDominantAudioChannelLayout,
  summarizeAudioBusExecutionPolicy,
  summarizeAudioBusProcessingPolicy,
  type AudioTrackRoutingDescriptor,
} from '@mcua/core';
import { detectGPU, getHWAccelDecodeArgs, getHWAccelFFmpegArgs } from './gpu';
import type {
  EditorBin,
  EditorClip,
  EditorMediaAsset,
  EditorMediaFingerprint,
  EditorMediaProxyMetadata,
  EditorMediaTechnicalMetadata,
  EditorMediaWaveformMetadata,
  EditorProject,
  EditorTrack,
  EditorWatchFolder,
  MediaStorageMode,
} from '@mcua/core';

const execFileAsync = promisify(execFile);
const HASH_SAMPLE_BYTES = 1024 * 1024;
const WAVEFORM_BUCKET_SIZE = 2048;
const WAVEFORM_TARGET_POINTS = 128;

export interface ProjectMediaPaths {
  packagePath: string;
  mediaPath: string;
  managedPath: string;
  proxyPath: string;
  waveformPath: string;
  indexPath: string;
  exportsPath: string;
}

interface MediaIndexManifest {
  projectId: string;
  updatedAt: string;
  assets: EditorMediaAsset[];
}

export interface IngestMediaOptions {
  storageMode?: MediaStorageMode;
  generateProxies?: boolean;
  extractWaveforms?: boolean;
}

export interface RelinkSummary {
  relinkedCount: number;
  missingCount: number;
  scannedFiles: number;
}

export interface WatchFolderScanSummary {
  importedCount: number;
  scannedFiles: number;
}

export interface ExportTranscodeRequest {
  jobId: string;
  sourceArtifact: Uint8Array;
  sourceContainer: string;
  targetContainer: string;
  targetVideoCodec?: string;
  targetAudioCodec?: string;
  fps?: number;
  width?: number;
  height?: number;
}

export interface ExportTranscodeResult {
  outputPath: string;
  outputContainer: string;
  outputVideoCodec: string;
  outputAudioCodec?: string;
}

export interface VideoFrameArtifactRequest {
  sourcePath: string;
  outputDirectory: string;
  cacheKey: string;
  frame: number;
  fps: number;
  width?: number;
  height?: number;
  pixelFormat?: string;
  preferHardware?: boolean;
}

export interface VideoFrameArtifactResult {
  outputPath: string;
  width: number;
  height: number;
  pixelFormat: string;
  storage: 'cpu' | 'gpu';
  cacheHit: boolean;
  decodeLatencyMs: number;
}

export interface AudioSliceArtifactRequest {
  sourcePath: string;
  outputDirectory: string;
  cacheKey: string;
  timeRange: {
    startSeconds: number;
    endSeconds: number;
  };
  sampleRate: number;
  channelCount: number;
}

export interface AudioSliceArtifactResult {
  outputPath: string;
  sampleRate: number;
  channelCount: number;
  cacheHit: boolean;
  decodeLatencyMs: number;
}

export interface CompositeFrameLayerInput {
  sourcePath: string;
  opacity?: number;
}

export interface CompositeFrameArtifactRequest {
  outputDirectory: string;
  cacheKey: string;
  width: number;
  height: number;
  colorSpace?: string;
  layers: CompositeFrameLayerInput[];
}

export interface CompositeFrameArtifactResult {
  outputPath: string;
  width: number;
  height: number;
  colorSpace?: string;
  layerCount: number;
  cacheHit: boolean;
  compositeLatencyMs: number;
}

type ToolAvailability = {
  ffmpeg: boolean;
  ffprobe: boolean;
};

type ToolPaths = {
  ffmpeg: string | null;
  ffprobe: string | null;
};

let cachedToolAvailability: Promise<ToolAvailability> | null = null;
let cachedToolPaths: Promise<ToolPaths> | null = null;

export function createProjectMediaPaths(projectPackagePath: string): ProjectMediaPaths {
  const mediaPath = path.join(projectPackagePath, 'media');
  return {
    packagePath: projectPackagePath,
    mediaPath,
    managedPath: path.join(mediaPath, 'managed'),
    proxyPath: path.join(mediaPath, 'proxies'),
    waveformPath: path.join(mediaPath, 'waveforms'),
    indexPath: path.join(mediaPath, 'indexes'),
    exportsPath: path.join(projectPackagePath, 'exports'),
  };
}

export async function ensureProjectMediaPaths(paths: ProjectMediaPaths): Promise<void> {
  await mkdir(paths.packagePath, { recursive: true });
  await mkdir(paths.mediaPath, { recursive: true });
  await mkdir(paths.managedPath, { recursive: true });
  await mkdir(paths.proxyPath, { recursive: true });
  await mkdir(paths.waveformPath, { recursive: true });
  await mkdir(paths.indexPath, { recursive: true });
  await mkdir(paths.exportsPath, { recursive: true });
}

export function inferMediaType(filePath: string): EditorMediaAsset['type'] {
  const extension = path.extname(filePath).toLowerCase();
  if (['.mov', '.mp4', '.mxf', '.webm', '.avi', '.m4v', '.mkv', '.mpg', '.mpeg', '.mts', '.m2ts', '.r3d', '.braw', '.ari'].includes(extension)) {
    return 'VIDEO';
  }
  if (['.wav', '.mp3', '.aif', '.aiff', '.aac', '.m4a', '.flac', '.ogg'].includes(extension)) {
    return 'AUDIO';
  }
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.tif', '.tiff', '.dng', '.bmp'].includes(extension)) {
    return 'IMAGE';
  }
  return 'DOCUMENT';
}

export function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-z0-9._-]+/gi, '-');
}

function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function uniqueList(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function parseFrameRate(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }
  if (!value.includes('/')) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  const [numerator, denominator] = value.split('/').map(Number);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return undefined;
  }
  return numerator! / denominator!;
}

function normalizeAudioChannelLayout(layout?: string): EditorMediaTechnicalMetadata['audioChannelLayout'] | undefined {
  if (!layout) {
    return undefined;
  }
  return normalizeAudioChannelLayoutLabel(layout);
}

async function hasExecutable(name: string): Promise<boolean> {
  try {
    await execFileAsync(name, ['-version']);
    return true;
  } catch {
    return false;
  }
}

async function pathExists(filePath: string | undefined): Promise<boolean> {
  if (!filePath) {
    return false;
  }
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function buildArtifactHash(...parts: Array<string | number | undefined>): string {
  const hash = createHash('sha1');
  for (const part of parts) {
    hash.update(String(part ?? ''));
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 16);
}

function coerceDimension(value: number | undefined, fallback: number): number {
  const rounded = Math.round(value ?? fallback);
  return Number.isFinite(rounded) && rounded > 0 ? rounded : fallback;
}

function createDeterministicPpmBuffer(width: number, height: number, seedText: string): Buffer {
  const safeWidth = coerceDimension(width, 64);
  const safeHeight = coerceDimension(height, 36);
  const header = Buffer.from(`P6\n${safeWidth} ${safeHeight}\n255\n`, 'ascii');
  const pixels = Buffer.alloc(safeWidth * safeHeight * 3);
  const digest = createHash('sha1').update(seedText).digest();

  for (let y = 0; y < safeHeight; y += 1) {
    for (let x = 0; x < safeWidth; x += 1) {
      const offset = (y * safeWidth + x) * 3;
      const seed = digest[(x + y) % digest.length] ?? 0;
      pixels[offset] = (seed + x * 3) % 256;
      pixels[offset + 1] = (seed + y * 5) % 256;
      pixels[offset + 2] = (seed + x + y * 2) % 256;
    }
  }

  return Buffer.concat([header, pixels]);
}

function createSilentWavBuffer(sampleRate: number, channelCount: number, durationSeconds: number): Buffer {
  const safeSampleRate = Math.max(1, Math.round(sampleRate));
  const safeChannelCount = Math.max(1, Math.round(channelCount));
  const sampleCount = Math.max(1, Math.round(Math.max(0.02, durationSeconds) * safeSampleRate));
  const blockAlign = safeChannelCount * 2;
  const byteRate = safeSampleRate * blockAlign;
  const dataSize = sampleCount * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(safeChannelCount, 22);
  buffer.writeUInt32LE(safeSampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

async function resolveFrameDimensions(
  sourcePath: string,
  width: number | undefined,
  height: number | undefined,
): Promise<{ width: number; height: number }> {
  if ((width ?? 0) > 0 && (height ?? 0) > 0) {
    return {
      width: coerceDimension(width, 64),
      height: coerceDimension(height, 36),
    };
  }

  const metadata = await probeMediaFile(sourcePath);
  return {
    width: coerceDimension(width ?? metadata.width, 64),
    height: coerceDimension(height ?? metadata.height, 36),
  };
}

function getPlatformBinDir(): string {
  const platformMap: Record<string, string> = {
    darwin: 'mac',
    win32: 'win',
    linux: 'linux',
  };
  return platformMap[process.platform] ?? process.platform;
}

function getToolCandidates(toolName: 'ffmpeg' | 'ffprobe'): string[] {
  const executableName = process.platform === 'win32' ? `${toolName}.exe` : toolName;
  const envVar = toolName === 'ffmpeg' ? 'THE_AVID_FFMPEG_PATH' : 'THE_AVID_FFPROBE_PATH';
  const platformDir = getPlatformBinDir();
  const candidates = [
    // 1. Environment variable override
    process.env[envVar],
    // 2. Platform-specific bundled path (development - monorepo root)
    path.join(process.cwd(), 'apps/desktop/resources/bin', platformDir, executableName),
    // 3. Platform-specific bundled path (development - desktop root)
    path.join(process.cwd(), 'resources/bin', platformDir, executableName),
    // 4. Packaged app resources path
    path.join(process.resourcesPath || '', 'bin', platformDir, executableName),
    // 5. Fall back to system PATH
    executableName,
  ];

  return uniqueList(candidates.filter((value): value is string => Boolean(value)));
}

async function resolveToolPath(toolName: 'ffmpeg' | 'ffprobe'): Promise<string | null> {
  const candidates = getToolCandidates(toolName);
  for (const candidate of candidates) {
    try {
      await execFileAsync(candidate, ['-version']);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

export async function getMediaToolPaths(): Promise<ToolPaths> {
  if (!cachedToolPaths) {
    cachedToolPaths = Promise.all([
      resolveToolPath('ffmpeg'),
      resolveToolPath('ffprobe'),
    ]).then(([ffmpeg, ffprobe]) => ({ ffmpeg, ffprobe }));
  }

  return cachedToolPaths;
}

async function getToolAvailability(): Promise<ToolAvailability> {
  if (!cachedToolAvailability) {
    cachedToolAvailability = getMediaToolPaths().then(({ ffmpeg, ffprobe }) => ({
      ffmpeg: Boolean(ffmpeg),
      ffprobe: Boolean(ffprobe),
    }));
  }

  return cachedToolAvailability;
}

async function computePartialFingerprint(filePath: string): Promise<EditorMediaFingerprint> {
  const fileStats = await stat(filePath);
  const fileHandle = await open(filePath, 'r');
  const hash = createHash('sha1');

  try {
    const sampleBytes = Math.min(HASH_SAMPLE_BYTES, fileStats.size);
    const startBuffer = Buffer.alloc(sampleBytes);
    const startRead = await fileHandle.read(startBuffer, 0, sampleBytes, 0);
    hash.update(startBuffer.subarray(0, startRead.bytesRead));

    if (fileStats.size > sampleBytes) {
      const endBuffer = Buffer.alloc(sampleBytes);
      const endRead = await fileHandle.read(endBuffer, 0, sampleBytes, Math.max(0, fileStats.size - sampleBytes));
      hash.update(endBuffer.subarray(0, endRead.bytesRead));
    }

    hash.update(String(fileStats.size));
    hash.update(fileStats.mtime.toISOString());

    return {
      algorithm: 'sha1-partial',
      digest: hash.digest('hex'),
      sizeBytes: fileStats.size,
      modifiedAt: fileStats.mtime.toISOString(),
    };
  } finally {
    await fileHandle.close();
  }
}

async function probeMediaFile(filePath: string): Promise<EditorMediaTechnicalMetadata> {
  const availability = await getToolAvailability();
  const toolPaths = await getMediaToolPaths();
  const extension = path.extname(filePath).replace(/^\./, '').toLowerCase();
  const fallback: EditorMediaTechnicalMetadata = {
    container: extension || undefined,
  };

  if (!availability.ffprobe || !toolPaths.ffprobe) {
    return fallback;
  }

  try {
    const { stdout } = await execFileAsync(toolPaths.ffprobe, [
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      filePath,
    ]);

    const parsed = JSON.parse(stdout) as {
      format?: {
        duration?: string;
        bit_rate?: string;
        format_name?: string;
        tags?: Record<string, string>;
      };
      streams?: Array<{
        codec_type?: string;
        codec_name?: string;
        width?: number;
        height?: number;
        r_frame_rate?: string;
        channels?: number;
        channel_layout?: string;
        sample_rate?: string;
        tags?: Record<string, string>;
      }>;
    };

    const videoStream = parsed.streams?.find((stream) => stream.codec_type === 'video');
    const audioStream = parsed.streams?.find((stream) => stream.codec_type === 'audio');
    const tags = {
      ...(parsed.format?.tags ?? {}),
      ...(videoStream?.tags ?? {}),
      ...(audioStream?.tags ?? {}),
    };

    return {
      container: parsed.format?.format_name ?? fallback.container,
      videoCodec: videoStream?.codec_name,
      audioCodec: audioStream?.codec_name,
      durationSeconds: parsed.format?.duration ? Number(parsed.format.duration) : undefined,
      frameRate: parseFrameRate(videoStream?.r_frame_rate),
      width: videoStream?.width,
      height: videoStream?.height,
      audioChannels: audioStream?.channels,
      audioChannelLayout: normalizeAudioChannelLayout(audioStream?.channel_layout),
      sampleRate: audioStream?.sample_rate ? Number(audioStream.sample_rate) : undefined,
      bitRate: parsed.format?.bit_rate ? Number(parsed.format.bit_rate) : undefined,
      timecodeStart: tags['timecode'],
      reelName: tags['reel_name'] ?? tags['reel'],
    };
  } catch {
    return fallback;
  }
}

function buildSemanticTags(filePath: string, assetName: string, mediaType: EditorMediaAsset['type']): string[] {
  const pathParts = filePath.split(path.sep).slice(-4);
  const nameTokens = assetName.split(/[^a-z0-9]+/i);
  const typeTokens = [mediaType.toLowerCase()];
  return uniqueList([
    ...pathParts.flatMap((part) => part.split(/[^a-z0-9]+/i)),
    ...nameTokens,
    ...typeTokens,
  ].map((value) => value.toLowerCase()).filter((value) => value.length > 2));
}

function buildRelinkKey(name: string, fingerprint: EditorMediaFingerprint, technicalMetadata: EditorMediaTechnicalMetadata): string {
  return [
    normalizeToken(name),
    fingerprint.digest,
    technicalMetadata.durationSeconds ? technicalMetadata.durationSeconds.toFixed(3) : '',
    technicalMetadata.frameRate ? technicalMetadata.frameRate.toFixed(3) : '',
    technicalMetadata.timecodeStart ?? '',
    technicalMetadata.reelName ?? '',
  ].filter(Boolean).join(':');
}

function buildWaveformFallback(fingerprint: EditorMediaFingerprint): number[] {
  return Array.from({ length: WAVEFORM_TARGET_POINTS }, (_value, index) => {
    const seed = fingerprint.digest.charCodeAt(index % fingerprint.digest.length) ?? 0;
    return Math.max(0.08, Math.min(0.95, ((seed % 97) + 14) / 110));
  });
}

function downsamplePeaks(peaks: number[], target: number): number[] {
  if (peaks.length <= target) {
    return peaks;
  }

  const chunkSize = peaks.length / target;
  return Array.from({ length: target }, (_value, index) => {
    const start = Math.floor(index * chunkSize);
    const end = Math.max(start + 1, Math.floor((index + 1) * chunkSize));
    const slice = peaks.slice(start, end);
    return slice.reduce((max, value) => Math.max(max, value), 0);
  });
}

async function extractWaveform(filePath: string, mediaType: EditorMediaAsset['type'], fallbackFingerprint: EditorMediaFingerprint): Promise<EditorMediaWaveformMetadata> {
  const now = new Date().toISOString();
  if (mediaType !== 'AUDIO' && mediaType !== 'VIDEO') {
    return {
      status: 'UNAVAILABLE',
      peaks: [],
      sampleCount: 0,
      updatedAt: now,
    };
  }

  const availability = await getToolAvailability();
  const toolPaths = await getMediaToolPaths();
  if (!availability.ffmpeg || !toolPaths.ffmpeg) {
    const peaks = buildWaveformFallback(fallbackFingerprint);
    return {
      status: 'UNAVAILABLE',
      peaks,
      sampleCount: peaks.length,
      updatedAt: now,
      error: 'ffmpeg not available',
    };
  }

  return new Promise((resolve) => {
    const peaks: number[] = [];
    let sampleCount = 0;
    let pendingBytes = Buffer.alloc(0);
    let bucketPeak = 0;
    let bucketSamples = 0;
    let stderr = '';

    const ffmpegProcess = spawn(toolPaths.ffmpeg!, [
      '-v',
      'error',
      '-i',
      filePath,
      '-vn',
      '-ac',
      '1',
      '-ar',
      '8000',
      '-f',
      's16le',
      'pipe:1',
    ], { stdio: ['ignore', 'pipe', 'pipe'] as ['ignore', 'pipe', 'pipe'] });

    ffmpegProcess.stdout.on('data', (chunk: Buffer) => {
      pendingBytes = Buffer.concat([pendingBytes, chunk]);
      while (pendingBytes.length >= 2) {
        const sample = pendingBytes.readInt16LE(0);
        pendingBytes = pendingBytes.subarray(2);
        const normalized = Math.abs(sample) / 32768;
        bucketPeak = Math.max(bucketPeak, normalized);
        bucketSamples += 1;
        sampleCount += 1;

        if (bucketSamples >= WAVEFORM_BUCKET_SIZE) {
          peaks.push(bucketPeak);
          bucketPeak = 0;
          bucketSamples = 0;
        }
      }
    });

    ffmpegProcess.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    ffmpegProcess.on('close', (code: number | null) => {
      if (bucketSamples > 0) {
        peaks.push(bucketPeak);
      }

      if (code === 0 && peaks.length > 0) {
        resolve({
          status: 'READY',
          peaks: downsamplePeaks(peaks, WAVEFORM_TARGET_POINTS),
          sampleCount,
          updatedAt: now,
        });
        return;
      }

      const fallbackPeaks = buildWaveformFallback(fallbackFingerprint);
      resolve({
        status: 'FAILED',
        peaks: fallbackPeaks,
        sampleCount,
        updatedAt: now,
        error: stderr.trim() || 'Waveform extraction failed',
      });
    });
  });
}

async function generateProxy(filePath: string, assetId: string, mediaType: EditorMediaAsset['type'], paths: ProjectMediaPaths): Promise<EditorMediaProxyMetadata> {
  const now = new Date().toISOString();
  if (mediaType !== 'VIDEO') {
    return {
      status: 'SKIPPED',
      updatedAt: now,
    };
  }

  const availability = await getToolAvailability();
  const toolPaths = await getMediaToolPaths();
  if (!availability.ffmpeg || !toolPaths.ffmpeg) {
    return {
      status: 'SKIPPED',
      updatedAt: now,
      error: 'ffmpeg not available',
    };
  }

  const proxyFilePath = path.join(paths.proxyPath, `${assetId}.proxy.mp4`);
  try {
    const gpu = await detectGPU();
    const hwDecodeArgs = getHWAccelDecodeArgs(gpu);
    const hwEncodeArgs = getHWAccelFFmpegArgs(gpu, 'h264');

    // Extract the encoder name from the hwEncodeArgs (always contains `-c:v <name>`).
    const cvIndex = hwEncodeArgs.indexOf('-c:v');
    const encoderName = cvIndex >= 0 ? hwEncodeArgs[cvIndex + 1]! : 'libx264';
    // Any args before `-c:v` are hwaccel input flags (e.g. `-hwaccel cuda`).
    const hwaccelInputFlags = cvIndex > 0 ? hwEncodeArgs.slice(0, cvIndex) : [];
    const isSoftwareEncoder = encoderName === 'libx264' || encoderName === 'libx265';

    // Quality flags differ between software and hardware encoders.
    const qualityArgs = isSoftwareEncoder
      ? ['-preset', 'veryfast', '-crf', '22']
      : ['-b:v', '5M'];

    await execFileAsync(toolPaths.ffmpeg!, [
      '-y',
      ...hwDecodeArgs,
      ...hwaccelInputFlags,
      '-i',
      filePath,
      '-vf',
      'scale=1280:-2:flags=lanczos',
      '-c:v',
      encoderName,
      ...qualityArgs,
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-movflags',
      '+faststart',
      proxyFilePath,
    ]);

    return {
      status: 'READY',
      filePath: proxyFilePath,
      relativePath: path.relative(paths.packagePath, proxyFilePath),
      playbackUrl: pathToFileURL(proxyFilePath).toString(),
      codec: 'h264/aac',
      width: 1280,
      updatedAt: now,
    };
  } catch (error) {
    return {
      status: 'FAILED',
      filePath: proxyFilePath,
      relativePath: path.relative(paths.packagePath, proxyFilePath),
      updatedAt: now,
      error: error instanceof Error ? error.message : 'Proxy generation failed',
    };
  }
}

export async function extractVideoFrameArtifact(
  request: VideoFrameArtifactRequest,
): Promise<VideoFrameArtifactResult> {
  await mkdir(request.outputDirectory, { recursive: true });

  const dimensions = await resolveFrameDimensions(request.sourcePath, request.width, request.height);
  const pixelFormat = request.pixelFormat ?? 'rgb24';
  const outputPath = path.join(
    request.outputDirectory,
    `${buildArtifactHash(
      request.cacheKey,
      request.sourcePath,
      request.frame,
      request.fps,
      dimensions.width,
      dimensions.height,
      pixelFormat,
    )}.ppm`,
  );

  let storage: 'cpu' | 'gpu' = 'cpu';
  if (await pathExists(outputPath)) {
    if (request.preferHardware) {
      try {
        storage = getHWAccelDecodeArgs(await detectGPU()).length > 0 ? 'gpu' : 'cpu';
      } catch {
        storage = 'cpu';
      }
    }
    return {
      outputPath,
      width: dimensions.width,
      height: dimensions.height,
      pixelFormat,
      storage,
      cacheHit: true,
      decodeLatencyMs: 0,
    };
  }

  const startedAt = Date.now();
  const availability = await getToolAvailability();
  const toolPaths = await getMediaToolPaths();

  if (availability.ffmpeg && toolPaths.ffmpeg) {
    try {
      const hwDecodeArgs = request.preferHardware ? getHWAccelDecodeArgs(await detectGPU()) : [];
      storage = hwDecodeArgs.length > 0 ? 'gpu' : 'cpu';
      const vfParts = [
        `scale=${dimensions.width}:${dimensions.height}:force_original_aspect_ratio=decrease`,
        `pad=${dimensions.width}:${dimensions.height}:(ow-iw)/2:(oh-ih)/2:black`,
        'format=rgb24',
      ];
      await execFileAsync(toolPaths.ffmpeg, [
        '-y',
        ...hwDecodeArgs,
        '-i',
        request.sourcePath,
        '-ss',
        Math.max(0, request.frame / Math.max(request.fps, 0.001)).toFixed(6),
        '-frames:v',
        '1',
        '-an',
        '-vf',
        vfParts.join(','),
        '-f',
        'image2',
        '-vcodec',
        'ppm',
        outputPath,
      ]);
      return {
        outputPath,
        width: dimensions.width,
        height: dimensions.height,
        pixelFormat,
        storage,
        cacheHit: false,
        decodeLatencyMs: Date.now() - startedAt,
      };
    } catch {
      storage = 'cpu';
    }
  }

  await writeFile(
    outputPath,
    createDeterministicPpmBuffer(
      dimensions.width,
      dimensions.height,
      `${request.sourcePath}:${request.frame}:${request.cacheKey}`,
    ),
  );
  return {
    outputPath,
    width: dimensions.width,
    height: dimensions.height,
    pixelFormat,
    storage,
    cacheHit: false,
    decodeLatencyMs: Date.now() - startedAt,
  };
}

export async function extractAudioSliceArtifact(
  request: AudioSliceArtifactRequest,
): Promise<AudioSliceArtifactResult> {
  await mkdir(request.outputDirectory, { recursive: true });

  const safeSampleRate = Math.max(1, Math.round(request.sampleRate));
  const safeChannelCount = Math.max(1, Math.round(request.channelCount));
  const durationSeconds = Math.max(0.02, request.timeRange.endSeconds - request.timeRange.startSeconds);
  const outputPath = path.join(
    request.outputDirectory,
    `${buildArtifactHash(
      request.cacheKey,
      request.sourcePath,
      request.timeRange.startSeconds,
      request.timeRange.endSeconds,
      safeSampleRate,
      safeChannelCount,
    )}.wav`,
  );

  if (await pathExists(outputPath)) {
    return {
      outputPath,
      sampleRate: safeSampleRate,
      channelCount: safeChannelCount,
      cacheHit: true,
      decodeLatencyMs: 0,
    };
  }

  const startedAt = Date.now();
  const availability = await getToolAvailability();
  const toolPaths = await getMediaToolPaths();
  if (availability.ffmpeg && toolPaths.ffmpeg) {
    try {
      await execFileAsync(toolPaths.ffmpeg, [
        '-y',
        '-ss',
        Math.max(0, request.timeRange.startSeconds).toFixed(6),
        '-t',
        durationSeconds.toFixed(6),
        '-i',
        request.sourcePath,
        '-vn',
        '-ac',
        String(safeChannelCount),
        '-ar',
        String(safeSampleRate),
        '-c:a',
        'pcm_s16le',
        outputPath,
      ]);
      return {
        outputPath,
        sampleRate: safeSampleRate,
        channelCount: safeChannelCount,
        cacheHit: false,
        decodeLatencyMs: Date.now() - startedAt,
      };
    } catch {
      // Fall through to a deterministic silent slice so the runtime keeps a real artifact.
    }
  }

  await writeFile(outputPath, createSilentWavBuffer(safeSampleRate, safeChannelCount, durationSeconds));
  return {
    outputPath,
    sampleRate: safeSampleRate,
    channelCount: safeChannelCount,
    cacheHit: false,
    decodeLatencyMs: Date.now() - startedAt,
  };
}

export async function composeFrameArtifact(
  request: CompositeFrameArtifactRequest,
): Promise<CompositeFrameArtifactResult> {
  await mkdir(request.outputDirectory, { recursive: true });

  const width = coerceDimension(request.width, 64);
  const height = coerceDimension(request.height, 36);
  const outputPath = path.join(
    request.outputDirectory,
    `${buildArtifactHash(
      request.cacheKey,
      width,
      height,
      request.colorSpace,
      ...request.layers.map((layer) => `${layer.sourcePath}:${layer.opacity ?? 1}`),
    )}.ppm`,
  );

  if (await pathExists(outputPath)) {
    return {
      outputPath,
      width,
      height,
      colorSpace: request.colorSpace,
      layerCount: request.layers.length,
      cacheHit: true,
      compositeLatencyMs: 0,
    };
  }

  const startedAt = Date.now();
  const availability = await getToolAvailability();
  const toolPaths = await getMediaToolPaths();

  if (availability.ffmpeg && toolPaths.ffmpeg && request.layers.length > 0) {
    try {
      const args = [
        '-y',
        '-f',
        'lavfi',
        '-i',
        `color=c=black:s=${width}x${height}:r=1:d=1`,
      ];
      const filterChains: string[] = [];

      request.layers.forEach((layer, index) => {
        args.push('-i', layer.sourcePath);
        const inputLabel = `[${index + 1}:v]`;
        const outputLabel = `[layer${index}]`;
        const opacityFilter = (layer.opacity ?? 1) < 1
          ? `,format=rgba,colorchannelmixer=aa=${Math.max(0, Math.min(layer.opacity ?? 1, 1)).toFixed(3)}`
          : '';
        filterChains.push(
          `${inputLabel}scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,format=rgb24${opacityFilter}${outputLabel}`,
        );
      });

      let currentLabel = '[0:v]';
      request.layers.forEach((_layer, index) => {
        const nextLabel = index === request.layers.length - 1 ? '[vout]' : `[overlay${index}]`;
        filterChains.push(`${currentLabel}[layer${index}]overlay=eof_action=pass${nextLabel}`);
        currentLabel = nextLabel;
      });

      await execFileAsync(toolPaths.ffmpeg, [
        ...args,
        '-filter_complex',
        filterChains.join(';'),
        '-map',
        currentLabel,
        '-frames:v',
        '1',
        '-an',
        '-f',
        'image2',
        '-vcodec',
        'ppm',
        outputPath,
      ]);

      return {
        outputPath,
        width,
        height,
        colorSpace: request.colorSpace,
        layerCount: request.layers.length,
        cacheHit: false,
        compositeLatencyMs: Date.now() - startedAt,
      };
    } catch {
      // Fall through to a deterministic copy/placeholder.
    }
  }

  const topLayer = request.layers[request.layers.length - 1];
  if (topLayer && await pathExists(topLayer.sourcePath)) {
    if (topLayer.sourcePath !== outputPath) {
      await copyFile(topLayer.sourcePath, outputPath);
    }
  } else {
    await writeFile(
      outputPath,
      createDeterministicPpmBuffer(width, height, `composite:${request.cacheKey}`),
    );
  }

  return {
    outputPath,
    width,
    height,
    colorSpace: request.colorSpace,
    layerCount: request.layers.length,
    cacheHit: false,
    compositeLatencyMs: Date.now() - startedAt,
  };
}

export async function ingestMediaFile(
  sourcePath: string,
  paths: ProjectMediaPaths,
  options: IngestMediaOptions = {},
): Promise<EditorMediaAsset> {
  const storageMode = options.storageMode ?? 'COPY';
  const mediaType = inferMediaType(sourcePath);
  const fileName = path.basename(sourcePath);
  const fileStats = await stat(sourcePath);
  const assetId = createId('asset');
  const fingerprint = await computePartialFingerprint(sourcePath);
  const technicalMetadata = await probeMediaFile(sourcePath);
  const destinationFileName = `${Date.now()}-${sanitizeFileName(fileName)}`;
  const managedPath = storageMode === 'COPY'
    ? path.join(paths.managedPath, destinationFileName)
    : undefined;

  if (managedPath) {
    await copyFile(sourcePath, managedPath);
  }

  const playableFilePath = managedPath ?? sourcePath;
  const proxyMetadata = options.generateProxies === false
    ? { status: 'NOT_REQUESTED' as const }
    : await generateProxy(playableFilePath, assetId, mediaType, paths);
  const waveformMetadata = options.extractWaveforms === false
    ? {
        status: 'UNAVAILABLE' as const,
        peaks: buildWaveformFallback(fingerprint),
        sampleCount: WAVEFORM_TARGET_POINTS,
        updatedAt: new Date().toISOString(),
      }
    : await extractWaveform(playableFilePath, mediaType, fingerprint);
  const semanticTags = buildSemanticTags(sourcePath, path.basename(fileName, path.extname(fileName)), mediaType);
  const playbackUrl = proxyMetadata.status === 'READY' && proxyMetadata.playbackUrl
    ? proxyMetadata.playbackUrl
    : pathToFileURL(playableFilePath).toString();

  await writeFile(
    path.join(paths.waveformPath, `${assetId}.waveform.json`),
    JSON.stringify({
      assetId,
      updatedAt: waveformMetadata.updatedAt,
      status: waveformMetadata.status,
      peaks: waveformMetadata.peaks,
    }, null, 2),
    'utf8',
  );

  return {
    id: assetId,
    name: path.basename(fileName, path.extname(fileName)),
    type: mediaType,
    status: 'READY',
    duration: technicalMetadata.durationSeconds,
    playbackUrl,
    waveformData: waveformMetadata.peaks,
    fileExtension: path.extname(fileName).replace(/^\./, '').toLowerCase(),
    fileSizeBytes: fileStats.size,
    indexStatus: 'READY',
    ingestMetadata: {
      importedAt: new Date().toISOString(),
      storageMode,
      importedFileName: fileName,
      originalFileName: fileName,
    },
    locations: {
      originalPath: sourcePath,
      managedPath,
      relativeManagedPath: managedPath ? path.relative(paths.packagePath, managedPath) : undefined,
      playbackUrl,
      pathHistory: uniqueList([sourcePath, managedPath ?? '']),
    },
    fingerprint,
    technicalMetadata,
    relinkIdentity: {
      assetKey: buildRelinkKey(fileName, fingerprint, technicalMetadata),
      normalizedName: normalizeToken(path.basename(fileName, path.extname(fileName))),
      sourceFileStem: path.basename(fileName, path.extname(fileName)),
      lastKnownPaths: uniqueList([sourcePath, managedPath ?? '']),
      reelName: technicalMetadata.reelName,
      sourceTimecodeStart: technicalMetadata.timecodeStart,
      frameRate: technicalMetadata.frameRate,
      durationSeconds: technicalMetadata.durationSeconds,
    },
    proxyMetadata,
    waveformMetadata,
    semanticMetadata: {
      status: 'READY',
      tags: semanticTags,
      people: [],
      locations: [],
      scenes: [],
      updatedAt: new Date().toISOString(),
    },
    tags: uniqueList(['desktop-import', ...semanticTags]),
    isFavorite: false,
  };
}

function createBin(name: string, color = '#4f63f5', parentId?: string): EditorBin {
  return {
    id: createId('bin'),
    name,
    color,
    parentId,
    children: [],
    assets: [],
    isOpen: true,
  };
}

function findBinByNameMutable(bins: EditorBin[], name: string): EditorBin | null {
  for (const bin of bins) {
    if (bin.name === name) {
      return bin;
    }
    const nested = findBinByNameMutable(bin.children, name);
    if (nested) {
      return nested;
    }
  }
  return null;
}

function ensureWatchFolderBin(project: EditorProject, watchFolder: EditorWatchFolder): EditorBin {
  let rootBin = findBinByNameMutable(project.bins, 'Watch Folders');
  if (!rootBin) {
    rootBin = createBin('Watch Folders', '#25a865');
    project.bins.unshift(rootBin);
  }

  let folderBin = rootBin.children.find((child) => child.name === watchFolder.name) ?? null;
  if (!folderBin) {
    folderBin = createBin(watchFolder.name, '#22c55e', rootBin.id);
    rootBin.children.unshift(folderBin);
  }

  rootBin.isOpen = true;
  folderBin.isOpen = true;
  return folderBin;
}

function getAllKnownPaths(project: EditorProject): Set<string> {
  const paths = new Set<string>();
  for (const asset of flattenAssets(project.bins)) {
    if (asset.locations?.originalPath) {
      paths.add(asset.locations.originalPath);
    }
    if (asset.locations?.managedPath) {
      paths.add(asset.locations.managedPath);
    }
    for (const historyPath of asset.locations?.pathHistory ?? []) {
      paths.add(historyPath);
    }
  }
  return paths;
}

async function collectFilesRecursively(rootPath: string): Promise<string[]> {
  const entries = await readdir(rootPath, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }
    const fullPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFilesRecursively(fullPath));
      continue;
    }
    files.push(fullPath);
  }
  return files;
}

function isSupportedIngestFile(filePath: string): boolean {
  return inferMediaType(filePath) !== 'DOCUMENT' || path.extname(filePath).toLowerCase() === '.pdf';
}

export async function resolveImportSourcePaths(filePaths: string[]): Promise<string[]> {
  const resolvedPaths: string[] = [];

  for (const filePath of filePaths) {
    try {
      const pathStats = await stat(filePath);
      if (pathStats.isDirectory()) {
        resolvedPaths.push(...await collectFilesRecursively(filePath));
        continue;
      }

      resolvedPaths.push(filePath);
    } catch {
      // Ignore paths that disappear or are inaccessible between drag/drop and ingest.
    }
  }

  return uniqueList(resolvedPaths.filter(isSupportedIngestFile));
}

function iterateAssetsMutable(bins: EditorBin[], visit: (asset: EditorMediaAsset) => void): void {
  for (const bin of bins) {
    for (const asset of bin.assets) {
      visit(asset);
    }
    iterateAssetsMutable(bin.children, visit);
  }
}

function appendAssetsToBin(bin: EditorBin, assets: EditorMediaAsset[]): void {
  const existingIds = new Set(bin.assets.map((asset) => asset.id));
  for (const asset of assets) {
    if (!existingIds.has(asset.id)) {
      bin.assets.unshift(asset);
      existingIds.add(asset.id);
    }
  }
}

function buildCandidateLookup(filePaths: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const filePath of filePaths) {
    const stem = normalizeToken(path.basename(filePath, path.extname(filePath)));
    const existing = map.get(stem) ?? [];
    existing.push(filePath);
    map.set(stem, existing);
  }
  return map;
}

export async function scanProjectMedia(project: EditorProject, paths: ProjectMediaPaths): Promise<EditorProject> {
  iterateAssetsMutable(project.bins, (asset) => {
    asset.indexStatus = asset.indexStatus ?? 'UNSCANNED';
  });

  for (const asset of flattenAssets(project.bins)) {
    const preferredPath = getMediaAssetPrimaryPath(asset);
    const hasPreferredPath = await pathExists(preferredPath);
    const hasOriginalPath = await pathExists(asset.locations?.originalPath);
    const nextPlaybackPath = hasPreferredPath
      ? preferredPath
      : hasOriginalPath
      ? asset.locations?.originalPath
      : undefined;

    asset.indexStatus = nextPlaybackPath ? 'READY' : 'MISSING';
    asset.status = nextPlaybackPath ? 'READY' : 'ERROR';
    asset.playbackUrl = nextPlaybackPath ? pathToFileURL(nextPlaybackPath).toString() : undefined;
    if (asset.locations) {
      asset.locations.playbackUrl = asset.playbackUrl;
      asset.locations.pathHistory = uniqueList([
        ...(asset.locations.pathHistory ?? []),
        asset.locations.originalPath ?? '',
        asset.locations.managedPath ?? '',
      ]);
    }
  }

  await writeMediaIndexManifest(project.id, flattenAssets(project.bins), paths);
  return project;
}

export async function relinkProjectMedia(
  project: EditorProject,
  paths: ProjectMediaPaths,
  searchRoots: string[],
): Promise<{ project: EditorProject; summary: RelinkSummary }> {
  const normalizedRoots = uniqueList(searchRoots);
  const discoveredFiles = uniqueList((await Promise.all(normalizedRoots.map(async (root) => {
    if (!await pathExists(root)) {
      return [];
    }
    const rootStats = await stat(root);
    return rootStats.isDirectory() ? collectFilesRecursively(root) : [root];
  }))).flat()).filter(isSupportedIngestFile);
  const candidateLookup = buildCandidateLookup(discoveredFiles);
  let relinkedCount = 0;
  let missingCount = 0;

  for (const asset of flattenAssets(project.bins)) {
    const currentPath = getMediaAssetPrimaryPath(asset);
    if (await pathExists(currentPath)) {
      asset.indexStatus = 'READY';
      continue;
    }

    missingCount += 1;
    const stem = asset.relinkIdentity?.sourceFileStem ?? asset.name;
    const candidates = candidateLookup.get(normalizeToken(stem)) ?? [];
    let resolvedPath: string | null = null;

    for (const candidatePath of candidates) {
      const candidateStats = await stat(candidatePath);
      if (asset.fingerprint?.sizeBytes && candidateStats.size !== asset.fingerprint.sizeBytes) {
        continue;
      }

      if (asset.fingerprint?.digest) {
        const candidateFingerprint = await computePartialFingerprint(candidatePath);
        if (candidateFingerprint.digest !== asset.fingerprint.digest) {
          continue;
        }
      }

      resolvedPath = candidatePath;
      break;
    }

    if (!resolvedPath && candidates[0]) {
      resolvedPath = candidates[0];
    }

    if (!resolvedPath) {
      asset.indexStatus = 'MISSING';
      asset.status = 'ERROR';
      continue;
    }

    asset.indexStatus = 'READY';
    asset.status = 'READY';
    asset.playbackUrl = pathToFileURL(resolvedPath).toString();
    asset.locations = {
      ...(asset.locations ?? { pathHistory: [] }),
      originalPath: resolvedPath,
      playbackUrl: asset.playbackUrl,
      pathHistory: uniqueList([
        ...(asset.locations?.pathHistory ?? []),
        resolvedPath,
      ]),
    };
    asset.relinkIdentity = {
      ...(asset.relinkIdentity ?? {
        assetKey: '',
        normalizedName: normalizeToken(asset.name),
        sourceFileStem: asset.name,
        lastKnownPaths: [],
      }),
      lastKnownPaths: uniqueList([
        ...(asset.relinkIdentity?.lastKnownPaths ?? []),
        resolvedPath,
      ]),
    };
    relinkedCount += 1;
  }

  await writeMediaIndexManifest(project.id, flattenAssets(project.bins), paths);

  return {
    project,
    summary: {
      relinkedCount,
      missingCount: flattenAssets(project.bins).filter((asset) => asset.indexStatus === 'MISSING').length,
      scannedFiles: discoveredFiles.length,
    },
  };
}

export async function scanWatchFolderIntoProject(
  project: EditorProject,
  watchFolder: EditorWatchFolder,
  paths: ProjectMediaPaths,
): Promise<{ project: EditorProject; summary: WatchFolderScanSummary }> {
  const folderBin = ensureWatchFolderBin(project, watchFolder);
  const knownPaths = getAllKnownPaths(project);
  const files = (await collectFilesRecursively(watchFolder.path)).filter(isSupportedIngestFile);
  const newFiles = files.filter((filePath) => !knownPaths.has(filePath));
  const importedAssets: EditorMediaAsset[] = [];

  for (const filePath of newFiles) {
    const asset = await ingestMediaFile(filePath, paths, {
      storageMode: 'COPY',
      generateProxies: true,
      extractWaveforms: true,
    });
    importedAssets.push(asset);
  }

  appendAssetsToBin(folderBin, importedAssets);
  watchFolder.lastScannedAt = new Date().toISOString();
  watchFolder.importedAssetCount += importedAssets.length;
  if (importedAssets.length > 0) {
    watchFolder.lastImportedAt = new Date().toISOString();
  }

  await mergeIntoMediaIndex(project.id, importedAssets, paths);
  return {
    project,
    summary: {
      importedCount: importedAssets.length,
      scannedFiles: files.length,
    },
  };
}

function getMediaIndexManifestPath(paths: ProjectMediaPaths): string {
  return path.join(paths.indexPath, 'media-index.json');
}

export async function readMediaIndexManifest(paths: ProjectMediaPaths): Promise<EditorMediaAsset[]> {
  try {
    const serialized = await readFile(getMediaIndexManifestPath(paths), 'utf8');
    const parsed = JSON.parse(serialized) as MediaIndexManifest;
    return parsed.assets ?? [];
  } catch {
    return [];
  }
}

export async function writeMediaIndexManifest(projectId: string, assets: EditorMediaAsset[], paths: ProjectMediaPaths): Promise<void> {
  await ensureProjectMediaPaths(paths);
  const manifest: MediaIndexManifest = {
    projectId,
    updatedAt: new Date().toISOString(),
    assets,
  };

  await writeFile(getMediaIndexManifestPath(paths), JSON.stringify(manifest, null, 2), 'utf8');
}

export async function mergeIntoMediaIndex(projectId: string, assets: EditorMediaAsset[], paths: ProjectMediaPaths): Promise<void> {
  const existingAssets = await readMediaIndexManifest(paths);
  const nextAssets = new Map<string, EditorMediaAsset>();
  for (const asset of existingAssets) {
    nextAssets.set(asset.id, asset);
  }
  for (const asset of assets) {
    nextAssets.set(asset.id, asset);
  }
  await writeMediaIndexManifest(projectId, Array.from(nextAssets.values()), paths);
}

function formatEdlTimecode(totalSeconds: number, frameRate: number): string {
  const fps = Math.max(1, Math.round(frameRate));
  const totalFrames = Math.max(0, Math.round(totalSeconds * fps));
  const frames = totalFrames % fps;
  const totalSecondsWhole = Math.floor(totalFrames / fps);
  const seconds = totalSecondsWhole % 60;
  const totalMinutes = Math.floor(totalSecondsWhole / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  return [hours, minutes, seconds, frames].map((value) => String(value).padStart(2, '0')).join(':');
}

function buildEdl(project: EditorProject, assetMap: Map<string, EditorMediaAsset>): string {
  const frameRate = project.settings.frameRate;
  const videoTrack = [...project.tracks]
    .filter((track) => track.type === 'VIDEO')
    .sort((left, right) => left.sortOrder - right.sortOrder)[0];

  if (!videoTrack) {
    return '';
  }

  const lines = [
    `TITLE: ${project.name}`,
    'FCM: NON-DROP FRAME',
    '',
  ];

  videoTrack.clips
    .slice()
    .sort((left, right) => left.startTime - right.startTime)
    .forEach((clip, index) => {
      const asset = clip.assetId ? assetMap.get(clip.assetId) : undefined;
      const sourceStart = clip.trimStart ?? 0;
      const sourceEnd = sourceStart + (clip.endTime - clip.startTime);
      lines.push(
        `${String(index + 1).padStart(3, '0')}  ${(asset?.relinkIdentity?.reelName ?? asset?.name ?? clip.name).slice(0, 8).padEnd(8, ' ')} V     C        ${formatEdlTimecode(sourceStart, frameRate)} ${formatEdlTimecode(sourceEnd, frameRate)} ${formatEdlTimecode(clip.startTime, frameRate)} ${formatEdlTimecode(clip.endTime, frameRate)}`,
        `* FROM CLIP NAME: ${clip.name}`,
      );
    });

  return `${lines.join('\n')}\n`;
}

function buildOtio(project: EditorProject, assetMap: Map<string, EditorMediaAsset>): string {
  const otio = {
    OTIO_SCHEMA: 'Timeline.1',
    name: project.name,
    global_start_time: {
      OTIO_SCHEMA: 'RationalTime.1',
      rate: project.settings.frameRate,
      value: 0,
    },
    tracks: {
      OTIO_SCHEMA: 'Stack.1',
      children: project.tracks.map((track) => ({
        OTIO_SCHEMA: 'Track.1',
        name: track.name,
        kind: track.type === 'AUDIO' ? 'Audio' : 'Video',
        children: track.clips
          .slice()
          .sort((left, right) => left.startTime - right.startTime)
          .map((clip) => {
            const asset = clip.assetId ? assetMap.get(clip.assetId) : undefined;
            return {
              OTIO_SCHEMA: 'Clip.2',
              name: clip.name,
              source_range: {
                OTIO_SCHEMA: 'TimeRange.1',
                start_time: {
                  OTIO_SCHEMA: 'RationalTime.1',
                  rate: project.settings.frameRate,
                  value: Math.round((clip.trimStart ?? 0) * project.settings.frameRate),
                },
                duration: {
                  OTIO_SCHEMA: 'RationalTime.1',
                  rate: project.settings.frameRate,
                  value: Math.round((clip.endTime - clip.startTime) * project.settings.frameRate),
                },
              },
              media_reference: asset ? {
                OTIO_SCHEMA: 'ExternalReference.1',
                target_url: asset.playbackUrl ?? asset.locations?.playbackUrl ?? '',
                available_range: asset.duration ? {
                  OTIO_SCHEMA: 'TimeRange.1',
                  start_time: {
                    OTIO_SCHEMA: 'RationalTime.1',
                    rate: project.settings.frameRate,
                    value: 0,
                  },
                  duration: {
                    OTIO_SCHEMA: 'RationalTime.1',
                    rate: project.settings.frameRate,
                    value: Math.round(asset.duration * project.settings.frameRate),
                  },
                } : undefined,
                metadata: {
                  relinkIdentity: asset.relinkIdentity,
                  technicalMetadata: asset.technicalMetadata,
                },
              } : null,
            };
          }),
      })),
    },
  };

  return JSON.stringify(otio, null, 2);
}

function buildAudioTurnoverManifest(project: EditorProject, assetMap: Map<string, EditorMediaAsset>): string {
  const audioTracks = project.tracks.filter((track) => track.type === 'AUDIO');
  const routingTracks: AudioTrackRoutingDescriptor[] = [];
  const trackSummaries = audioTracks.map((track) => {
    const clipLayouts = track.clips.map((clip) => {
      const asset = clip.assetId ? assetMap.get(clip.assetId) : undefined;
      return normalizeAudioChannelLayoutLabel(
        asset?.technicalMetadata?.audioChannelLayout,
        asset?.technicalMetadata?.audioChannels,
      );
    });
    const dominantLayout = pickDominantAudioChannelLayout(clipLayouts);
    routingTracks.push({
      trackId: track.id,
      trackName: track.name,
      layout: dominantLayout,
      channelCount: getAudioChannelCountForLayout(dominantLayout, 2),
      clipLayouts: Array.from(new Set(clipLayouts)) as AudioTrackRoutingDescriptor['clipLayouts'],
    });

    return {
      id: track.id,
      name: track.name,
      layout: dominantLayout,
      channelCount: getAudioChannelCountForLayout(dominantLayout, 2),
      clips: track.clips.map((clip) => {
        const asset = clip.assetId ? assetMap.get(clip.assetId) : undefined;
        const assetLayout = normalizeAudioChannelLayoutLabel(
          asset?.technicalMetadata?.audioChannelLayout,
          asset?.technicalMetadata?.audioChannels,
        );
        return {
          id: clip.id,
          name: clip.name,
          recordIn: clip.startTime,
          recordOut: clip.endTime,
          sourceIn: clip.trimStart ?? 0,
          sourceDuration: clip.endTime - clip.startTime,
          assetId: clip.assetId,
          sourcePath: asset ? getMediaAssetPrimaryPath(asset) : undefined,
          relinkIdentity: asset?.relinkIdentity,
          audioChannelLayout: assetLayout,
          audioChannels: getAudioChannelCountForLayout(assetLayout, asset?.technicalMetadata?.audioChannels ?? 2),
        };
      }),
    };
  });
  const topology = buildAudioMixTopology(routingTracks);
  const projectLayout = pickDominantAudioChannelLayout(trackSummaries.map((track) => track.layout));
  const printMasterBus = topology.buses.find((bus) => bus.id === topology.printMasterBusId || bus.role === 'printmaster');
  const foldDownBus = topology.buses.find((bus) => bus.id === topology.monitoringBusId || bus.role === 'fold-down');
  const processingPolicy = topology.buses.map((bus) => ({
    busId: bus.id,
    ...summarizeAudioBusProcessingPolicy(bus),
  }));
  const executionPolicy = topology.buses.map((bus) => ({
    busId: bus.id,
    ...summarizeAudioBusExecutionPolicy(bus),
  }));
  const assistantEditorChecklist = [
    {
      id: 'source-paths',
      label: 'Resolve source paths',
      status: trackSummaries.every((track) => track.clips.every((clip) => Boolean(clip.sourcePath))) ? 'complete' : 'needs-attention',
    },
    {
      id: 'stem-roles',
      label: 'Assign stem roles',
      status: topology.buses
        .filter((bus) => bus.role !== 'master')
        .every((bus) => Boolean(bus.stemRole)) ? 'complete' : 'needs-attention',
    },
    {
      id: 'printmaster-chain',
      label: 'Verify printmaster print chain',
      status: printMasterBus
        && summarizeAudioBusProcessingPolicy(printMasterBus).print.activeStages.some((stage) => stage.kind === 'meter')
        && summarizeAudioBusProcessingPolicy(printMasterBus).print.activeStages.some((stage) => stage.kind === 'limiter')
        ? 'complete'
        : 'needs-attention',
    },
    {
      id: 'fold-down-chain',
      label: 'Verify fold-down print chain',
      status: getAudioChannelCountForLayout(projectLayout, 2) <= 2
        ? 'not-applicable'
        : Boolean(
          foldDownBus
            && summarizeAudioBusProcessingPolicy(foldDownBus).print.activeStages
              .some((stage) => stage.kind === 'fold-down-matrix')
            && summarizeAudioBusProcessingPolicy(foldDownBus).print.activeStages
              .some((stage) => stage.kind === 'limiter')
        )
          ? 'complete'
          : 'needs-attention',
    },
    {
      id: 'preview-print-separation',
      label: 'Confirm preview vs print processing split',
      status: processingPolicy.every((bus) => (
        bus.preview.bypassedStages.length === 0
        || bus.print.activeStages.length > bus.preview.activeStages.length
      )) ? 'complete' : 'needs-attention',
    },
  ];
  const manifest = {
    projectId: project.id,
    projectName: project.name,
    sampleRate: project.settings.sampleRate,
    audioChannelLayout: projectLayout,
    audioChannels: getAudioChannelCountForLayout(projectLayout, 2),
    previewProcessingContext: 'preview',
    printProcessingContext: 'print',
    printMasterBusId: topology.printMasterBusId,
    monitoringBusId: topology.monitoringBusId,
    routingWarnings: topology.routingWarnings,
    processingWarnings: topology.processingWarnings,
    processingPolicy: {
      requiresDedicatedPreviewRender: processingPolicy.some((bus) => bus.requiresDedicatedPreviewRender),
      requiresDedicatedPrintRender: processingPolicy.some((bus) => bus.requiresDedicatedPrintRender),
    },
    executionPolicy: {
      requiresBufferedPreviewCaches: executionPolicy.some((bus) => bus.previewMode === 'buffered-preview-cache'),
      requiresOfflinePrintRenders: executionPolicy.some((bus) => bus.printMode === 'offline-print-render'),
    },
    assistantEditorChecklist,
    buses: topology.buses.map((bus) => {
      const policy = summarizeAudioBusProcessingPolicy(bus);
      const execution = summarizeAudioBusExecutionPolicy(bus);
      return {
        id: bus.id,
        name: bus.name,
        role: bus.role,
        stemRole: bus.stemRole,
        layout: bus.layout,
        channelCount: bus.channelCount ?? getAudioChannelCountForLayout(bus.layout, 2),
        meteringMode: bus.meteringMode,
        sourceTrackIds: bus.sourceTrackIds ?? [],
        sendTargets: bus.sendTargets ?? [],
        processingChain: bus.processingChain ?? [],
        previewProcessingChain: policy.preview.activeStages,
        printProcessingChain: policy.print.activeStages,
        processingPolicy: {
          requiresDedicatedPreviewRender: policy.requiresDedicatedPreviewRender,
          requiresDedicatedPrintRender: policy.requiresDedicatedPrintRender,
          previewBypassedProcessingChain: policy.preview.bypassedStages,
          printBypassedProcessingChain: policy.print.bypassedStages,
        },
        executionPolicy: {
          previewMode: execution.previewMode,
          printMode: execution.printMode,
          previewReasonKinds: execution.previewReasonKinds,
          printReasonKinds: execution.printReasonKinds,
        },
      };
    }),
    exportedAt: new Date().toISOString(),
    tracks: trackSummaries,
  };

  return JSON.stringify(manifest, null, 2);
}

function buildRenderClips(track: EditorTrack): EditorClip[] {
  return track.clips.slice().sort((left, right) => left.startTime - right.startTime);
}

async function renderTimelineScreener(project: EditorProject, exportDir: string): Promise<string | null> {
  const { ffmpeg } = await getMediaToolPaths();
  if (!ffmpeg) {
    return null;
  }

  const assetMap = new Map(flattenAssets(project.bins).map((asset) => [asset.id, asset] as const));
  const durationSeconds = Math.max(
    1,
    project.tracks.flatMap((track) => track.clips).reduce((max, clip) => Math.max(max, clip.endTime), 0),
  );
  const outputPath = path.join(exportDir, 'sequence-preview.mp4');
  const args = [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `color=c=black:s=${project.settings.width}x${project.settings.height}:r=${project.settings.frameRate}:d=${durationSeconds}`,
    '-f',
    'lavfi',
    '-i',
    `anullsrc=r=${project.settings.sampleRate}:cl=stereo:d=${durationSeconds}`,
  ];

  const videoTracks = [...project.tracks]
    .filter((track) => track.type === 'VIDEO')
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const audioTracks = [...project.tracks]
    .filter((track) => track.type === 'AUDIO')
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const videoFilters: string[] = [];
  const audioFilters: string[] = [];
  const overlayLabels: string[] = [];
  const audioLabels: string[] = ['[1:a]'];
  let inputIndex = 2;

  for (const track of videoTracks) {
    for (const clip of buildRenderClips(track)) {
      const asset = clip.assetId ? assetMap.get(clip.assetId) : undefined;
      const sourcePath = asset ? getMediaAssetPrimaryPath(asset) : undefined;
      if (!sourcePath || !await pathExists(sourcePath)) {
        continue;
      }

      const clipDuration = Math.max(0.04, clip.endTime - clip.startTime);
      args.push('-ss', String(Math.max(0, clip.trimStart ?? 0)), '-t', String(clipDuration), '-i', sourcePath);
      const videoLabel = `[v${inputIndex}]`;
      videoFilters.push(
        `[${inputIndex}:v]scale=${project.settings.width}:${project.settings.height}:force_original_aspect_ratio=decrease,pad=${project.settings.width}:${project.settings.height}:(ow-iw)/2:(oh-ih)/2:black,fps=${project.settings.frameRate},setsar=1,format=yuv420p,setpts=PTS-STARTPTS+${clip.startTime}/TB${videoLabel}`,
      );
      overlayLabels.push(videoLabel);

      if (asset?.technicalMetadata?.audioChannels) {
        const delayMs = Math.round(clip.startTime * 1000);
        const audioLabel = `[a${inputIndex}]`;
        audioFilters.push(
          `[${inputIndex}:a]aformat=sample_fmts=fltp:sample_rates=${project.settings.sampleRate}:channel_layouts=stereo,asetpts=PTS-STARTPTS,adelay=${delayMs}|${delayMs}${audioLabel}`,
        );
        audioLabels.push(audioLabel);
      }

      inputIndex += 1;
    }
  }

  for (const track of audioTracks) {
    for (const clip of buildRenderClips(track)) {
      const asset = clip.assetId ? assetMap.get(clip.assetId) : undefined;
      const sourcePath = asset ? getMediaAssetPrimaryPath(asset) : undefined;
      if (!sourcePath || !await pathExists(sourcePath)) {
        continue;
      }

      const clipDuration = Math.max(0.04, clip.endTime - clip.startTime);
      args.push('-ss', String(Math.max(0, clip.trimStart ?? 0)), '-t', String(clipDuration), '-i', sourcePath);
      const delayMs = Math.round(clip.startTime * 1000);
      const audioLabel = `[a${inputIndex}]`;
      audioFilters.push(
        `[${inputIndex}:a]aformat=sample_fmts=fltp:sample_rates=${project.settings.sampleRate}:channel_layouts=stereo,asetpts=PTS-STARTPTS,adelay=${delayMs}|${delayMs}${audioLabel}`,
      );
      audioLabels.push(audioLabel);
      inputIndex += 1;
    }
  }

  let currentVideoLabel = '[0:v]';
  const overlayFilters: string[] = [];
  overlayLabels.forEach((label, index) => {
    const nextLabel = index === overlayLabels.length - 1 ? '[vout]' : `[vo${index}]`;
    overlayFilters.push(`${currentVideoLabel}${label}overlay=eof_action=pass${nextLabel}`);
    currentVideoLabel = nextLabel;
  });

  const audioMixLabel = '[aout]';
  const audioMixFilter = `${audioLabels.join('')}amix=inputs=${audioLabels.length}:normalize=0:dropout_transition=0${audioMixLabel}`;
  const filterComplex = [
    ...videoFilters,
    ...audioFilters,
    ...overlayFilters,
    audioMixFilter,
  ].join(';');

  const gpu = await detectGPU();
  const hwEncodeArgs = getHWAccelFFmpegArgs(gpu, 'h264');
  const cvIdx = hwEncodeArgs.indexOf('-c:v');
  const screenerEncoder = cvIdx >= 0 ? hwEncodeArgs[cvIdx + 1]! : 'libx264';
  const isSWEncoder = screenerEncoder === 'libx264' || screenerEncoder === 'libx265';
  const screenerQualityArgs = isSWEncoder
    ? ['-preset', 'veryfast', '-crf', '20']
    : ['-b:v', '8M'];

  const finalVideoLabel = overlayLabels.length > 0 ? '[vout]' : '[0:v]';
  args.push(
    '-filter_complex',
    filterComplex,
    '-map',
    finalVideoLabel,
    '-map',
    audioMixLabel,
    '-c:v',
    screenerEncoder,
    ...screenerQualityArgs,
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-movflags',
    '+faststart',
    outputPath,
  );

  await execFileAsync(ffmpeg, args);
  return outputPath;
}

export async function writeConformExportPackage(project: EditorProject, paths: ProjectMediaPaths, exportBaseName: string): Promise<string> {
  await ensureProjectMediaPaths(paths);
  const exportDir = path.join(paths.exportsPath, `${exportBaseName}-${Date.now()}`);
  await mkdir(exportDir, { recursive: true });

  const assets = flattenAssets(project.bins);
  const assetMap = new Map(assets.map((asset) => [asset.id, asset] as const));
  const relinkMap = assets.map((asset) => ({
    assetId: asset.id,
    name: asset.name,
    assetKey: asset.relinkIdentity?.assetKey,
    originalPath: asset.locations?.originalPath,
    managedPath: asset.locations?.managedPath,
    proxyPath: asset.proxyMetadata?.filePath,
    fingerprint: asset.fingerprint,
    technicalMetadata: asset.technicalMetadata,
  }));

  await writeFile(path.join(exportDir, 'project.avid.export.json'), JSON.stringify({
    project,
    exportedAt: new Date().toISOString(),
    type: 'conform-package',
  }, null, 2), 'utf8');
  await writeFile(path.join(exportDir, 'media-index.json'), JSON.stringify({
    projectId: project.id,
    updatedAt: new Date().toISOString(),
    assets,
  }, null, 2), 'utf8');
  await writeFile(path.join(exportDir, 'relink-map.json'), JSON.stringify(relinkMap, null, 2), 'utf8');
  await writeFile(path.join(exportDir, 'timeline.edl'), buildEdl(project, assetMap), 'utf8');
  await writeFile(path.join(exportDir, 'timeline.otio.json'), buildOtio(project, assetMap), 'utf8');
  await writeFile(path.join(exportDir, 'audio-turnover.json'), buildAudioTurnoverManifest(project, assetMap), 'utf8');

  try {
    await renderTimelineScreener(project, exportDir);
  } catch {
    // Conform and interchange files remain available even when screener render fails.
  }

  return exportDir;
}

function mapVideoEncoder(codec?: string, fallbackContainer?: string): string {
  const normalized = normalizeToken(codec ?? '');
  switch (normalized) {
    case 'h264':
    case 'avc':
    case 'libx264':
      return 'libx264';
    case 'h265':
    case 'hevc':
    case 'libx265':
      return 'libx265';
    case 'prores':
    case 'prores ks':
    case 'prores_ks':
      return 'prores_ks';
    case 'dnxhd':
    case 'dnxhr':
      return 'dnxhd';
    case 'av1':
    case 'libaom-av1':
    case 'libaom av1':
      return 'libaom-av1';
    case 'vp9':
    case 'libvpx-vp9':
      return 'libvpx-vp9';
    default: {
      const container = normalizeToken(fallbackContainer ?? '');
      if (container === 'mov') {
        return 'prores_ks';
      }
      if (container === 'mxf') {
        return 'dnxhd';
      }
      return 'libx264';
    }
  }
}

function mapAudioEncoder(codec?: string, fallbackContainer?: string): string | null {
  const normalized = normalizeToken(codec ?? '');
  switch (normalized) {
    case '':
      break;
    case 'none':
      return null;
    case 'aac':
      return 'aac';
    case 'opus':
      return 'libopus';
    case 'pcm s24le':
    case 'pcm_s24le':
      return 'pcm_s24le';
    case 'pcm s16le':
    case 'pcm_s16le':
      return 'pcm_s16le';
    default:
      return normalized.replace(/\s+/g, '_');
  }

  const container = normalizeToken(fallbackContainer ?? '');
  if (container === 'mxf' || container === 'mov') {
    return 'pcm_s24le';
  }
  return 'aac';
}

export async function transcodeExportArtifact(
  request: ExportTranscodeRequest,
  outputDirectory: string,
): Promise<ExportTranscodeResult> {
  const availability = await getToolAvailability();
  const toolPaths = await getMediaToolPaths();
  if (!availability.ffmpeg || !toolPaths.ffmpeg) {
    throw new Error('ffmpeg not available for export transcode handoff');
  }

  await mkdir(outputDirectory, { recursive: true });

  const safeJobId = sanitizeFileName(request.jobId || createId('export'));
  const targetContainer = sanitizeFileName(request.targetContainer || 'mp4');
  const sourceContainer = sanitizeFileName(request.sourceContainer || 'webm');
  const tempInputPath = path.join(outputDirectory, `${safeJobId}.handoff.${sourceContainer}`);
  const outputPath = path.join(outputDirectory, `${safeJobId}.${targetContainer}`);

  await writeFile(tempInputPath, Buffer.from(request.sourceArtifact));

  const videoEncoder = mapVideoEncoder(request.targetVideoCodec, targetContainer);
  const audioEncoder = mapAudioEncoder(request.targetAudioCodec, targetContainer);
  const args = ['-y', '-i', tempInputPath];

  if (
    Number.isFinite(request.width)
    && Number.isFinite(request.height)
    && (request.width ?? 0) > 0
    && (request.height ?? 0) > 0
  ) {
    args.push(
      '-vf',
      `scale=${Math.round(request.width!)}:${Math.round(request.height!)}:flags=lanczos,format=yuv420p`,
    );
  } else {
    args.push('-pix_fmt', 'yuv420p');
  }

  if (Number.isFinite(request.fps) && (request.fps ?? 0) > 0) {
    args.push('-r', String(request.fps));
  }

  args.push('-c:v', videoEncoder);

  if (audioEncoder) {
    args.push('-c:a', audioEncoder);
  } else {
    args.push('-an');
  }

  if (targetContainer === 'mp4' || targetContainer === 'mov') {
    args.push('-movflags', '+faststart');
  }

  args.push(outputPath);
  await execFileAsync(toolPaths.ffmpeg, args);

  return {
    outputPath,
    outputContainer: targetContainer,
    outputVideoCodec: videoEncoder,
    outputAudioCodec: audioEncoder ?? undefined,
  };
}
