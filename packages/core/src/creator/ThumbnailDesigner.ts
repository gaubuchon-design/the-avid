// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — Thumbnail Designer Engine (CC-03)
//  Frame selection, text overlays, face cutout, color boost
// ═══════════════════════════════════════════════════════════════════════════

import { generateId } from '../utils';
import {
  TextOverlay,
  ThumbnailBackground,
  ThumbnailDesign,
  ThumbnailCandidate,
  ThumbnailExportSize,
  THUMBNAIL_EXPORT_SIZES,
  ColorBoostPreset,
} from './types';

// ─── Built-in Color Boost Presets ─────────────────────────────────────────

export const COLOR_BOOST_PRESETS: ColorBoostPreset[] = [
  {
    id: 'vibrant',
    name: 'Vibrant',
    saturation: 1.35,
    contrast: 1.15,
    brightness: 1.05,
    warmth: 0.1,
    vibrance: 1.4,
  },
  {
    id: 'warm-pop',
    name: 'Warm Pop',
    saturation: 1.2,
    contrast: 1.2,
    brightness: 1.1,
    warmth: 0.3,
    vibrance: 1.25,
  },
  {
    id: 'cool-cinema',
    name: 'Cool Cinema',
    saturation: 0.9,
    contrast: 1.3,
    brightness: 0.95,
    warmth: -0.2,
    vibrance: 1.1,
  },
  {
    id: 'high-contrast',
    name: 'High Contrast',
    saturation: 1.1,
    contrast: 1.5,
    brightness: 1.0,
    warmth: 0,
    vibrance: 1.15,
  },
  {
    id: 'soft-glow',
    name: 'Soft Glow',
    saturation: 1.15,
    contrast: 0.85,
    brightness: 1.15,
    warmth: 0.15,
    vibrance: 1.3,
  },
  {
    id: 'dramatic',
    name: 'Dramatic',
    saturation: 0.85,
    contrast: 1.45,
    brightness: 0.9,
    warmth: -0.1,
    vibrance: 1.0,
  },
];

// ─── Default Text Styles ──────────────────────────────────────────────────

export const TEXT_STYLE_PRESETS: Omit<TextOverlay, 'id' | 'text' | 'position'>[] = [
  {
    fontSize: 64,
    fontFamily: 'Inter',
    fontWeight: 900,
    color: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 3,
    shadowColor: 'rgba(0,0,0,0.5)',
    shadowBlur: 8,
    rotation: 0,
    opacity: 1,
  },
  {
    fontSize: 48,
    fontFamily: 'Inter',
    fontWeight: 700,
    color: '#FFD700',
    strokeColor: '#000000',
    strokeWidth: 2,
    shadowColor: 'rgba(0,0,0,0.6)',
    shadowBlur: 6,
    rotation: 0,
    opacity: 1,
  },
  {
    fontSize: 36,
    fontFamily: 'Inter',
    fontWeight: 600,
    color: '#FF4444',
    strokeColor: '#FFFFFF',
    strokeWidth: 2,
    rotation: -3,
    opacity: 1,
  },
  {
    fontSize: 28,
    fontFamily: 'Inter',
    fontWeight: 500,
    color: '#FFFFFF',
    rotation: 0,
    opacity: 0.9,
  },
];

// ─── AI Frame Scoring ─────────────────────────────────────────────────────

function scoreFrame(
  time: number,
  totalDuration: number,
  hasTranscript: boolean,
): ThumbnailCandidate {
  // Simulated AI frame analysis
  // In production, this would analyze actual frame pixel data

  // Prefer frames from the first third (usually more context)
  const positionScore = time < totalDuration * 0.33 ? 0.8 : time < totalDuration * 0.66 ? 0.6 : 0.4;

  // Simulate face detection
  const hasFaces = Math.random() > 0.3;
  const faceScore = hasFaces ? 0.3 : 0;

  // Simulate composition quality (rule of thirds, sharpness, etc.)
  const compositionScore = 0.3 + Math.random() * 0.4;

  // Simulate color variety
  const colorScore = 0.2 + Math.random() * 0.3;

  const totalScore = Math.min(1, positionScore * 0.25 + faceScore + compositionScore * 0.25 + colorScore * 0.2);

  // Generate reason
  const reasons: string[] = [];
  if (hasFaces) reasons.push('Contains faces');
  if (compositionScore > 0.5) reasons.push('Strong composition');
  if (colorScore > 0.35) reasons.push('Vivid colors');
  if (positionScore > 0.7) reasons.push('Early in video (context)');

  // Simulate dominant colors
  const palettes = [
    ['#2563eb', '#f59e0b', '#1e1e1e'],
    ['#dc2626', '#fafafa', '#171717'],
    ['#059669', '#f97316', '#1f2937'],
    ['#7c3aed', '#fbbf24', '#111827'],
    ['#0891b2', '#f43f5e', '#0f172a'],
  ];
  const dominantColors = palettes[Math.floor(Math.random() * palettes.length)]!;

  return {
    frameTime: time,
    score: totalScore,
    reason: reasons.join(', ') || 'General quality',
    hasFaces,
    dominantColors,
  };
}

