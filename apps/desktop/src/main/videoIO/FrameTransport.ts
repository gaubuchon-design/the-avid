// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID -- Zero-Copy Frame Transport via SharedArrayBuffer
// ═══════════════════════════════════════════════════════════════════════════
//
// Double-buffered ring for transferring video frames between the Electron
// main process (capture/playback) and the renderer (canvas display).
//
// Layout per buffer slot:
//   [0]       Atomic flag: 0 = free, 1 = written by producer, 2 = read by consumer
//   [4..7]    Frame width (uint32)
//   [8..11]   Frame height (uint32)
//   [12..15]  Frame number (uint32)
//   [16..23]  Timestamp (float64)
//   [24..55]  Timecode string (32 bytes UTF-8)
//   [64..]    Pixel data
//
// ═══════════════════════════════════════════════════════════════════════════

const HEADER_SIZE = 64;
const FLAG_FREE = 0;
const FLAG_WRITTEN = 1;
const FLAG_READ = 2;
const TC_OFFSET = 24;
const TC_MAX_LEN = 32;

export interface FrameMetadata {
  width: number;
  height: number;
  frameNumber: number;
  timestamp: number;
  timecode: string;
}

/**
 * Double-buffered frame transport using SharedArrayBuffer.
 *
 * Producer (main process) writes into the current write slot,
 * consumer (renderer) reads from the current read slot.
 * Atomic flags ensure lock-free synchronization.
 */
export class FrameTransport {
  private sab: SharedArrayBuffer;
  private slotSize: number;
  private int32View: Int32Array;
  private uint32View: Uint32Array;
  private float64View: Float64Array;
  private uint8View: Uint8Array;
  private writeSlot = 0;

  /**
   * Create a frame transport buffer.
   * @param maxFrameBytes Maximum pixel data size per frame.
   * @param slots Number of buffer slots (default 2 for double-buffering).
   */
  constructor(maxFrameBytes: number, private slots = 2) {
    this.slotSize = HEADER_SIZE + maxFrameBytes;
    // Align slot size to 8 bytes for Float64 access
    this.slotSize = Math.ceil(this.slotSize / 8) * 8;

    const totalSize = this.slotSize * this.slots;
    this.sab = new SharedArrayBuffer(totalSize);
    this.int32View = new Int32Array(this.sab);
    this.uint32View = new Uint32Array(this.sab);
    this.float64View = new Float64Array(this.sab);
    this.uint8View = new Uint8Array(this.sab);

    // Initialize all slots as free
    for (let i = 0; i < this.slots; i++) {
      Atomics.store(this.int32View, this.slotOffset32(i), FLAG_FREE);
    }
  }

  /** Get the underlying SharedArrayBuffer for IPC transfer. */
  getBuffer(): SharedArrayBuffer {
    return this.sab;
  }

  /** Get the total buffer size in bytes. */
  getBufferSize(): number {
    return this.sab.byteLength;
  }

  /** Get the maximum payload size per frame in bytes. */
  getMaxPayloadSize(): number {
    return this.slotSize - HEADER_SIZE;
  }

  // ── Producer API (main process) ─────────────────────────────────────────

