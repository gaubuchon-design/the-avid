// =============================================================================
//  THE AVID — Built-In Publishing Templates
//  Template definitions for social media, broadcast, archive, streaming,
//  interchange, and multi-step professional workflows.
//  Templates reference ExportEngine presets and add workflow steps + overrides.
// =============================================================================

import type {
  PublishingTemplate,
  TemplateCategory,
  TemplateStep,
  TemplateStepType,
} from '../types/deliver.types';

// ─── Helpers ────────────────────────────────────────────────────────────────

let _stepId = 0;
function step(
  type: TemplateStepType,
  label: string,
  workerType: 'ingest' | 'transcribe' | 'metadata' | 'render' = 'render',
  config: Record<string, unknown> = {},
  optional = false,
  failureAction: 'skip' | 'retry' | 'abort' = 'abort',
): TemplateStep {
  return {
    id: `step_${++_stepId}`,
    order: 0, // set below
    type,
    label,
    workerType,
    config,
    failureAction,
    optional,
  };
}

function template(
  id: string,
  name: string,
  category: TemplateCategory,
  icon: string,
  description: string,
  steps: TemplateStep[],
  overrides: Partial<import('../types/deliver.types').ExportSettings> = {},
  platform?: string,
  aspectRatio?: string,
): PublishingTemplate {
  const ordered = steps.map((s, i) => ({ ...s, order: i + 1 }));
  return {
    id,
    name,
    category,
    icon,
    description,
    isBuiltIn: true,
    steps: ordered,
    presetOverrides: overrides,
    platform,
    aspectRatio,
  };
}

// =============================================================================
//  SOCIAL TEMPLATES
// =============================================================================

