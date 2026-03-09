// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — Video Source Manager
//  Manages HTMLVideoElement instances for real video playback.
// ═══════════════════════════════════════════════════════════════════════════

export interface VideoSource {
  assetId: string;
  url: string;
  element: HTMLVideoElement;
  duration: number;
  width: number;
  height: number;
  ready: boolean;
  objectUrl?: string; // track for cleanup
}

/**
 * Manages HTMLVideoElement instances for loaded media assets.
 * Handles objectURL lifecycle, seeking, play/pause control.
 */
class VideoSourceManager {
  private sources: Map<string, VideoSource> = new Map();
  private activeSourceId: string | null = null;
  private listeners = new Set<() => void>();

  /**
   * Load a video source from a URL or File.
   * Creates a hidden HTMLVideoElement and waits for metadata.
   */
  async loadSource(assetId: string, urlOrFile: string | File): Promise<VideoSource> {
    // If already loaded, return existing
    const existing = this.sources.get(assetId);
    if (existing?.ready) return existing;

    // Clean up any previous source with this ID
    this.unloadSource(assetId);

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    video.playsInline = true;
    // Muted so we can autoplay and route audio through Web Audio API
    video.muted = true;

    let url: string;
    let objectUrl: string | undefined;

    if (urlOrFile instanceof File) {
      objectUrl = URL.createObjectURL(urlOrFile);
      url = objectUrl;
    } else {
      url = urlOrFile;
    }

    video.src = url;

    const source: VideoSource = {
      assetId,
      url,
      element: video,
      duration: 0,
      width: 0,
      height: 0,
      ready: false,
      objectUrl,
    };

    this.sources.set(assetId, source);

    // Wait for metadata
    return new Promise<VideoSource>((resolve, reject) => {
      video.addEventListener('loadedmetadata', () => {
        source.duration = isFinite(video.duration) ? video.duration : 0;
        source.width = video.videoWidth;
        source.height = video.videoHeight;
        source.ready = true;
        this.notify();
        resolve(source);
      }, { once: true });

      video.addEventListener('error', () => {
        const err = video.error;
        console.error(`[VideoSourceManager] Failed to load ${assetId}:`, err?.message);
        this.sources.delete(assetId);
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        reject(new Error(err?.message ?? 'Video load failed'));
      }, { once: true });

      // Start loading
      video.load();
    });
  }

