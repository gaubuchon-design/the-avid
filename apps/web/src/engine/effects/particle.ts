// =============================================================================
//  Boris FX Particle Illusion
//  Procedural particle system with multiple emitter types.
// =============================================================================

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const match = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!match) return { r: 255, g: 255, b: 255 };
  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16),
  };
}

// ─── Particle State ──────────────────────────────────────────────────────────

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;      // remaining lifetime in seconds
  maxLife: number;    // total lifetime
  size: number;       // radius in px
  r: number;
  g: number;
  b: number;
  alpha: number;
}

// ─── Emitter Presets ─────────────────────────────────────────────────────────

interface EmitterPreset {
  velocityRange: [number, number];
  angleRange: [number, number];   // degrees
  sizeRange: [number, number];
  lifetimeRange: [number, number];
  gravityMultiplier: number;
  colorVariation: number;         // 0-1
  fadeIn: number;                 // fraction of lifetime
  fadeOut: number;                // fraction of lifetime
  spread: number;                 // initial spread radius
}

const EMITTER_PRESETS: Record<string, EmitterPreset> = {
  spark: {
    velocityRange: [100, 300],
    angleRange: [200, 340],   // upward spray
    sizeRange: [1, 3],
    lifetimeRange: [0.3, 1.0],
    gravityMultiplier: 1.5,
    colorVariation: 0.2,
    fadeIn: 0.0,
    fadeOut: 0.6,
    spread: 5,
  },
  fire: {
    velocityRange: [30, 100],
    angleRange: [240, 300],   // mostly upward
    sizeRange: [3, 12],
    lifetimeRange: [0.5, 2.0],
    gravityMultiplier: -0.5,  // rises
    colorVariation: 0.3,
    fadeIn: 0.1,
    fadeOut: 0.5,
    spread: 10,
  },
  smoke: {
    velocityRange: [10, 40],
    angleRange: [250, 290],
    sizeRange: [8, 25],
    lifetimeRange: [2.0, 5.0],
    gravityMultiplier: -0.2,
    colorVariation: 0.1,
    fadeIn: 0.2,
    fadeOut: 0.4,
    spread: 15,
  },
  snow: {
    velocityRange: [10, 30],
    angleRange: [70, 110],    // downward
    sizeRange: [2, 5],
    lifetimeRange: [3.0, 8.0],
    gravityMultiplier: 0.3,
    colorVariation: 0.05,
    fadeIn: 0.1,
    fadeOut: 0.3,
    spread: 100,
  },
  rain: {
    velocityRange: [200, 400],
    angleRange: [80, 100],    // nearly straight down
    sizeRange: [1, 2],
    lifetimeRange: [0.5, 1.5],
    gravityMultiplier: 2.0,
    colorVariation: 0.05,
    fadeIn: 0.0,
    fadeOut: 0.1,
    spread: 100,
  },
  dust: {
    velocityRange: [2, 10],
    angleRange: [0, 360],     // all directions
    sizeRange: [1, 3],
    lifetimeRange: [3.0, 10.0],
    gravityMultiplier: 0.05,
    colorVariation: 0.3,
    fadeIn: 0.3,
    fadeOut: 0.3,
    spread: 80,
  },
  explosion: {
    velocityRange: [150, 500],
    angleRange: [0, 360],     // radial burst
    sizeRange: [2, 8],
    lifetimeRange: [0.3, 1.5],
    gravityMultiplier: 1.0,
    colorVariation: 0.4,
    fadeIn: 0.0,
    fadeOut: 0.7,
    spread: 5,
  },
};

// ─── Particle Illusion Class ─────────────────────────────────────────────────

/**
 * Particle Illusion — a procedural particle system.
 *
 * Usage:
 *   const pi = new ParticleIllusion();
 *   pi.configure({ emitterType: 'fire', birthRate: 50, ... });
 *   // On each frame:
 *   pi.render(imageData, frameNumber);
 */
export class ParticleIllusion {
  private particles: Particle[] = [];
  private emitterType = 'spark';
  private birthRate = 50;       // particles per second
  private lifetime = 2;         // base lifetime in seconds
  private velocity = 100;       // base velocity
  private gravity = 50;         // gravity strength (-100 to 100)
  private particleSize = 5;     // base size in px
  private baseColor = { r: 255, g: 255, b: 255 };
  private frameRate = 30;
  private lastFrame = -1;
  private emitAccumulator = 0;

  /**
   * Configure the particle system.
   */
  configure(params: {
    emitterType?: string;
    birthRate?: number;
    lifetime?: number;
    velocity?: number;
    gravity?: number;
    particleSize?: number;
    color?: string;
  }): void {
    if (params.emitterType !== undefined) this.emitterType = params.emitterType;
    if (params.birthRate !== undefined) this.birthRate = params.birthRate;
    if (params.lifetime !== undefined) this.lifetime = params.lifetime;
    if (params.velocity !== undefined) this.velocity = params.velocity;
    if (params.gravity !== undefined) this.gravity = params.gravity;
    if (params.particleSize !== undefined) this.particleSize = params.particleSize;
    if (params.color !== undefined) this.baseColor = hexToRgb(params.color);
  }

