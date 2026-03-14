export type AudioChannelLayout = 'mono' | 'stereo' | 'quad' | '5.1' | '7.1';

const LAYOUT_CHANNEL_COUNT: Record<AudioChannelLayout, number> = {
  mono: 1,
  stereo: 2,
  quad: 4,
  '5.1': 6,
  '7.1': 8,
};

function normalizeLayoutToken(value: string): string {
  return value.trim().toLowerCase().replace(/[_\s-]+/g, '.');
}

export function normalizeAudioChannelLayoutLabel(
  layout?: string | null,
  channelCount?: number | null,
): AudioChannelLayout {
  const normalizedLayout = layout ? normalizeLayoutToken(layout) : '';

  if (
    normalizedLayout.includes('7.1')
    || normalizedLayout.includes('octagonal')
    || normalizedLayout.includes('8ch')
    || (channelCount !== null && channelCount !== undefined && channelCount >= 8)
  ) {
    return '7.1';
  }

  if (
    normalizedLayout.includes('quad')
    || normalizedLayout.includes('4ch')
    || normalizedLayout.includes('4.0')
    || (channelCount !== null && channelCount !== undefined && channelCount === 4)
  ) {
    return 'quad';
  }

  if (
    normalizedLayout.includes('5.1')
    || normalizedLayout.includes('6ch')
    || normalizedLayout.includes('hexagonal')
    || (channelCount !== null && channelCount !== undefined && channelCount >= 6)
  ) {
    return '5.1';
  }

  if (
    normalizedLayout === 'mono'
    || normalizedLayout === '1.0'
    || normalizedLayout.includes('1ch')
    || channelCount === 1
  ) {
    return 'mono';
  }

  return 'stereo';
}

export function getAudioChannelCountForLayout(
  layout?: AudioChannelLayout | string | null,
  fallbackChannelCount = 2,
): number {
  if (!layout) {
    return Math.max(1, Math.round(fallbackChannelCount || 2));
  }

  const normalized = normalizeAudioChannelLayoutLabel(layout, fallbackChannelCount);
  return LAYOUT_CHANNEL_COUNT[normalized];
}

export function compareAudioChannelLayouts(
  left: AudioChannelLayout,
  right: AudioChannelLayout,
): number {
  return getAudioChannelCountForLayout(left) - getAudioChannelCountForLayout(right);
}

export function pickDominantAudioChannelLayout(
  layouts: Array<AudioChannelLayout | string | null | undefined>,
  fallbackLayout: AudioChannelLayout = 'stereo',
): AudioChannelLayout {
  let dominant = fallbackLayout;

  for (const layout of layouts) {
    const normalized = normalizeAudioChannelLayoutLabel(layout, undefined);
    if (compareAudioChannelLayouts(normalized, dominant) > 0) {
      dominant = normalized;
    }
  }

  return dominant;
}
