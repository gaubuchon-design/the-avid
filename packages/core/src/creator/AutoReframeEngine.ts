// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — Auto-Reframe Engine (CC-01)
//  AI-powered reframe for multi-platform delivery
// ═══════════════════════════════════════════════════════════════════════════

import { generateId } from '../utils';
import {
  AspectRatio,
  ASPECT_RATIOS,
  AutoReframeConfig,
  DetectedSubject,
  ReframeKeyframe,
  ReframeResult,
  SubjectType,
} from './types';

// ─── Constants ────────────────────────────────────────────────────────────

const SUBJECT_RETENTION_TARGET = 0.95;
const DEFAULT_KEYFRAME_INTERVAL = 1 / 24; // one keyframe per frame at 24fps
const MAX_CROP_VELOCITY = 0.15;           // max crop movement per frame (normalized)

// ─── Subject Detection (simulated AI) ─────────────────────────────────────

interface FrameAnalysis {
  time: number;
  subjects: DetectedSubject[];
}

function detectSubjectsInFrame(
  time: number,
  _sourceWidth: number,
  _sourceHeight: number,
  priority: SubjectType[],
): DetectedSubject[] {
  // Simulated AI subject detection
  // In production this would call a vision model (e.g. MediaPipe, ONNX face/object detector)
  const subjects: DetectedSubject[] = [];

  // Simulate a face that moves across the frame over time
  const faceCenterX = 0.35 + Math.sin(time * 0.3) * 0.15;
  const faceCenterY = 0.3 + Math.cos(time * 0.2) * 0.05;
  const faceSize = 0.12 + Math.sin(time * 0.1) * 0.02;

  if (priority.includes('face')) {
    subjects.push({
      type: 'face',
      confidence: 0.92 + Math.random() * 0.06,
      boundingBox: {
        x: faceCenterX - faceSize / 2,
        y: faceCenterY - faceSize / 2,
        width: faceSize,
        height: faceSize * 1.3,
      },
    });
  }

  // Simulate a secondary salient object
  if (priority.includes('salient_object')) {
    const objX = 0.55 + Math.cos(time * 0.15) * 0.1;
    const objY = 0.5 + Math.sin(time * 0.25) * 0.08;
    subjects.push({
      type: 'salient_object',
      confidence: 0.78 + Math.random() * 0.12,
      boundingBox: {
        x: objX - 0.08,
        y: objY - 0.06,
        width: 0.16,
        height: 0.12,
      },
    });
  }

  // Sort by priority order then confidence
  subjects.sort((a, b) => {
    const aPriority = priority.indexOf(a.type);
    const bPriority = priority.indexOf(b.type);
    if (aPriority !== bPriority) return aPriority - bPriority;
    return b.confidence - a.confidence;
  });

  return subjects;
}

// ─── Crop Region Calculation ──────────────────────────────────────────────

interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

function calculateTargetCropSize(
  sourceWidth: number,
  sourceHeight: number,
  targetAspect: AspectRatio,
): { width: number; height: number } {
  const targetRatio = targetAspect.width / targetAspect.height;
  const sourceRatio = sourceWidth / sourceHeight;

  if (targetRatio <= sourceRatio) {
    // Target is taller relative to source -- height limited
    const cropHeight = sourceHeight;
    const cropWidth = cropHeight * targetRatio;
    return { width: cropWidth / sourceWidth, height: 1.0 };
  } else {
    // Target is wider relative to source -- width limited
    const cropWidth = sourceWidth;
    const cropHeight = cropWidth / targetRatio;
    return { width: 1.0, height: cropHeight / sourceHeight };
  }
}

function computeCropForSubject(
  subject: DetectedSubject,
  cropSize: { width: number; height: number },
  lockStrength: number,
  safeZoneMargin: number,
): CropRegion {
  const subjectCenterX = subject.boundingBox.x + subject.boundingBox.width / 2;
  const subjectCenterY = subject.boundingBox.y + subject.boundingBox.height / 2;

  // Center crop on subject with lock strength weighting
  const centerX = 0.5 + (subjectCenterX - 0.5) * lockStrength;
  const centerY = 0.5 + (subjectCenterY - 0.5) * lockStrength;

  // Apply safe zone margin
  const marginX = safeZoneMargin * cropSize.width;
  const marginY = safeZoneMargin * cropSize.height;

  let cropX = centerX - cropSize.width / 2;
  let cropY = centerY - cropSize.height / 2;

  // Ensure subject bounding box is within the crop with margin
  const subjectLeft = subject.boundingBox.x - marginX;
  const subjectRight = subject.boundingBox.x + subject.boundingBox.width + marginX;
  const subjectTop = subject.boundingBox.y - marginY;
  const subjectBottom = subject.boundingBox.y + subject.boundingBox.height + marginY;

  if (subjectLeft < cropX) cropX = subjectLeft;
  if (subjectRight > cropX + cropSize.width) cropX = subjectRight - cropSize.width;
  if (subjectTop < cropY) cropY = subjectTop;
  if (subjectBottom > cropY + cropSize.height) cropY = subjectBottom - cropSize.height;

  // Clamp to valid range [0, 1-size]
  cropX = Math.max(0, Math.min(1 - cropSize.width, cropX));
  cropY = Math.max(0, Math.min(1 - cropSize.height, cropY));

  return {
    x: cropX,
    y: cropY,
    width: cropSize.width,
    height: cropSize.height,
  };
}

