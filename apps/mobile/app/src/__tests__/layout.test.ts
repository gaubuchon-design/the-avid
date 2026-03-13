import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
    select: (options: Record<string, string | undefined>) =>
      options['ios'] ?? options['default'],
  },
}));

import { createLayoutConstants } from '../constants/layout';

type MobilePlatform = 'android' | 'ios';

function getLayoutForPlatform(platform: MobilePlatform) {
  const mockedPlatform = {
    OS: platform,
    select: (options: { ios?: unknown; android?: unknown; default?: unknown }) =>
      options[platform] ?? options.default,
  } as Parameters<typeof createLayoutConstants>[0];

  return createLayoutConstants(mockedPlatform);
}

describe('layout constants', () => {
  it('uses iOS-safe touch targets and font defaults', () => {
    const layout = getLayoutForPlatform('ios');

    expect(layout.MIN_TOUCH_TARGET).toBe(44);
    expect(layout.MONO_FONT).toBe('Menlo');
    expect(layout.CARD_BORDER_RADIUS).toBeGreaterThan(0);
    expect(layout.BUTTON_BORDER_RADIUS).toBeLessThan(layout.PILL_BORDER_RADIUS);
  });

  it('uses Android-safe touch targets and preserves ordered scales', () => {
    const layout = getLayoutForPlatform('android');

    expect(layout.MIN_TOUCH_TARGET).toBe(48);
    expect(layout.MONO_FONT).toBe('monospace');
    expect(layout.SPACING.xs).toBeLessThan(layout.SPACING.sm);
    expect(layout.SPACING.sm).toBeLessThan(layout.SPACING.md);
    expect(layout.SPACING.md).toBeLessThan(layout.SPACING.lg);
    expect(layout.FONT_SIZE.lg).toBeLessThan(layout.FONT_SIZE.xl);
    expect(layout.FONT_SIZE.xl).toBeLessThan(layout.FONT_SIZE.hero);
  });
});
