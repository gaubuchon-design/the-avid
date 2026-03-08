import React, { useRef, useCallback, useEffect } from 'react';

interface RulerProps {
  zoom: number;
  scrollLeft: number;
  duration: number;
  onScrub: (time: number) => void;
}

export function Ruler({ zoom, scrollLeft, duration, onScrub }: RulerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    canvas.width = W * devicePixelRatio;
    canvas.height = H * devicePixelRatio;
    ctx.scale(devicePixelRatio, devicePixelRatio);

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#111822';
    ctx.fillRect(0, 0, W, H);

    const secWidth = zoom;
    const intervalSec =
      secWidth < 30 ? 10 : secWidth < 60 ? 5 : secWidth < 100 ? 2 : 1;
    const startSec = scrollLeft / zoom;
    const endSec = startSec + W / zoom;

    ctx.font = `9.5px 'DM Mono', monospace`;
    ctx.textAlign = 'center';

    for (
      let t = Math.floor(startSec / intervalSec) * intervalSec;
      t <= endSec;
      t += intervalSec
    ) {
      const x = t * zoom - scrollLeft;
      const isMain = t % (intervalSec * 5) === 0 || intervalSec >= 5;

      ctx.beginPath();
      ctx.moveTo(x, isMain ? 0 : H * 0.55);
      ctx.lineTo(x, H);
      ctx.strokeStyle = isMain
        ? 'rgba(255,255,255,0.12)'
        : 'rgba(255,255,255,0.05)';
      ctx.stroke();

      if (isMain || intervalSec >= 2) {
        const m = Math.floor(t / 60);
        const s = Math.floor(t % 60);
        ctx.fillStyle = 'rgba(90, 112, 136, 0.8)';
        ctx.fillText(
          `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`,
          x,
          H - 5,
        );
      }
    }
  }, [zoom, scrollLeft, duration]);

  useEffect(() => {
    draw();
    const obs = new ResizeObserver(draw);
    if (canvasRef.current) obs.observe(canvasRef.current);
    return () => obs.disconnect();
  }, [draw]);

  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const scrub = (ev: MouseEvent) => {
      const x = ev.clientX - rect.left;
      onScrub(Math.max(0, (x + scrollLeft) / zoom));
    };
    scrub(e.nativeEvent);
    const up = () => {
      window.removeEventListener('mousemove', scrub);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', scrub);
    window.addEventListener('mouseup', up);
  };

  return (
    <div className="timeline-ruler" onMouseDown={handleMouseDown}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  );
}
