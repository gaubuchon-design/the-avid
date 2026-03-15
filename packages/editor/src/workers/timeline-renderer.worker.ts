import type { MainToWorkerMsg, RenderState, RenderTrack, RenderClip } from './renderer-protocol';

let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let dpr = 1;
let currentState: RenderState | null = null;

// ─── Track-type background tints ─────────────────────────────────────────────

const TRACK_BG: Record<string, string> = {
  VIDEO: 'rgba(79,99,245,0.06)',
  AUDIO: 'rgba(37,168,101,0.06)',
  EFFECT: 'rgba(212,135,58,0.06)',
  SUBTITLE: 'rgba(90,184,217,0.06)',
  GRAPHIC: 'rgba(251,113,133,0.06)',
};

const CLIP_FILLS: Record<string, [string, string]> = {
  video: ['rgba(79,99,245,0.65)', 'rgba(79,99,245,0.38)'],
  audio: ['rgba(37,168,101,0.55)', 'rgba(37,168,101,0.28)'],
  effect: ['rgba(212,135,58,0.55)', 'rgba(212,135,58,0.28)'],
  subtitle: ['rgba(90,184,217,0.45)', 'rgba(90,184,217,0.22)'],
};

// ─── Drawing helpers ─────────────────────────────────────────────────────────

function roundRect(
  c: OffscreenCanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);
  c.arcTo(x + w, y, x + w, y + r, r);
  c.lineTo(x + w, y + h - r);
  c.arcTo(x + w, y + h, x + w - r, y + h, r);
  c.lineTo(x + r, y + h);
  c.arcTo(x, y + h, x, y + h - r, r);
  c.lineTo(x, y + r);
  c.arcTo(x, y, x + r, y, r);
  c.closePath();
}

function drawWaveform(
  c: OffscreenCanvasRenderingContext2D,
  data: number[],
  x: number, y: number, w: number, h: number,
  color: string,
) {
  const hw = h / 2;
  const cy = y + hw;
  const step = w / data.length;

  c.save();
  c.globalAlpha = 0.5;
  c.strokeStyle = color;
  c.lineWidth = 1;
  c.beginPath();
  for (let i = 0; i < data.length; i++) {
    const px = x + i * step;
    const amp = data[i]! * hw * 0.85;
    c.moveTo(px, cy - amp);
    c.lineTo(px, cy + amp);
  }
  c.stroke();
  c.restore();
}

function drawClip(
  c: OffscreenCanvasRenderingContext2D,
  clip: RenderClip,
  track: RenderTrack,
  s: RenderState,
  trackY: number,
) {
  const left = clip.startTime * s.zoom - s.scrollLeft;
  const width = (clip.endTime - clip.startTime) * s.zoom;
  const right = left + width;

  // Cull off-screen
  if (right < -2 || left > s.viewportWidth + 2) return;

  const y = trackY + 3;
  const h = s.trackHeight - 6;
  const r = 3;
  const w = Math.max(2, width);

  // Clip background gradient
  const fills = CLIP_FILLS[clip.type] || CLIP_FILLS['video'];
  const grad = c.createLinearGradient(left, y, left, y + h);
  grad.addColorStop(0, fills![0]);
  grad.addColorStop(1, fills![1]);

  roundRect(c, left, y, w, h, r);
  c.fillStyle = grad;
  c.fill();

  // Border
  if (clip.selected) {
    c.strokeStyle = '#f59e0b';
    c.lineWidth = 1.5;
  } else {
    c.strokeStyle = 'rgba(255,255,255,0.09)';
    c.lineWidth = 1;
  }
  c.stroke();

  // Waveform
  if (clip.waveformData && clip.waveformData.length > 0 && width > 4) {
    drawWaveform(c, clip.waveformData, left, y, width, h, track.color);
  }
}

function drawGrid(
  c: OffscreenCanvasRenderingContext2D,
  s: RenderState,
  W: number,
  totalH: number,
) {
  const secWidth = s.zoom;
  const intervalSec =
    secWidth < 30 ? 10 : secWidth < 60 ? 5 : secWidth < 100 ? 2 : 1;
  const startSec = s.scrollLeft / s.zoom;
  const endSec = startSec + W / s.zoom;

  for (
    let t = Math.floor(startSec / intervalSec) * intervalSec;
    t <= endSec;
    t += intervalSec
  ) {
    const x = t * s.zoom - s.scrollLeft;
    const isMain = t % (intervalSec * 5) === 0 || intervalSec >= 5;
    c.strokeStyle = isMain
      ? 'rgba(255,255,255,0.06)'
      : 'rgba(255,255,255,0.025)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x, totalH);
    c.stroke();
  }
}

// ─── Main render ─────────────────────────────────────────────────────────────

function render() {
  if (!ctx || !canvas || !currentState) return;
  const s = currentState;
  const W = canvas.width / dpr;
  const H = canvas.height / dpr;

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const totalH = s.tracks.length * s.trackHeight;

  // Track backgrounds
  let y = 0;
  for (const track of s.tracks) {
    const bgColor = TRACK_BG[track.type] || TRACK_BG['VIDEO'];
    ctx.fillStyle! = bgColor!;
    ctx.fillRect(0, y, W, s.trackHeight);

    if (track.muted) {
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(0, y, W, s.trackHeight);
    }

    if (track.locked) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.03)';
      ctx.lineWidth = 1;
      for (let dx = -s.trackHeight; dx < W + s.trackHeight; dx += 12) {
        ctx.beginPath();
        ctx.moveTo(dx, y);
        ctx.lineTo(dx + s.trackHeight, y + s.trackHeight);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Track separator
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(0, y + s.trackHeight - 1, W, 1);

    // Clips
    for (const clip of track.clips) {
      drawClip(ctx, clip, track, s, y);
    }
    y += s.trackHeight;
  }

  // Grid lines
  drawGrid(ctx, s, W, totalH);

  // Markers
  for (const marker of s.markers) {
    const mx = marker.time * s.zoom - s.scrollLeft;
    if (mx < -2 || mx > W + 2) continue;
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = marker.color;
    ctx.fillRect(mx, 0, 1, totalH);
    ctx.restore();
  }

  // Playhead
  const px = s.playheadTime * s.zoom - s.scrollLeft;
  if (px >= -1 && px <= W + 1) {
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(px - 0.5, 0, 1, totalH);
  }

  ctx.restore();
}

// ─── Error handler ───────────────────────────────────────────────────────────

self.onerror = (event) => {
  console.error('[TimelineRendererWorker] Unhandled error:', event);
};

// ─── Message handler ─────────────────────────────────────────────────────────

self.onmessage = (e: MessageEvent<MainToWorkerMsg>) => {
  const msg = e.data;
  try {
    switch (msg.type) {
      case 'init':
        canvas = msg.canvas;
        ctx = canvas.getContext('2d');
        dpr = msg.dpr;
        (self as unknown as Worker).postMessage({ type: 'ready' });
        break;

      case 'resize':
        if (canvas) {
          canvas.width = msg.width * msg.dpr;
          canvas.height = msg.height * msg.dpr;
          dpr = msg.dpr;
          render();
        }
        break;

      case 'update':
        currentState = msg.state;
        render();
        (self as unknown as Worker).postMessage({
          type: 'frame',
          time: performance.now(),
        });
        break;

      case 'destroy':
        canvas = null;
        ctx = null;
        currentState = null;
        self.close();
        break;
    }
  } catch (err) {
    console.error('[TimelineRendererWorker] Error processing message:', msg.type, err);
  }
};
