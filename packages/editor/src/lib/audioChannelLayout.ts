import type { MediaAsset } from '../store/editor.store';

export interface AudioChannelLayoutHintSource {
  audioChannels?: number;
  audioChannelLayout?: string;
  codec?: string;
  mimeType?: string;
  name?: string;
  type?: MediaAsset['type'];
}

function normalizeChannelCount(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.round(value));
}

function buildLayoutFromChannelCount(channelCount: number): string {
  switch (channelCount) {
    case 0:
      return 'none';
    case 1:
      return 'mono';
    case 2:
      return 'stereo';
    case 4:
      return 'quad';
    case 6:
      return '5.1';
    case 8:
      return '7.1';
    default:
      return `${channelCount}ch`;
  }
}

function normalizeLayoutToken(value: string): string {
  const normalized = value.trim().toLowerCase();

  if (!normalized || normalized === 'unknown') {
    return 'unknown';
  }

  if (normalized === 'none' || normalized === 'silent' || normalized === 'mute') {
    return 'none';
  }

  if (normalized === 'mono' || normalized === '1.0' || normalized === '1ch' || normalized === '1 channel') {
    return 'mono';
  }

  if (
    normalized === 'stereo'
    || normalized === '2.0'
    || normalized === '2ch'
    || normalized === '2 channel'
    || normalized === 'l/r'
  ) {
    return 'stereo';
  }

  if (normalized === 'quad' || normalized === '4.0' || normalized === '4ch' || normalized === '4 channel') {
    return 'quad';
  }

  if (normalized === '5.1' || normalized === '5_1' || normalized === '6ch' || normalized === '6 channel') {
    return '5.1';
  }

  if (normalized === '7.1' || normalized === '7_1' || normalized === '8ch' || normalized === '8 channel') {
    return '7.1';
  }

  const channelMatch = normalized.match(/(\d+)\s*ch/);
  if (channelMatch) {
    return buildLayoutFromChannelCount(Number.parseInt(channelMatch[1] ?? '0', 10));
  }

  return normalized;
}

export function inferAudioChannelLayout(source: AudioChannelLayoutHintSource): string {
  if (source.audioChannelLayout) {
    return normalizeLayoutToken(source.audioChannelLayout);
  }

  const explicitCount = normalizeChannelCount(source.audioChannels);
  if (explicitCount !== null) {
    return buildLayoutFromChannelCount(explicitCount);
  }

  const metadataHint = `${source.codec ?? ''} ${source.mimeType ?? ''} ${source.name ?? ''}`.toLowerCase();

  if (source.type === 'IMAGE' || source.type === 'GRAPHIC' || source.type === 'DOCUMENT') {
    return 'none';
  }

  if (/7\.1|8ch|8 channel|dolby atmos/.test(metadataHint)) {
    return '7.1';
  }

  if (/5\.1|6ch|6 channel/.test(metadataHint)) {
    return '5.1';
  }

  if (/quad|4ch|4 channel/.test(metadataHint)) {
    return 'quad';
  }

  if (/stereo|2ch|2 channel|aac|pcm|mp3|opus|vorbis/.test(metadataHint)) {
    return 'stereo';
  }

  if (/mono|1ch|1 channel/.test(metadataHint)) {
    return 'mono';
  }

  if (source.type === 'AUDIO') {
    return 'mono';
  }

  if (source.type === 'VIDEO') {
    return 'stereo';
  }

  return 'unknown';
}

export function resolveAudioTrackCount(source: AudioChannelLayoutHintSource): number {
  const explicitCount = normalizeChannelCount(source.audioChannels);
  if (explicitCount !== null) {
    return explicitCount;
  }

  const layout = inferAudioChannelLayout(source);
  if (layout === 'none' || layout === 'unknown') {
    if (source.type === 'AUDIO') {
      return 1;
    }

    if (source.type === 'VIDEO') {
      return 2;
    }

    return 0;
  }

  if (layout === 'mono') {
    return 1;
  }

  if (layout === 'stereo') {
    return 2;
  }

  if (layout === 'quad') {
    return 4;
  }

  if (layout === '5.1') {
    return 6;
  }

  if (layout === '7.1') {
    return 8;
  }

  const channelMatch = layout.match(/(\d+)\s*ch/);
  if (channelMatch) {
    return Number.parseInt(channelMatch[1] ?? '0', 10);
  }

  return 0;
}
