import React from 'react';

interface PlayheadProps {
  time: number;
  zoom: number;
  scrollLeft: number;
}

export function Playhead({ time, zoom, scrollLeft }: PlayheadProps) {
  const left = time * zoom - scrollLeft;
  if (left < -1 || left > 10000) return null;
  return <div className="playhead" style={{ left }} />;
}
