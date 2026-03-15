import React, { useCallback } from 'react';

interface PanelResizeHandleProps {
  axis: 'horizontal' | 'vertical';
  ariaLabel: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  className?: string;
  invert?: boolean;
  step?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function PanelResizeHandle({
  axis,
  ariaLabel,
  value,
  min,
  max,
  onChange,
  className,
  invert = false,
  step = 16,
}: PanelResizeHandleProps) {
  const directionMultiplier = invert ? -1 : 1;

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();

    const startPoint = axis === 'horizontal' ? event.clientX : event.clientY;
    const startValue = value;
    const pointerId = event.pointerId;
    const target = event.currentTarget;

    document.body.classList.add('panel-resize-active');
    target.setPointerCapture(pointerId);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const currentPoint = axis === 'horizontal' ? moveEvent.clientX : moveEvent.clientY;
      const delta = (currentPoint - startPoint) * directionMultiplier;
      onChange(clamp(startValue + delta, min, max));
    };

    const handlePointerUp = () => {
      document.body.classList.remove('panel-resize-active');
      target.releasePointerCapture(pointerId);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  }, [axis, directionMultiplier, max, min, onChange, value]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const positiveKeys = axis === 'horizontal' ? ['ArrowRight'] : ['ArrowDown'];
    const negativeKeys = axis === 'horizontal' ? ['ArrowLeft'] : ['ArrowUp'];
    const direction = positiveKeys.includes(event.key)
      ? 1
      : negativeKeys.includes(event.key)
        ? -1
        : 0;

    if (direction === 0) {
      return;
    }

    event.preventDefault();
    const delta = direction * step * directionMultiplier;
    onChange(clamp(value + delta, min, max));
  }, [axis, directionMultiplier, max, min, onChange, step, value]);

  return (
    <div
      role="separator"
      aria-label={ariaLabel}
      aria-orientation={axis === 'horizontal' ? 'vertical' : 'horizontal'}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      className={className}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
    >
      <span className="panel-resize-handle-grip" aria-hidden="true" />
    </div>
  );
}
