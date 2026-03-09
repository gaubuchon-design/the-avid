import type { EditorMediaAsset } from './project-library';

// ── Weak caches for repeated calls on the same asset objects ─────────────────
// These avoid re-computing values when UI components re-render with the same
// asset references. WeakMap allows GC to collect entries when assets are freed.

const playbackUrlCache = new WeakMap<object, string | undefined>();
const resolutionLabelCache = new WeakMap<object, string | null>();

/**
 * Get the best available playback URL for a media asset.
 * Prioritizes proxy URLs when ready, falls back to primary or location URLs.
 * Results are cached per asset object reference.
 *
 * @param asset - The asset to query. Safe if null fields are present.
 * @returns The playback URL, or undefined if none is available.
 */
export function getMediaAssetPlaybackUrl(asset: Pick<EditorMediaAsset, 'playbackUrl' | 'locations' | 'proxyMetadata'>): string | undefined {
  if (!asset) return undefined;

  if (playbackUrlCache.has(asset)) return playbackUrlCache.get(asset);

  let url: string | undefined;
  if (asset.proxyMetadata?.status === 'READY' && asset.proxyMetadata.playbackUrl) {
    url = asset.proxyMetadata.playbackUrl;
  } else {
    url = asset.playbackUrl ?? asset.locations?.playbackUrl;
  }

  playbackUrlCache.set(asset, url);
  return url;
}

/**
 * Get the primary file path for a media asset.
 * Prioritizes proxy paths when ready, falls back to managed or original paths.
 *
 * @param asset - The asset to query. Safe if null fields are present.
 * @returns The file path, or undefined if none is available.
 */
export function getMediaAssetPrimaryPath(asset: Pick<EditorMediaAsset, 'locations' | 'proxyMetadata'>): string | undefined {
  if (!asset) return undefined;
  if (asset.proxyMetadata?.status === 'READY' && asset.proxyMetadata.filePath) {
    return asset.proxyMetadata.filePath;
  }

  return asset.locations?.managedPath ?? asset.locations?.originalPath;
}

/**
 * Get a human-readable resolution label for a media asset.
 * Returns null for audio-only or document assets, or if resolution metadata is missing.
 * Guards against non-finite frame rate values in the label.
 *
 * @param asset - The asset to query.
 * @returns Resolution string like "1920x1080 @ 24fps", or null.
 */
export function getMediaAssetResolutionLabel(asset: Pick<EditorMediaAsset, 'type' | 'technicalMetadata'>): string | null {
  if (!asset) return null;

  if (resolutionLabelCache.has(asset)) return resolutionLabelCache.get(asset)!;

  let label: string | null = null;

  if (asset.type === 'VIDEO' || asset.type === 'IMAGE') {
    const width = asset.technicalMetadata?.width;
    const height = asset.technicalMetadata?.height;
    if (width && height && Number.isFinite(width) && Number.isFinite(height)) {
      const frameRate = asset.technicalMetadata?.frameRate;
      if (frameRate && Number.isFinite(frameRate) && frameRate > 0) {
        label = `${width}x${height} @ ${Math.round(frameRate * 100) / 100}fps`;
      } else {
        label = `${width}x${height}`;
      }
    }
  }

  resolutionLabelCache.set(asset, label);
  return label;
}

/**
 * Get a list of human-readable technical summary strings for a media asset.
 * Includes resolution, codecs, sample rate, and channel count.
 * Returns an empty array if the asset has no technical metadata.
 *
 * @param asset - The asset to query.
 * @returns Array of summary strings.
 */
export function getMediaAssetTechnicalSummary(asset: Pick<EditorMediaAsset, 'type' | 'technicalMetadata'>): string[] {
  if (!asset) return [];
  const summary: string[] = [];
  const videoCodec = asset.technicalMetadata?.videoCodec;
  const audioCodec = asset.technicalMetadata?.audioCodec;
  const sampleRate = asset.technicalMetadata?.sampleRate;
  const audioChannels = asset.technicalMetadata?.audioChannels;
  const resolution = getMediaAssetResolutionLabel(asset);

  if (resolution) {
    summary.push(resolution);
  }
  if (videoCodec) {
    summary.push(videoCodec);
  }
  if (audioCodec) {
    summary.push(audioCodec);
  }
  if (sampleRate && Number.isFinite(sampleRate) && sampleRate > 0) {
    summary.push(`${Math.round(sampleRate)}Hz`);
  }
  if (audioChannels && Number.isFinite(audioChannels) && audioChannels > 0) {
    summary.push(`${audioChannels}ch`);
  }

  return summary;
}