const SOCIAL_TEMPLATES: PublishingTemplate[] = [
  template(
    'tpl-youtube-4k',
    'YouTube 4K',
    'social',
    'youtube',
    'Upload-ready 4K H.264 for YouTube with auto-captions and metadata tagging.',
    [
      step('encode', 'Encode H.264 4K', 'render', { presetId: 'social-youtube-4k' }),
      step('caption', 'Generate Captions', 'transcribe', { format: 'srt', language: 'en' }, true),
      step('metadata', 'Tag Metadata', 'metadata', { tags: true, chapters: true }, true),
      step('upload', 'Upload to YouTube', 'render', { destination: 'youtube' }),
    ],
    {
      videoCodec: 'h264',
      resolution: { width: 3840, height: 2160 },
      frameRate: 23.976,
      bitrate: '40 Mbps',
      container: 'mp4',
      audioCodec: 'aac',
      audioBitrate: '320 kbps',
    },
    'youtube',
    '16:9',
  ),

  template(
    'tpl-youtube-1080',
    'YouTube 1080p',
    'social',
    'youtube',
    'Optimized 1080p H.264 for standard YouTube uploads.',
    [
      step('encode', 'Encode H.264 1080p', 'render', { presetId: 'stream-h264-1080p' }),
      step('caption', 'Generate Captions', 'transcribe', { format: 'srt', language: 'en' }, true),
      step('upload', 'Upload to YouTube', 'render', { destination: 'youtube' }),
    ],
    {
      videoCodec: 'h264',
      resolution: { width: 1920, height: 1080 },
      frameRate: 23.976,
      bitrate: '15 Mbps',
      container: 'mp4',
    },
    'youtube',
    '16:9',
  ),

  template(
    'tpl-youtube-shorts',
    'YouTube Shorts',
    'social',
    'youtube',
    'Vertical 9:16 short-form video optimized for YouTube Shorts.',
    [
      step('reframe', 'Smart Reframe 9:16', 'render', { targetAspectRatio: '9:16' }),
      step('encode', 'Encode H.264 Vertical', 'render', { presetId: 'social-youtube-shorts' }),
      step('upload', 'Upload to YouTube', 'render', { destination: 'youtube', isShort: true }),
    ],
    {
      videoCodec: 'h264',
      resolution: { width: 1080, height: 1920 },
      frameRate: 30,
      bitrate: '10 Mbps',
      container: 'mp4',
      smartReframe: { enabled: true, targetAspectRatio: '9:16' },
    },
    'youtube',
    '9:16',
  ),

  template(
    'tpl-instagram-reels',
    'Instagram Reels',
    'social',
    'instagram',
    'Vertical 9:16 H.264 optimized for Instagram Reels.',
    [
      step('reframe', 'Smart Reframe 9:16', 'render', { targetAspectRatio: '9:16' }),
      step('encode', 'Encode H.264 Vertical', 'render', { presetId: 'social-instagram-reels' }),
      step('upload', 'Upload to Instagram', 'render', { destination: 'instagram' }),
    ],
    {
      videoCodec: 'h264',
      resolution: { width: 1080, height: 1920 },
      frameRate: 30,
      bitrate: '10 Mbps',
      container: 'mp4',
      smartReframe: { enabled: true, targetAspectRatio: '9:16' },
    },
    'instagram',
    '9:16',
  ),

  template(
    'tpl-instagram-feed',
    'Instagram Feed',
    'social',
    'instagram',
    'Square 1:1 H.264 for Instagram feed posts.',
    [
      step('reframe', 'Smart Reframe 1:1', 'render', { targetAspectRatio: '1:1' }),
      step('encode', 'Encode H.264 Square', 'render', { presetId: 'social-instagram-reels' }),
      step('upload', 'Upload to Instagram', 'render', { destination: 'instagram' }),
    ],
    {
      videoCodec: 'h264',
      resolution: { width: 1080, height: 1080 },
      frameRate: 30,
      bitrate: '8 Mbps',
      container: 'mp4',
      smartReframe: { enabled: true, targetAspectRatio: '1:1' },
    },
    'instagram',
    '1:1',
  ),

  template(
    'tpl-tiktok',
    'TikTok',
    'social',
    'tiktok',
    'Vertical 9:16 delivery optimized for TikTok publishing.',
    [
      step('reframe', 'Smart Reframe 9:16', 'render', { targetAspectRatio: '9:16' }),
      step('encode', 'Encode H.264 Vertical', 'render', { presetId: 'social-tiktok' }),
      step('upload', 'Upload to TikTok', 'render', { destination: 'tiktok' }),
    ],
    {
      videoCodec: 'h264',
      resolution: { width: 1080, height: 1920 },
      frameRate: 30,
      bitrate: '8 Mbps',
      container: 'mp4',
      smartReframe: { enabled: true, targetAspectRatio: '9:16' },
    },
    'tiktok',
    '9:16',
  ),

  template(
    'tpl-twitter-x',
    'Twitter / X',
    'social',
    'twitter',
    'H.264 1080p delivery optimized for Twitter/X video.',
    [
      step('encode', 'Encode H.264 1080p', 'render', { presetId: 'stream-h264-1080p' }),
      step('upload', 'Upload to Twitter', 'render', { destination: 'twitter' }),
    ],
    {
      videoCodec: 'h264',
      resolution: { width: 1920, height: 1080 },
      frameRate: 30,
      bitrate: '12 Mbps',
      container: 'mp4',
    },
    'twitter',
    '16:9',
  ),

  template(
    'tpl-vimeo',
    'Vimeo',
    'social',
    'vimeo',
    'High-quality H.264 4K upload for Vimeo.',
    [
      step('encode', 'Encode H.264 4K', 'render', { presetId: 'stream-h264-4k' }),
      step('upload', 'Upload to Vimeo', 'render', { destination: 'vimeo' }),
    ],
    {
      videoCodec: 'h264',
      resolution: { width: 3840, height: 2160 },
      frameRate: 23.976,
      bitrate: '45 Mbps',
      container: 'mp4',
    },
    'vimeo',
    '16:9',
  ),

  template(
    'tpl-linkedin',
    'LinkedIn',
    'social',
    'linkedin',
    'H.264 1080p delivery for LinkedIn video.',
    [
      step('encode', 'Encode H.264 1080p', 'render', { presetId: 'stream-h264-1080p' }),
      step('upload', 'Upload to LinkedIn', 'render', { destination: 'linkedin' }),
    ],
    {
      videoCodec: 'h264',
      resolution: { width: 1920, height: 1080 },
      frameRate: 30,
      bitrate: '10 Mbps',
      container: 'mp4',
    },
    'linkedin',
    '16:9',
  ),

  template(
    'tpl-facebook',
    'Facebook',
    'social',
    'facebook',
    'H.264 1080p delivery for Facebook video.',
    [
      step('encode', 'Encode H.264 1080p', 'render', { presetId: 'stream-h264-1080p' }),
      step('upload', 'Upload to Facebook', 'render', { destination: 'facebook' }),
    ],
    {
      videoCodec: 'h264',
      resolution: { width: 1920, height: 1080 },
      frameRate: 30,
      bitrate: '12 Mbps',
      container: 'mp4',
    },
    'facebook',
    '16:9',
  ),
];

