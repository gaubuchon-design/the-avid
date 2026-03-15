import { describe, it, expect } from 'vitest';
import {
  resolveColorPipeline,
  type SourceColorInfo,
  type SequenceColorSettings,
  type DeliveryColorSettings,
} from '../../lib/colorPipeline';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function seq(colorSpace: string, displayTransform = 'sdr-rec709'): SequenceColorSettings {
  return { colorSpace, displayTransform };
}

function src(colorSpace?: string, hdrMode?: SourceColorInfo['hdrMode']): SourceColorInfo {
  return { colorSpace, hdrMode };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('resolveColorPipeline', () => {
  // ── Basic same-space scenarios ──────────────────────────────────────────

  it('rec709 source + rec709 working = no transform needed', () => {
    const result = resolveColorPipeline(src('rec709'), seq('rec709'));
    expect(result.sourceSpace).toBe('rec709');
    expect(result.workingSpace).toBe('rec709');
    expect(result.inputTransformNeeded).toBe(false);
    expect(result.outputTransformNeeded).toBe(false);
    expect(result.toneMapNeeded).toBe(false);
    expect(result.warnings).toHaveLength(0);
  });

  // ── Input transform scenarios ───────────────────────────────────────────

  it('rec709 source + rec2020 working = input transform needed', () => {
    const result = resolveColorPipeline(src('rec709'), seq('rec2020'));
    expect(result.inputTransformNeeded).toBe(true);
    expect(result.sourceSpace).toBe('rec709');
    expect(result.workingSpace).toBe('rec2020');
  });

  it('rec2020 source + rec709 working = input transform + gamut clipping warning', () => {
    const result = resolveColorPipeline(src('rec2020'), seq('rec709'));
    expect(result.inputTransformNeeded).toBe(true);
    expect(result.warnings.some((w) => w.includes('Out-of-gamut colors will be clipped'))).toBe(
      true,
    );
  });

  // ── HDR / SDR mismatch ─────────────────────────────────────────────────

  it('HDR (PQ) source + SDR working = tone map needed + warning', () => {
    const result = resolveColorPipeline(src('rec2020', 'pq'), seq('rec709'));
    expect(result.toneMapNeeded).toBe(true);
    expect(result.warnings.some((w) => w.includes('HDR') && w.includes('SDR'))).toBe(true);
  });

  it('SDR source + HDR working = tone map needed + warning', () => {
    const result = resolveColorPipeline(src('rec709'), seq('rec2020', 'hdr-pq'));
    expect(result.toneMapNeeded).toBe(true);
    expect(result.warnings.some((w) => w.includes('SDR') && w.includes('HDR'))).toBe(true);
  });

  // ── Default / fallback behavior ────────────────────────────────────────

  it('missing source descriptor defaults to rec709', () => {
    const result = resolveColorPipeline(undefined, seq('rec709'));
    expect(result.sourceSpace).toBe('rec709');
    expect(result.inputTransformNeeded).toBe(false);
  });

  it('output space falls back to working space when not specified in delivery', () => {
    const result = resolveColorPipeline(src('rec709'), seq('rec2020'), {});
    expect(result.outputSpace).toBe('rec2020');
    expect(result.outputTransformNeeded).toBe(false);
  });

  // ── Custom output space ────────────────────────────────────────────────

  it('custom output space different from working = output transform needed', () => {
    const delivery: DeliveryColorSettings = { outputColorSpace: 'rec709' };
    const result = resolveColorPipeline(src('rec2020'), seq('rec2020'), delivery);
    expect(result.outputSpace).toBe('rec709');
    expect(result.outputTransformNeeded).toBe(true);
  });

  // ── ACES warning ───────────────────────────────────────────────────────

  it('ACES source with non-ACES working generates warning', () => {
    const result = resolveColorPipeline(src('aces-cct'), seq('rec709'));
    expect(result.warnings.some((w) => w.includes('ACES'))).toBe(true);
  });

  it('ACES-linear source with ACES-cct working does not warn about non-ACES working', () => {
    const result = resolveColorPipeline(src('aces-linear'), seq('aces-cct'));
    expect(result.warnings.some((w) => w.includes('use an ACES working color space'))).toBe(false);
  });

  // ── normalizeColorSpace mappings ───────────────────────────────────────

  describe('normalizeColorSpace mappings', () => {
    it('maps bt2020 to rec2020', () => {
      const result = resolveColorPipeline(src('bt2020'), seq('rec709'));
      expect(result.sourceSpace).toBe('rec2020');
    });

    it('maps displayp3 to dci-p3', () => {
      const result = resolveColorPipeline(src('displayp3'), seq('rec709'));
      expect(result.sourceSpace).toBe('dci-p3');
    });

    it('maps DCI-P3 to dci-p3', () => {
      const result = resolveColorPipeline(src('DCI-P3'), seq('rec709'));
      expect(result.sourceSpace).toBe('dci-p3');
    });

    it('maps sRGB to srgb', () => {
      const result = resolveColorPipeline(src('sRGB'), seq('rec709'));
      expect(result.sourceSpace).toBe('srgb');
    });

    it('maps bt709 to rec709', () => {
      const result = resolveColorPipeline(src('bt709'), seq('rec709'));
      expect(result.sourceSpace).toBe('rec709');
    });

    it('maps AP0 to aces-linear', () => {
      const result = resolveColorPipeline(src('AP0'), seq('rec709'));
      expect(result.sourceSpace).toBe('aces-linear');
    });

    it('maps AP1 to aces-cct', () => {
      const result = resolveColorPipeline(src('AP1'), seq('rec709'));
      expect(result.sourceSpace).toBe('aces-cct');
    });

    it('maps unknown strings to rec709', () => {
      const result = resolveColorPipeline(src('something-unknown'), seq('rec709'));
      expect(result.sourceSpace).toBe('rec709');
    });
  });
});
