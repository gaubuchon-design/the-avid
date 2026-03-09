// =============================================================================
//  THE AVID — Media Probe Engine
//  Extracts metadata from media files using browser APIs:
//  HTMLVideoElement, AudioContext, createImageBitmap, WebCodecs VideoFrame.
// =============================================================================

export interface ExtractedMetadata {
  duration: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  colorSpace: string;
  hasAlpha: boolean;
  audioChannels: number;
  sampleRate: number;
  fileSize: number;
  startTimecode: string;
  bitDepth: number;
  mimeType: string;
  thumbnailUrl?: string;
  waveformData?: Float32Array;
}

// ─── Codec Detection ──────────────────────────────────────────────────────────

const EXTENSION_CODEC_MAP: Record<string, string> = {
  mp4: 'H.264/AAC', m4v: 'H.264', mov: 'ProRes/H.264', avi: 'AVI',
  mkv: 'Matroska', webm: 'VP9/Opus', ogv: 'Theora/Vorbis',
  mxf: 'MXF/DNxHD', ts: 'MPEG-TS', mpg: 'MPEG-2', mpeg: 'MPEG-2',
  mp3: 'MP3', wav: 'PCM/WAV', aac: 'AAC', flac: 'FLAC',
  ogg: 'Vorbis', aiff: 'AIFF', wma: 'WMA', m4a: 'AAC',
  png: 'PNG', jpg: 'JPEG', jpeg: 'JPEG', webp: 'WebP',
  avif: 'AVIF', tiff: 'TIFF', tif: 'TIFF', bmp: 'BMP',
  svg: 'SVG', gif: 'GIF', exr: 'OpenEXR', dpx: 'DPX',
  psd: 'Photoshop', tga: 'Targa',
};

const MIME_COLOR_SPACE_HINTS: Record<string, string> = {
  'video/mp4': 'bt709',
  'video/webm': 'bt709',
  'video/quicktime': 'bt709',
};

function detectCodec(file: File): string {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (EXTENSION_CODEC_MAP[ext]) return EXTENSION_CODEC_MAP[ext];
  if (file.type) {
    const parts = file.type.split('/');
    return parts[1]?.toUpperCase() ?? 'Unknown';
  }
  return 'Unknown';
}

function detectFps(duration: number, _file: File): number {
  // Default heuristic — prefer common rates.  Real detection would
  // require demuxing (mp4box.js) or WebCodecs chunk timing.
  const ext = _file.name.split('.').pop()?.toLowerCase() ?? '';
  if (['mxf', 'mov'].includes(ext)) return 23.976;
  if (['ts', 'mpg', 'mpeg'].includes(ext)) return 29.97;
  if (duration > 0) return 23.976; // common cinema default
  return 29.97;
}

// ─── Image Alpha Detection ────────────────────────────────────────────────────

async function imageHasAlpha(file: File): Promise<boolean> {
  const mime = file.type.toLowerCase();
  // Only PNG, WebP, AVIF, TIFF, EXR, TGA, PSD can have alpha
  if (!['image/png', 'image/webp', 'image/avif', 'image/tiff'].includes(mime)) {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!['exr', 'tga', 'psd', 'tiff', 'tif'].includes(ext)) return false;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const canvas = new OffscreenCanvas(Math.min(bitmap.width, 64), Math.min(bitmap.height, 64));
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    bitmap.close();
    // Check if any pixel has alpha < 255
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 255) return true;
    }
  } catch {
    // Fallback: assume alpha if format supports it
    return true;
  }
  return false;
}

// ─── Thumbnail Generation ─────────────────────────────────────────────────────

function generateVideoThumbnail(video: HTMLVideoElement, time: number): Promise<string> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = 192;
    canvas.height = Math.round(192 * (video.videoHeight / (video.videoWidth || 1)));
    const ctx = canvas.getContext('2d');
    if (!ctx) { resolve(''); return; }

    // Guard against non-finite time values (common with MediaRecorder WebM)
    const safeTime = isFinite(time) && time > 0 ? time : 0;

    const seek = () => {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };

    // Timeout to prevent hanging forever
    const timeout = setTimeout(() => {
      // Still capture current frame even if seek didn't work
      if (video.readyState >= 2) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      } else {
        resolve('');
      }
    }, 3000);

    const seekAndCapture = () => {
      video.addEventListener('seeked', () => {
        clearTimeout(timeout);
        seek();
      }, { once: true });
      video.currentTime = safeTime;
    };

    if (video.readyState >= 2) {
      seekAndCapture();
    } else {
      video.addEventListener('loadeddata', seekAndCapture, { once: true });
    }
  });
}

