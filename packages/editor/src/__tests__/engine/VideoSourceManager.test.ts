import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { videoSourceManager } from '../../engine/VideoSourceManager';

describe('VideoSourceManager', () => {
  afterEach(() => {
    videoSourceManager.dispose();
  });

  it('getSource() returns null for unknown asset', () => {
    expect(videoSourceManager.getSource('nonexistent')).toBeNull();
  });

  it('getActiveSource() returns null when no source is active', () => {
    expect(videoSourceManager.getActiveSource()).toBeNull();
  });

  it('getLoadedSourceIds() returns empty array initially', () => {
    expect(videoSourceManager.getLoadedSourceIds()).toEqual([]);
  });

  it('isReady() returns false for unknown asset', () => {
    expect(videoSourceManager.isReady('nonexistent')).toBe(false);
  });

  it('setActiveSource(null) sets no active source', () => {
    videoSourceManager.setActiveSource(null);
    expect(videoSourceManager.getActiveSource()).toBeNull();
  });

  it('setActiveSource() changes active source ID', () => {
    // Set active to an ID even if source not loaded
    videoSourceManager.setActiveSource('asset_1');
    // getActiveSource returns null since asset_1 isn't actually loaded
    expect(videoSourceManager.getActiveSource()).toBeNull();
  });

  it('seekTo() does nothing when no active source', () => {
    // Should not throw
    videoSourceManager.seekTo(5);
  });

  it('play() does nothing when no active source', () => {
    videoSourceManager.play();
  });

  it('pause() does nothing when no active source', () => {
    videoSourceManager.pause();
  });

  it('setPlaybackRate() does nothing when no active source', () => {
    videoSourceManager.setPlaybackRate(2);
  });

  it('unloadSource() does nothing for unknown asset', () => {
    // Should not throw
    videoSourceManager.unloadSource('nonexistent');
    expect(videoSourceManager.getLoadedSourceIds()).toEqual([]);
  });

  it('subscribe/unsubscribe pattern works', () => {
    const listener = vi.fn();
    const unsub = videoSourceManager.subscribe(listener);

    videoSourceManager.setActiveSource('test');
    expect(listener).toHaveBeenCalled();

    const callCount = listener.mock.calls.length;
    unsub();
    videoSourceManager.setActiveSource(null);
    expect(listener).toHaveBeenCalledTimes(callCount);
  });

  it('dispose() clears all state', () => {
    videoSourceManager.dispose();
    expect(videoSourceManager.getLoadedSourceIds()).toEqual([]);
    expect(videoSourceManager.getActiveSource()).toBeNull();
  });
});
