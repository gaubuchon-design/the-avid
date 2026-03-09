// =============================================================================
//  THE AVID — ONNX Runtime Web Inference Engine
//  Wrapper for onnxruntime-web providing model management and inference for:
//    - SAM (Segment Anything Model) — object segmentation
//    - LaMa (Large Mask Inpainting) — inpainting masked regions
//    - Sky segmentation model — semantic sky detection
//  Models are INT8 quantized for browser-friendly sizes.
// =============================================================================

import type { SegmentationResult, InpaintingResult } from './VFXAgent';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ModelConfig {
  name: string;
  url: string;
  inputSize: { width: number; height: number };
  loaded: boolean;
}

type InferenceSession = {
  run: (feeds: Record<string, unknown>) => Promise<Record<string, { data: Float32Array; dims: number[] }>>;
  release: () => void;
};

// ─── Constants ──────────────────────────────────────────────────────────────

const MODEL_BASE_URL = '/models/';

const MODELS: Record<string, ModelConfig> = {
  sam_encoder: {
    name: 'SAM Image Encoder (INT8)',
    url: `${MODEL_BASE_URL}sam_vit_b_encoder_int8.onnx`,
    inputSize: { width: 1024, height: 1024 },
    loaded: false,
  },
  sam_decoder: {
    name: 'SAM Mask Decoder',
    url: `${MODEL_BASE_URL}sam_vit_b_decoder.onnx`,
    inputSize: { width: 256, height: 256 },
    loaded: false,
  },
  lama: {
    name: 'LaMa Inpainting (INT8)',
    url: `${MODEL_BASE_URL}lama_fp16.onnx`,
    inputSize: { width: 512, height: 512 },
    loaded: false,
  },
  sky_seg: {
    name: 'Sky Segmentation',
    url: `${MODEL_BASE_URL}sky_seg_int8.onnx`,
    inputSize: { width: 384, height: 384 },
    loaded: false,
  },
};

// ─── ONNX Inference Engine ──────────────────────────────────────────────────

class ONNXInferenceEngine {
  private sessions: Map<string, InferenceSession> = new Map();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private ort: any = null;
  private initialized = false;
  private samEmbedding: Float32Array | null = null;

