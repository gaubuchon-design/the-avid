import { effectsEngine, type EffectInstance, type EffectRenderQuality } from './EffectsEngine';

type EffectsEngineCompat = typeof effectsEngine & {
  getRenderRevision?: () => number;
  getClipRenderRevision?: (clipId: string) => string;
};

function getEffectsEngineCompat(): EffectsEngineCompat {
  return effectsEngine as EffectsEngineCompat;
}

export function getEffectsRenderRevision(): string {
  const compat = getEffectsEngineCompat();
  return typeof compat.getRenderRevision === 'function' ? `${compat.getRenderRevision()}` : '0';
}

export function getClipEffectsRenderRevision(clipId: string): string {
  const compat = getEffectsEngineCompat();
  return typeof compat.getClipRenderRevision === 'function'
    ? compat.getClipRenderRevision(clipId)
    : getEffectsRenderRevision();
}

export function processEffectsFrame(
  imageData: ImageData,
  effects: EffectInstance[],
  frameNumber: number,
  quality: EffectRenderQuality
): ImageData {
  if (effectsEngine.processFrame.length >= 4) {
    return effectsEngine.processFrame(imageData, effects, frameNumber, quality);
  }

  return effectsEngine.processFrame(imageData, effects, frameNumber);
}
