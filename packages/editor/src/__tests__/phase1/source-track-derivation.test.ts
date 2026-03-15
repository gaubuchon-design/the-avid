import { describe, expect, it } from 'vitest';
import { deriveSourceTracksFromAsset } from '../../lib/sourceTrackDerivation';

describe('phase 1 source-track derivation', () => {
  it('derives multichannel audio descriptors from probed audio metadata', () => {
    const descriptors = deriveSourceTracksFromAsset({
      id: 'asset-audio',
      name: 'Production Mix',
      type: 'AUDIO',
      status: 'READY',
      tags: [],
      isFavorite: false,
      audioChannels: 6,
      codec: 'PCM 5.1',
      mimeType: 'audio/wav',
    });

    expect(descriptors).toEqual([
      { id: 'src-a1', type: 'AUDIO', index: 1 },
      { id: 'src-a2', type: 'AUDIO', index: 2 },
      { id: 'src-a3', type: 'AUDIO', index: 3 },
      { id: 'src-a4', type: 'AUDIO', index: 4 },
      { id: 'src-a5', type: 'AUDIO', index: 5 },
      { id: 'src-a6', type: 'AUDIO', index: 6 },
    ]);
  });

  it('keeps still-image sources video-only', () => {
    const descriptors = deriveSourceTracksFromAsset({
      id: 'asset-still',
      name: 'Matte Painting',
      type: 'IMAGE',
      status: 'READY',
      tags: [],
      isFavorite: false,
      width: 4096,
      height: 2160,
      hasAlpha: true,
      mimeType: 'image/png',
    });

    expect(descriptors).toEqual([
      { id: 'src-v1', type: 'VIDEO', index: 1 },
    ]);
  });

  it('falls back to stereo for probed video containers without explicit channel counts', () => {
    const descriptors = deriveSourceTracksFromAsset({
      id: 'asset-video',
      name: 'Interview',
      type: 'VIDEO',
      status: 'READY',
      tags: [],
      isFavorite: false,
      codec: 'H.264/AAC',
      mimeType: 'video/mp4',
    });

    expect(descriptors).toEqual([
      { id: 'src-v1', type: 'VIDEO', index: 1 },
      { id: 'src-a1', type: 'AUDIO', index: 1 },
      { id: 'src-a2', type: 'AUDIO', index: 2 },
    ]);
  });

  it('prefers upstream audio layout metadata over codec fallbacks', () => {
    const descriptors = deriveSourceTracksFromAsset({
      id: 'asset-surround',
      name: 'Mix Stem',
      type: 'VIDEO',
      status: 'READY',
      tags: [],
      isFavorite: false,
      audioChannels: 8,
      codec: 'PCM',
      mimeType: 'video/quicktime',
    });

    expect(descriptors).toEqual([
      { id: 'src-v1', type: 'VIDEO', index: 1 },
      { id: 'src-a1', type: 'AUDIO', index: 1 },
      { id: 'src-a2', type: 'AUDIO', index: 2 },
      { id: 'src-a3', type: 'AUDIO', index: 3 },
      { id: 'src-a4', type: 'AUDIO', index: 4 },
      { id: 'src-a5', type: 'AUDIO', index: 5 },
      { id: 'src-a6', type: 'AUDIO', index: 6 },
      { id: 'src-a7', type: 'AUDIO', index: 7 },
      { id: 'src-a8', type: 'AUDIO', index: 8 },
    ]);
  });

  it('uses FFprobe technical metadata when flattened audio fields are absent', () => {
    const descriptors = deriveSourceTracksFromAsset({
      id: 'asset-ffprobe-layout',
      name: 'Desktop Ingest',
      type: 'VIDEO',
      status: 'READY',
      tags: [],
      isFavorite: false,
      technicalMetadata: {
        videoCodec: 'prores',
        audioCodec: 'pcm_s24le',
        audioChannels: 6,
        audioChannelLayout: '5.1',
      },
    } as Parameters<typeof deriveSourceTracksFromAsset>[0]);

    expect(descriptors).toEqual([
      { id: 'src-v1', type: 'VIDEO', index: 1 },
      { id: 'src-a1', type: 'AUDIO', index: 1 },
      { id: 'src-a2', type: 'AUDIO', index: 2 },
      { id: 'src-a3', type: 'AUDIO', index: 3 },
      { id: 'src-a4', type: 'AUDIO', index: 4 },
      { id: 'src-a5', type: 'AUDIO', index: 5 },
      { id: 'src-a6', type: 'AUDIO', index: 6 },
    ]);
  });
});