  /**
   * Write a frame into the next available slot.
   * If the slot is still being read, this skips (drops the frame).
   * @returns true if the frame was written, false if dropped.
   */
  writeFrame(
    pixelData: ArrayBuffer | Uint8Array,
    metadata: FrameMetadata,
  ): boolean {
    const slot = this.writeSlot;
    const flagIdx = this.slotOffset32(slot);

    // Check if slot is free (consumer has read it or it was never written)
    const currentFlag = Atomics.load(this.int32View, flagIdx);
    if (currentFlag === FLAG_WRITTEN) {
      // Consumer hasn't read previous frame — drop this one
      return false;
    }

    const byteOffset = slot * this.slotSize;

    // Write header
    this.uint32View[(byteOffset + 4) >> 2] = metadata.width;
    this.uint32View[(byteOffset + 8) >> 2] = metadata.height;
    this.uint32View[(byteOffset + 12) >> 2] = metadata.frameNumber;
    this.float64View[(byteOffset + 16) >> 3] = metadata.timestamp;

    // Write timecode string (UTF-8, null-padded)
    const tcBytes = new TextEncoder().encode(metadata.timecode);
    this.uint8View.fill(0, byteOffset + TC_OFFSET, byteOffset + TC_OFFSET + TC_MAX_LEN);
    this.uint8View.set(
      tcBytes.subarray(0, Math.min(tcBytes.length, TC_MAX_LEN)),
      byteOffset + TC_OFFSET,
    );

    // Write pixel data
    const src = pixelData instanceof Uint8Array ? pixelData : new Uint8Array(pixelData);
    const maxPayload = this.slotSize - HEADER_SIZE;
    const copyLen = Math.min(src.length, maxPayload);
    this.uint8View.set(src.subarray(0, copyLen), byteOffset + HEADER_SIZE);

    // Mark slot as written (release)
    Atomics.store(this.int32View, flagIdx, FLAG_WRITTEN);

    // Advance to next slot
    this.writeSlot = (slot + 1) % this.slots;
    return true;
  }

  // ── Consumer API (renderer) ─────────────────────────────────────────────

  /**
   * Read the latest available frame.
   * @returns The frame metadata and a Uint8Array view into the pixel data,
   *          or null if no frame is available.
   */
  readFrame(): { metadata: FrameMetadata; pixelData: Uint8Array } | null {
    // Find the most recently written slot
    for (let attempt = 0; attempt < this.slots; attempt++) {
      const readSlot = (this.writeSlot - 1 - attempt + this.slots) % this.slots;
      const flagIdx = this.slotOffset32(readSlot);
      const currentFlag = Atomics.load(this.int32View, flagIdx);

      if (currentFlag === FLAG_WRITTEN) {
        const byteOffset = readSlot * this.slotSize;

        // Read header
        const width = this.uint32View[(byteOffset + 4) >> 2];
        const height = this.uint32View[(byteOffset + 8) >> 2];
        const frameNumber = this.uint32View[(byteOffset + 12) >> 2];
        const timestamp = this.float64View[(byteOffset + 16) >> 3];

        // Read timecode string
        const tcSlice = this.uint8View.subarray(
          byteOffset + TC_OFFSET,
          byteOffset + TC_OFFSET + TC_MAX_LEN,
        );
        const nullIdx = tcSlice.indexOf(0);
        const timecode = new TextDecoder().decode(
          tcSlice.subarray(0, nullIdx >= 0 ? nullIdx : TC_MAX_LEN),
        );

        // Get pixel data view (zero-copy — points into the SharedArrayBuffer)
        const pixelData = this.uint8View.subarray(
          byteOffset + HEADER_SIZE,
          byteOffset + this.slotSize,
        );

        // Mark slot as read (free for producer)
        Atomics.store(this.int32View, flagIdx, FLAG_READ);

        return {
          metadata: { width, height, frameNumber, timestamp, timecode },
          pixelData,
        };
      }
    }

    return null;
  }

  /**
   * Reset all slots to free state.
   */
  reset(): void {
    for (let i = 0; i < this.slots; i++) {
      Atomics.store(this.int32View, this.slotOffset32(i), FLAG_FREE);
    }
    this.writeSlot = 0;
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private slotOffset32(slot: number): number {
    return (slot * this.slotSize) >> 2;
  }
}

/**
 * Create a FrameTransport sized for a specific resolution.
 */
export function createFrameTransport(
  width: number,
  height: number,
  bytesPerPixel: number,
  slots = 2,
): FrameTransport {
  const maxFrameBytes = width * height * Math.ceil(bytesPerPixel);
  return new FrameTransport(maxFrameBytes, slots);
}