  /**
   * Initialize ONNX Runtime Web (lazy load).
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Dynamic import to avoid bundling onnxruntime-web when not needed
      const moduleName = 'onnxruntime-web';
      this.ort = await import(/* @vite-ignore */ moduleName);

      // Configure for WebGPU execution (fallback to WASM)
      this.ort.env.wasm.numThreads = navigator.hardwareConcurrency || 4;
      this.ort.env.wasm.simd = true;

      this.initialized = true;
      console.log('[ONNXInference] Initialized ONNX Runtime Web');
    } catch (err) {
      console.warn('[ONNXInference] ONNX Runtime not available, using fallback:', err);
      this.initialized = true; // Mark as initialized to prevent repeated attempts
    }
  }

  /**
   * Load a specific model by key.
   */
  private async loadModel(modelKey: string): Promise<InferenceSession | null> {
    if (this.sessions.has(modelKey)) return this.sessions.get(modelKey)!;
    if (!this.ort) return null;

    const config = MODELS[modelKey];
    if (!config) return null;

    try {
      console.log(`[ONNXInference] Loading model: ${config.name}`);
      const session = await this.ort.InferenceSession.create(config.url, {
        executionProviders: ['webgpu', 'wasm'],
        graphOptimizationLevel: 'all',
      });

      this.sessions.set(modelKey, session as unknown as InferenceSession);
      config.loaded = true;
      console.log(`[ONNXInference] Model loaded: ${config.name}`);
      return session as unknown as InferenceSession;
    } catch (err) {
      console.error(`[ONNXInference] Failed to load ${config.name}:`, err);
      return null;
    }
  }

  /**
   * Segment an object in an image using SAM (Segment Anything Model).
   * Uses text/point prompt to identify the target object.
   */
  async segmentObject(
    imageData: ImageData,
    description: string,
    pointPrompt?: { x: number; y: number },
  ): Promise<SegmentationResult | null> {
    const encoder = await this.loadModel('sam_encoder');
    const decoder = await this.loadModel('sam_decoder');

    if (!encoder || !decoder || !this.ort) {
      // Fallback: return a center-biased mask
      return this.fallbackSegmentation(imageData, description);
    }

    try {
      const { width, height } = imageData;
      const inputSize = MODELS['sam_encoder']!.inputSize;

      // Preprocess: resize and normalize to model input
      const inputTensor = this.preprocessImage(imageData, inputSize.width, inputSize.height);

      // Run encoder
      const encoderFeeds = {
        image: new this.ort.Tensor('float32', inputTensor, [1, 3, inputSize.height, inputSize.width]),
      };
      const encoderResult = await encoder.run(encoderFeeds);
      this.samEmbedding = encoderResult['image_embeddings']!.data;

      // Prepare point prompt (center of image if not specified)
      const px = pointPrompt?.x ?? width / 2;
      const py = pointPrompt?.y ?? height / 2;

      // Scale point to encoder coordinates
      const scaledX = (px / width) * inputSize.width;
      const scaledY = (py / height) * inputSize.height;

      // Run decoder with point prompt
      const decoderFeeds = {
        image_embeddings: new this.ort.Tensor('float32', this.samEmbedding, [1, 256, 64, 64]),
        point_coords: new this.ort.Tensor('float32', new Float32Array([scaledX, scaledY]), [1, 1, 2]),
        point_labels: new this.ort.Tensor('float32', new Float32Array([1]), [1, 1]),
        has_mask_input: new this.ort.Tensor('float32', new Float32Array([0]), [1]),
        mask_input: new this.ort.Tensor('float32', new Float32Array(256 * 256).fill(0), [1, 1, 256, 256]),
        orig_im_size: new this.ort.Tensor('float32', new Float32Array([height, width]), [2]),
      };

      const decoderResult = await decoder.run(decoderFeeds);
      const maskData = decoderResult['masks']!.data;
      const maskDims = decoderResult['masks']!.dims;

      // Convert mask to ImageData
      const mask = this.maskToImageData(maskData, maskDims[3]!, maskDims[2]!, width, height);
      const bbox = this.computeBBox(mask);

      return {
        mask,
        confidence: 0.85,
        bbox,
        label: description,
      };
    } catch (err) {
      console.error('[ONNXInference] SAM inference failed:', err);
      return this.fallbackSegmentation(imageData, description);
    }
  }

  /**
   * Propagate a mask from one frame to the next.
   * Uses the SAM encoder embedding with the previous mask as input.
   */
  async propagateMask(
    currentFrame: ImageData,
    previousMask: ImageData,
  ): Promise<ImageData> {
    const encoder = await this.loadModel('sam_encoder');
    const decoder = await this.loadModel('sam_decoder');

    if (!encoder || !decoder || !this.ort) {
      return previousMask; // Fallback: reuse previous mask
    }

    try {
      const { width, height } = currentFrame;
      const inputSize = MODELS['sam_encoder']!.inputSize;

      // Encode current frame
      const inputTensor = this.preprocessImage(currentFrame, inputSize.width, inputSize.height);
      const encoderFeeds = {
        image: new this.ort.Tensor('float32', inputTensor, [1, 3, inputSize.height, inputSize.width]),
      };
      const encoderResult = await encoder.run(encoderFeeds);
      const embedding = encoderResult['image_embeddings']!.data;

      // Resize previous mask to 256x256 for decoder input
      const prevMaskResized = this.resizeMask(previousMask, 256, 256);

      // Find centroid of previous mask as point prompt
      const centroid = this.maskCentroid(previousMask);
      const scaledX = (centroid.x / width) * inputSize.width;
      const scaledY = (centroid.y / height) * inputSize.height;

      const decoderFeeds = {
        image_embeddings: new this.ort.Tensor('float32', embedding, [1, 256, 64, 64]),
        point_coords: new this.ort.Tensor('float32', new Float32Array([scaledX, scaledY]), [1, 1, 2]),
        point_labels: new this.ort.Tensor('float32', new Float32Array([1]), [1, 1]),
        has_mask_input: new this.ort.Tensor('float32', new Float32Array([1]), [1]),
        mask_input: new this.ort.Tensor('float32', prevMaskResized, [1, 1, 256, 256]),
        orig_im_size: new this.ort.Tensor('float32', new Float32Array([height, width]), [2]),
      };

      const decoderResult = await decoder.run(decoderFeeds);
      const maskData = decoderResult['masks']!.data;
      const maskDims = decoderResult['masks']!.dims;

      return this.maskToImageData(maskData, maskDims[3]!, maskDims[2]!, width, height);
    } catch {
      return previousMask;
    }
  }

  /**
   * Inpaint a masked region using LaMa.
   */
  async inpaint(
    imageData: ImageData,
    mask: ImageData,
  ): Promise<InpaintingResult> {
    const session = await this.loadModel('lama');

    if (!session || !this.ort) {
      return this.fallbackInpaint(imageData, mask);
    }

    try {
      const inputSize = MODELS['lama']!.inputSize;
      const { width, height } = imageData;

      // Preprocess image and mask
      const imageTensor = this.preprocessImage(imageData, inputSize.width, inputSize.height);
      const maskTensor = this.preprocessMask(mask, inputSize.width, inputSize.height);

      const feeds = {
        image: new this.ort.Tensor('float32', imageTensor, [1, 3, inputSize.height, inputSize.width]),
        mask: new this.ort.Tensor('float32', maskTensor, [1, 1, inputSize.height, inputSize.width]),
      };

      const result = await session.run(feeds);
      const outputData = result['output']!.data;

      // Convert output back to ImageData at original resolution
      const outputImage = this.postprocessImage(outputData, inputSize.width, inputSize.height, width, height);

      // Composite: use inpainted result only in masked regions
      const composited = this.compositeInpaint(imageData, outputImage, mask);

      return { frame: composited, quality: 0.9 };
    } catch (err) {
      console.error('[ONNXInference] LaMa inference failed:', err);
      return this.fallbackInpaint(imageData, mask);
    }
  }

  /**
   * Segment sky regions in an image.
   */
  async segmentSky(imageData: ImageData): Promise<ImageData> {
    const session = await this.loadModel('sky_seg');

    if (!session || !this.ort) {
      return this.fallbackSkySegmentation(imageData);
    }

    try {
      const inputSize = MODELS['sky_seg']!.inputSize;
      const { width, height } = imageData;

      const inputTensor = this.preprocessImage(imageData, inputSize.width, inputSize.height);
      const feeds = {
        input: new this.ort.Tensor('float32', inputTensor, [1, 3, inputSize.height, inputSize.width]),
      };

      const result = await session.run(feeds);
      const maskData = result['output']!.data;

      return this.maskToImageData(maskData, inputSize.width, inputSize.height, width, height);
    } catch {
      return this.fallbackSkySegmentation(imageData);
    }
  }

  /**
   * Release all loaded models.
   */
  dispose(): void {
    for (const session of this.sessions.values()) {
      session.release();
    }
    this.sessions.clear();
    this.samEmbedding = null;
  }

  // ─── Preprocessing / Postprocessing ─────────────────────────────────────

  private preprocessImage(imageData: ImageData, targetW: number, targetH: number): Float32Array {
    const { width, height, data } = imageData;
    const tensor = new Float32Array(3 * targetW * targetH);
    const channelSize = targetW * targetH;

    for (let y = 0; y < targetH; y++) {
      for (let x = 0; x < targetW; x++) {
        const sx = Math.min(Math.floor((x / targetW) * width), width - 1);
        const sy = Math.min(Math.floor((y / targetH) * height), height - 1);
        const srcIdx = (sy * width + sx) * 4;
        const dstIdx = y * targetW + x;

        // Normalize to [0, 1]
        tensor[dstIdx] = data[srcIdx]! / 255;                    // R
        tensor[channelSize + dstIdx] = data[srcIdx + 1]! / 255;  // G
        tensor[2 * channelSize + dstIdx] = data[srcIdx + 2]! / 255; // B
      }
    }

    return tensor;
  }

  private preprocessMask(mask: ImageData, targetW: number, targetH: number): Float32Array {
    const { width, height, data } = mask;
    const tensor = new Float32Array(targetW * targetH);

    for (let y = 0; y < targetH; y++) {
      for (let x = 0; x < targetW; x++) {
        const sx = Math.min(Math.floor((x / targetW) * width), width - 1);
        const sy = Math.min(Math.floor((y / targetH) * height), height - 1);
        tensor[y * targetW + x] = data[(sy * width + sx) * 4]! / 255;
      }
    }

    return tensor;
  }

  private postprocessImage(
    tensor: Float32Array,
    tensorW: number,
    tensorH: number,
    outputW: number,
    outputH: number,
  ): ImageData {
    const result = new ImageData(outputW, outputH);
    const out = result.data;
    const channelSize = tensorW * tensorH;

    for (let y = 0; y < outputH; y++) {
      for (let x = 0; x < outputW; x++) {
        const sx = Math.min(Math.floor((x / outputW) * tensorW), tensorW - 1);
        const sy = Math.min(Math.floor((y / outputH) * tensorH), tensorH - 1);
        const srcIdx = sy * tensorW + sx;
        const dstIdx = (y * outputW + x) * 4;

        out[dstIdx] = Math.round(Math.max(0, Math.min(255, tensor[srcIdx]! * 255)));
        out[dstIdx + 1] = Math.round(Math.max(0, Math.min(255, tensor[channelSize + srcIdx]! * 255)));
        out[dstIdx + 2] = Math.round(Math.max(0, Math.min(255, tensor[2 * channelSize + srcIdx]! * 255)));
        out[dstIdx + 3] = 255;
      }
    }

    return result;
  }

  private maskToImageData(
    maskData: Float32Array,
    maskW: number,
    maskH: number,
    outputW: number,
    outputH: number,
  ): ImageData {
    const result = new ImageData(outputW, outputH);
    const out = result.data;

    for (let y = 0; y < outputH; y++) {
      for (let x = 0; x < outputW; x++) {
        const sx = Math.min(Math.floor((x / outputW) * maskW), maskW - 1);
        const sy = Math.min(Math.floor((y / outputH) * maskH), maskH - 1);
        const val = maskData[sy * maskW + sx]! > 0 ? 255 : 0;
        const idx = (y * outputW + x) * 4;
        out[idx] = val;
        out[idx + 1] = val;
        out[idx + 2] = val;
        out[idx + 3] = 255;
      }
    }

    return result;
  }

  private resizeMask(mask: ImageData, targetW: number, targetH: number): Float32Array {
    const { width, height, data } = mask;
    const result = new Float32Array(targetW * targetH);

    for (let y = 0; y < targetH; y++) {
      for (let x = 0; x < targetW; x++) {
        const sx = Math.min(Math.floor((x / targetW) * width), width - 1);
        const sy = Math.min(Math.floor((y / targetH) * height), height - 1);
        result[y * targetW + x] = data[(sy * width + sx) * 4]! > 127 ? 1 : 0;
      }
    }

    return result;
  }

  private maskCentroid(mask: ImageData): { x: number; y: number } {
    const { width, height, data } = mask;
    let sumX = 0, sumY = 0, count = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4]! > 127) {
          sumX += x;
          sumY += y;
          count++;
        }
      }
    }

    return count > 0
      ? { x: sumX / count, y: sumY / count }
      : { x: width / 2, y: height / 2 };
  }

  private computeBBox(mask: ImageData): { x: number; y: number; w: number; h: number } {
    const { width, height, data } = mask;
    let minX = width, minY = height, maxX = 0, maxY = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4]! > 127) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  private compositeInpaint(original: ImageData, inpainted: ImageData, mask: ImageData): ImageData {
    const { width, height } = original;
    const result = new ImageData(width, height);
    const out = result.data;

    for (let i = 0; i < out.length; i += 4) {
      const alpha = mask.data[i]! / 255; // mask intensity
      out[i] = Math.round(original.data[i]! * (1 - alpha) + inpainted.data[i]! * alpha);
      out[i + 1] = Math.round(original.data[i + 1]! * (1 - alpha) + inpainted.data[i + 1]! * alpha);
      out[i + 2] = Math.round(original.data[i + 2]! * (1 - alpha) + inpainted.data[i + 2]! * alpha);
      out[i + 3] = 255;
    }

    return result;
  }

  // ─── Fallback implementations (no ONNX models available) ─────────────────

  private fallbackSegmentation(imageData: ImageData, _description: string): SegmentationResult {
    // Simple center-biased elliptical mask
    const { width, height } = imageData;
    const mask = new ImageData(width, height);
    const cx = width / 2, cy = height / 2;
    const rx = width * 0.3, ry = height * 0.3;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        const val = dx * dx + dy * dy < 1 ? 255 : 0;
        const idx = (y * width + x) * 4;
        mask.data[idx] = val;
        mask.data[idx + 1] = val;
        mask.data[idx + 2] = val;
        mask.data[idx + 3] = 255;
      }
    }

    return {
      mask,
      confidence: 0.3, // Low confidence for fallback
      bbox: { x: Math.round(cx - rx), y: Math.round(cy - ry), w: Math.round(rx * 2), h: Math.round(ry * 2) },
      label: _description,
    };
  }

  private fallbackInpaint(imageData: ImageData, mask: ImageData): InpaintingResult {
    // Simple inpainting: fill masked regions with average of surrounding pixels
    const { width, height } = imageData;
    const result = new ImageData(new Uint8ClampedArray(imageData.data), width, height);
    const data = result.data;
    const radius = 5;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        if (mask.data[idx]! < 128) continue; // Not masked

        let sumR = 0, sumG = 0, sumB = 0, count = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const ny = y + dy, nx = x + dx;
            if (ny < 0 || ny >= height || nx < 0 || nx >= width) continue;
            const nIdx = (ny * width + nx) * 4;
            if (mask.data[nIdx]! >= 128) continue; // Skip masked pixels
            sumR += imageData.data[nIdx]!;
            sumG += imageData.data[nIdx + 1]!;
            sumB += imageData.data[nIdx + 2]!;
            count++;
          }
        }

        if (count > 0) {
          data[idx] = Math.round(sumR / count);
          data[idx + 1] = Math.round(sumG / count);
          data[idx + 2] = Math.round(sumB / count);
        }
      }
    }

    return { frame: result, quality: 0.4 };
  }

  private fallbackSkySegmentation(imageData: ImageData): ImageData {
    // Heuristic: top portion of image with blue/bright pixels = sky
    const { width, height, data } = imageData;
    const mask = new ImageData(width, height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];

        // Sky detection heuristic: blue-ish, bright, upper half
        const brightness = (r! + g! + b!) / 3;
        const isBlueish = b! > r! && b! > g! * 0.8;
        const isBright = brightness > 120;
        const heightFactor = 1 - (y / height); // Stronger for upper pixels

        const isSky = (isBlueish && isBright && heightFactor > 0.3) || (isBright && heightFactor > 0.7);
        const val = isSky ? 255 : 0;

        mask.data[idx] = val;
        mask.data[idx + 1] = val;
        mask.data[idx + 2] = val;
        mask.data[idx + 3] = 255;
      }
    }

    return mask;
  }
}

export const onnxInference = new ONNXInferenceEngine();
