// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID -- Title Graphics Renderer
// ═══════════════════════════════════════════════════════════════════════════

// ─── Types ─────────────────────────────────────────────────────────────────

/** Data structure describing a title overlay to render on the canvas. */
export interface TitleData {
  text: string;
  style: {
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
    color: string;
    outlineColor?: string;
    outlineWidth?: number;
    shadowColor?: string;
    shadowBlur?: number;
    opacity: number;
    textAlign: 'left' | 'center' | 'right';
  };
  position: {
    x: number; // 0-1 normalised
    y: number; // 0-1 normalised
    width: number;
    height: number;
  };
  background?: {
    type: 'none' | 'solid' | 'gradient';
    color?: string;
    gradientColors?: string[];
    opacity?: number;
  };
  animation?: {
    type: 'none' | 'fade-in' | 'slide-up' | 'typewriter' | 'scale-in';
    duration: number; // frames
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Clamp a number to a range.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Ease-out cubic for smooth animation curves.
 */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Build the CSS font shorthand from style properties.
 */
function buildFontString(style: TitleData['style']): string {
  return `${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`;
}

/**
 * Word-wrap text to fit within a maximum pixel width.
 *
 * Measures each word using the context and breaks the text into lines
 * that do not exceed `maxWidth`.
 *
 * @param ctx      The 2D rendering context (must already have the font set).
 * @param text     The raw text string to wrap.
 * @param maxWidth Maximum pixel width for a single line.
 * @returns Array of wrapped lines.
 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  if (maxWidth <= 0) return [text];

  const paragraphs = text.split('\n');
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(' ');
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(testLine);

      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    lines.push(currentLine);
  }

  return lines;
}

// ─── Animation Calculators ─────────────────────────────────────────────────

interface AnimationResult {
  /** Effective opacity multiplier (0-1). */
  opacity: number;
  /** Vertical pixel offset to apply. */
  offsetY: number;
  /** Scale factor (1.0 = normal). */
  scale: number;
  /** Number of visible characters (Infinity = all). */
  visibleChars: number;
}

/**
 * Compute the animation state for the current frame.
 *
 * @param animation The animation definition from TitleData.
 * @param currentFrame Current playback frame number.
 * @param canvasHeight Full canvas height (used for slide offset calculation).
 * @returns An AnimationResult with modifiers for the renderer.
 */
function computeAnimation(
  animation: TitleData['animation'] | undefined,
  currentFrame: number,
  canvasHeight: number,
): AnimationResult {
  const result: AnimationResult = {
    opacity: 1,
    offsetY: 0,
    scale: 1,
    visibleChars: Infinity,
  };

  if (!animation || animation.type === 'none' || animation.duration <= 0) {
    return result;
  }

  const progress = clamp(currentFrame / animation.duration, 0, 1);
  const eased = easeOutCubic(progress);

  switch (animation.type) {
    case 'fade-in':
      result.opacity = eased;
      break;

    case 'slide-up': {
      result.opacity = eased;
      // Start 15% of canvas height below the target position and slide up
      const slideDistance = canvasHeight * 0.15;
      result.offsetY = slideDistance * (1 - eased);
      break;
    }

    case 'typewriter':
      // Store progress as a 0-1 fraction; the renderer maps this to total
      // character count so text is revealed character by character.
      result.visibleChars = progress >= 1 ? Infinity : progress;
      break;

    case 'scale-in': {
      result.opacity = eased;
      // Scale from 0.5 to 1.0
      result.scale = 0.5 + 0.5 * eased;
      break;
    }
  }

  return result;
}

// ─── Background Rendering ──────────────────────────────────────────────────

/**
 * Draw the title background rectangle.
 *
 * Supports solid colour or linear gradient fills with an independent
 * opacity value.
 *
 * @param ctx        The 2D rendering context.
 * @param background Background definition from TitleData.
 * @param x          Left edge in pixels.
 * @param y          Top edge in pixels.
 * @param w          Width in pixels.
 * @param h          Height in pixels.
 */
function renderBackground(
  ctx: CanvasRenderingContext2D,
  background: TitleData['background'],
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  if (!background || background.type === 'none') return;

  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = background.opacity ?? 1;

  if (background.type === 'solid' && background.color) {
    ctx.fillStyle = background.color;
    ctx.fillRect(x, y, w, h);
  } else if (background.type === 'gradient' && background.gradientColors && background.gradientColors.length >= 2) {
    const gradient = ctx.createLinearGradient(x, y, x + w, y);
    const stops = background.gradientColors.length;
    for (let i = 0; i < stops; i++) {
      gradient.addColorStop(i / (stops - 1), background.gradientColors[i]!);
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, w, h);
  }

  ctx.globalAlpha = prevAlpha;
}

// ─── Main Render Function ──────────────────────────────────────────────────

/**
 * Render a title overlay onto a CanvasRenderingContext2D.
 *
 * Handles text measurement, word wrapping, background rendering,
 * outline/stroke text, shadows, and per-frame animation.
 *
 * @param ctx          Target 2D rendering context.
 * @param title        The title data to render.
 * @param canvasWidth  Width of the canvas in pixels.
 * @param canvasHeight Height of the canvas in pixels.
 * @param currentFrame Current frame number within the title's lifespan.
 * @param fps          Frames per second (reserved for future time-based calculations).
 */
export function renderTitle(
  ctx: CanvasRenderingContext2D,
  title: TitleData,
  canvasWidth: number,
  canvasHeight: number,
  currentFrame: number,
  fps: number,
): void {
  if (!title.text) return;

  const { style, position, background, animation } = title;

  // ── Compute animation state ────────────────────────────────────────────
  const anim = computeAnimation(animation, currentFrame, canvasHeight);

  // Skip rendering if fully transparent
  const effectiveOpacity = style.opacity * anim.opacity;
  if (effectiveOpacity <= 0) return;

  // ── Resolve pixel positions ────────────────────────────────────────────
  const posX = position.x * canvasWidth;
  const posY = position.y * canvasHeight + anim.offsetY;
  const boxWidth = position.width * canvasWidth;
  const boxHeight = position.height * canvasHeight;

  // ── Save context state ─────────────────────────────────────────────────
  ctx.save();

  // ── Apply scale-in transform ───────────────────────────────────────────
  if (anim.scale !== 1) {
    const centerX = posX + boxWidth / 2;
    const centerY = posY + boxHeight / 2;
    ctx.translate(centerX, centerY);
    ctx.scale(anim.scale, anim.scale);
    ctx.translate(-centerX, -centerY);
  }

  // ── Render background ──────────────────────────────────────────────────
  renderBackground(ctx, background, posX, posY, boxWidth, boxHeight);

  // ── Configure text rendering ───────────────────────────────────────────
  ctx.font = buildFontString(style);
  ctx.textBaseline = 'top';
  ctx.textAlign = style.textAlign;
  ctx.globalAlpha = effectiveOpacity;

  // ── Shadow ─────────────────────────────────────────────────────────────
  if (style.shadowColor && style.shadowBlur) {
    ctx.shadowColor = style.shadowColor;
    ctx.shadowBlur = style.shadowBlur;
  } else {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }

  // ── Word wrap ──────────────────────────────────────────────────────────
  const lines = wrapText(ctx, title.text, boxWidth);
  const lineHeight = style.fontSize * 1.3;

  // ── Determine text anchor X based on alignment ─────────────────────────
  let textX: number;
  switch (style.textAlign) {
    case 'left':
      textX = posX;
      break;
    case 'center':
      textX = posX + boxWidth / 2;
      break;
    case 'right':
      textX = posX + boxWidth;
      break;
  }

  // ── Typewriter: calculate total visible characters ─────────────────────
  let totalChars = 0;
  if (animation?.type === 'typewriter') {
    const fullLength = lines.reduce((sum, line) => sum + line.length, 0);
    totalChars = Math.floor(anim.visibleChars * fullLength);
  }

  // ── Render each line ───────────────────────────────────────────────────
  let charsRendered = 0;

  for (let i = 0; i < lines.length; i++) {
    let lineText = lines[i];
    const lineY = posY + i * lineHeight;

    // Typewriter: truncate text per line
    if (animation?.type === 'typewriter') {
      const remaining = totalChars - charsRendered;
      if (remaining <= 0) break;
      if (remaining < lineText!.length!) {
        lineText = lineText!.substring(0, remaining)!;
      }
      charsRendered += lineText!.length!;
    }

    // ── Outline / Stroke text ──────────────────────────────────────────
    if (style.outlineColor && style.outlineWidth && style.outlineWidth > 0) {
      ctx.strokeStyle = style.outlineColor;
      ctx.lineWidth = style.outlineWidth * 2; // *2 because strokeText straddles the path
      ctx.lineJoin = 'round';
      ctx.strokeText(lineText!, textX, lineY);
    }

    // ── Fill text ──────────────────────────────────────────────────────
    ctx.fillStyle = style.color;
    ctx.fillText(lineText!, textX, lineY);
  }

  // ── Restore context state ──────────────────────────────────────────────
  ctx.restore();
}
