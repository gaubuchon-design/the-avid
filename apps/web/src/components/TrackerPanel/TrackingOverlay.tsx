// =============================================================================
//  Tracking Overlay
//  SVG overlay rendered on top of the monitor canvas for interactive ROI
//  drawing and visualization of tracked region across frames.
// =============================================================================

import React, { useCallback, useRef, useState, useEffect } from 'react';
import { useTrackingStore } from '../../store/tracking.store';
import type { Point2D } from '../../engine/tracking/PlanarTracker';

// ─── Styles ─────────────────────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  zIndex: 10,
};

const svgStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  pointerEvents: 'all',
};

// ─── Component ──────────────────────────────────────────────────────────────

interface TrackingOverlayProps {
  width: number;
  height: number;
  currentFrame?: number;
}

export const TrackingOverlay: React.FC<TrackingOverlayProps> = ({
  width,
  height,
  currentFrame,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragIndex, setDragIndex] = useState(-1);
  const [rectStart, setRectStart] = useState<Point2D | null>(null);

  const mode = useTrackingStore((s) => s.mode);
  const drawingPoints = useTrackingStore((s) => s.drawingPoints);
  const drawingType = useTrackingStore((s) => s.drawingType);
  const sessions = useTrackingStore((s) => s.sessions);
  const activeRegionId = useTrackingStore((s) => s.activeRegionId);
  const showOverlay = useTrackingStore((s) => s.showOverlay);

  const addDrawingPoint = useTrackingStore((s) => s.addDrawingPoint);
  const updateDrawingPoint = useTrackingStore((s) => s.updateDrawingPoint);
  const finishDrawing = useTrackingStore((s) => s.finishDrawing);
  const updateRegionPoints = useTrackingStore((s) => s.updateRegionPoints);

  const getSVGPoint = useCallback((e: React.MouseEvent): Point2D | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * width,
      y: ((e.clientY - rect.top) / rect.height) * height,
    };
  }, [width, height]);

  // ── Drawing handlers ──

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (mode !== 'drawing') return;
    const pt = getSVGPoint(e);
    if (!pt) return;

    if (drawingType === 'rectangle') {
      setRectStart(pt);
    } else {
      addDrawingPoint(pt);
    }
  }, [mode, drawingType, getSVGPoint, addDrawingPoint]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const pt = getSVGPoint(e);
    if (!pt) return;

    if (mode === 'drawing' && drawingType === 'rectangle' && rectStart) {
      // Update rectangle preview via 4 corner points
      const points: Point2D[] = [
        rectStart,
        { x: pt.x, y: rectStart.y },
        pt,
        { x: rectStart.x, y: pt.y },
      ];
      // Reset drawing points to rectangle corners
      for (let i = 0; i < 4; i++) {
        if (i < drawingPoints.length) {
          updateDrawingPoint(i, points[i]);
        } else {
          addDrawingPoint(points[i]);
        }
      }
    }

    // Handle control point dragging for existing regions
    if (isDragging && activeRegionId && dragIndex >= 0) {
      const session = sessions.get(activeRegionId);
      if (session) {
        const newPoints = [...session.region.points];
        newPoints[dragIndex] = pt;
        updateRegionPoints(activeRegionId, newPoints);
      }
    }
  }, [
    mode, drawingType, rectStart, drawingPoints, isDragging, activeRegionId,
    dragIndex, sessions, getSVGPoint, updateDrawingPoint, addDrawingPoint,
    updateRegionPoints,
  ]);

  const handleMouseUp = useCallback(() => {
    if (mode === 'drawing' && drawingType === 'rectangle' && rectStart) {
      if (drawingPoints.length >= 4) {
        finishDrawing();
      }
      setRectStart(null);
    }
    setIsDragging(false);
    setDragIndex(-1);
  }, [mode, drawingType, rectStart, drawingPoints, finishDrawing]);

  const handleDoubleClick = useCallback(() => {
    if (mode === 'drawing' && drawingType === 'polygon' && drawingPoints.length >= 3) {
      finishDrawing();
    }
  }, [mode, drawingType, drawingPoints, finishDrawing]);

  // Handle control point drag start
  const handleControlPointMouseDown = useCallback((regionId: string, pointIndex: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (mode === 'tracking') return;
    setIsDragging(true);
    setDragIndex(pointIndex);
  }, [mode]);

  // ESC to cancel drawing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mode === 'drawing') {
        useTrackingStore.getState().cancelDrawing();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode]);

  if (!showOverlay) return null;

  // ── Get tracked region corners for current frame ──
  const getTrackedCorners = (regionId: string): Point2D[] | null => {
    if (currentFrame === undefined) return null;
    const session = sessions.get(regionId);
    if (!session?.data) return null;
    const result = session.data.frames.get(currentFrame);
    if (!result) return null;
    const { cornerPin } = result.decomposed;
    return [cornerPin.topLeft, cornerPin.topRight, cornerPin.bottomRight, cornerPin.bottomLeft];
  };

  return (
    <div style={overlayStyle}>
      <svg
        ref={svgRef}
        style={svgStyle}
        viewBox={`0 0 ${width} ${height}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleDoubleClick}
      >
        {/* Drawing preview */}
        {mode === 'drawing' && drawingPoints.length > 0 && (
          <g>
            <polygon
              points={drawingPoints.map(p => `${p.x},${p.y}`).join(' ')}
              fill="rgba(137, 180, 250, 0.15)"
              stroke="#89b4fa"
              strokeWidth={2}
              strokeDasharray="6 3"
            />
            {drawingPoints.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={4}
                fill="#89b4fa"
                stroke="#1e1e2e"
                strokeWidth={1}
              />
            ))}
          </g>
        )}

        {/* Existing regions */}
        {Array.from(sessions.entries()).map(([id, session]) => {
          const isActive = id === activeRegionId;
          const trackedCorners = getTrackedCorners(id);
          const displayPoints = trackedCorners || session.region.points;
          const strokeColor = isActive ? '#89b4fa' : '#a6adc8';
          const confidence = currentFrame !== undefined
            ? session.data?.frames.get(currentFrame)?.confidence ?? 1
            : 1;

          return (
            <g key={id}>
              {/* Region polygon */}
              <polygon
                points={displayPoints.map(p => `${p.x},${p.y}`).join(' ')}
                fill={`rgba(137, 180, 250, ${isActive ? 0.1 : 0.05})`}
                stroke={strokeColor}
                strokeWidth={isActive ? 2 : 1}
                opacity={confidence}
              />

              {/* Crosshair at center */}
              {displayPoints.length >= 3 && (() => {
                const cx = displayPoints.reduce((s, p) => s + p.x, 0) / displayPoints.length;
                const cy = displayPoints.reduce((s, p) => s + p.y, 0) / displayPoints.length;
                return (
                  <g opacity={0.6}>
                    <line x1={cx - 8} y1={cy} x2={cx + 8} y2={cy} stroke={strokeColor} strokeWidth={1} />
                    <line x1={cx} y1={cy - 8} x2={cx} y2={cy + 8} stroke={strokeColor} strokeWidth={1} />
                  </g>
                );
              })()}

              {/* Control points (draggable when not tracking) */}
              {isActive && mode !== 'tracking' && displayPoints.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={5}
                  fill={strokeColor}
                  stroke="#1e1e2e"
                  strokeWidth={1.5}
                  style={{ cursor: 'move', pointerEvents: 'all' }}
                  onMouseDown={(e) => handleControlPointMouseDown(id, i, e)}
                />
              ))}

              {/* Confidence indicator */}
              {trackedCorners && confidence < 0.5 && (
                <text
                  x={displayPoints[0].x}
                  y={displayPoints[0].y - 8}
                  fill="#f38ba8"
                  fontSize={10}
                  fontFamily="monospace"
                >
                  Low confidence ({Math.round(confidence * 100)}%)
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
