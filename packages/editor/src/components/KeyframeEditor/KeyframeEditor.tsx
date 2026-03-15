import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useEditorStore } from '../../store/editor.store';
import type {
  Clip,
  IntrinsicVideoProps,
  IntrinsicAudioProps,
} from '../../store/editor.store';

// ─── Types ──────────────────────────────────────────────────────────────────────

type InterpolationType = 'linear' | 'bezier' | 'hold';

interface Keyframe {
  time: number;        // seconds (relative to clip start)
  value: number;
  interpolation: InterpolationType;
  bezierIn: { x: number; y: number };   // tangent handle (relative offset)
  bezierOut: { x: number; y: number };
}

interface ParameterDef {
  id: string;
  label: string;
  group: 'Transform' | 'Audio';
  min: number;
  max: number;
  defaultValue: number;
  unit: string;
  getValue: (clip: Clip) => number;
  setValue: (clipId: string, value: number) => void;
}

interface DragState {
  type: 'keyframe' | 'handle-in' | 'handle-out' | 'pan';
  paramId: string;
  keyframeIndex: number;
  startMouseX: number;
  startMouseY: number;
  startTime: number;
  startValue: number;
  shiftHeld: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const PARAM_SIDEBAR_WIDTH = 200;
const HEADER_HEIGHT = 28;
const KEYFRAME_BAR_HEIGHT = 24;
const CURVE_MIN_HEIGHT = 180;
const DIAMOND_SIZE = 8;
const HANDLE_RADIUS = 4;
const HANDLE_LINE_LEN = 40;
const GRID_DIVISIONS_Y = 5;
const SNAP_THRESHOLD = 5; // pixels

// ─── Parameter Definitions ──────────────────────────────────────────────────────

function buildParameterDefs(): ParameterDef[] {
  const store = useEditorStore.getState();
  return [
    // Transform
    {
      id: 'positionX', label: 'Position X', group: 'Transform',
      min: -2000, max: 2000, defaultValue: 0, unit: 'px',
      getValue: (c) => c.intrinsicVideo.positionX,
      setValue: (cid, v) => store.updateIntrinsicVideo(cid, { positionX: v }),
    },
    {
      id: 'positionY', label: 'Position Y', group: 'Transform',
      min: -2000, max: 2000, defaultValue: 0, unit: 'px',
      getValue: (c) => c.intrinsicVideo.positionY,
      setValue: (cid, v) => store.updateIntrinsicVideo(cid, { positionY: v }),
    },
    {
      id: 'scaleX', label: 'Scale X', group: 'Transform',
      min: 0, max: 400, defaultValue: 100, unit: '%',
      getValue: (c) => c.intrinsicVideo.scaleX,
      setValue: (cid, v) => store.updateIntrinsicVideo(cid, { scaleX: v }),
    },
    {
      id: 'scaleY', label: 'Scale Y', group: 'Transform',
      min: 0, max: 400, defaultValue: 100, unit: '%',
      getValue: (c) => c.intrinsicVideo.scaleY,
      setValue: (cid, v) => store.updateIntrinsicVideo(cid, { scaleY: v }),
    },
    {
      id: 'rotation', label: 'Rotation', group: 'Transform',
      min: -360, max: 360, defaultValue: 0, unit: '\u00b0',
      getValue: (c) => c.intrinsicVideo.rotation,
      setValue: (cid, v) => store.updateIntrinsicVideo(cid, { rotation: v }),
    },
    {
      id: 'opacity', label: 'Opacity', group: 'Transform',
      min: 0, max: 100, defaultValue: 100, unit: '%',
      getValue: (c) => c.intrinsicVideo.opacity,
      setValue: (cid, v) => store.updateIntrinsicVideo(cid, { opacity: v }),
    },
    // Audio
    {
      id: 'volume', label: 'Volume', group: 'Audio',
      min: -60, max: 12, defaultValue: 0, unit: 'dB',
      getValue: (c) => c.intrinsicAudio.volume,
      setValue: (cid, v) => store.updateIntrinsicAudio(cid, { volume: v }),
    },
    {
      id: 'pan', label: 'Pan', group: 'Audio',
      min: -100, max: 100, defaultValue: 0, unit: '',
      getValue: (c) => c.intrinsicAudio.pan,
      setValue: (cid, v) => store.updateIntrinsicAudio(cid, { pan: v }),
    },
  ];
}

// ─── Utility ────────────────────────────────────────────────────────────────────

function clamp(val: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, val));
}

function formatValue(val: number, unit: string): string {
  return `${val.toFixed(1)}${unit}`;
}

