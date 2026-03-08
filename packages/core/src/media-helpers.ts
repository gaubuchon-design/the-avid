import type { EditorMediaAsset } from './project-library';

export function getMediaAssetPlaybackUrl(asset: Pick<EditorMediaAsset, 'playbackUrl' | 'locations' | 'proxyMetadata'>): string | undefined {
  if (asset.proxyMetadata?.status === 'READY' && asset.proxyMetadata.playbackUrl) {
    return asset.proxyMetadata.playbackUrl;
  }

  return asset.playbackUrl ?? asset.locations?.playbackUrl;
}

export function getMediaAssetPrimaryPath(asset: Pick<EditorMediaAsset, 'locations' | 'proxyMetadata'>): string | undefined {
  if (asset.proxyMetadata?.status === 'READY' && asset.proxyMetadata.filePath) {
    return asset.proxyMetadata.filePath;
  }

  return asset.locations?.managedPath ?? asset.locations?.originalPath;
}

export function getMediaAssetResolutionLabel(asset: Pick<EditorMediaAsset, 'type' | 'technicalMetadata'>): string | null {
  if (asset.type !== 'VIDEO' && asset.type !== 'IMAGE') {
    return null;
  }

  const width = asset.technicalMetadata?.width;
  const height = asset.technicalMetadata?.height;
  if (!width || !height) {
    return null;
  }

  const frameRate = asset.technicalMetadata?.frameRate;
  return frameRate ? `${width}x${height} @ ${Math.round(frameRate * 100) / 100}fps` : `${width}x${height}`;
}

export function getMediaAssetTechnicalSummary(asset: Pick<EditorMediaAsset, 'type' | 'technicalMetadata'>): string[] {
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
  if (sampleRate) {
    summary.push(`${Math.round(sampleRate)}Hz`);
  }
  if (audioChannels) {
    summary.push(`${audioChannels}ch`);
  }

  return summary;
}
