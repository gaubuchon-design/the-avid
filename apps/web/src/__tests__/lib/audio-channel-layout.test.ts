import { describe, expect, it } from 'vitest';

import { inferAudioChannelLayout, resolveAudioTrackCount } from '../../lib/audioChannelLayout';

describe('audio channel layout helpers', () => {
  it('normalizes explicit channel counts into standard layout labels', () => {
    expect(inferAudioChannelLayout({ audioChannels: 1 })).toBe('mono');
    expect(inferAudioChannelLayout({ audioChannels: 2 })).toBe('stereo');
    expect(inferAudioChannelLayout({ audioChannels: 6 })).toBe('5.1');
    expect(inferAudioChannelLayout({ audioChannels: 8 })).toBe('7.1');
  });

  it('infers multichannel layouts from metadata hints when channel counts are absent', () => {
    expect(inferAudioChannelLayout({
      codec: 'DNxHD / PCM 5.1',
      mimeType: 'video/mxf',
      name: 'mix_51.mxf',
      type: 'VIDEO',
    })).toBe('5.1');

    expect(resolveAudioTrackCount({
      codec: 'DNxHD / PCM 5.1',
      mimeType: 'video/mxf',
      name: 'mix_51.mxf',
      type: 'VIDEO',
    })).toBe(6);
  });

  it('keeps still and document assets silent', () => {
    expect(inferAudioChannelLayout({ type: 'IMAGE', name: 'matte.png' })).toBe('none');
    expect(resolveAudioTrackCount({ type: 'DOCUMENT', name: 'script.pdf' })).toBe(0);
  });
});
