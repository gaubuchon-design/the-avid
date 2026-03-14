import { describe, expect, it } from 'vitest';

import { temperatureTintToRGB } from '../../engine/color/ColorMath';

describe('temperatureTintToRGB', () => {
  it('returns neutral multipliers at the default correction', () => {
    const multipliers = temperatureTintToRGB(0, 0);

    expect(multipliers.r).toBeCloseTo(1, 6);
    expect(multipliers.g).toBeCloseTo(1, 6);
    expect(multipliers.b).toBeCloseTo(1, 6);
  });

  it('warms and cools relative to the neutral baseline', () => {
    const warm = temperatureTintToRGB(-20, 0);
    const cool = temperatureTintToRGB(20, 0);

    expect(warm.r).toBeGreaterThan(warm.b);
    expect(cool.b).toBeGreaterThan(cool.r);
  });
});