// =============================================================================
//  BROADCAST TEMPLATES
// =============================================================================

const BROADCAST_TEMPLATES: PublishingTemplate[] = [
  template(
    'tpl-dnxhd-mxf',
    'DNxHD MXF Broadcast',
    'broadcast',
    'broadcast',
    'DNxHD 145 in MXF wrapper for broadcast playout with QC validation.',
    [
      step('encode', 'Encode DNxHD 145', 'render', { presetId: 'broadcast-dnxhd-1080i' }),
      step('loudness', 'Loudness Normalize EBU R128', 'render', { standard: 'ebu-r128', targetLUFS: -23 }),
      step('qc', 'QC Validate', 'metadata', { checkLevels: true, checkBlack: true, checkAudio: true }),
    ],
    {
      videoCodec: 'dnxhd',
      resolution: { width: 1920, height: 1080 },
      frameRate: 29.97,
      bitrate: '145 Mbps',
      container: 'mxf',
      audioCodec: 'pcm_s24le',
      audioBitrate: '2304 kbps',
      sampleRate: 48000,
      bitDepth: 24,
      channels: 8,
      loudnessStandard: 'ebu-r128',
      targetLUFS: -23,
    },
  ),

  template(
    'tpl-prores422-hq',
    'ProRes 422 HQ',
    'broadcast',
    'broadcast',
    'ProRes 422 HQ in MOV for high-quality post-production interchange.',
    [
      step('encode', 'Encode ProRes 422 HQ', 'render', { presetId: 'broadcast-prores422-1080p' }),
      step('qc', 'Technical QC', 'metadata', { checkLevels: true }),
    ],
    {
      videoCodec: 'prores',
      resolution: { width: 1920, height: 1080 },
      frameRate: 23.976,
      bitrate: '147 Mbps',
      container: 'mov',
      audioCodec: 'pcm_s24le',
      audioBitrate: '2304 kbps',
    },
  ),

  template(
    'tpl-prores4444',
    'ProRes 4444',
    'broadcast',
    'broadcast',
    'ProRes 4444 mastering grade with alpha support for VFX pipelines.',
    [
      step('encode', 'Encode ProRes 4444', 'render', { presetId: 'broadcast-prores4444-4k' }),
    ],
    {
      videoCodec: 'prores',
      resolution: { width: 3840, height: 2160 },
      frameRate: 23.976,
      bitrate: '330 Mbps',
      container: 'mov',
      audioCodec: 'pcm_s24le',
      audioBitrate: '2304 kbps',
    },
  ),

  template(
    'tpl-imf-package',
    'IMF Package',
    'broadcast',
    'broadcast',
    'Interoperable Master Format package for standards-compliant distribution.',
    [
      step('encode', 'Encode JPEG2000 Master', 'render', { codec: 'jpeg2000', bitrate: '250 Mbps' }),
      step('package', 'Package IMF CPL', 'render', { format: 'imf', cpl: true }),
      step('validate', 'Validate IMF', 'metadata', { schema: 'imf-2020' }),
      step('checksum', 'Generate Checksums', 'metadata', { algorithm: 'sha256' }),
    ],
    {
      videoCodec: 'h264',
      resolution: { width: 3840, height: 2160 },
      frameRate: 23.976,
      bitrate: '250 Mbps',
      container: 'mxf',
      audioCodec: 'pcm_s24le',
      audioBitrate: '2304 kbps',
      channels: 6,
    },
  ),

  template(
    'tpl-atsc-broadcast',
    'ATSC Broadcast Master',
    'broadcast',
    'broadcast',
    'ATSC A/85 compliant broadcast master with loudness normalization.',
    [
      step('encode', 'Encode H.264 Broadcast', 'render', { presetId: 'stream-h264-1080p', profile: 'main' }),
      step('loudness', 'ATSC A/85 Normalize', 'render', { standard: 'atsc-a85', targetLUFS: -24 }),
      step('qc', 'Broadcast QC', 'metadata', { checkLevels: true, checkLoudness: true }),
    ],
    {
      videoCodec: 'h264',
      resolution: { width: 1920, height: 1080 },
      frameRate: 29.97,
      bitrate: '20 Mbps',
      container: 'mp4',
      loudnessStandard: 'atsc-a85',
      targetLUFS: -24,
    },
  ),
];

