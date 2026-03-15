// =============================================================================
//  Boris FX Warp Effects
//  Corner Pin, Mesh Warp, Ripple, Wave, Twirl, Sphere
// =============================================================================

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/**
 * Bilinear sample from source data at floating-point coordinates.
 * Returns [r, g, b, a] or fill color if out of bounds.
 */
function bilinearSample(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  sx: number,
  sy: number,
): [number, number, number, number] {
  if (sx < 0 || sx >= width - 1 || sy < 0 || sy >= height - 1) {
    return [0, 0, 0, 0]; // transparent for OOB
  }

  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const fx = sx - x0;
  const fy = sy - y0;

  const i00 = (y0 * width + x0) * 4;
  const i10 = (y0 * width + x1) * 4;
  const i01 = (y1 * width + x0) * 4;
  const i11 = (y1 * width + x1) * 4;

  const r = src[i00]! * (1 - fx) * (1 - fy) + src[i10]! * fx * (1 - fy) + src[i01]! * (1 - fx) * fy + src[i11]! * fx * fy;
  const g = src[i00 + 1]! * (1 - fx) * (1 - fy) + src[i10 + 1]! * fx * (1 - fy) + src[i01 + 1]! * (1 - fx) * fy + src[i11 + 1]! * fx * fy;
  const b = src[i00 + 2]! * (1 - fx) * (1 - fy) + src[i10 + 2]! * fx * (1 - fy) + src[i01 + 2]! * (1 - fx) * fy + src[i11 + 2]! * fx * fy;
  const a = src[i00 + 3]! * (1 - fx) * (1 - fy) + src[i10 + 3]! * fx * (1 - fy) + src[i01 + 3]! * (1 - fx) * fy + src[i11 + 3]! * fx * fy;

  return [Math.round(r), Math.round(g), Math.round(b), Math.round(a)];
}

// ─── Corner Pin ──────────────────────────────────────────────────────────────

/**
 * Apply a perspective transform via corner pinning.
 * Maps the image from its rectangular bounds to four arbitrary corner points.
 *
 * @param imageData Source image (modified in place)
 * @param tlX       Top-left X (0-100)
 * @param tlY       Top-left Y (0-100)
 * @param trX       Top-right X (0-100)
 * @param trY       Top-right Y (0-100)
 * @param blX       Bottom-left X (0-100)
 * @param blY       Bottom-left Y (0-100)
 * @param brX       Bottom-right X (0-100)
 * @param brY       Bottom-right Y (0-100)
 */
