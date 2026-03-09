// ═══════════════════════════════════════════════════════════════════════════
//  WGSL Shader Sources Index
//  Re-exports all compute shader source strings keyed by effect definition ID.
// ═══════════════════════════════════════════════════════════════════════════

export { shaderSource as brightnessContrastShader } from './brightness-contrast';
export { shaderSource as hueSaturationShader } from './hue-saturation';
export { shaderSource as colorBalanceShader } from './color-balance';
export { shaderSource as sharpenShader } from './sharpen';
export { shaderSource as chromaKeyShader } from './chroma-key';
export { shaderSource as vignetteShader } from './vignette';
export { shaderSource as filmGrainShader } from './film-grain';
export { shaderSource as glowShader } from './glow';
export { shaderSource as dropShadowShader } from './drop-shadow';
export { shaderSource as letterboxShader } from './letterbox';

// Blur is special — it has separate horizontal and vertical passes
export { horizontalBlurSource, verticalBlurSource, shaderSource as blurShader } from './blur';

import { shaderSource as brightnessContrastShader } from './brightness-contrast';
import { shaderSource as hueSaturationShader } from './hue-saturation';
import { shaderSource as colorBalanceShader } from './color-balance';
import { shaderSource as sharpenShader } from './sharpen';
import { shaderSource as chromaKeyShader } from './chroma-key';
import { shaderSource as vignetteShader } from './vignette';
import { shaderSource as filmGrainShader } from './film-grain';
import { shaderSource as glowShader } from './glow';
import { shaderSource as dropShadowShader } from './drop-shadow';
import { shaderSource as letterboxShader } from './letterbox';
import { horizontalBlurSource, verticalBlurSource } from './blur';

/**
 * Map of effect definition ID to WGSL shader source string.
 * Blur has two separate entries for its separable passes.
 */
export const SHADER_SOURCES: Record<string, string> = {
  'brightness-contrast': brightnessContrastShader,
  'hue-saturation': hueSaturationShader,
  'color-balance': colorBalanceShader,
  'blur-gaussian': horizontalBlurSource,
  'blur-gaussian-v': verticalBlurSource,
  'sharpen': sharpenShader,
  'chroma-key': chromaKeyShader,
  'vignette': vignetteShader,
  'film-grain': filmGrainShader,
  'glow': glowShader,
  'drop-shadow': dropShadowShader,
  'letterbox': letterboxShader,
};