  /**
   * Reset the particle system state.
   */
  reset(): void {
    this.particles = [];
    this.lastFrame = -1;
    this.emitAccumulator = 0;
  }

  /**
   * Update particle physics and render onto imageData.
   *
   * @param imageData Target image (composited additively)
   * @param frame     Current frame number
   */
  render(imageData: ImageData, frame: number): void {
    const { width, height, data } = imageData;
    const preset = EMITTER_PRESETS[this.emitterType] || EMITTER_PRESETS.spark;

    // Calculate delta time
    const dt = this.lastFrame >= 0 ? Math.min((frame - this.lastFrame) / this.frameRate, 0.1) : 1 / this.frameRate;
    this.lastFrame = frame;

    // Emit new particles
    const emitCx = width / 2;
    const emitCy = height / 2;

    this.emitAccumulator += this.birthRate * dt;
    const toEmit = Math.floor(this.emitAccumulator);
    this.emitAccumulator -= toEmit;

    for (let i = 0; i < toEmit; i++) {
      const angleDeg = preset.angleRange[0] + Math.random() * (preset.angleRange[1] - preset.angleRange[0]);
      const angleRad = (angleDeg * Math.PI) / 180;
      const speed = (preset.velocityRange[0] + Math.random() * (preset.velocityRange[1] - preset.velocityRange[0])) * (this.velocity / 100);
      const life = (preset.lifetimeRange[0] + Math.random() * (preset.lifetimeRange[1] - preset.lifetimeRange[0])) * this.lifetime;
      const size = (preset.sizeRange[0] + Math.random() * (preset.sizeRange[1] - preset.sizeRange[0])) * (this.particleSize / 10);

      // Color variation
      const cv = preset.colorVariation;
      const cr = clamp(this.baseColor.r + (Math.random() - 0.5) * cv * 510);
      const cg = clamp(this.baseColor.g + (Math.random() - 0.5) * cv * 510);
      const cb = clamp(this.baseColor.b + (Math.random() - 0.5) * cv * 510);

      // Apply fire-specific color: yellow -> orange -> red over lifetime
      const particle: Particle = {
        x: emitCx + (Math.random() - 0.5) * preset.spread * 2,
        y: emitCy + (Math.random() - 0.5) * preset.spread * 2,
        vx: Math.cos(angleRad) * speed,
        vy: Math.sin(angleRad) * speed,
        life: life,
        maxLife: life,
        size: Math.max(1, size),
        r: cr,
        g: cg,
        b: cb,
        alpha: 1.0,
      };

      this.particles.push(particle);
    }

    // Update physics
    const gravityAccel = (this.gravity / 100) * 200 * preset.gravityMultiplier;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;

      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      // Apply gravity
      p.vy += gravityAccel * dt;

      // Add slight random drift for smoke/dust
      if (this.emitterType === 'smoke' || this.emitterType === 'dust') {
        p.vx += (Math.random() - 0.5) * 20 * dt;
      }

      // Add wind for snow
      if (this.emitterType === 'snow') {
        p.vx += Math.sin(frame * 0.05 + p.y * 0.01) * 10 * dt;
      }

      // Update position
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Calculate alpha based on lifetime phase
      const lifeRatio = 1.0 - (p.life / p.maxLife);
      if (lifeRatio < preset.fadeIn) {
        p.alpha = lifeRatio / preset.fadeIn;
      } else if (lifeRatio > (1.0 - preset.fadeOut)) {
        p.alpha = (1.0 - lifeRatio) / preset.fadeOut;
      } else {
        p.alpha = 1.0;
      }

      // Fire color shift: interpolate from base -> orange -> dark red
      if (this.emitterType === 'fire') {
        const t = lifeRatio;
        p.r = clamp(p.r * (1.0 - t * 0.3));
        p.g = clamp(p.g * (1.0 - t * 0.7));
        p.b = clamp(p.b * (1.0 - t * 0.9));
      }
    }

    // Render particles onto image
    for (const p of this.particles) {
      const px = Math.round(p.x);
      const py = Math.round(p.y);
      const r = Math.max(1, Math.round(p.size));
      const alpha = Math.max(0, Math.min(1, p.alpha));

      if (alpha <= 0) continue;

      // Draw filled circle
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > r) continue;

          const sx = px + dx;
          const sy = py + dy;
          if (sx < 0 || sx >= width || sy < 0 || sy >= height) continue;

          const idx = (sy * width + sx) * 4;
          const edgeFade = 1.0 - (dist / r);
          const a = alpha * edgeFade;

          // Additive blending for light-emitting particles
          if (this.emitterType === 'spark' || this.emitterType === 'fire' || this.emitterType === 'explosion') {
            data[idx] = clamp(data[idx] + p.r * a);
            data[idx + 1] = clamp(data[idx + 1] + p.g * a);
            data[idx + 2] = clamp(data[idx + 2] + p.b * a);
          } else {
            // Alpha blending for solid particles
            data[idx] = clamp(data[idx] * (1 - a) + p.r * a);
            data[idx + 1] = clamp(data[idx + 1] * (1 - a) + p.g * a);
            data[idx + 2] = clamp(data[idx + 2] * (1 - a) + p.b * a);
          }
        }
      }
    }
  }
}
