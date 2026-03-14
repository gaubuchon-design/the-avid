import { describe, expect, it } from 'vitest';
import {
  getAudioChannelCountForLayout,
  normalizeAudioChannelLayoutLabel,
  pickDominantAudioChannelLayout,
} from '../audio/channelLayout';

describe('audio channel layout helpers', () => {
  it('normalizes ffprobe-style layout labels into editorial layouts', () => {
    expect(normalizeAudioChannelLayoutLabel('mono')).toBe('mono');
    expect(normalizeAudioChannelLayoutLabel('stereo')).toBe('stereo');
    expect(normalizeAudioChannelLayoutLabel('5.1(side)')).toBe('5.1');
    expect(normalizeAudioChannelLayoutLabel('7.1(wide-side)')).toBe('7.1');
    expect(normalizeAudioChannelLayoutLabel(undefined, 6)).toBe('5.1');
    expect(normalizeAudioChannelLayoutLabel(undefined, 8)).toBe('7.1');
  });

  it('returns channel counts and dominant layouts consistently', () => {
    expect(getAudioChannelCountForLayout('mono')).toBe(1);
    expect(getAudioChannelCountForLayout('stereo')).toBe(2);
    expect(getAudioChannelCountForLayout('5.1')).toBe(6);
    expect(getAudioChannelCountForLayout('7.1')).toBe(8);
    expect(pickDominantAudioChannelLayout(['mono', 'stereo', '5.1'])).toBe('5.1');
    expect(pickDominantAudioChannelLayout(['stereo', '7.1'])).toBe('7.1');
  });
});
