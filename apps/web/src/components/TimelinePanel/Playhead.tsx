import React, { memo } from 'react';
import { usePointerScrub } from '../../hooks/usePointerScrub';

interface PlayheadProps {
  time: number;
  zoom: number;
  scrollLeft: number;
  duration: number;
  viewportRef: React.RefObject<HTMLDivElement | null>;
  onScrub: (time: number) => void;
}

export const Playhead = memo(function Playhead({
  time,
  zoom,
  scrollLeft,
  duration,
  viewportRef,
  onScrub,
}: PlayheadProps) {
  const left = time * zoom - scrollLeft;
  const scrubBindings = usePointerScrub({
    disabled: duration <= 0,
    onScrub: ({ clientX }) => {
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) {
        return;
      }

      const x = clientX - rect.left;
      const nextTime = Math.max(0, Math.min(duration, (x + scrollLeft) / zoom));
      onScrub(nextTime);
    },
  });

  if (left < -1 || left > 10000) return null;

  return (
    <div
      className="playhead"
      style={{ left }}
      role="slider"
      aria-label="Playhead position"
      aria-valuenow={Math.round(time * 100) / 100}
      aria-valuetext={`${time.toFixed(2)} seconds`}
      aria-valuemax={duration}
      tabIndex={0}
      {...scrubBindings}
    />
  );
});