// =============================================================================
//  ARCHIVE TEMPLATES
// =============================================================================

const ARCHIVE_TEMPLATES: PublishingTemplate[] = [
  template(
    'tpl-prores4444xq',
    'ProRes 4444 XQ Archive',
    'archive',
    'archive',
    'Highest-fidelity archival master with SHA-256 checksum verification.',
    [
      step('encode', 'Encode ProRes 4444 XQ', 'render', { presetId: 'archive-prores4444xq' }),
      step('checksum', 'Generate SHA-256', 'metadata', { algorithm: 'sha256' }),
    ],
    {
      videoCodec: 'prores',
      resolution: { width: 3840, height: 2160 },
      frameRate: 23.976,
      bitrate: '500 Mbps',
      container: 'mov',
      audioCodec: 'pcm_s24le',
      audioBitrate: '2304 kbps',
    },
  ),

  template(
    'tpl-dnxhr-444',
    'DNxHR 444 Archive',
    'archive',
    'archive',
    'Avid-native 4:4:4 archive master for long-term storage.',
    [
      step('encode', 'Encode DNxHR 444', 'render', { presetId: 'archive-dnxhr-444' }),
      step('checksum', 'Generate SHA-256', 'metadata', { algorithm: 'sha256' }),
    ],
    {
      videoCodec: 'dnxhd',
      resolution: { width: 3840, height: 2160 },
      frameRate: 23.976,
      bitrate: '350 Mbps',
      container: 'mxf',
      audioCodec: 'pcm_s24le',
      audioBitrate: '2304 kbps',
    },
  ),

  template(
    'tpl-lossless-ffv1',
    'FFV1 Lossless Archive',
    'archive',
    'archive',
    'Mathematically lossless FFV1 archive for preservation workflows.',
    [
      step('encode', 'Encode FFV1 Lossless', 'render', { codec: 'ffv1', lossless: true }),
      step('checksum', 'Generate MD5 + SHA-256', 'metadata', { algorithm: 'sha256', also: 'md5' }),
      step('validate', 'Validate Fixity', 'metadata', { verifyChecksum: true }),
    ],
    {
      videoCodec: 'h264', // closest enum — actual codec is ffv1
      resolution: { width: 1920, height: 1080 },
      frameRate: 23.976,
      bitrate: '800 Mbps',
      container: 'mkv',
      qualityMode: 'crf',
    },
  ),
];

// =============================================================================
//  STREAMING TEMPLATES
// =============================================================================