// ─── Canvas Rendering (offscreen) ─────────────────────────────────────────

function applyColorBoost(
  imageData: ImageData,
  preset: ColorBoostPreset,
): ImageData {
  // Simplified color boost -- in production would use WebGL shaders
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i]!;
    let g = data[i + 1]!;
    let b = data[i + 2]!;

    // Brightness
    r = Math.min(255, r * preset.brightness);
    g = Math.min(255, g * preset.brightness);
    b = Math.min(255, b * preset.brightness);

    // Contrast
    const factor = (259 * (preset.contrast * 128 + 255)) / (255 * (259 - preset.contrast * 128));
    r = Math.min(255, Math.max(0, factor * (r - 128) + 128));
    g = Math.min(255, Math.max(0, factor * (g - 128) + 128));
    b = Math.min(255, Math.max(0, factor * (b - 128) + 128));

    // Saturation
    const gray = 0.2989 * r + 0.587 * g + 0.114 * b;
    r = Math.min(255, Math.max(0, gray + preset.saturation * (r - gray)));
    g = Math.min(255, Math.max(0, gray + preset.saturation * (g - gray)));
    b = Math.min(255, Math.max(0, gray + preset.saturation * (b - gray)));

    // Warmth
    if (preset.warmth > 0) {
      r = Math.min(255, r + preset.warmth * 20);
      b = Math.max(0, b - preset.warmth * 10);
    } else if (preset.warmth < 0) {
      b = Math.min(255, b - preset.warmth * 20);
      r = Math.max(0, r + preset.warmth * 10);
    }

    data[i] = Math.round(r);
    data[i + 1] = Math.round(g);
    data[i + 2] = Math.round(b);
  }

  return imageData;
}

// ─── Main Designer Class ──────────────────────────────────────────────────

export class ThumbnailDesignerEngine {
  private designs: ThumbnailDesign[] = [];

  /**
   * Create a new thumbnail design
   */
  createDesign(options?: Partial<ThumbnailDesign>): ThumbnailDesign {
    const now = new Date().toISOString();
    const design: ThumbnailDesign = {
      id: generateId(),
      frameTime: options?.frameTime ?? 0,
      textOverlays: options?.textOverlays ?? [],
      background: options?.background ?? { type: 'frame', frameTime: options?.frameTime ?? 0 },
      colorBoost: options?.colorBoost ?? null,
      exportSize: options?.exportSize ?? THUMBNAIL_EXPORT_SIZES[0]!,
      faceCutout: options?.faceCutout,
      createdAt: now,
      updatedAt: now,
    };

    this.designs.push(design);
    return design;
  }

  /**
   * Update an existing design
   */
  updateDesign(id: string, updates: Partial<ThumbnailDesign>): ThumbnailDesign | null {
    const index = this.designs.findIndex((d) => d.id === id);
    if (index === -1) return null;

    const existing = this.designs[index]!;
    const updated: ThumbnailDesign = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.designs[index] = updated;
    return updated;
  }

  /**
   * Delete a design
   */
  deleteDesign(id: string): boolean {
    const index = this.designs.findIndex((d) => d.id === id);
    if (index === -1) return false;
    this.designs.splice(index, 1);
    return true;
  }

  /**
   * Get all designs
   */
  getDesigns(): ThumbnailDesign[] {
    return [...this.designs];
  }

  /**
   * Get design by ID
   */
  getDesign(id: string): ThumbnailDesign | null {
    return this.designs.find((d) => d.id === id) ?? null;
  }

  /**
   * Add text overlay to a design
   */
  addTextOverlay(
    designId: string,
    text: string,
    options?: Partial<TextOverlay>,
  ): TextOverlay | null {
    const design = this.designs.find((d) => d.id === designId);
    if (!design) return null;

    const overlay: TextOverlay = {
      id: generateId(),
      text,
      position: options?.position ?? { x: 0.5, y: 0.5 },
      fontSize: options?.fontSize ?? 48,
      fontFamily: options?.fontFamily ?? 'Inter',
      fontWeight: options?.fontWeight ?? 700,
      color: options?.color ?? '#FFFFFF',
      strokeColor: options?.strokeColor,
      strokeWidth: options?.strokeWidth,
      shadowColor: options?.shadowColor,
      shadowBlur: options?.shadowBlur,
      rotation: options?.rotation ?? 0,
      opacity: options?.opacity ?? 1,
      maxWidth: options?.maxWidth,
    };

    design.textOverlays.push(overlay);
    design.updatedAt = new Date().toISOString();
    return overlay;
  }