async function generateImageThumbnail(file: File): Promise<string> {
  try {
    const bitmap = await createImageBitmap(file);
    const aspect = bitmap.height / bitmap.width;
    const canvas = document.createElement('canvas');
    canvas.width = 192;
    canvas.height = Math.round(192 * aspect);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL('image/jpeg', 0.7);
  } catch {
    return '';
  }
}

// ─── Waveform Generation ──────────────────────────────────────────────────────

async function generateWaveform(file: File, samples = 200): Promise<Float32Array> {
  try {
    const arrayBuf = await file.arrayBuffer();
    const audioCtx = new OfflineAudioContext(1, 44100, 44100);
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuf);
    const channelData = audioBuffer.getChannelData(0);
    const blockSize = Math.floor(channelData.length / samples);
    const waveform = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      let sum = 0;
      const start = i * blockSize;
      for (let j = 0; j < blockSize; j++) {
        sum += Math.abs(channelData[start + j] ?? 0);
      }
      waveform[i] = sum / blockSize;
    }
    return waveform;
  } catch {
    return new Float32Array(samples);
  }
}

// ─── Color Space via WebCodecs ────────────────────────────────────────────────

async function detectColorSpace(file: File): Promise<string> {
  // Try VideoFrame API if available (WebCodecs)
  if (typeof VideoFrame !== 'undefined') {
    try {
      const bitmap = await createImageBitmap(file.slice(0, 1024 * 1024));
      const frame = new VideoFrame(bitmap, { timestamp: 0 });
      const cs = (frame as any).colorSpace;
      frame.close();
      bitmap.close();
      if (cs?.primaries) return cs.primaries; // 'bt709', 'bt2020', 'smpte432' (P3)
    } catch { /* fall through */ }
  }
  return MIME_COLOR_SPACE_HINTS[file.type] ?? 'bt709';
}

// ─── Main Extraction ──────────────────────────────────────────────────────────

class MediaProbeEngineClass {
  /**
   * Extract comprehensive metadata from a media file.
   * Works for video, audio, image, and graphic files.
   */
  async extract(file: File, onProgress?: (p: number) => void): Promise<ExtractedMetadata> {
    const mime = file.type || '';
    const isVideo = mime.startsWith('video/') || ['mov', 'mxf', 'avi', 'mkv'].includes(
      file.name.split('.').pop()?.toLowerCase() ?? ''
    );
    const isAudio = mime.startsWith('audio/');
    const isImage = mime.startsWith('image/') || ['exr', 'dpx', 'tga', 'psd'].includes(
      file.name.split('.').pop()?.toLowerCase() ?? ''
    );

    onProgress?.(0.1);

    if (isVideo) return this.extractVideo(file, onProgress);
    if (isAudio) return this.extractAudio(file, onProgress);
    if (isImage) return this.extractImage(file, onProgress);

    // Fallback for unknown types
    onProgress?.(1);
    return {
      duration: 0, width: 0, height: 0, fps: 0,
      codec: detectCodec(file), colorSpace: 'srgb', hasAlpha: false,
      audioChannels: 0, sampleRate: 0, fileSize: file.size,
      startTimecode: '00:00:00:00', bitDepth: 8, mimeType: mime,
    };
  }

  private async extractVideo(file: File, onProgress?: (p: number) => void): Promise<ExtractedMetadata> {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.src = url;

    const meta = await new Promise<{ duration: number; width: number; height: number }>((resolve, reject) => {
      video.addEventListener('loadedmetadata', () => {
        resolve({
          duration: isFinite(video.duration) ? video.duration : 0,
          width: video.videoWidth,
          height: video.videoHeight,
        });
      }, { once: true });
      video.addEventListener('error', () => reject(new Error('Failed to load video')), { once: true });
    });

    onProgress?.(0.3);

    const fps = detectFps(meta.duration, file);
    const codec = detectCodec(file);
    const colorSpace = await detectColorSpace(file);

    onProgress?.(0.5);

    // Generate thumbnail at 10% of duration
    const thumbnailUrl = await generateVideoThumbnail(video, meta.duration * 0.1);

    onProgress?.(0.7);

    // Generate audio waveform from video
    let waveformData: Float32Array | undefined;
    try {
      waveformData = await generateWaveform(file);
    } catch { /* no audio track or decode failed */ }

    onProgress?.(0.9);

    // Estimate audio channels (default to stereo for video)
    const audioChannels = 2;
    const sampleRate = 48000;

    // Compute start timecode (frame 0 by default)
    const startTimecode = '00:00:00:00';

    URL.revokeObjectURL(url);

    onProgress?.(1);

    return {
      duration: meta.duration,
      width: meta.width,
      height: meta.height,
      fps,
      codec,
      colorSpace,
      hasAlpha: await this.detectVideoAlpha(file),
      audioChannels,
      sampleRate,
      fileSize: file.size,
      startTimecode,
      bitDepth: 8,
      mimeType: file.type,
      thumbnailUrl,
      waveformData,
    };
  }