const STREAMING_TEMPLATES: PublishingTemplate[] = [
  template(
    'tpl-h264-1080p',
    'H.264 1080p Streaming',
    'streaming',
    'streaming',
    'Streaming-optimized 1080p with high-profile H.264.',
    [
      step('encode', 'Encode H.264 1080p', 'render', { presetId: 'stream-h264-1080p' }),
    ],
    {
      videoCodec: 'h264',
      resolution: { width: 1920, height: 1080 },
      frameRate: 23.976,
      bitrate: '15 Mbps',
      container: 'mp4',
      profile: 'high',
    },
  ),

  template(
    'tpl-h264-4k',
    'H.264 4K Streaming',
    'streaming',
    'streaming',
    '4K streaming master with H.264 high profile.',
    [
      step('encode', 'Encode H.264 4K', 'render', { presetId: 'stream-h264-4k' }),
    ],
    {
      videoCodec: 'h264',
      resolution: { width: 3840, height: 2160 },
      frameRate: 23.976,
      bitrate: '45 Mbps',
      container: 'mp4',
      profile: 'high',
    },
  ),

  template(
    'tpl-h265-4k-hdr',
    'H.265 4K HDR',
    'streaming',
    'streaming',
    '4K HDR10 delivery with HEVC for next-gen streaming.',
    [
      step('encode', 'Encode H.265 4K HDR', 'render', { presetId: 'stream-h265-4k-hdr' }),
    ],
    {
      videoCodec: 'h265',
      resolution: { width: 3840, height: 2160 },
      frameRate: 23.976,
      bitrate: '30 Mbps',
      container: 'mp4',
      colorSpaceConversion: 'rec709-to-rec2020',
    },
  ),

  template(
    'tpl-av1-1080p',
    'AV1 1080p',
    'streaming',
    'streaming',
    'Next-generation AV1 codec with 50% better compression than H.264.',
    [
      step('encode', 'Encode AV1 1080p', 'render', { presetId: 'stream-av1-1080p' }),
    ],
    {
      videoCodec: 'av1',
      resolution: { width: 1920, height: 1080 },
      frameRate: 23.976,
      bitrate: '8 Mbps',
      container: 'mp4',
      audioCodec: 'opus',
      audioBitrate: '128 kbps',
    },
  ),

  template(
    'tpl-adaptive-ladder',
    'Adaptive Bitrate Ladder',
    'streaming',
    'streaming',
    'Multi-bitrate HLS/DASH ladder: 4K + 1080p + 720p + 480p renditions.',
    [
      step('encode', 'Encode 4K (8 Mbps)', 'render', { presetId: 'stream-h264-4k', bitrate: '8 Mbps' }),
      step('encode', 'Encode 1080p (5 Mbps)', 'render', { presetId: 'stream-h264-1080p', bitrate: '5 Mbps' }),
      step('encode', 'Encode 720p (2.5 Mbps)', 'render', { resolution: '1280x720', bitrate: '2.5 Mbps' }),
      step('encode', 'Encode 480p (1 Mbps)', 'render', { resolution: '854x480', bitrate: '1 Mbps' }),
      step('package', 'Package HLS/DASH', 'render', { formats: ['hls', 'dash'] }),
    ],
    {
      videoCodec: 'h264',
      resolution: { width: 3840, height: 2160 },
      frameRate: 23.976,
      bitrate: '8 Mbps',
      container: 'mp4',
    },
  ),

  template(
    'tpl-webm-vp9',
    'WebM VP9 Web',
    'streaming',
    'streaming',
    'Open-format WebM for HTML5 video embedding.',
    [
      step('encode', 'Encode VP9 WebM', 'render', { presetId: 'custom-webm-vp9' }),
    ],
    {
      videoCodec: 'webm',
      resolution: { width: 1920, height: 1080 },
      frameRate: 30,
      bitrate: '12 Mbps',
      container: 'webm',
      audioCodec: 'opus',
      audioBitrate: '128 kbps',
    },
  ),
];

// =============================================================================
//  INTERCHANGE TEMPLATES
// =============================================================================

