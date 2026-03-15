// =============================================================================
//  THE AVID — VFX Compositing Agent
//  Orchestrates AI-driven VFX operations: segmentation, masking, inpainting,
//  rotoscoping, sky replacement, and content-aware stabilization.
//  Works with ONNX Runtime Web for local inference (SAM, LaMa).
// =============================================================================

import type { AgentStep, AgentPlan } from '../AgentEngine';
import { onnxInference } from './ONNXInference';
import { vfxJobManager, type VFXJob } from './VFXJobManager';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface VFXOperation {
  type: VFXOperationType;
  clipId: string;
  frameRange: { start: number; end: number };
  params: Record<string, unknown>;
}

export type VFXOperationType =
  | 'object-removal'
  | 'rotoscope'
  | 'sky-replacement'
  | 'face-beauty'
  | 'color-match'
  | 'content-stabilize';

export interface SegmentationResult {
  mask: ImageData;
  confidence: number;
  bbox: { x: number; y: number; w: number; h: number };
  label?: string;
}

export interface InpaintingResult {
  frame: ImageData;
  quality: number;
}

// ─── VFX Plan Templates ────────────────────────────────────────────────────

interface VFXPlanTemplate {
  match: (msg: string) => boolean;
  plan: (msg: string) => Omit<AgentStep, 'id' | 'status'>[];
}

const VFX_PLAN_TEMPLATES: VFXPlanTemplate[] = [
  {
    match: (m) => /remov(e|al)\s+(the\s+)?(object|mic|microphone|boom|wire|cable|rig|stand)/i.test(m),
    plan: (msg) => {
      const objectMatch = msg.match(/remov(?:e|al)\s+(?:the\s+)?(\w+)/i);
      const objectName = objectMatch?.[1] || 'object';
      return [
        { description: `Segment "${objectName}" across frame range using SAM`, toolName: 'ai_rotoscope', toolArgs: { description: objectName, frameRange: 'clip' } },
        { description: 'Generate per-frame mask refinement', toolName: 'ai_object_removal', toolArgs: { maskSource: 'previous_step', method: 'inpaint' } },
        { description: 'Apply inpainted frames as clip overlay', toolName: 'apply_color_grade', toolArgs: { clipIds: ['current'], preset: 'vfx_composite' } },
      ];
    },
  },
  {
    match: (m) => /replace\s+(the\s+)?sky/i.test(m) || /sky\s*replacement/i.test(m),
    plan: () => [
      { description: 'Segment sky region using AI semantic segmentation', toolName: 'ai_sky_replacement', toolArgs: { segmentationType: 'sky', autoDetect: true } },
      { description: 'Generate sky mask with edge refinement', toolName: 'ai_rotoscope', toolArgs: { description: 'sky', method: 'semantic' } },
      { description: 'Composite replacement sky with color matching', toolName: 'ai_color_match', toolArgs: { matchTarget: 'sky_replacement', blendMode: 'screen' } },
    ],
  },
  {
    match: (m) => /smooth\s*skin/i.test(m) || /beauty\s*(pass|filter)/i.test(m) || /face\s*beauty/i.test(m),
    plan: () => [
      { description: 'Detect face regions across frame range', toolName: 'ai_face_beauty', toolArgs: { detection: 'face', autoTrack: true } },
      { description: 'Apply frequency separation skin smoothing', toolName: 'ai_face_beauty', toolArgs: { method: 'bilateral', strength: 0.6 } },
    ],
  },
  {
    match: (m) => /stabiliz/i.test(m) || /content.?aware.*stab/i.test(m),
    plan: () => [
      { description: 'Analyze clip motion with dense optical flow', toolName: 'ai_stabilize', toolArgs: { method: 'content-aware', smoothing: 0.8 } },
      { description: 'Apply motion compensation with edge fill', toolName: 'ai_stabilize', toolArgs: { applyMethod: 'warp', fillEdges: 'inpaint' } },
    ],
  },
  {
    match: (m) => /rotoscop/i.test(m) || /mask\s+(the|this)/i.test(m) || /isolate\s+(the|this)/i.test(m),
    plan: (msg) => {
      const objMatch = msg.match(/(?:rotoscope|mask|isolate)\s+(?:the\s+)?(\w+)/i);
      const objectName = objMatch?.[1] || 'subject';
      return [
        { description: `Generate per-frame mask for "${objectName}" using SAM`, toolName: 'ai_rotoscope', toolArgs: { description: objectName, propagate: true } },
        { description: 'Refine mask edges with matte choker', toolName: 'ai_rotoscope', toolArgs: { refine: true, edgeSoftness: 2 } },
      ];
    },
  },
  {
    match: (m) => /color\s*match/i.test(m) && /clip/i.test(m),
    plan: () => [
      { description: 'Analyze color histograms of reference and target clips', toolName: 'ai_color_match', toolArgs: { method: 'histogram', perceptual: true } },
      { description: 'Apply perceptual color transfer', toolName: 'ai_color_match', toolArgs: { apply: true, strength: 0.85 } },
    ],
  },
];

// ─── VFX Agent Class ────────────────────────────────────────────────────────

export class VFXAgent {
  private isInitialized = false;

  /**
   * Initialize ONNX models (lazy load on first use).
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    await onnxInference.initialize();
    this.isInitialized = true;
  }

  /**
   * Match a user message to a VFX plan template.
   */
  matchIntent(message: string): Omit<AgentStep, 'id' | 'status'>[] | null {
    for (const template of VFX_PLAN_TEMPLATES) {
      if (template.match(message)) {
        return template.plan(message);
      }
    }
    return null;
  }