// ─── Motion Smoothing ─────────────────────────────────────────────────────

function smoothKeyframes(
  keyframes: ReframeKeyframe[],
  smoothing: number,
  maxVelocity: number,
): ReframeKeyframe[] {
  if (keyframes.length < 2) return keyframes;

  const smoothed: ReframeKeyframe[] = [keyframes[0]];
  const alpha = 1 - smoothing;

  for (let i = 1; i < keyframes.length; i++) {
    const prev = smoothed[i - 1].cropRegion;
    const curr = keyframes[i].cropRegion;

    // Exponential moving average
    let newX = prev.x * (1 - alpha) + curr.x * alpha;
    let newY = prev.y * (1 - alpha) + curr.y * alpha;

    // Velocity clamping
    const dx = newX - prev.x;
    const dy = newY - prev.y;
    const velocity = Math.sqrt(dx * dx + dy * dy);

    if (velocity > maxVelocity) {
      const scale = maxVelocity / velocity;
      newX = prev.x + dx * scale;
      newY = prev.y + dy * scale;
    }

    // Clamp to bounds
    newX = Math.max(0, Math.min(1 - curr.width, newX));
    newY = Math.max(0, Math.min(1 - curr.height, newY));

    smoothed.push({
      ...keyframes[i],
      cropRegion: {
        x: newX,
        y: newY,
        width: curr.width,
        height: curr.height,
      },
    });
  }

  return smoothed;
}

// ─── Subject Retention Scoring ────────────────────────────────────────────

function calculateRetentionScore(keyframes: ReframeKeyframe[]): number {
  if (keyframes.length === 0) return 0;

  let subjectVisible = 0;
  for (const kf of keyframes) {
    if (kf.subjects.length === 0) {
      subjectVisible++;
      continue;
    }

    const primarySubject = kf.subjects[0];
    const subjectCenterX = primarySubject.boundingBox.x + primarySubject.boundingBox.width / 2;
    const subjectCenterY = primarySubject.boundingBox.y + primarySubject.boundingBox.height / 2;

    const crop = kf.cropRegion;
    if (
      subjectCenterX >= crop.x &&
      subjectCenterX <= crop.x + crop.width &&
      subjectCenterY >= crop.y &&
      subjectCenterY <= crop.y + crop.height
    ) {
      subjectVisible++;
    }
  }

  return subjectVisible / keyframes.length;
}

// ─── Main Engine ──────────────────────────────────────────────────────────

export class AutoReframeEngine {
  private config: AutoReframeConfig;

  constructor(config?: Partial<AutoReframeConfig>) {
    this.config = {
      sourceAspect: ASPECT_RATIOS['16:9'],
      targetAspect: ASPECT_RATIOS['9:16'],
      subjectLockStrength: 0.8,
      motionSmoothing: 0.6,
      subjectPriority: ['face', 'salient_object'],
      safeZoneMargin: 0.05,
      ...config,
    };
  }

