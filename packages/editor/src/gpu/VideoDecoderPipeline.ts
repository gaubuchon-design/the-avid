/**
 * WebCodecs-based hardware-accelerated video decoding.
 * Falls back to <video> element when WebCodecs unavailable.
 */

export interface DecodedFrame {
  frame: VideoFrame | ImageBitmap;
  timestamp: number;
  duration: number;
}

/** Default timeout for decode operations (5 seconds). */
const DECODE_TIMEOUT_MS = 5000;

export class VideoDecoderPipeline {
  private decoder: VideoDecoder | null = null;
  private pendingFrames: Map<number, {
    resolve: (frame: DecodedFrame) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = new Map();

  static isSupported(): boolean {
    return typeof VideoDecoder !== 'undefined';
  }

  async initialize(codec: string = 'avc1.42E01E'): Promise<boolean> {
    if (!VideoDecoderPipeline.isSupported()) return false;

    try {
      const support = await VideoDecoder.isConfigSupported({
        codec,
        hardwareAcceleration: 'prefer-hardware',
      });

      if (!support.supported) return false;

      this.decoder = new VideoDecoder({
        output: (frame: VideoFrame) => {
          const pending = this.pendingFrames.get(frame.timestamp || 0);
          if (pending) {
            clearTimeout(pending.timer);
            this.pendingFrames.delete(frame.timestamp || 0);
            pending.resolve({
              frame,
              timestamp: frame.timestamp || 0,
              duration: frame.duration || 0,
            });
          } else {
            frame.close();
          }
        },
        error: (err) => {
          console.error('[VideoDecoder] Error:', err);
          // Reject all pending frames on decoder error
          for (const [ts, pending] of this.pendingFrames) {
            clearTimeout(pending.timer);
            pending.reject(new Error(`Decoder error: ${err.message}`));
          }
          this.pendingFrames.clear();
        },
      });

      this.decoder.configure({
        codec,
        hardwareAcceleration: 'prefer-hardware',
      });

      return true;
    } catch {
      return false;
    }
  }

  async decodeChunk(
    data: BufferSource,
    timestamp: number,
    isKeyframe: boolean,
  ): Promise<DecodedFrame> {
    if (!this.decoder) throw new Error('Decoder not initialized');

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingFrames.delete(timestamp);
        reject(new Error(`Decode timed out for timestamp ${timestamp}`));
      }, DECODE_TIMEOUT_MS);

      this.pendingFrames.set(timestamp, { resolve, reject, timer });

      const chunk = new EncodedVideoChunk({
        type: isKeyframe ? 'key' : 'delta',
        timestamp,
        data,
      });

      this.decoder!.decode(chunk);
    });
  }

  async flush(): Promise<void> {
    await this.decoder?.flush();
  }

  destroy(): void {
    // Reject all pending decode operations before cleanup
    for (const [, pending] of this.pendingFrames) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Decoder destroyed'));
    }
    this.pendingFrames.clear();

    this.decoder?.close();
    this.decoder = null;
  }
}