  /**
   * Execute object removal on a frame range.
   * Pipeline: segment → refine mask → inpaint → composite.
   */
  async removeObject(
    clipId: string,
    description: string,
    startFrame: number,
    endFrame: number,
    getFrame: (frame: number) => Promise<ImageData>,
    onProgress?: (progress: number) => void,
  ): Promise<VFXJob> {
    await this.initialize();

    return vfxJobManager.submitJob({
      type: 'object-removal',
      clipId,
      frameRange: { start: startFrame, end: endFrame },
      params: { description },
      execute: async (job) => {
        const totalFrames = endFrame - startFrame + 1;
        const results: Map<number, ImageData> = new Map();

        // Step 1: Segment the object on first frame to get initial mask
        const firstFrame = await getFrame(startFrame);
        const segmentation = await onnxInference.segmentObject(firstFrame, description);

        if (!segmentation || segmentation.confidence < 0.3) {
          throw new Error(`Could not detect "${description}" in the frame`);
        }

        // Step 2: Process each frame
        for (let f = startFrame; f <= endFrame; f++) {
          const frame = await getFrame(f);

          // Propagate mask from previous frame (or use initial)
          const mask = f === startFrame
            ? segmentation.mask
            : await onnxInference.propagateMask(frame, segmentation.mask);

          // Inpaint the masked region
          const inpainted = await onnxInference.inpaint(frame, mask);
          results.set(f, inpainted.frame);

          const progress = (f - startFrame + 1) / totalFrames;
          job.progress = progress;
          onProgress?.(progress);
        }

        job.results = results;
      },
    });
  }

  /**
   * AI rotoscoping: generate per-frame masks for an object.
   */
  async rotoscope(
    clipId: string,
    description: string,
    startFrame: number,
    endFrame: number,
    getFrame: (frame: number) => Promise<ImageData>,
    onProgress?: (progress: number) => void,
  ): Promise<VFXJob> {
    await this.initialize();

    return vfxJobManager.submitJob({
      type: 'rotoscope',
      clipId,
      frameRange: { start: startFrame, end: endFrame },
      params: { description },
      execute: async (job) => {
        const totalFrames = endFrame - startFrame + 1;
        const masks: Map<number, ImageData> = new Map();

        const firstFrame = await getFrame(startFrame);
        const segmentation = await onnxInference.segmentObject(firstFrame, description);

        if (!segmentation) {
          throw new Error(`Could not segment "${description}"`);
        }

        let prevMask = segmentation.mask;
        masks.set(startFrame, prevMask);

        for (let f = startFrame + 1; f <= endFrame; f++) {
          const frame = await getFrame(f);
          const propagated = await onnxInference.propagateMask(frame, prevMask);
          masks.set(f, propagated);
          prevMask = propagated;

          const progress = (f - startFrame + 1) / totalFrames;
          job.progress = progress;
          onProgress?.(progress);
        }

        job.results = masks;
      },
    });
  }

  /**
   * AI sky replacement pipeline.
   */
  async replaceSky(
    clipId: string,
    replacementImage: ImageData,
    startFrame: number,
    endFrame: number,
    getFrame: (frame: number) => Promise<ImageData>,
    onProgress?: (progress: number) => void,
  ): Promise<VFXJob> {
    await this.initialize();

    return vfxJobManager.submitJob({
      type: 'sky-replacement',
      clipId,
      frameRange: { start: startFrame, end: endFrame },
      params: {},
      execute: async (job) => {
        const totalFrames = endFrame - startFrame + 1;
        const results: Map<number, ImageData> = new Map();

        for (let f = startFrame; f <= endFrame; f++) {
          const frame = await getFrame(f);

          // Segment sky
          const skyMask = await onnxInference.segmentSky(frame);

          // Composite replacement sky
          const composited = this.compositeSkyReplacement(frame, skyMask, replacementImage);
          results.set(f, composited);

          const progress = (f - startFrame + 1) / totalFrames;
          job.progress = progress;
          onProgress?.(progress);
        }

        job.results = results;
      },
    });
  }

  /**
   * Composite sky replacement: blend replacement image into sky mask region.
   */
  private compositeSkyReplacement(
    original: ImageData,
    skyMask: ImageData,
    replacement: ImageData,
  ): ImageData {
    const { width, height } = original;
    const result = new ImageData(width, height);
    const out = result.data;
    const orig = original.data;
    const mask = skyMask.data;
    const rep = replacement.data;

    // Scale replacement to match frame size
    const rw = replacement.width;
    const rh = replacement.height;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const alpha = mask[idx]! / 255; // mask intensity = sky region

        // Sample replacement (nearest neighbor scaling)
        const rx = Math.min(Math.floor((x / width) * rw), rw - 1);
        const ry = Math.min(Math.floor((y / height) * rh), rh - 1);
        const ridx = (ry * rw + rx) * 4;

        // Blend: sky region gets replacement, non-sky keeps original
        out[idx] = Math.round(orig[idx]! * (1 - alpha) + rep[ridx]! * alpha);
        out[idx + 1] = Math.round(orig[idx + 1]! * (1 - alpha) + rep[ridx + 1]! * alpha);
        out[idx + 2] = Math.round(orig[idx + 2]! * (1 - alpha) + rep[ridx + 2]! * alpha);
        out[idx + 3] = 255;
      }
    }

    return result;
  }
}

export const vfxAgent = new VFXAgent();