const INTERCHANGE_TEMPLATES: PublishingTemplate[] = [
  template(
    'tpl-aaf-export',
    'AAF Export',
    'interchange',
    'interchange',
    'Advanced Authoring Format for Avid Media Composer round-trip.',
    [
      step('package', 'Export AAF', 'render', { format: 'aaf', includeMedia: false }),
      step('validate', 'Validate AAF', 'metadata', { schema: 'aaf' }),
    ],
  ),

  template(
    'tpl-edl-export',
    'EDL Export',
    'interchange',
    'interchange',
    'CMX3600 Edit Decision List for legacy system interchange.',
    [
      step('package', 'Export EDL', 'render', { format: 'edl', standard: 'cmx3600' }),
    ],
  ),

  template(
    'tpl-xml-export',
    'FCPXML Export',
    'interchange',
    'interchange',
    'Final Cut Pro XML for Apple ecosystem interchange.',
    [
      step('package', 'Export FCPXML', 'render', { format: 'fcpxml', version: '1.11' }),
    ],
  ),

  template(
    'tpl-omf-export',
    'OMF Audio Export',
    'interchange',
    'interchange',
    'Open Media Framework audio export for Pro Tools interchange.',
    [
      step('package', 'Export OMF', 'render', { format: 'omf', audioOnly: true }),
    ],
  ),

  template(
    'tpl-stems-export',
    'Audio Stems',
    'interchange',
    'interchange',
    'Individual audio stem exports (dialogue, music, effects, mix).',
    [
      step('encode', 'Export Dialogue Stem', 'render', { stem: 'dialogue', codec: 'pcm_s24le' }),
      step('encode', 'Export Music Stem', 'render', { stem: 'music', codec: 'pcm_s24le' }),
      step('encode', 'Export Effects Stem', 'render', { stem: 'sfx', codec: 'pcm_s24le' }),
      step('encode', 'Export Full Mix', 'render', { stem: 'mix', codec: 'pcm_s24le' }),
    ],
  ),
];

// =============================================================================
//  PROFESSIONAL MULTI-STEP TEMPLATES
// =============================================================================

