import { describe, expect, it } from 'vitest';

import { extractDesktopDroppedPaths } from '../../lib/desktopDropPaths';

describe('extractDesktopDroppedPaths', () => {
  it('collects unique non-empty desktop file paths from dropped files', () => {
    const files = [
      { name: 'clip-a.mov', path: '/Volumes/RAID/clip-a.mov' },
      { name: 'clip-b.wav', path: '/Volumes/RAID/clip-b.wav' },
      { name: 'clip-a.mov', path: '/Volumes/RAID/clip-a.mov' },
      { name: 'missing-path.mov' },
      { name: 'blank-path.mov', path: '   ' },
    ] as File[];

    expect(extractDesktopDroppedPaths(files)).toEqual([
      '/Volumes/RAID/clip-a.mov',
      '/Volumes/RAID/clip-b.wav',
    ]);
  });
});