  /**
   * Update a text overlay
   */
  updateTextOverlay(
    designId: string,
    overlayId: string,
    updates: Partial<TextOverlay>,
  ): boolean {
    const design = this.designs.find((d) => d.id === designId);
    if (!design) return false;

    const overlay = design.textOverlays.find((o) => o.id === overlayId);
    if (!overlay) return false;

    Object.assign(overlay, updates);
    design.updatedAt = new Date().toISOString();
    return true;
  }

  /**
   * Remove a text overlay
   */
  removeTextOverlay(designId: string, overlayId: string): boolean {
    const design = this.designs.find((d) => d.id === designId);
    if (!design) return false;

    const index = design.textOverlays.findIndex((o) => o.id === overlayId);
    if (index === -1) return false;

    design.textOverlays.splice(index, 1);
    design.updatedAt = new Date().toISOString();
    return true;
  }

  /**
   * AI: Suggest best thumbnail frames
   */
  suggestThumbnailCandidates(
    totalDuration: number,
    sampleCount = 10,
    hasTranscript = false,
  ): ThumbnailCandidate[] {
    const candidates: ThumbnailCandidate[] = [];
    const interval = totalDuration / (sampleCount + 1);

    for (let i = 1; i <= sampleCount; i++) {
      const time = interval * i;
      candidates.push(scoreFrame(time, totalDuration, hasTranscript));
    }

    // Also check specific moments (1/4, 1/3, 1/2 of duration)
    for (const fraction of [0.25, 0.33, 0.5]) {
      const time = totalDuration * fraction;
      const existing = candidates.find((c) => Math.abs(c.frameTime - time) < interval * 0.5);
      if (!existing) {
        candidates.push(scoreFrame(time, totalDuration, hasTranscript));
      }
    }

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score);

    return candidates.slice(0, sampleCount);
  }

  /**
   * Set background for a design
   */
  setBackground(designId: string, background: ThumbnailBackground): boolean {
    const design = this.designs.find((d) => d.id === designId);
    if (!design) return false;
    design.background = background;
    design.updatedAt = new Date().toISOString();
    return true;
  }

  /**
   * Set color boost for a design
   */
  setColorBoost(designId: string, preset: ColorBoostPreset | null): boolean {
    const design = this.designs.find((d) => d.id === designId);
    if (!design) return false;
    design.colorBoost = preset;
    design.updatedAt = new Date().toISOString();
    return true;
  }

  /**
   * Configure face cutout
   */
  setFaceCutout(
    designId: string,
    config: ThumbnailDesign['faceCutout'],
  ): boolean {
    const design = this.designs.find((d) => d.id === designId);
    if (!design) return false;
    design.faceCutout = config;
    design.updatedAt = new Date().toISOString();
    return true;
  }

  /**
   * Set export size
   */
  setExportSize(designId: string, size: ThumbnailExportSize): boolean {
    const design = this.designs.find((d) => d.id === designId);
    if (!design) return false;
    design.exportSize = size;
    design.updatedAt = new Date().toISOString();
    return true;
  }

  /**
   * Get available color boost presets
   */
  getColorBoostPresets(): ColorBoostPreset[] {
    return [...COLOR_BOOST_PRESETS];
  }

  /**
   * Get available export sizes
   */
  getExportSizes(): ThumbnailExportSize[] {
    return [...THUMBNAIL_EXPORT_SIZES];
  }

  /**
   * Duplicate a design
   */
  duplicateDesign(id: string): ThumbnailDesign | null {
    const original = this.designs.find((d) => d.id === id);
    if (!original) return null;

    const now = new Date().toISOString();
    const duplicate: ThumbnailDesign = {
      ...JSON.parse(JSON.stringify(original)),
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    };

    this.designs.push(duplicate);
    return duplicate;
  }

  /**
   * Generate export data for a design
   * Returns metadata needed by the renderer
   */
  getExportData(designId: string): {
    design: ThumbnailDesign;
    width: number;
    height: number;
    format: 'jpeg' | 'png';
    quality: number;
  } | null {
    const design = this.designs.find((d) => d.id === designId);
    if (!design) return null;

    return {
      design: JSON.parse(JSON.stringify(design)),
      width: design.exportSize.width,
      height: design.exportSize.height,
      format: 'jpeg',
      quality: 0.92,
    };
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────

export function createThumbnailDesigner(): ThumbnailDesignerEngine {
  return new ThumbnailDesignerEngine();
}
