import type { MediaAsset } from '../store/editor.store';
import type { SourceTrackDescriptor } from '../engine/TrackPatchingEngine';
import { resolveAudioTrackCount } from './audioChannelLayout';

type AssetWithTechnicalMetadata = MediaAsset & {
  technicalMetadata?: {
    videoCodec?: string;
    audioCodec?: string;
    audioChannels?: number;
    audioChannelLayout?: string;
  };
};

function hasVideoTrack(asset: MediaAsset): boolean {
  if (asset.type === 'AUDIO' || asset.type === 'DOCUMENT') {
    return false;
  }

  if (asset.type === 'VIDEO' || asset.type === 'IMAGE' || asset.type === 'GRAPHIC') {
    return true;
  }

  return Boolean(asset.width || asset.height || asset.fps || asset.hasAlpha);
}

export function deriveSourceTracksFromAsset(asset: MediaAsset): SourceTrackDescriptor[] {
  const descriptors: SourceTrackDescriptor[] = [];
  const technicalMetadata = (asset as AssetWithTechnicalMetadata).technicalMetadata;

  if (hasVideoTrack(asset)) {
    descriptors.push({ id: 'src-v1', type: 'VIDEO', index: 1 });
  }

  const technicalCodecHint = [technicalMetadata?.videoCodec, technicalMetadata?.audioCodec]
    .filter(Boolean)
    .join('/');
  const codecHint = asset.codec ?? (technicalCodecHint || undefined);
  const audioTrackCount = resolveAudioTrackCount({
    ...asset,
    codec: codecHint,
    audioChannels: asset.audioChannels ?? technicalMetadata?.audioChannels,
    audioChannelLayout: (asset as AssetWithTechnicalMetadata).technicalMetadata?.audioChannelLayout ?? technicalMetadata?.audioChannelLayout,
  });
  for (let index = 1; index <= audioTrackCount; index += 1) {
    descriptors.push({ id: `src-a${index}`, type: 'AUDIO', index });
  }

  return descriptors;
}
