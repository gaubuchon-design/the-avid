// ─── Smart Color Pipeline Resolver ──────────────────────────────────────────
// Resolves the full source → working → output color transform chain,
// detects mismatches, and generates actionable warnings for the user.

import type { ColorSpaceId } from '../engine/gpu/shaders/colorSpaceTransform';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ResolvedColorPipeline {
  /** Detected or specified source color space. */
  sourceSpace: ColorSpaceId;
  /** Project/sequence working color space. */
  workingSpace: ColorSpaceId;
  /** Delivery/output color space. */
  outputSpace: ColorSpaceId;
  /** True when source → working transform is needed. */
  inputTransformNeeded: boolean;
  /** True when working → output transform is needed. */
  outputTransformNeeded: boolean;
  /** True when HDR-to-SDR or SDR-to-HDR tone mapping is required. */
  toneMapNeeded: boolean;
  /** Human-readable warnings about the pipeline configuration. */
  warnings: string[];
}

export interface SourceColorInfo {
  colorSpace?: string;
  hdrMode?: 'sdr' | 'hlg' | 'pq';
}

export interface SequenceColorSettings {
  colorSpace: string;
  displayTransform: string;
}

export interface DeliveryColorSettings {
  outputColorSpace?: string;
  hdrMode?: 'sdr' | 'hlg' | 'pq' | null;
}

// ─── HDR detection helpers ──────────────────────────────────────────────────

const HDR_COLOR_SPACES = new Set<string>(['rec2020', 'dci-p3', 'aces-linear', 'aces-cct']);

/** Map raw detected color space strings to canonical ColorSpaceId. */
function normalizeColorSpace(raw: string | undefined): ColorSpaceId {
  if (!raw) return 'rec709';
  const lower = raw.toLowerCase().replace(/[\s_-]/g, '');
  if (lower.includes('bt2020') || lower.includes('rec2020') || lower === '2020') return 'rec2020';
  if (lower.includes('dcip3') || lower.includes('displayp3') || lower.includes('p3')) return 'dci-p3';
  if (lower.includes('aceslinear') || lower.includes('ap0')) return 'aces-linear';
  if (lower.includes('acescct') || lower.includes('ap1')) return 'aces-cct';
  if (lower.includes('srgb')) return 'srgb';
  if (lower.includes('bt709') || lower.includes('rec709') || lower === '709') return 'rec709';
  return 'rec709';
}

function isHDRSpace(cs: ColorSpaceId): boolean {
  return HDR_COLOR_SPACES.has(cs);
}

function isHDRTransfer(hdrMode: string | undefined): boolean {
  return hdrMode === 'pq' || hdrMode === 'hlg';
}

// ─── Pipeline Resolver ──────────────────────────────────────────────────────

/**
 * Resolve the full color pipeline from source media through the working
 * timeline to the output/delivery destination.
 *
 * @param source     Color information from the source clip (probe results).
 * @param sequence   Color space settings from the active sequence.
 * @param delivery   Optional delivery spec color settings (for render/export).
 * @returns          Fully resolved pipeline with transform flags and warnings.
 */
export function resolveColorPipeline(
  source: SourceColorInfo | undefined,
  sequence: SequenceColorSettings,
  delivery?: DeliveryColorSettings,
): ResolvedColorPipeline {
  const warnings: string[] = [];

  // Resolve source
  const sourceSpace = normalizeColorSpace(source?.colorSpace);
  const sourceHDR = isHDRTransfer(source?.hdrMode) || isHDRSpace(sourceSpace);

  // Resolve working space from sequence
  const workingSpace = normalizeColorSpace(sequence.colorSpace) as ColorSpaceId;
  const workingHDR = isHDRSpace(workingSpace) || sequence.displayTransform.includes('hdr');

  // Resolve output space from delivery or fall back to working space
  const outputSpace = delivery?.outputColorSpace
    ? normalizeColorSpace(delivery.outputColorSpace)
    : workingSpace;
  const outputHDR = delivery?.hdrMode
    ? isHDRTransfer(delivery.hdrMode)
    : workingHDR;

  // Determine transform needs
  const inputTransformNeeded = sourceSpace !== workingSpace;
  const outputTransformNeeded = workingSpace !== outputSpace;

  // Tone mapping detection: HDR ↔ SDR mismatch
  const toneMapNeeded = (sourceHDR && !workingHDR) || (!sourceHDR && workingHDR)
    || (workingHDR && !outputHDR) || (!workingHDR && outputHDR);

  // Generate warnings
  if (sourceHDR && !workingHDR) {
    warnings.push(
      `Source media is HDR (${sourceSpace}) but the working space is SDR (${workingSpace}). ` +
      `Tone mapping will be applied — highlight detail may be compressed.`
    );
  }

  if (!sourceHDR && workingHDR) {
    warnings.push(
      `Source media is SDR (${sourceSpace}) but the working space is HDR (${workingSpace}). ` +
      `Inverse tone mapping will expand the signal — noise may become visible.`
    );
  }

  if (inputTransformNeeded && sourceSpace === 'rec2020' && workingSpace === 'rec709') {
    warnings.push(
      `Wide color gamut source (Rec.2020) will be converted to Rec.709. ` +
      `Out-of-gamut colors will be clipped. Consider using a Rec.2020 working space.`
    );
  }

  if (outputTransformNeeded && workingHDR && !outputHDR) {
    warnings.push(
      `Output is SDR but working space is HDR. ` +
      `Tone mapping will be applied during render/export.`
    );
  }

  if (sourceSpace === 'aces-linear' || sourceSpace === 'aces-cct') {
    if (workingSpace !== 'aces-cct' && workingSpace !== 'aces-linear') {
      warnings.push(
        `ACES source media detected. For best results, use an ACES working color space (ACEScct).`
      );
    }
  }

  return {
    sourceSpace,
    workingSpace,
    outputSpace,
    inputTransformNeeded,
    outputTransformNeeded,
    toneMapNeeded,
    warnings,
  };
}