  /**
   * Load a video from a File object and return a thumbnail data URL.
   */
  async generateThumbnail(file: File, time = 0.5): Promise<string> {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'auto';
    video.playsInline = true;
    video.muted = true;
    video.src = objectUrl;

    return new Promise<string>((resolve, reject) => {
      video.addEventListener('loadedmetadata', () => {
        // Seek to the requested time (or 10% of duration)
        video.currentTime = Math.min(time, video.duration * 0.1);
      }, { once: true });

      video.addEventListener('seeked', () => {
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = Math.round(160 * (video.videoHeight / video.videoWidth));
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        }
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        URL.revokeObjectURL(objectUrl);
        resolve(dataUrl);
      }, { once: true });

      video.addEventListener('error', () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Thumbnail generation failed'));
      }, { once: true });

      video.load();
    });
  }

  /**
   * Set the active source for playback.
   */
  setActiveSource(assetId: string | null): void {
    // Pause previous
    if (this.activeSourceId && this.activeSourceId !== assetId) {
      const prev = this.sources.get(this.activeSourceId);
      if (prev?.element) {
        prev.element.pause();
      }
    }
    this.activeSourceId = assetId;
    this.notify();
  }

  /**
   * Get the currently active video source.
   */
  getActiveSource(): VideoSource | null {
    if (!this.activeSourceId) return null;
    return this.sources.get(this.activeSourceId) ?? null;
  }

  /**
   * Get a source by asset ID.
   */
  getSource(assetId: string): VideoSource | null {
    return this.sources.get(assetId) ?? null;
  }

  /**
   * Seek the active video to a specific time in seconds.
   */
  seekTo(time: number): void {
    const source = this.getActiveSource();
    if (!source?.element || !source.ready) return;
    if (!isFinite(time)) return;
    const maxDur = isFinite(source.duration) && source.duration > 0 ? source.duration : Infinity;
    const clampedTime = Math.max(0, Math.min(time, maxDur));
    if (Math.abs(source.element.currentTime - clampedTime) > 0.01) {
      source.element.currentTime = clampedTime;
    }
  }

  /**
   * Seek a video source to an exact time and capture an ImageBitmap.
   * Used by FrameCompositor for frame-accurate rendering.
   */
  async seekToExactFrame(assetId: string, timeSeconds: number): Promise<ImageBitmap | null> {
    const source = this.sources.get(assetId);
    if (!source?.element || !source.ready) return null;
    if (!isFinite(timeSeconds)) return null;

    const video = source.element;
    const maxDur = isFinite(source.duration) && source.duration > 0 ? source.duration : video.duration;
    const clampedTime = Math.max(0, isFinite(maxDur) ? Math.min(timeSeconds, maxDur) : timeSeconds);

    // If already at the right time (within half-frame tolerance), capture directly
    if (Math.abs(video.currentTime - clampedTime) < 0.01 && video.readyState >= 2) {
      try {
        return await createImageBitmap(video);
      } catch {
        return null;
      }
    }

    // Seek and wait for the seeked event before capturing
    return new Promise<ImageBitmap | null>((resolve) => {
      const onSeeked = async () => {
        video.removeEventListener('seeked', onSeeked);
        clearTimeout(timeout);
        try {
          const bitmap = await createImageBitmap(video);
          resolve(bitmap);
        } catch {
          resolve(null);
        }
      };

      // Timeout after 2 seconds to prevent hanging
      const timeout = setTimeout(() => {
        video.removeEventListener('seeked', onSeeked);
        resolve(null);
      }, 2000);

      video.addEventListener('seeked', onSeeked, { once: true });
      video.currentTime = clampedTime;
    });
  }

  /**
   * Play the active video.
   */
  play(): void {
    const source = this.getActiveSource();
    if (!source?.element || !source.ready) return;
    source.element.play().catch((err) => {
      console.warn('[VideoSourceManager] Play failed:', err.message);
    });
  }

  /**
   * Pause the active video.
   */
  pause(): void {
    const source = this.getActiveSource();
    if (!source?.element) return;
    source.element.pause();
  }

  /**
   * Set playback rate.
   */
  setPlaybackRate(rate: number): void {
    const source = this.getActiveSource();
    if (!source?.element) return;
    source.element.playbackRate = Math.abs(rate);
  }

  /**
   * Unload a specific source, revoking its objectURL if applicable.
   */
  unloadSource(assetId: string): void {
    const source = this.sources.get(assetId);
    if (!source) return;

    source.element.pause();
    source.element.src = '';
    source.element.load();

    if (source.objectUrl) {
      URL.revokeObjectURL(source.objectUrl);
    }

    this.sources.delete(assetId);

    if (this.activeSourceId === assetId) {
      this.activeSourceId = null;
    }
    this.notify();
  }

  /**
   * Get all loaded source IDs.
   */
  getLoadedSourceIds(): string[] {
    return Array.from(this.sources.keys());
  }

  /**
   * Check if a source is loaded and ready.
   */
  isReady(assetId: string): boolean {
    return this.sources.get(assetId)?.ready ?? false;
  }

  /**
   * Subscribe to state changes.
   */
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  private notify(): void {
    this.listeners.forEach((fn) => {
      try { fn(); } catch (err) {
        console.error('[VideoSourceManager] Listener error:', err);
      }
    });
  }

  /**
   * Dispose all sources.
   */
  dispose(): void {
    for (const [id] of this.sources) {
      this.unloadSource(id);
    }
    this.listeners.clear();
  }
}

/** Singleton video source manager instance. */
export const videoSourceManager = new VideoSourceManager();
