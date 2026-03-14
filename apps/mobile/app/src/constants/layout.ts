import { Platform } from 'react-native';

type LayoutPlatform = Pick<typeof Platform, 'OS' | 'select'>;

export function createLayoutConstants(platform: LayoutPlatform = Platform) {
  return {
    /** Minimum touch target size per Apple/Google HIG (44pt iOS, 48dp Android). */
    MIN_TOUCH_TARGET: platform.OS === 'android' ? 48 : 44,

    /** Standard border radius for cards and surfaces. */
    CARD_BORDER_RADIUS: 12,

    /** Standard border radius for buttons and pills. */
    BUTTON_BORDER_RADIUS: 10,

    /** Standard border radius for full-round elements. */
    PILL_BORDER_RADIUS: 999,

    /** Standard spacing values. */
    SPACING: {
      xs: 4,
      sm: 8,
      md: 12,
      lg: 16,
      xl: 24,
      xxl: 32,
    } as const,

    /** Standard font sizes. */
    FONT_SIZE: {
      xs: 10,
      sm: 12,
      md: 14,
      lg: 16,
      xl: 20,
      xxl: 28,
      hero: 32,
    } as const,

    /** Monospace font family per platform. */
    MONO_FONT: platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: 'monospace',
    }),
  };
}

const layoutConstants = createLayoutConstants();

/** Minimum touch target size per Apple/Google HIG (44pt iOS, 48dp Android). */
export const MIN_TOUCH_TARGET = layoutConstants.MIN_TOUCH_TARGET;

/** Standard border radius for cards and surfaces. */
export const CARD_BORDER_RADIUS = layoutConstants.CARD_BORDER_RADIUS;

/** Standard border radius for buttons and pills. */
export const BUTTON_BORDER_RADIUS = layoutConstants.BUTTON_BORDER_RADIUS;

/** Standard border radius for full-round elements. */
export const PILL_BORDER_RADIUS = layoutConstants.PILL_BORDER_RADIUS;

/** Standard spacing values. */
export const SPACING = layoutConstants.SPACING;

/** Standard font sizes. */
export const FONT_SIZE = layoutConstants.FONT_SIZE;

/** Monospace font family per platform. */
export const MONO_FONT = layoutConstants.MONO_FONT;
