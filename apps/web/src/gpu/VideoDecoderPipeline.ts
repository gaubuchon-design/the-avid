/**
 * WebCodecs-based hardware-accelerated video decoding.
 * Falls back to <video> element when WebCodecs unavailable.
 */

export interface DecodedFrame {
  frame: VideoFrame | ImageBitmap;
  timestamp: number;
  duration: number;
}

export class VideoDecoderPipeline {
  private decoder: VideoDecoder | null = null;
  private pendingFrames: Map<number, (frame: DecodedFrame) => void> = new Map();

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
          const callback = this.pendingFrames.get(frame.timestamp || 0);
          if (callback) {
            this.pendingFrames.delete(frame.timestamp || 0);
            callback({
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

    return new Promise((resolve) => {
      this.pendingFrames.set(timestamp, resolve);

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
    this.decoder?.close();
    this.decoder = null;
    this.pendingFrames.clear();
  }
}