  /**
   * Analyze a clip and generate reframe keyframes
   */
  async reframeClip(
    clipId: string,
    clipDuration: number,
    sourceWidth: number,
    sourceHeight: number,
    frameRate = 24,
  ): Promise<ReframeResult> {
    const result: ReframeResult = {
      clipId,
      sourceAspect: this.config.sourceAspect,
      targetAspect: this.config.targetAspect,
      keyframes: [],
      subjectRetentionScore: 0,
      status: 'processing',
    };

    try {
      const cropSize = calculateTargetCropSize(
        sourceWidth,
        sourceHeight,
        this.config.targetAspect,
      );

      // Analyze frames at regular intervals
      const frameInterval = 1 / frameRate;
      const analyses: FrameAnalysis[] = [];

      for (let time = 0; time <= clipDuration; time += frameInterval) {
        const subjects = detectSubjectsInFrame(
          time,
          sourceWidth,
          sourceHeight,
          this.config.subjectPriority,
        );
        analyses.push({ time, subjects });
      }

      // Compute crop regions for each frame
      const rawKeyframes: ReframeKeyframe[] = analyses.map((analysis) => {
        const primarySubject = analysis.subjects[0];

        let cropRegion: CropRegion;
        if (primarySubject) {
          cropRegion = computeCropForSubject(
            primarySubject,
            cropSize,
            this.config.subjectLockStrength,
            this.config.safeZoneMargin,
          );
        } else {
          // No subject detected -- center crop
          cropRegion = {
            x: (1 - cropSize.width) / 2,
            y: (1 - cropSize.height) / 2,
            width: cropSize.width,
            height: cropSize.height,
          };
        }

        return {
          time: analysis.time,
          cropRegion,
          subjects: analysis.subjects,
        };
      });

      // Apply motion smoothing
      result.keyframes = smoothKeyframes(
        rawKeyframes,
        this.config.motionSmoothing,
        MAX_CROP_VELOCITY,
      );

      // Calculate retention score
      result.subjectRetentionScore = calculateRetentionScore(result.keyframes);

      // Reduce keyframe density for storage (keep every Nth frame + key moments)
      result.keyframes = this.reduceKeyframes(result.keyframes, frameRate);

      result.status = 'completed';
    } catch (error) {
      result.status = 'failed';
      result.error = error instanceof Error ? error.message : 'Unknown error during reframe';
    }

    return result;
  }

  /**
   * Batch reframe all clips for a target aspect ratio
   */
  async batchReframe(
    clips: Array<{
      id: string;
      duration: number;
      width: number;
      height: number;
    }>,
    frameRate = 24,
  ): Promise<ReframeResult[]> {
    const results: ReframeResult[] = [];

    for (const clip of clips) {
      const result = await this.reframeClip(
        clip.id,
        clip.duration,
        clip.width,
        clip.height,
        frameRate,
      );
      results.push(result);
    }

    return results;
  }

  /**
   * Generate all standard platform variants
   */
  async generatePlatformVariants(
    clipId: string,
    clipDuration: number,
    sourceWidth: number,
    sourceHeight: number,
    frameRate = 24,
  ): Promise<Map<string, ReframeResult>> {
    const variants = new Map<string, ReframeResult>();
    const targets = ['16:9', '9:16', '1:1'];

    for (const targetKey of targets) {
      const targetAspect = ASPECT_RATIOS[targetKey];
      if (!targetAspect) continue;

      const engine = new AutoReframeEngine({
        ...this.config,
        targetAspect,
      });

      const result = await engine.reframeClip(
        clipId,
        clipDuration,
        sourceWidth,
        sourceHeight,
        frameRate,
      );

      variants.set(targetKey, result);
    }

    return variants;
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<AutoReframeConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): AutoReframeConfig {
    return { ...this.config };
  }

  /**
   * Check if retention target is met
   */
  meetsRetentionTarget(result: ReframeResult): boolean {
    return result.subjectRetentionScore >= SUBJECT_RETENTION_TARGET;
  }

  // ─── Private Helpers ────────────────────────────────────────────────────

  private reduceKeyframes(
    keyframes: ReframeKeyframe[],
    frameRate: number,
  ): ReframeKeyframe[] {
    if (keyframes.length <= 2) return keyframes;

    // Keep first and last, then every 12th frame, plus any with significant movement
    const reduced: ReframeKeyframe[] = [keyframes[0]];
    const step = Math.max(1, Math.round(frameRate / 2));

    for (let i = 1; i < keyframes.length - 1; i++) {
      const isStepFrame = i % step === 0;
      const prev = reduced[reduced.length - 1];
      const curr = keyframes[i];
      const dx = Math.abs(curr.cropRegion.x - prev.cropRegion.x);
      const dy = Math.abs(curr.cropRegion.y - prev.cropRegion.y);
      const hasSignificantMotion = dx > 0.02 || dy > 0.02;

      if (isStepFrame || hasSignificantMotion) {
        reduced.push(curr);
      }
    }

    reduced.push(keyframes[keyframes.length - 1]);
    return reduced;
  }
}

// ─── Default Export ───────────────────────────────────────────────────────

export function createAutoReframeEngine(config?: Partial<AutoReframeConfig>): AutoReframeEngine {
  return new AutoReframeEngine(config);
}
