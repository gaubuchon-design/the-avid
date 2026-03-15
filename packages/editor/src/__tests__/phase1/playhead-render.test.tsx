import React, { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { Playhead } from '../../components/TimelinePanel/Playhead';

describe('timeline playhead rendering', () => {
  it('can transition between hidden and visible states without hook-order errors', async () => {
    const container = document.createElement('div');
    const viewport = document.createElement('div');
    const root = createRoot(container);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    Object.defineProperty(viewport, 'getBoundingClientRect', {
      value: () => ({
        left: 0,
        top: 0,
        right: 400,
        bottom: 120,
        width: 400,
        height: 120,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    const viewportRef = { current: viewport };

    await act(async () => {
      root.render(
        <Playhead
          time={200}
          zoom={60}
          scrollLeft={0}
          duration={400}
          viewportRef={viewportRef}
          onScrub={() => {}}
        />,
      );
    });

    expect(container.querySelector('.playhead')).toBeNull();

    await act(async () => {
      root.render(
        <Playhead
          time={4}
          zoom={60}
          scrollLeft={0}
          duration={400}
          viewportRef={viewportRef}
          onScrub={() => {}}
        />,
      );
    });

    expect(container.querySelector('.playhead')).toBeInstanceOf(HTMLDivElement);
    expect(consoleError).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });

    consoleError.mockRestore();
  });
});