export function applyCornerPin(
  imageData: ImageData,
  tlX: number, tlY: number,
  trX: number, trY: number,
  blX: number, blY: number,
  brX: number, brY: number,
): void {
  // Skip if corners are at default positions (no transformation needed)
  if (tlX === 0 && tlY === 0 && trX === 100 && trY === 0 &&
      blX === 0 && blY === 100 && brX === 100 && brY === 100) {
    return;
  }

  const { width, height, data } = imageData;
  const src = new Uint8ClampedArray(data);

  // Convert percentage to pixel coordinates
  const tl = { x: (tlX / 100) * width, y: (tlY / 100) * height };
  const tr = { x: (trX / 100) * width, y: (trY / 100) * height };
  const bl = { x: (blX / 100) * width, y: (blY / 100) * height };
  const br = { x: (brX / 100) * width, y: (brY / 100) * height };

  // For each output pixel, find the corresponding source pixel
  // using inverse bilinear interpolation
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Normalize output coordinates to 0-1
      const u = x / width;
      const v = y / height;

      // Bilinear interpolation of corner positions to find source coordinates
      const srcX = (1 - u) * (1 - v) * tl.x + u * (1 - v) * tr.x + (1 - u) * v * bl.x + u * v * br.x;
      const srcY = (1 - u) * (1 - v) * tl.y + u * (1 - v) * tr.y + (1 - u) * v * bl.y + u * v * br.y;

      // We need the inverse: given output (x,y), what source pixel maps here?
      // Using forward mapping approach: for each output pixel at (x,y),
      // compute which normalized (u,v) would map to this output position,
      // then sample from that (u,v) in the source.

      // Since we're doing the forward warp: source(u,v) -> dest(x,y),
      // we need to invert. For simplicity, use the direct inverse approximation:
      // Map the output pixel back through the inverse transform.

      // Alternative approach: iterate source UV and map to output pixel
      // For each output pixel, compute corresponding source position
      // by solving the bilinear equation system.

      // Simplified approach: the forward transform maps source(u,v) to
      // dest = lerp(lerp(TL,TR,u), lerp(BL,BR,u), v)
      // The inverse maps dest(x,y) back to source(u*W, v*H)

      // For the inverse, we need to solve:
      // x = (1-u)*(1-v)*tl.x + u*(1-v)*tr.x + (1-u)*v*bl.x + u*v*br.x
      // y = (1-u)*(1-v)*tl.y + u*(1-v)*tr.y + (1-u)*v*bl.y + u*v*br.y

      // Newton's method for inverse bilinear
      let su = x / width;
      let sv = y / height;

      for (let iter = 0; iter < 5; iter++) {
        const fx = (1 - su) * (1 - sv) * tl.x + su * (1 - sv) * tr.x + (1 - su) * sv * bl.x + su * sv * br.x - x;
        const fy = (1 - su) * (1 - sv) * tl.y + su * (1 - sv) * tr.y + (1 - su) * sv * bl.y + su * sv * br.y - y;

        // Jacobian
        const dxdu = -(1 - sv) * tl.x + (1 - sv) * tr.x - sv * bl.x + sv * br.x;
        const dxdv = -(1 - su) * tl.x - su * tr.x + (1 - su) * bl.x + su * br.x;
        const dydu = -(1 - sv) * tl.y + (1 - sv) * tr.y - sv * bl.y + sv * br.y;
        const dydv = -(1 - su) * tl.y - su * tr.y + (1 - su) * bl.y + su * br.y;

        const det = dxdu * dydv - dxdv * dydu;
        if (Math.abs(det) < 1e-10) break;

        su -= (dydv * fx - dxdv * fy) / det;
        sv -= (dxdu * fy - dydu * fx) / det;
      }

      const idx = (y * width + x) * 4;
      const sampleX = su * width;
      const sampleY = sv * height;

      if (sampleX >= 0 && sampleX < width - 1 && sampleY >= 0 && sampleY < height - 1) {
        const [r, g, b, a] = bilinearSample(src, width, height, sampleX, sampleY);
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = a;
      } else {
        data[idx] = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = 0;
      }
    }
  }
}

// ─── Mesh Warp ───────────────────────────────────────────────────────────────

/**
 * Apply a mesh-based warp deformation. The grid is initially uniform;
 * this implementation generates a sinusoidal deformation for demonstration.
 * A full implementation would accept user-displaced grid points.
 *
 * @param imageData Source image (modified in place)
 * @param gridRows  Number of grid rows (2-20)
 * @param gridCols  Number of grid columns (2-20)
 */
export function applyMeshWarp(
  imageData: ImageData,
  gridRows: number,
  gridCols: number,
): void {
  const { width, height, data } = imageData;
  const src = new Uint8ClampedArray(data);

  // Generate mesh grid with subtle wave deformation for demonstration
  // In a full implementation, these offsets would come from user interaction
  const cellW = width / gridCols;
  const cellH = height / gridRows;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Determine which grid cell this pixel is in
      const gridX = x / cellW;
      const gridY = y / cellH;

      // Local coordinates within the cell (0-1)
      const localX = gridX - Math.floor(gridX);
      const localY = gridY - Math.floor(gridY);

      // Apply subtle sinusoidal mesh deformation based on grid position
      const meshOffsetX = Math.sin(gridY * Math.PI / gridRows) * (cellW * 0.1);
      const meshOffsetY = Math.sin(gridX * Math.PI / gridCols) * (cellH * 0.1);

      const srcX = x - meshOffsetX;
      const srcY = y - meshOffsetY;

      const idx = (y * width + x) * 4;

      if (srcX >= 0 && srcX < width - 1 && srcY >= 0 && srcY < height - 1) {
        const [r, g, b, a] = bilinearSample(src, width, height, srcX, srcY);
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = a;
      } else {
        data[idx] = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = 0;
      }
    }
  }
}

