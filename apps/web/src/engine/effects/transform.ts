// ═══════════════════════════════════════════════════════════════════════════
//  Transform Effects: Letterbox, Speed Ramp
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Apply a letterbox (black bars for cinematic aspect ratio).
 *
 * @param data    Pixel data (RGBA)
 * @param width   Image width
 * @param height  Image height
 * @param ratio   Target aspect ratio string ("2.39:1", "1.85:1", etc.)
 * @param color   Bar color hex
 * @param opacity Bar opacity 0-100
 */
export function applyLetterbox(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  ratio: string,
  color: string,
  opacity: number,
): void {
  if (opacity <= 0) return;

  const targetAR = parseAspectRatio(ratio);
  const currentAR = width / height;

  if (targetAR <= currentAR) return; // Already wider than target, no bars needed

  // Calculate bar height
  const targetHeight = width / targetAR;
  const barHeight = Math.round((height - targetHeight) / 2);

  if (barHeight <= 0) return;

  const barColor = hexToRgb(color);
  const opNorm = opacity / 100;

  for (let y = 0; y < height; y++) {
    const isBar = y < barHeight || y >= height - barHeight;
    if (!isBar) continue;

    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      data[idx]     = Math.round(data[idx] * (1 - opNorm) + barColor.r * opNorm);
      data[idx + 1] = Math.round(data[idx + 1] * (1 - opNorm) + barColor.g * opNorm);
      data[idx + 2] = Math.round(data[idx + 2] * (1 - opNorm) + barColor.b * opNorm);
    }
  }
}

/**
 * Speed ramp is a metadata-only effect — it changes playback speed,
 * not pixel data. This function returns the speed multiplier for a given frame.
 *
 * @param currentFrame    Current frame number within the clip
 * @param clipDuration    Total clip duration in frames
 * @param targetSpeed     Target speed percentage (100 = normal)
 * @param rampDuration    Ramp duration in frames
 * @param easing          Easing function name
 * @returns Speed multiplier at the current frame
 */
export function getSpeedRampMultiplier(
  currentFrame: number,
  clipDuration: number,
  targetSpeed: number,
  rampDuration: number,
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out',
): number {
  const speedMult = targetSpeed / 100;
  if (rampDuration <= 0) return speedMult;

  // Ramp up at start
  if (currentFrame < rampDuration) {
    const t = currentFrame / rampDuration;
    const eased = applyEasing(t, easing);
    return 1 + (speedMult - 1) * eased;
  }

  // Ramp down at end
  if (currentFrame > clipDuration - rampDuration) {
    const t = (clipDuration - currentFrame) / rampDuration;
    const eased = applyEasing(t, easing);
    return 1 + (speedMult - 1) * eased;
  }

  // Full speed in middle
  return speedMult;
}

function applyEasing(t: number, easing: string): number {
  const ct = Math.max(0, Math.min(1, t));
  switch (easing) {
    case 'ease-in':
      return ct * ct;
    case 'ease-out':
      return ct * (2 - ct);
    case 'ease-in-out':
      return ct < 0.5 ? 2 * ct * ct : -1 + (4 - 2 * ct) * ct;
    default: // linear
      return ct;
  }
}

function parseAspectRatio(ratio: string): number {
  const parts = ratio.split(':');
  if (parts.length === 2) {
    return parseFloat(parts[0]) / parseFloat(parts[1]);
  }
  return parseFloat(ratio) || 1.78;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const match = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!match) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16),
  };
}