function cubicBezierPoint(
  t: number,
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
): { x: number; y: number } {
  const mt = 1 - t;
  return {
    x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
    y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y,
  };
}

// ─── Component ──────────────────────────────────────────────────────────────────

export function KeyframeEditor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Store state
  const selectedClipIds = useEditorStore((s) => s.selectedClipIds);
  const tracks = useEditorStore((s) => s.tracks);
  const playheadTime = useEditorStore((s) => s.playheadTime);
  const setPlayhead = useEditorStore((s) => s.setPlayhead);

  // Local state
  const [keyframes, setKeyframes] = useState<Record<string, Keyframe[]>>({});
  const [selectedParam, setSelectedParam] = useState<string | null>(null);
  const [selectedKeyframeIdx, setSelectedKeyframeIdx] = useState<number | null>(null);
  const [interpolationType, setInterpolationType] = useState<InterpolationType>('bezier');
  const [zoom, setZoom] = useState(80); // pixels per second
  const [panOffset, setPanOffset] = useState(0); // horizontal scroll offset
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [curveHeight, setCurveHeight] = useState(CURVE_MIN_HEIGHT);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['Transform', 'Audio']));

  // Resolve selected clip
  const selectedClip = useMemo(() => {
    if (selectedClipIds.length !== 1) return null;
    for (const track of tracks) {
      const clip = track.clips.find((c) => c.id === selectedClipIds[0]);
      if (clip) return clip;
    }
    return null;
  }, [selectedClipIds, tracks]);

  const paramDefs = useMemo(() => buildParameterDefs(), []);

  const clipDuration = selectedClip ? selectedClip.endTime - selectedClip.startTime : 0;
  const clipStartTime = selectedClip ? selectedClip.startTime : 0;

  // Time-to-pixel and pixel-to-time conversions (relative to clip start)
  const timeToX = useCallback(
    (t: number) => (t * zoom) - panOffset + PARAM_SIDEBAR_WIDTH,
    [zoom, panOffset],
  );

  const xToTime = useCallback(
    (x: number) => ((x - PARAM_SIDEBAR_WIDTH + panOffset) / zoom),
    [zoom, panOffset],
  );

  // Value-to-Y and Y-to-value (within the curve area)
  const valueToY = useCallback(
    (value: number, min: number, max: number) => {
      const range = max - min;
      if (range === 0) return HEADER_HEIGHT + KEYFRAME_BAR_HEIGHT + curveHeight / 2;
      const norm = (value - min) / range;
      return HEADER_HEIGHT + KEYFRAME_BAR_HEIGHT + curveHeight - (norm * curveHeight) + 8;
    },
    [curveHeight],
  );

  const yToValue = useCallback(
    (y: number, min: number, max: number) => {
      const range = max - min;
      const norm = 1 - (y - HEADER_HEIGHT - KEYFRAME_BAR_HEIGHT - 8) / curveHeight;
      return min + norm * range;
    },
    [curveHeight],
  );

  // ── Keyframe CRUD ─────────────────────────────────────────────────────────

  const addKeyframe = useCallback((paramId: string) => {
    if (!selectedClip) return;
    const param = paramDefs.find((p) => p.id === paramId);
    if (!param) return;
    const relativeTime = playheadTime - clipStartTime;
    if (relativeTime < 0 || relativeTime > clipDuration) return;

    setKeyframes((prev) => {
      const existing = prev[paramId] || [];
      // Don't add duplicate at same time
      if (existing.some((k) => Math.abs(k.time - relativeTime) < 0.001)) return prev;
      const newKf: Keyframe = {
        time: relativeTime,
        value: param.getValue(selectedClip),
        interpolation: interpolationType,
        bezierIn: { x: -0.15, y: 0 },
        bezierOut: { x: 0.15, y: 0 },
      };
      const updated = [...existing, newKf].sort((a, b) => a.time - b.time);
      return { ...prev, [paramId]: updated };
    });
  }, [selectedClip, paramDefs, playheadTime, clipStartTime, clipDuration, interpolationType]);

  const deleteKeyframe = useCallback(() => {
    if (!selectedParam || selectedKeyframeIdx === null) return;
    setKeyframes((prev) => {
      const existing = prev[selectedParam] || [];
      const updated = existing.filter((_, i) => i !== selectedKeyframeIdx);
      return { ...prev, [selectedParam]: updated };
    });
    setSelectedKeyframeIdx(null);
  }, [selectedParam, selectedKeyframeIdx]);

  const goToPrevKeyframe = useCallback(() => {
    if (!selectedParam || !selectedClip) return;
    const kfs = keyframes[selectedParam] || [];
    const relTime = playheadTime - clipStartTime;
    for (let i = kfs.length - 1; i >= 0; i--) {
      const kf = kfs[i]!;
      if (kf.time < relTime - 0.001) {
        setPlayhead(kf.time + clipStartTime);
        setSelectedKeyframeIdx(i);
        return;
      }
    }
  }, [selectedParam, keyframes, playheadTime, clipStartTime, selectedClip, setPlayhead]);

  const goToNextKeyframe = useCallback(() => {
    if (!selectedParam || !selectedClip) return;
    const kfs = keyframes[selectedParam] || [];
    const relTime = playheadTime - clipStartTime;
    for (let i = 0; i < kfs.length; i++) {
      const kf = kfs[i]!;
      if (kf.time > relTime + 0.001) {
        setPlayhead(kf.time + clipStartTime);
        setSelectedKeyframeIdx(i);
        return;
      }
    }
  }, [selectedParam, keyframes, playheadTime, clipStartTime, selectedClip, setPlayhead]);

  const setSelectedInterpolation = useCallback((type: InterpolationType) => {
    setInterpolationType(type);
    if (selectedParam && selectedKeyframeIdx !== null) {
      setKeyframes((prev) => {
        const existing = prev[selectedParam] || [];
        const updated = existing.map((k, i) =>
          i === selectedKeyframeIdx ? { ...k, interpolation: type } : k,
        );
        return { ...prev, [selectedParam]: updated };
      });
    }
  }, [selectedParam, selectedKeyframeIdx]);

  const toggleKeyframeForParam = useCallback((paramId: string) => {
    if (!selectedClip) return;
    const relativeTime = playheadTime - clipStartTime;
    const existing = keyframes[paramId] || [];
    const existingIdx = existing.findIndex((k) => Math.abs(k.time - relativeTime) < 0.01);
    if (existingIdx >= 0) {
      // Remove
      setKeyframes((prev) => ({
        ...prev,
        [paramId]: existing.filter((_, i) => i !== existingIdx),
      }));
    } else {
      addKeyframe(paramId);
    }
  }, [selectedClip, playheadTime, clipStartTime, keyframes, addKeyframe]);

  // ── Mouse interactions ────────────────────────────────────────────────────

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !selectedParam || !selectedClip) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Middle-click pan
    if (e.button === 1) {
      setDragState({
        type: 'pan',
        paramId: '',
        keyframeIndex: -1,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startTime: panOffset,
        startValue: 0,
        shiftHeld: false,
      });
      e.preventDefault();
      return;
    }

    const param = paramDefs.find((p) => p.id === selectedParam);
    if (!param) return;
    const kfs = keyframes[selectedParam] || [];

    // Check bezier handles first (they're smaller targets)
    for (let i = 0; i < kfs.length; i++) {
      const kf = kfs[i]!;
      const kx = timeToX(kf.time);
      const ky = valueToY(kf.value, param.min, param.max);

      if (kf.interpolation === 'bezier') {
        // Handle in
        const hix = kx + kf.bezierIn.x * zoom;
        const hiy = ky - kf.bezierIn.y * (curveHeight / (param.max - param.min));
        if (Math.hypot(mx - hix, my - hiy) < HANDLE_RADIUS + 4) {
          setDragState({
            type: 'handle-in',
            paramId: selectedParam,
            keyframeIndex: i,
            startMouseX: e.clientX,
            startMouseY: e.clientY,
            startTime: kf.bezierIn.x,
            startValue: kf.bezierIn.y,
            shiftHeld: e.shiftKey,
          });
          setSelectedKeyframeIdx(i);
          return;
        }
        // Handle out
        const hox = kx + kf.bezierOut.x * zoom;
        const hoy = ky - kf.bezierOut.y * (curveHeight / (param.max - param.min));
        if (Math.hypot(mx - hox, my - hoy) < HANDLE_RADIUS + 4) {
          setDragState({
            type: 'handle-out',
            paramId: selectedParam,
            keyframeIndex: i,
            startMouseX: e.clientX,
            startMouseY: e.clientY,
            startTime: kf.bezierOut.x,
            startValue: kf.bezierOut.y,
            shiftHeld: e.shiftKey,
          });
          setSelectedKeyframeIdx(i);
          return;
        }
      }
    }

    // Check keyframe diamonds
    for (let i = 0; i < kfs.length; i++) {
      const kf = kfs[i]!;
      const kx = timeToX(kf.time);
      const ky = valueToY(kf.value, param.min, param.max);
      if (Math.abs(mx - kx) < DIAMOND_SIZE + 2 && Math.abs(my - ky) < DIAMOND_SIZE + 2) {
        setDragState({
          type: 'keyframe',
          paramId: selectedParam,
          keyframeIndex: i,
          startMouseX: e.clientX,
          startMouseY: e.clientY,
          startTime: kf.time,
          startValue: kf.value,
          shiftHeld: e.shiftKey,
        });
        setSelectedKeyframeIdx(i);
        return;
      }
    }

    // Click on empty area - deselect keyframe
    setSelectedKeyframeIdx(null);
  }, [selectedParam, selectedClip, paramDefs, keyframes, timeToX, valueToY, zoom, curveHeight, panOffset]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragState || !selectedClip) return;

    if (dragState.type === 'pan') {
      const dx = e.clientX - dragState.startMouseX;
      setPanOffset(Math.max(0, dragState.startTime - dx));
      return;
    }

    const param = paramDefs.find((p) => p.id === dragState.paramId);
    if (!param) return;

    const dx = e.clientX - dragState.startMouseX;
    const dy = e.clientY - dragState.startMouseY;
    const shiftHeld = e.shiftKey;

    if (dragState.type === 'keyframe') {
      let newTime = dragState.startTime + dx / zoom;
      let newValue = dragState.startValue - dy * (param.max - param.min) / curveHeight;

      // Shift constrains to horizontal or vertical
      if (shiftHeld) {
        if (Math.abs(dx) > Math.abs(dy)) {
          newValue = dragState.startValue;
        } else {
          newTime = dragState.startTime;
        }
      }

      newTime = clamp(newTime, 0, clipDuration);
      newValue = clamp(newValue, param.min, param.max);

      setKeyframes((prev) => {
        const existing = prev[dragState.paramId] || [];
        const updated = existing.map((k, i) =>
          i === dragState.keyframeIndex ? { ...k, time: newTime, value: newValue } : k,
        );
        return { ...prev, [dragState.paramId]: updated };
      });

      // Apply value to the clip property in real time
      param.setValue(selectedClip.id, newValue);
    } else if (dragState.type === 'handle-in' || dragState.type === 'handle-out') {
      const newX = dragState.startTime + dx / zoom;
      const newY = dragState.startValue + dy * (param.max - param.min) / curveHeight;
      const key = dragState.type === 'handle-in' ? 'bezierIn' : 'bezierOut';

      setKeyframes((prev) => {
        const existing = prev[dragState.paramId] || [];
        const updated = existing.map((k, i) =>
          i === dragState.keyframeIndex ? { ...k, [key]: { x: newX, y: -newY } } : k,
        );
        return { ...prev, [dragState.paramId]: updated };
      });
    }
  }, [dragState, selectedClip, paramDefs, zoom, curveHeight, clipDuration]);

  const handleCanvasMouseUp = useCallback(() => {
    if (dragState && dragState.type === 'keyframe') {
      // Re-sort keyframes after drag
      setKeyframes((prev) => {
        const existing = prev[dragState.paramId] || [];
        const sorted = [...existing].sort((a, b) => a.time - b.time);
        // Update selectedKeyframeIdx to match new sort position
        const movedKf = existing[dragState.keyframeIndex];
        if (movedKf) {
          const newIdx = sorted.findIndex((k) => k === movedKf);
          if (newIdx >= 0) setSelectedKeyframeIdx(newIdx);
        }
        return { ...prev, [dragState.paramId]: sorted };
      });
    }
    setDragState(null);
  }, [dragState]);

  // Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      // Vertical zoom (curve height)
      const delta = e.deltaY > 0 ? -20 : 20;
      setCurveHeight((h) => Math.max(CURVE_MIN_HEIGHT, Math.min(600, h + delta)));
    } else {
      // Horizontal zoom
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom((z) => clamp(z * factor, 10, 500));
    }
  }, []);

  // ── Canvas Drawing ────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width - PARAM_SIDEBAR_WIDTH;
    const h = HEADER_HEIGHT + KEYFRAME_BAR_HEIGHT + curveHeight + 16;

    canvas.width = (w + PARAM_SIDEBAR_WIDTH) * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w + PARAM_SIDEBAR_WIDTH}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w + PARAM_SIDEBAR_WIDTH, h);

    const totalW = w + PARAM_SIDEBAR_WIDTH;

    // ── Background ──
    const styles = getComputedStyle(document.documentElement);
    const bgVoid = styles.getPropertyValue('--bg-void').trim() || '#0d0d0d';
    const bgSurface = styles.getPropertyValue('--bg-surface').trim() || '#1a1a1a';
    const bgRaised = styles.getPropertyValue('--bg-raised').trim() || '#252525';
    const borderDefault = styles.getPropertyValue('--border-default').trim() || '#333';
    const textPrimary = styles.getPropertyValue('--text-primary').trim() || '#e0e0e0';
    const textSecondary = styles.getPropertyValue('--text-secondary').trim() || '#999';
    const textMuted = styles.getPropertyValue('--text-muted').trim() || '#666';
    const brand = styles.getPropertyValue('--brand').trim() || '#5b6af5';
    const brandBright = styles.getPropertyValue('--brand-bright').trim() || '#7b8aff';
    const errorColor = styles.getPropertyValue('--error').trim() || '#ef4444';

    // Curve area background
    ctx.fillStyle = bgVoid;
    ctx.fillRect(PARAM_SIDEBAR_WIDTH, HEADER_HEIGHT + KEYFRAME_BAR_HEIGHT, w, curveHeight + 16);

    // Keyframe bar background
    ctx.fillStyle = bgSurface;
    ctx.fillRect(PARAM_SIDEBAR_WIDTH, HEADER_HEIGHT, w, KEYFRAME_BAR_HEIGHT);

    // Header bar
    ctx.fillStyle = bgRaised;
    ctx.fillRect(PARAM_SIDEBAR_WIDTH, 0, w, HEADER_HEIGHT);

    // ── Grid Lines ──
    ctx.strokeStyle = borderDefault;
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = 0.4;

    // Vertical grid (time)
    const secondsVisible = w / zoom;
    const gridStep = secondsVisible > 20 ? 5 : secondsVisible > 8 ? 2 : secondsVisible > 3 ? 1 : 0.5;
    const startSec = Math.floor((panOffset / zoom) / gridStep) * gridStep;
    for (let t = startSec; t <= startSec + secondsVisible + gridStep; t += gridStep) {
      const x = timeToX(t);
      if (x < PARAM_SIDEBAR_WIDTH || x > totalW) continue;
      ctx.beginPath();
      ctx.moveTo(x, HEADER_HEIGHT);
      ctx.lineTo(x, h);
      ctx.stroke();

      // Time labels in header
      ctx.globalAlpha = 1;
      ctx.fillStyle = textMuted;
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      const minutes = Math.floor(t / 60);
      const seconds = (t % 60).toFixed(t % 1 === 0 ? 0 : 1);
      ctx.fillText(`${minutes}:${seconds.padStart(t % 1 === 0 ? 2 : 4, '0')}`, x, HEADER_HEIGHT - 6);
      ctx.globalAlpha = 0.4;
    }

    // Horizontal grid (values)
    const curveTop = HEADER_HEIGHT + KEYFRAME_BAR_HEIGHT + 8;
    for (let i = 0; i <= GRID_DIVISIONS_Y; i++) {
      const y = curveTop + (i / GRID_DIVISIONS_Y) * curveHeight;
      ctx.beginPath();
      ctx.moveTo(PARAM_SIDEBAR_WIDTH, y);
      ctx.lineTo(totalW, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // ── Clip duration region highlight ──
    if (clipDuration > 0) {
      const x0 = timeToX(0);
      const x1 = timeToX(clipDuration);
      ctx.fillStyle = bgSurface;
      ctx.globalAlpha = 0.15;
      ctx.fillRect(
        Math.max(PARAM_SIDEBAR_WIDTH, x0),
        HEADER_HEIGHT + KEYFRAME_BAR_HEIGHT,
        Math.min(totalW, x1) - Math.max(PARAM_SIDEBAR_WIDTH, x0),
        curveHeight + 16,
      );
      ctx.globalAlpha = 1;
    }

    // ── Draw keyframes in keyframe bar (all params) ──
    for (const [paramId, kfs] of Object.entries(keyframes)) {
      const param = paramDefs.find((p) => p.id === paramId);
      if (!param) continue;
      const isActive = paramId === selectedParam;

      for (let i = 0; i < kfs.length; i++) {
        const kf = kfs[i]!;
        const x = timeToX(kf.time);
        if (x < PARAM_SIDEBAR_WIDTH || x > totalW) continue;
        const y = HEADER_HEIGHT + KEYFRAME_BAR_HEIGHT / 2;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = isActive ? brandBright : textSecondary;
        ctx.fillRect(-3, -3, 6, 6);
        ctx.restore();
      }
    }

    // ── Draw selected parameter curve ──
    if (selectedParam) {
      const param = paramDefs.find((p) => p.id === selectedParam);
      const kfs = keyframes[selectedParam] || [];
      if (param && kfs.length > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(PARAM_SIDEBAR_WIDTH, HEADER_HEIGHT + KEYFRAME_BAR_HEIGHT, w, curveHeight + 16);
        ctx.clip();

        // Draw curve segments
        for (let i = 0; i < kfs.length; i++) {
          const kf = kfs[i]!;
          const kx = timeToX(kf.time);
          const ky = valueToY(kf.value, param.min, param.max);

          if (i === 0) {
            // Flat line from start to first keyframe
            ctx.strokeStyle = brand;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            const startX = timeToX(0);
            ctx.moveTo(startX, ky);
            ctx.lineTo(kx, ky);
            ctx.stroke();
          }

          if (i < kfs.length - 1) {
            const next = kfs[i + 1]!;
            const nx = timeToX(next.time);
            const ny = valueToY(next.value, param.min, param.max);

            ctx.strokeStyle = brand;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(kx, ky);

            if (kf.interpolation === 'hold') {
              // Step function
              ctx.lineTo(nx, ky);
              ctx.lineTo(nx, ny);
            } else if (kf.interpolation === 'bezier') {
              // Cubic bezier
              const cp1x = kx + kf.bezierOut.x * zoom;
              const cp1y = ky - kf.bezierOut.y * (curveHeight / (param.max - param.min));
              const cp2x = nx + next.bezierIn.x * zoom;
              const cp2y = ny - next.bezierIn.y * (curveHeight / (param.max - param.min));
              ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, nx, ny);
            } else {
              // Linear
              ctx.lineTo(nx, ny);
            }
            ctx.stroke();
          } else {
            // Flat line from last keyframe to end
            ctx.strokeStyle = brand;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(kx, ky);
            const endX = timeToX(clipDuration);
            ctx.lineTo(endX, ky);
            ctx.stroke();
          }
        }

        // Draw bezier handles
        for (let i = 0; i < kfs.length; i++) {
          const kf = kfs[i]!;
          if (kf.interpolation !== 'bezier') continue;
          const kx = timeToX(kf.time);
          const ky = valueToY(kf.value, param.min, param.max);
          const scale = curveHeight / (param.max - param.min);

          // Handle in
          const hix = kx + kf.bezierIn.x * zoom;
          const hiy = ky - kf.bezierIn.y * scale;
          ctx.strokeStyle = textSecondary;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(kx, ky);
          ctx.lineTo(hix, hiy);
          ctx.stroke();
          ctx.fillStyle = i === selectedKeyframeIdx ? brandBright : textSecondary;
          ctx.beginPath();
          ctx.arc(hix, hiy, HANDLE_RADIUS, 0, Math.PI * 2);
          ctx.fill();

          // Handle out
          const hox = kx + kf.bezierOut.x * zoom;
          const hoy = ky - kf.bezierOut.y * scale;
          ctx.strokeStyle = textSecondary;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(kx, ky);
          ctx.lineTo(hox, hoy);
          ctx.stroke();
          ctx.fillStyle = i === selectedKeyframeIdx ? brandBright : textSecondary;
          ctx.beginPath();
          ctx.arc(hox, hoy, HANDLE_RADIUS, 0, Math.PI * 2);
          ctx.fill();
        }

        // Draw keyframe diamonds on curve
        for (let i = 0; i < kfs.length; i++) {
          const kf = kfs[i]!;
          const kx = timeToX(kf.time);
          const ky = valueToY(kf.value, param.min, param.max);

          ctx.save();
          ctx.translate(kx, ky);
          ctx.rotate(Math.PI / 4);

          const isSelected = i === selectedKeyframeIdx;
          ctx.fillStyle = isSelected ? brandBright : brand;
          ctx.strokeStyle = isSelected ? '#fff' : borderDefault;
          ctx.lineWidth = isSelected ? 2 : 1;
          ctx.fillRect(-DIAMOND_SIZE / 2, -DIAMOND_SIZE / 2, DIAMOND_SIZE, DIAMOND_SIZE);
          ctx.strokeRect(-DIAMOND_SIZE / 2, -DIAMOND_SIZE / 2, DIAMOND_SIZE, DIAMOND_SIZE);
          ctx.restore();

          // Value label on hover/selection
          if (isSelected) {
            ctx.fillStyle = textPrimary;
            ctx.font = '10px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(formatValue(kf.value, param.unit), kx, ky - DIAMOND_SIZE - 6);
          }
        }

        ctx.restore();
      }
    }

    // ── Playhead ──
    const relPlayhead = playheadTime - clipStartTime;
    if (relPlayhead >= 0 && relPlayhead <= clipDuration) {
      const px = timeToX(relPlayhead);
      if (px >= PARAM_SIDEBAR_WIDTH && px <= totalW) {
        ctx.strokeStyle = errorColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, h);
        ctx.stroke();

        // Playhead triangle
        ctx.fillStyle = errorColor;
        ctx.beginPath();
        ctx.moveTo(px - 5, 0);
        ctx.lineTo(px + 5, 0);
        ctx.lineTo(px, 6);
        ctx.closePath();
        ctx.fill();
      }
    }

    // ── Border lines ──
    ctx.strokeStyle = borderDefault;
    ctx.lineWidth = 1;
    // Sidebar / canvas separator
    ctx.beginPath();
    ctx.moveTo(PARAM_SIDEBAR_WIDTH, 0);
    ctx.lineTo(PARAM_SIDEBAR_WIDTH, h);
    ctx.stroke();
    // Header bottom
    ctx.beginPath();
    ctx.moveTo(PARAM_SIDEBAR_WIDTH, HEADER_HEIGHT);
    ctx.lineTo(totalW, HEADER_HEIGHT);
    ctx.stroke();
    // Keyframe bar bottom
    ctx.beginPath();
    ctx.moveTo(PARAM_SIDEBAR_WIDTH, HEADER_HEIGHT + KEYFRAME_BAR_HEIGHT);
    ctx.lineTo(totalW, HEADER_HEIGHT + KEYFRAME_BAR_HEIGHT);
    ctx.stroke();
  }, [
    keyframes, selectedParam, selectedKeyframeIdx, zoom, panOffset, curveHeight,
    paramDefs, timeToX, valueToY, clipDuration, clipStartTime, playheadTime,
  ]);

  // ── No clip selected ──────────────────────────────────────────────────────

  if (!selectedClip) {
    return (
      <div style={{
        background: 'var(--bg-surface)',
        borderTop: '1px solid var(--border-default)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: 80,
        color: 'var(--text-muted)',
        fontSize: 13,
        fontFamily: 'inherit',
      }}>
        Select a clip to edit keyframes
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const totalH = HEADER_HEIGHT + KEYFRAME_BAR_HEIGHT + curveHeight + 16;

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const groupedParams = useMemo(() => {
    const groups: Record<string, ParameterDef[]> = {};
    for (const p of paramDefs) {
      if (!groups[p.group]) groups[p.group] = [];
      groups[p.group]!.push(p);
    }
    return groups;
  }, [paramDefs]);

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        borderTop: '1px solid var(--border-default)',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
        fontSize: 12,
        fontFamily: 'inherit',
      }}
    >
      {/* ── Control Bar ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 8px',
        background: 'var(--bg-raised)',
        borderBottom: '1px solid var(--border-default)',
        flexShrink: 0,
        height: 30,
      }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: 11, marginRight: 8, fontWeight: 600 }}>
          KEYFRAMES
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: 10, marginRight: 'auto' }}>
          {selectedClip.name}
        </span>

        {/* Keyframe navigation */}
        <ControlButton title="Previous keyframe" onClick={goToPrevKeyframe}>
          &#x25C0;&#x25C6;
        </ControlButton>
        <ControlButton
          title="Add keyframe at playhead"
          onClick={() => selectedParam && addKeyframe(selectedParam)}
          highlight
        >
          &#x25C6;+
        </ControlButton>
        <ControlButton title="Next keyframe" onClick={goToNextKeyframe}>
          &#x25C6;&#x25B6;
        </ControlButton>
        <ControlButton title="Delete keyframe" onClick={deleteKeyframe} danger>
          &#x2715;
        </ControlButton>

        <div style={{ width: 1, height: 16, background: 'var(--border-default)', margin: '0 4px' }} />

        {/* Interpolation controls */}
        <InterpButton
          label="Lin"
          title="Linear interpolation"
          active={interpolationType === 'linear'}
          onClick={() => setSelectedInterpolation('linear')}
        />
        <InterpButton
          label="Bez"
          title="Bezier (smooth) interpolation"
          active={interpolationType === 'bezier'}
          onClick={() => setSelectedInterpolation('bezier')}
        />
        <InterpButton
          label="Hold"
          title="Hold (step) interpolation"
          active={interpolationType === 'hold'}
          onClick={() => setSelectedInterpolation('hold')}
        />
      </div>

      {/* ── Main area: sidebar + canvas ── */}
      <div
        ref={containerRef}
        style={{
          display: 'flex',
          flexDirection: 'row',
          overflow: 'hidden',
        }}
      >
        {/* ── Parameter Sidebar ── */}
        <div style={{
          width: PARAM_SIDEBAR_WIDTH,
          flexShrink: 0,
          background: 'var(--bg-surface)',
          borderRight: '1px solid var(--border-default)',
          overflowY: 'auto',
          height: totalH,
        }}>
          {Object.entries(groupedParams).map(([group, params]) => (
            <div key={group}>
              {/* Group header */}
              <div
                onClick={() => toggleGroup(group)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '4px 8px',
                  cursor: 'pointer',
                  background: 'var(--bg-raised)',
                  borderBottom: '1px solid var(--border-default)',
                  color: 'var(--text-secondary)',
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.5px',
                  textTransform: 'uppercase',
                }}
              >
                <span style={{
                  display: 'inline-block',
                  width: 10,
                  fontSize: 8,
                  marginRight: 4,
                  transform: expandedGroups.has(group) ? 'rotate(90deg)' : 'rotate(0deg)',
                  transition: 'transform 0.15s',
                }}>
                  &#x25B6;
                </span>
                {group}
              </div>

              {/* Parameter rows */}
              {expandedGroups.has(group) && params.map((param) => {
                const isActive = selectedParam === param.id;
                const hasKeyframes = (keyframes[param.id] || []).length > 0;
                const currentValue = param.getValue(selectedClip);
                const relTime = playheadTime - clipStartTime;
                const kfAtPlayhead = (keyframes[param.id] || []).some(
                  (k) => Math.abs(k.time - relTime) < 0.01,
                );

                return (
                  <div
                    key={param.id}
                    onClick={() => setSelectedParam(isActive ? null : param.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '3px 8px',
                      cursor: 'pointer',
                      background: isActive ? 'var(--bg-raised)' : 'transparent',
                      borderBottom: '1px solid var(--border-default)',
                      borderLeft: isActive ? `2px solid var(--brand)` : '2px solid transparent',
                    }}
                  >
                    {/* Keyframe toggle diamond */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleKeyframeForParam(param.id);
                      }}
                      title={kfAtPlayhead ? 'Remove keyframe at playhead' : 'Add keyframe at playhead'}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                        marginRight: 6,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 14,
                        height: 14,
                      }}
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10">
                        <rect
                          x="5" y="0"
                          width="7" height="7"
                          transform="rotate(45 5 5)"
                          fill={kfAtPlayhead ? 'var(--brand-bright)' : hasKeyframes ? 'var(--brand)' : 'var(--text-muted)'}
                          stroke={kfAtPlayhead ? 'var(--brand-bright)' : 'var(--border-default)'}
                          strokeWidth="0.5"
                        />
                      </svg>
                    </button>

                    {/* Name */}
                    <span style={{
                      flex: 1,
                      color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                      fontSize: 11,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {param.label}
                    </span>

                    {/* Value */}
                    <span style={{
                      color: 'var(--text-muted)',
                      fontSize: 10,
                      fontFamily: 'monospace',
                      minWidth: 50,
                      textAlign: 'right',
                    }}>
                      {formatValue(currentValue, param.unit)}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* ── Canvas area ── */}
        <canvas
          ref={canvasRef}
          style={{
            flex: 1,
            cursor: dragState
              ? dragState.type === 'pan' ? 'grabbing' : 'crosshair'
              : 'crosshair',
          }}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
          onWheel={handleWheel}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

function ControlButton({
  children,
  title,
  onClick,
  highlight,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  highlight?: boolean;
  danger?: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  let color = 'var(--text-secondary)';
  if (highlight) color = 'var(--brand)';
  if (danger) color = 'var(--error)';
  if (hovered) {
    if (highlight) color = 'var(--brand-bright)';
    else if (danger) color = 'var(--error)';
    else color = 'var(--text-primary)';
  }

  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? 'var(--bg-raised)' : 'transparent',
        border: '1px solid transparent',
        borderColor: hovered ? 'var(--border-default)' : 'transparent',
        borderRadius: 3,
        cursor: 'pointer',
        padding: '2px 6px',
        color,
        fontSize: 11,
        fontWeight: 600,
        lineHeight: 1,
        display: 'flex',
        alignItems: 'center',
        transition: 'all 0.12s',
      }}
    >
      {children}
    </button>
  );
}

function InterpButton({
  label,
  title,
  active,
  onClick,
}: {
  label: string;
  title: string;
  active: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: active ? 'var(--brand)' : hovered ? 'var(--bg-raised)' : 'transparent',
        border: '1px solid',
        borderColor: active ? 'var(--brand)' : 'var(--border-default)',
        borderRadius: 3,
        cursor: 'pointer',
        padding: '2px 8px',
        color: active ? '#fff' : 'var(--text-secondary)',
        fontSize: 10,
        fontWeight: 600,
        lineHeight: 1,
        transition: 'all 0.12s',
      }}
    >
      {label}
    </button>
  );
}