// ─── Ripple ──────────────────────────────────────────────────────────────────

/**
 * Apply a concentric ripple distortion from a center point.
 *
 * @param imageData  Source image (modified in place)
 * @param amplitude  0-200px — wave height
 * @param wavelength 1-500px — distance between ripple peaks
 * @param phase      0-360deg — phase offset for animation
 * @param damping    0-100% — fade ripple with distance from center
 * @param cx         0-100% — center X position
 * @param cy         0-100% — center Y position
 */
export function applyRipple(
  imageData: ImageData,
  amplitude: number,
  wavelength: number,
  phase: number,
  damping: number,
  cx: number,
  cy: number,
): void {
  if (amplitude <= 0) return;

  const { width, height, data } = imageData;
  const src = new Uint8ClampedArray(data);
  const centerX = (cx / 100) * width;
  const centerY = (cy / 100) * height;
  const phaseRad = (phase * Math.PI) / 180;
  const dampNorm = damping / 100;
  const maxDist = Math.sqrt(width * width + height * height) * 0.5;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - centerX;
      const dy = y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 1) {
        continue; // center pixel unchanged
      }

      // Calculate ripple displacement
      const dampFactor = dampNorm > 0 ? Math.max(0, 1.0 - (dist / maxDist) * dampNorm) : 1.0;
      const displacement = amplitude * Math.sin((dist / wavelength) * Math.PI * 2 + phaseRad) * dampFactor;

      // Displace radially
      const nx = dx / dist;
      const ny = dy / dist;
      const srcX = x + nx * displacement;
      const srcY = y + ny * displacement;

      const idx = (y * width + x) * 4;

      if (srcX >= 0 && srcX < width - 1 && srcY >= 0 && srcY < height - 1) {
        const [r, g, b, a] = bilinearSample(src, width, height, srcX, srcY);
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = a;
      } else {
        data[idx] = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = 0;
      }
    }
  }
}

// ─── Wave ────────────────────────────────────────────────────────────────────

/**
 * Apply a directional wave distortion.
 *
 * @param imageData  Source image (modified in place)
 * @param amplitude  0-200px — wave height
 * @param wavelength 1-500px — distance between wave peaks
 * @param direction  0-360deg — wave propagation direction
 * @param waveType   'sine' | 'triangle' | 'square' — wave shape
 */
export function applyWave(
  imageData: ImageData,
  amplitude: number,
  wavelength: number,
  direction: number,
  waveType: string,
): void {
  if (amplitude <= 0) return;

  const { width, height, data } = imageData;
  const src = new Uint8ClampedArray(data);
  const dirRad = (direction * Math.PI) / 180;
  const dirX = Math.cos(dirRad);
  const dirY = Math.sin(dirRad);
  // Perpendicular direction for displacement
  const perpX = -dirY;
  const perpY = dirX;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Project pixel position onto wave direction
      const projDist = x * dirX + y * dirY;
      const phase = (projDist / wavelength) * Math.PI * 2;

      // Calculate wave value based on type
      let waveVal: number;
      switch (waveType) {
        case 'triangle': {
          const t = ((phase / (Math.PI * 2)) % 1 + 1) % 1;
          waveVal = t < 0.5 ? 4 * t - 1 : 3 - 4 * t;
          break;
        }
        case 'square':
          waveVal = Math.sin(phase) >= 0 ? 1 : -1;
          break;
        default: // sine
          waveVal = Math.sin(phase);
          break;
      }

      const displacement = waveVal * amplitude;

      // Displace perpendicular to wave direction
      const srcX = x - perpX * displacement;
      const srcY = y - perpY * displacement;

      const idx = (y * width + x) * 4;

      if (srcX >= 0 && srcX < width - 1 && srcY >= 0 && srcY < height - 1) {
        const [r, g, b, a] = bilinearSample(src, width, height, srcX, srcY);
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = a;
      } else {
        data[idx] = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = 0;
      }
    }
  }
}