const PRO_TEMPLATES: PublishingTemplate[] = [
  template(
    'tpl-netflix-imf',
    'Netflix IMF Delivery',
    'broadcast',
    'broadcast',
    'Full Netflix IMF delivery pipeline: ProRes master → IMF package → validate → upload.',
    [
      step('encode', 'ProRes 4444 Master', 'render', { presetId: 'broadcast-prores4444-4k' }),
      step('package', 'IMF Package', 'render', { format: 'imf', cpl: true, opl: true }),
      step('validate', 'Netflix QC Validate', 'metadata', { schema: 'netflix-imf', strictMode: true }),
      step('checksum', 'Generate Checksums', 'metadata', { algorithm: 'sha256' }),
      step('upload', 'Upload to Backlot', 'render', { destination: 'aspera', profile: 'netflix' }),
    ],
    {
      videoCodec: 'prores',
      resolution: { width: 3840, height: 2160 },
      frameRate: 23.976,
      bitrate: '330 Mbps',
      container: 'mxf',
      audioCodec: 'pcm_s24le',
      channels: 6,
      loudnessStandard: 'ebu-r128',
      targetLUFS: -27,
    },
  ),

  template(
    'tpl-broadcast-master',
    'Broadcast Master + QC',
    'broadcast',
    'broadcast',
    'DNxHD broadcast master with full QC, loudness compliance, and Aspera delivery.',
    [
      step('encode', 'Encode DNxHD 145', 'render', { presetId: 'broadcast-dnxhd-1080i' }),
      step('loudness', 'EBU R128 Normalize', 'render', { standard: 'ebu-r128', targetLUFS: -23 }),
      step('qc', 'Broadcast QC Suite', 'metadata', {
        checkLevels: true,
        checkBlack: true,
        checkAudio: true,
        checkCaptions: true,
        checkLoudness: true,
      }),
      step('upload', 'Aspera Transfer', 'render', { destination: 'aspera' }),
    ],
    {
      videoCodec: 'dnxhd',
      resolution: { width: 1920, height: 1080 },
      frameRate: 29.97,
      bitrate: '145 Mbps',
      container: 'mxf',
      loudnessStandard: 'ebu-r128',
      targetLUFS: -23,
    },
  ),

  template(
    'tpl-social-package',
    'Social Media Package',
    'social',
    'social',
    'Batch export: YouTube + Instagram Reels + TikTok + Twitter simultaneously.',
    [
      step('encode', 'YouTube 1080p', 'render', { presetId: 'stream-h264-1080p' }),
      step('reframe', 'Smart Reframe 9:16', 'render', { targetAspectRatio: '9:16' }),
      step('encode', 'Instagram Reels', 'render', { presetId: 'social-instagram-reels' }),
      step('encode', 'TikTok', 'render', { presetId: 'social-tiktok' }),
      step('encode', 'Twitter/X', 'render', { presetId: 'stream-h264-1080p', bitrate: '12 Mbps' }),
    ],
    {
      videoCodec: 'h264',
      resolution: { width: 1920, height: 1080 },
      frameRate: 30,
      bitrate: '15 Mbps',
      container: 'mp4',
    },
  ),

  template(
    'tpl-review-screener',
    'Review Screener',
    'streaming',
    'streaming',
    'Watermarked H.264 screener for client/stakeholder review.',
    [
      step('encode', 'Encode H.264 Review', 'render', { presetId: 'stream-h264-1080p', bitrate: '8 Mbps' }),
      step('watermark', 'Add Watermark', 'render', { text: 'CONFIDENTIAL', opacity: 0.15, position: 'center' }),
      step('caption', 'Burn-In Timecode', 'render', { burnInTimecode: true }),
      step('upload', 'Upload to Frame.io', 'render', { destination: 'frameio' }),
    ],
    {
      videoCodec: 'h264',
      resolution: { width: 1920, height: 1080 },
      frameRate: 23.976,
      bitrate: '8 Mbps',
      container: 'mp4',
      burnInCaptions: true,
    },
  ),

  template(
    'tpl-dailies',
    'Dailies Package',
    'streaming',
    'streaming',
    'Set dailies: ProRes proxy + burn-in metadata overlay + organized folder structure.',
    [
      step('transcode', 'ProRes Proxy Transcode', 'ingest', { codec: 'prores', profile: 'proxy' }),
      step('watermark', 'Burn-In Metadata', 'render', { showTimecode: true, showFilename: true, showDate: true }),
      step('metadata', 'Extract Metadata', 'metadata', { camera: true, lens: true, lut: true }),
    ],
    {
      videoCodec: 'prores',
      resolution: { width: 1920, height: 1080 },
      frameRate: 23.976,
      bitrate: '45 Mbps',
      container: 'mov',
    },
  ),

  template(
    'tpl-podcast-audio',
    'Podcast Audio Export',
    'streaming',
    'streaming',
    'High-quality audio export for podcast distribution with loudness normalization.',
    [
      step('encode', 'Encode AAC Audio', 'render', { audioOnly: true, codec: 'aac', bitrate: '320 kbps' }),
      step('loudness', 'Loudness Normalize', 'render', { standard: 'ebu-r128', targetLUFS: -16 }),
      step('metadata', 'Tag ID3 Metadata', 'metadata', { id3: true }),
    ],
    {
      audioCodec: 'aac',
      audioBitrate: '320 kbps',
      sampleRate: 48000,
      channels: 2,
      loudnessStandard: 'ebu-r128',
      targetLUFS: -16,
    },
  ),
];

// =============================================================================
//  EXPORT
// =============================================================================

export const BUILT_IN_TEMPLATES: PublishingTemplate[] = [
  ...SOCIAL_TEMPLATES,
  ...BROADCAST_TEMPLATES,
  ...ARCHIVE_TEMPLATES,
  ...STREAMING_TEMPLATES,
  ...INTERCHANGE_TEMPLATES,
  ...PRO_TEMPLATES,
];
