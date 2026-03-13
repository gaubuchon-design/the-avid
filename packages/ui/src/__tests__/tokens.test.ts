import { describe, expect, it } from 'vitest';
import {
  borderDark,
  borderLight,
  cssVar,
  getBorders,
  getShadows,
  getSurfaces,
  getTextColors,
  shadowDark,
  shadowLight,
  surfaceDark,
  surfaceLight,
  textDark,
  textLight,
  theme,
} from '../index';

describe('@mcua/ui theme tokens', () => {
  it('formats CSS custom property references consistently', () => {
    expect(cssVar('bg-canvas')).toBe('var(--bg-canvas)');
  });

  it('returns the correct token collections for each theme mode', () => {
    expect(getSurfaces('dark')).toBe(surfaceDark);
    expect(getSurfaces('light')).toBe(surfaceLight);
    expect(getTextColors('dark')).toBe(textDark);
    expect(getTextColors('light')).toBe(textLight);
    expect(getBorders('dark')).toBe(borderDark);
    expect(getBorders('light')).toBe(borderLight);
    expect(getShadows('dark')).toBe(shadowDark);
    expect(getShadows('light')).toBe(shadowLight);
  });

  it('keeps the assembled theme object wired to the exported token groups', () => {
    expect(theme.surfaces.dark).toBe(surfaceDark);
    expect(theme.text.light).toBe(textLight);
    expect(theme.borders.dark).toBe(borderDark);
    expect(theme.shadows.light).toBe(shadowLight);
  });
});