// ─── Twirl ───────────────────────────────────────────────────────────────────

/**
 * Apply a twirl/swirl distortion centered at a specified point.
 *
 * @param imageData Source image (modified in place)
 * @param angle     -720 to 720deg — twist angle (positive = clockwise)
 * @param radius    0-100% — radius of the twirl effect as percentage of image diagonal
 * @param cx        0-100% — center X position
 * @param cy        0-100% — center Y position
 */
export function applyTwirl(
  imageData: ImageData,
  angle: number,
  radius: number,
  cx: number,
  cy: number,
): void {
  if (angle === 0) return;

  const { width, height, data } = imageData;
  const src = new Uint8ClampedArray(data);
  const centerX = (cx / 100) * width;
  const centerY = (cy / 100) * height;
  const maxDist = Math.sqrt(width * width + height * height) * 0.5;
  const twirlRadius = (radius / 100) * maxDist;
  const angleRad = (angle * Math.PI) / 180;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - centerX;
      const dy = y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const idx = (y * width + x) * 4;

      if (dist < twirlRadius && dist > 0) {
        // Calculate twist amount based on distance from center
        // More twist at center, fading to zero at radius edge
        const t = 1.0 - (dist / twirlRadius);
        const twirlAngle = t * t * angleRad; // quadratic falloff

        // Rotate the sampling point
        const cosA = Math.cos(twirlAngle);
        const sinA = Math.sin(twirlAngle);
        const srcX = centerX + dx * cosA - dy * sinA;
        const srcY = centerY + dx * sinA + dy * cosA;

        if (srcX >= 0 && srcX < width - 1 && srcY >= 0 && srcY < height - 1) {
          const [r, g, b, a] = bilinearSample(src, width, height, srcX, srcY);
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = a;
        } else {
          data[idx] = 0;
          data[idx + 1] = 0;
          data[idx + 2] = 0;
          data[idx + 3] = 0;
        }
      }
      // Outside twirl radius: keep original pixels
    }
  }
}

// ─── Sphere ──────────────────────────────────────────────────────────────────

/**
 * Apply a spherical lens distortion.
 *
 * @param imageData  Source image (modified in place)
 * @param radius     0-100% — radius of the sphere as percentage of image diagonal
 * @param refraction -100 to 100 — refraction index (positive = magnify, negative = minify)
 * @param cx         0-100% — center X position
 * @param cy         0-100% — center Y position
 */
export function applySphere(
  imageData: ImageData,
  radius: number,
  refraction: number,
  cx: number,
  cy: number,
): void {
  if (radius <= 0 || refraction === 0) return;

  const { width, height, data } = imageData;
  const src = new Uint8ClampedArray(data);
  const centerX = (cx / 100) * width;
  const centerY = (cy / 100) * height;
  const maxDist = Math.sqrt(width * width + height * height) * 0.5;
  const sphereRadius = (radius / 100) * maxDist;
  const refrNorm = refraction / 100;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - centerX;
      const dy = y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const idx = (y * width + x) * 4;

      if (dist < sphereRadius) {
        // Calculate spherical refraction
        const normalizedDist = dist / sphereRadius;

        // Compute the 3D position on the sphere surface
        const z = Math.sqrt(1.0 - normalizedDist * normalizedDist);

        // Refraction displacement
        // Positive refraction magnifies (zoom in), negative minifies (zoom out)
        const refractionAmount = refrNorm * (1.0 - z);
        const srcX = centerX + dx * (1.0 - refractionAmount);
        const srcY = centerY + dy * (1.0 - refractionAmount);

        if (srcX >= 0 && srcX < width - 1 && srcY >= 0 && srcY < height - 1) {
          const [r, g, b, a] = bilinearSample(src, width, height, srcX, srcY);
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = a;
        } else {
          data[idx] = 0;
          data[idx + 1] = 0;
          data[idx + 2] = 0;
          data[idx + 3] = 0;
        }
      }
      // Outside sphere: keep original pixels
    }
  }
}
