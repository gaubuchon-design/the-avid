// ─── Ad Unit Validator ───────────────────────────────────────────────────────
// Pre-export platform validation: Meta, Google DV360, YouTube, LinkedIn,
// TikTok, Twitter specs. File size, duration, aspect ratio, codec, audio
// normalization checks. PASS/FAIL/WARNING per platform. Block export on fail.

import type {
  AdPlatform,
  AdUnitSpec,
  AdValidationResult,
  AdValidationCheck,
  AdValidationStatus,
} from './types';

// ─── Platform Specs Database ─────────────────────────────────────────────────

const PLATFORM_SPECS: AdUnitSpec[] = [
  // Meta (Facebook / Instagram)
  {
    platform: 'META',
    name: 'Meta In-Feed Video',
    maxFileSize: 4 * 1024 * 1024 * 1024, // 4 GB
    maxDuration: 241 * 60, // 241 minutes
    minDuration: 1,
    aspectRatios: ['16:9', '1:1', '4:5', '9:16'],
    codecs: ['h264', 'h265'],
    audioNormalization: -14,
    maxBitrate: 26000,
    minResolution: { width: 600, height: 315 },
    maxResolution: { width: 4096, height: 4096 },
  },
  {
    platform: 'META',
    name: 'Meta Stories / Reels',
    maxFileSize: 4 * 1024 * 1024 * 1024,
    maxDuration: 60,
    minDuration: 1,
    aspectRatios: ['9:16'],
    codecs: ['h264', 'h265'],
    audioNormalization: -14,
    maxBitrate: 26000,
    minResolution: { width: 500, height: 888 },
    maxResolution: { width: 1080, height: 1920 },
  },
  // Google DV360
  {
    platform: 'GOOGLE_DV360',
    name: 'DV360 Standard Video',
    maxFileSize: 1 * 1024 * 1024 * 1024,
    maxDuration: 180,
    minDuration: 5,
    aspectRatios: ['16:9', '4:3'],
    codecs: ['h264', 'vp9'],
    audioNormalization: -24,
    maxBitrate: 20000,
    minResolution: { width: 640, height: 360 },
    maxResolution: { width: 3840, height: 2160 },
  },
  // YouTube
  {
    platform: 'YOUTUBE',
    name: 'YouTube Standard Upload',
    maxFileSize: 256 * 1024 * 1024 * 1024, // 256 GB
    maxDuration: 12 * 60 * 60, // 12 hours
    aspectRatios: ['16:9', '4:3', '1:1', '9:16'],
    codecs: ['h264', 'h265', 'vp9', 'av1'],
    audioNormalization: -14,
    maxBitrate: 68000,
    minResolution: { width: 426, height: 240 },
    maxResolution: { width: 7680, height: 4320 },
  },
  {
    platform: 'YOUTUBE',
    name: 'YouTube Bumper Ad',
    maxFileSize: 1 * 1024 * 1024 * 1024,
    maxDuration: 6,
    minDuration: 1,
    aspectRatios: ['16:9'],
    codecs: ['h264', 'h265'],
    audioNormalization: -14,
    maxBitrate: 20000,
    minResolution: { width: 640, height: 360 },
    maxResolution: { width: 3840, height: 2160 },
  },
  // LinkedIn
  {
    platform: 'LINKEDIN',
    name: 'LinkedIn Video Ad',
    maxFileSize: 200 * 1024 * 1024, // 200 MB
    maxDuration: 30 * 60,
    minDuration: 3,
    aspectRatios: ['16:9', '1:1', '9:16'],
    codecs: ['h264'],
    audioNormalization: -14,
    maxBitrate: 30000,
    minResolution: { width: 360, height: 360 },
    maxResolution: { width: 1920, height: 1920 },
  },
  // TikTok
  {
    platform: 'TIKTOK',
    name: 'TikTok In-Feed',
    maxFileSize: 500 * 1024 * 1024,
    maxDuration: 60,
    minDuration: 5,
    aspectRatios: ['9:16', '1:1', '16:9'],
    codecs: ['h264', 'h265'],
    audioNormalization: -14,
    maxBitrate: 20000,
    minResolution: { width: 540, height: 960 },
    maxResolution: { width: 1080, height: 1920 },
  },
  {
    platform: 'TIKTOK',
    name: 'TikTok TopView',
    maxFileSize: 500 * 1024 * 1024,
    maxDuration: 60,
    minDuration: 5,
    aspectRatios: ['9:16'],
    codecs: ['h264', 'h265'],
    audioNormalization: -14,
    maxBitrate: 20000,
    minResolution: { width: 540, height: 960 },
    maxResolution: { width: 1080, height: 1920 },
  },
  // Twitter / X
  {
    platform: 'TWITTER',
    name: 'X Video Ad',
    maxFileSize: 1 * 1024 * 1024 * 1024,
    maxDuration: 140,
    minDuration: 2,
    aspectRatios: ['16:9', '1:1'],
    codecs: ['h264'],
    audioNormalization: -14,
    maxBitrate: 25000,
    minResolution: { width: 600, height: 600 },
    maxResolution: { width: 1920, height: 1200 },
  },
];

