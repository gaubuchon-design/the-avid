import React, { memo } from 'react';

interface PlayheadProps {
  time: number;
  zoom: number;
  scrollLeft: number;
}

export const Playhead = memo(function Playhead({ time, zoom, scrollLeft }: PlayheadProps) {
  const left = time * zoom - scrollLeft;
  if (left < -1 || left > 10000) return null;
  return (
    <div
      className="playhead"
      style={{ left }}
      role="slider"
      aria-label="Playhead position"
      aria-valuenow={Math.round(time * 100) / 100}
      aria-valuetext={`${time.toFixed(2)} seconds`}
    />
  );
});