  private async extractAudio(file: File, onProgress?: (p: number) => void): Promise<ExtractedMetadata> {
    const url = URL.createObjectURL(file);
    const audio = document.createElement('audio');
    audio.preload = 'auto';
    audio.src = url;

    const duration = await new Promise<number>((resolve, reject) => {
      audio.addEventListener('loadedmetadata', () => resolve(audio.duration), { once: true });
      audio.addEventListener('error', () => reject(new Error('Failed to load audio')), { once: true });
    });

    onProgress?.(0.3);

    // Decode for channel info and waveform
    let audioChannels = 2;
    let sampleRate = 44100;
    let waveformData: Float32Array | undefined;

    try {
      const arrayBuf = await file.arrayBuffer();
      const offCtx = new OfflineAudioContext(1, 44100, 44100);
      const audioBuffer = await offCtx.decodeAudioData(arrayBuf);
      audioChannels = audioBuffer.numberOfChannels;
      sampleRate = audioBuffer.sampleRate;

      onProgress?.(0.6);

      // Generate waveform
      const channelData = audioBuffer.getChannelData(0);
      const samples = 200;
      const blockSize = Math.floor(channelData.length / samples);
      waveformData = new Float32Array(samples);
      for (let i = 0; i < samples; i++) {
        let sum = 0;
        const start = i * blockSize;
        for (let j = 0; j < blockSize; j++) {
          sum += Math.abs(channelData[start + j] ?? 0);
        }
        waveformData[i] = sum / blockSize;
      }
    } catch { /* fallback */ }

    URL.revokeObjectURL(url);
    onProgress?.(1);

    return {
      duration,
      width: 0,
      height: 0,
      fps: 0,
      codec: detectCodec(file),
      colorSpace: 'n/a',
      hasAlpha: false,
      audioChannels,
      sampleRate,
      fileSize: file.size,
      startTimecode: '00:00:00:00',
      bitDepth: file.type.includes('wav') ? 24 : 16,
      mimeType: file.type,
      waveformData,
    };
  }

  /**
   * Detect if a video file contains an alpha channel.
   * Uses WebCodecs VideoFrame API when available to check pixel format,
   * and falls back to extension-based heuristics for known alpha-capable codecs.
   */
  private async detectVideoAlpha(file: File): Promise<boolean> {
    // Extension-based heuristic: formats known to support alpha
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const alphaCapableExts = ['mov', 'webm', 'mkv', 'avi']; // ProRes 4444, VP9, etc.
    const alphaCodecHints = ['prores', '4444', 'vp9', 'vp09', 'hap'];

    // Check if format can carry alpha at all
    if (!alphaCapableExts.includes(ext)) return false;

    // Try WebCodecs VideoFrame API to detect actual pixel format
    if (typeof VideoFrame !== 'undefined') {
      try {
        const blob = file.slice(0, 2 * 1024 * 1024); // Read first 2MB
        const bitmap = await createImageBitmap(blob);
        const frame = new VideoFrame(bitmap, { timestamp: 0 });
        const format = (frame as any).format as string | undefined;
        frame.close();
        bitmap.close();
        // RGBA/BGRA formats have alpha; RGBX/I420/NV12 do not
        if (format && (format.includes('RGBA') || format.includes('BGRA'))) {
          return true;
        }
        if (format) return false; // Known format without alpha
      } catch { /* fall through to heuristic */ }
    }

    // Codec name heuristic — if codec suggests alpha capability
    const codec = EXTENSION_CODEC_MAP[ext]?.toLowerCase() ?? '';
    return alphaCodecHints.some((hint) => codec.includes(hint));
  }

  private async extractImage(file: File, onProgress?: (p: number) => void): Promise<ExtractedMetadata> {
    let width = 0, height = 0;

    try {
      const bitmap = await createImageBitmap(file);
      width = bitmap.width;
      height = bitmap.height;
      bitmap.close();
    } catch { /* unsupported format */ }

    onProgress?.(0.4);

    const hasAlpha = await imageHasAlpha(file);

    onProgress?.(0.6);

    const thumbnailUrl = await generateImageThumbnail(file);

    onProgress?.(1);

    return {
      duration: 0,
      width,
      height,
      fps: 0,
      codec: detectCodec(file),
      colorSpace: 'srgb',
      hasAlpha,
      audioChannels: 0,
      sampleRate: 0,
      fileSize: file.size,
      startTimecode: '00:00:00:00',
      bitDepth: hasAlpha ? 32 : 24,
      mimeType: file.type,
      thumbnailUrl,
    };
  }
}

export const mediaProbeEngine = new MediaProbeEngineClass();
