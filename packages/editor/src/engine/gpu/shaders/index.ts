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
export { shaderSource as lumaKeyShader } from './luma-key';
export { shaderSource as curvesShader } from './curves';
export { shaderSource as colorLookupShader } from './color-lookup';
export { shaderSource as directionalBlurShader } from './directional-blur';
export { shaderSource as radialBlurShader } from './radial-blur';
export { shaderSource as lensDistortionShader } from './lens-distortion';
export { shaderSource as turbulentDisplaceShader } from './turbulent-displace';
export { shaderSource as noiseShader } from './noise-gen';
export { shaderSource as mirrorShader } from './mirror';
export { shaderSource as glitchShader } from './glitch';
export { shaderSource as halftoneShader } from './halftone';

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
import { shaderSource as lumaKeyShader } from './luma-key';
import { shaderSource as curvesShader } from './curves';
import { shaderSource as colorLookupShader } from './color-lookup';
import { shaderSource as directionalBlurShader } from './directional-blur';
import { shaderSource as radialBlurShader } from './radial-blur';
import { shaderSource as lensDistortionShader } from './lens-distortion';
import { shaderSource as turbulentDisplaceShader } from './turbulent-displace';
import { shaderSource as noiseShader } from './noise-gen';
import { shaderSource as mirrorShader } from './mirror';
import { shaderSource as glitchShader } from './glitch';
import { shaderSource as halftoneShader } from './halftone';
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
  'luma-key': lumaKeyShader,
  'curves': curvesShader,
  'color-lookup': colorLookupShader,
  'directional-blur': directionalBlurShader,
  'radial-blur': radialBlurShader,
  'lens-distortion': lensDistortionShader,
  'turbulent-displace': turbulentDisplaceShader,
  'noise': noiseShader,
  'mirror': mirrorShader,
  'glitch': glitchShader,
  'halftone': halftoneShader,
};