// ─── Public API ──────────────────────────────────────────────────────────────

export function getSpecsForPlatform(platform: AdPlatform): AdUnitSpec[] {
  return PLATFORM_SPECS.filter((spec) => spec.platform === platform);
}

export function getAllSpecs(): AdUnitSpec[] {
  return [...PLATFORM_SPECS];
}

export function getSupportedPlatforms(): AdPlatform[] {
  return [...new Set(PLATFORM_SPECS.map((s) => s.platform))];
}

// ─── Validation ──────────────────────────────────────────────────────────────

export interface VideoMetadata {
  fileSize: number;       // bytes
  duration: number;       // seconds
  width: number;
  height: number;
  codec: string;          // e.g. "h264"
  bitrate: number;        // kbps
  audioLoudness: number;  // LUFS
  hasAudio: boolean;
}

function computeAspectRatio(width: number, height: number): string {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
}

function checkStatus(pass: boolean, isWarning?: boolean): AdValidationStatus {
  if (pass) return 'PASS';
  return isWarning ? 'WARNING' : 'FAIL';
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/**
 * Validate a video against a specific ad unit spec.
 */
export function validateAgainstSpec(
  video: VideoMetadata,
  spec: AdUnitSpec,
): AdValidationResult {
  const checks: AdValidationCheck[] = [];

  // File size
  const sizePass = video.fileSize <= spec.maxFileSize;
  checks.push({
    name: 'File Size',
    status: checkStatus(sizePass),
    actual: formatBytes(video.fileSize),
    expected: `<= ${formatBytes(spec.maxFileSize)}`,
    message: sizePass
      ? 'File size is within limits.'
      : `File size exceeds maximum of ${formatBytes(spec.maxFileSize)}.`,
  });

  // Duration
  const durationMax = video.duration <= spec.maxDuration;
  const durationMin = spec.minDuration ? video.duration >= spec.minDuration : true;
  checks.push({
    name: 'Duration',
    status: checkStatus(durationMax && durationMin),
    actual: `${video.duration.toFixed(1)}s`,
    expected: spec.minDuration
      ? `${spec.minDuration}s - ${spec.maxDuration}s`
      : `<= ${spec.maxDuration}s`,
    message: durationMax && durationMin
      ? 'Duration is within limits.'
      : !durationMax
        ? `Duration exceeds maximum of ${spec.maxDuration}s.`
        : `Duration is below minimum of ${spec.minDuration}s.`,
  });

  // Aspect ratio
  const actualRatio = computeAspectRatio(video.width, video.height);
  const ratioPass = spec.aspectRatios.includes(actualRatio);
  checks.push({
    name: 'Aspect Ratio',
    status: checkStatus(ratioPass, true), // warning rather than fail for some platforms
    actual: actualRatio,
    expected: spec.aspectRatios.join(', '),
    message: ratioPass
      ? 'Aspect ratio is supported.'
      : `Aspect ratio ${actualRatio} is not in the supported list.`,
  });

  // Codec
  const codecPass = spec.codecs.includes(video.codec.toLowerCase());
  checks.push({
    name: 'Video Codec',
    status: checkStatus(codecPass),
    actual: video.codec,
    expected: spec.codecs.join(', '),
    message: codecPass
      ? 'Video codec is supported.'
      : `Codec "${video.codec}" is not supported. Use: ${spec.codecs.join(', ')}.`,
  });

  // Bitrate
  if (spec.maxBitrate) {
    const bitratePass = video.bitrate <= spec.maxBitrate;
    checks.push({
      name: 'Bitrate',
      status: checkStatus(bitratePass, true),
      actual: `${video.bitrate} kbps`,
      expected: `<= ${spec.maxBitrate} kbps`,
      message: bitratePass
        ? 'Bitrate is within limits.'
        : `Bitrate exceeds recommended maximum of ${spec.maxBitrate} kbps.`,
    });
  }

  // Resolution
  if (spec.minResolution) {
    const resPass = video.width >= spec.minResolution.width && video.height >= spec.minResolution.height;
    checks.push({
      name: 'Min Resolution',
      status: checkStatus(resPass),
      actual: `${video.width}x${video.height}`,
      expected: `>= ${spec.minResolution.width}x${spec.minResolution.height}`,
      message: resPass
        ? 'Resolution meets minimum requirements.'
        : 'Resolution is below the minimum required.',
    });
  }
  if (spec.maxResolution) {
    const resPass = video.width <= spec.maxResolution.width && video.height <= spec.maxResolution.height;
    checks.push({
      name: 'Max Resolution',
      status: checkStatus(resPass, true),
      actual: `${video.width}x${video.height}`,
      expected: `<= ${spec.maxResolution.width}x${spec.maxResolution.height}`,
      message: resPass
        ? 'Resolution is within limits.'
        : 'Resolution exceeds the maximum recommended.',
    });
  }

  // Audio normalization
  if (video.hasAudio) {
    const loudnessDiff = Math.abs(video.audioLoudness - spec.audioNormalization);
    const audioPass = loudnessDiff <= 1;
    const audioWarning = loudnessDiff <= 3;
    checks.push({
      name: 'Audio Normalization',
      status: audioPass ? 'PASS' : audioWarning ? 'WARNING' : 'FAIL',
      actual: `${video.audioLoudness} LUFS`,
      expected: `${spec.audioNormalization} LUFS (+/- 1)`,
      message: audioPass
        ? 'Audio loudness meets target.'
        : `Audio loudness ${video.audioLoudness} LUFS differs from target ${spec.audioNormalization} LUFS.`,
    });
  }

  // Determine overall status
  const hasFail = checks.some((c) => c.status === 'FAIL');
  const hasWarning = checks.some((c) => c.status === 'WARNING');
  const overallStatus: AdValidationStatus = hasFail ? 'FAIL' : hasWarning ? 'WARNING' : 'PASS';

  return {
    platform: spec.platform,
    specName: spec.name,
    status: overallStatus,
    checks,
  };
}

/**
 * Validate a video against all specs for a specific platform.
 */
export function validateForPlatform(
  video: VideoMetadata,
  platform: AdPlatform,
): AdValidationResult[] {
  return getSpecsForPlatform(platform).map((spec) => validateAgainstSpec(video, spec));
}

/**
 * Validate a video against all platform specs.
 */
export function validateForAllPlatforms(video: VideoMetadata): AdValidationResult[] {
  return PLATFORM_SPECS.map((spec) => validateAgainstSpec(video, spec));
}

/**
 * Export gating: returns true only if the video passes the specified platform specs.
 */
export function canExportForPlatform(
  video: VideoMetadata,
  platform: AdPlatform,
): boolean {
  const results = validateForPlatform(video, platform);
  return results.every((r) => r.status !== 'FAIL');
}

/**
 * Get a summary of pass/fail/warning counts across all platforms.
 */
export function getValidationSummary(results: AdValidationResult[]): {
  pass: number;
  fail: number;
  warning: number;
  total: number;
} {
  return {
    pass: results.filter((r) => r.status === 'PASS').length,
    fail: results.filter((r) => r.status === 'FAIL').length,
    warning: results.filter((r) => r.status === 'WARNING').length,
    total: results.length,
  };
}
