// =============================================================================
//  THE AVID -- Subtitle Engine (Browser-native STT & Caption Formatting)
// =============================================================================
//
// Uses the Web Speech API (SpeechRecognition / webkitSpeechRecognition) to
// perform browser-native speech-to-text. When the API is unavailable, falls
// back to placeholder demo segments so the UI always has data to render.
//
// Exported singleton: `subtitleEngine`.


// -- Web Speech API type declarations (vendor-prefixed, not in lib.dom.d.ts) --

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

/** A single subtitle segment with timing, text, and optional metadata. */
export interface SubtitleSegment {
  start: number;  // seconds
  end: number;
  text: string;
  speaker?: string;
  confidence?: number;
}

/** Options controlling subtitle generation and formatting. */
export interface SubtitleGenerationOptions {
  language: string;
  maxCharsPerLine: number;
  maxLinesPerCue: number;
  minDuration: number;
  maxDuration: number;
}

/** Progress subscriber callback. */
type ProgressSubscriber = (progress: number, status: string) => void;

// -- Defaults -----------------------------------------------------------------

const DEFAULT_OPTIONS: SubtitleGenerationOptions = {
  language: 'en-US',
  maxCharsPerLine: 42,
  maxLinesPerCue: 2,
  minDuration: 1.0,
  maxDuration: 7.0,
};

// -- Demo / fallback data -----------------------------------------------------

const DEMO_SEGMENTS: SubtitleSegment[] = [
  { start: 2.0, end: 5.5, text: 'The morning light filtered through the curtains.', speaker: 'NARRATOR', confidence: 0.96 },
  { start: 5.8, end: 9.2, text: 'She stared at the phone, waiting for a sign.', speaker: 'NARRATOR', confidence: 0.94 },
  { start: 9.5, end: 13.0, text: 'We need to talk about the project deadline.', speaker: 'SARAH', confidence: 0.97 },
  { start: 13.5, end: 17.0, text: "I think we can make it work if we push.", speaker: 'SARAH', confidence: 0.95 },
  { start: 17.5, end: 21.0, text: 'The drone footage from yesterday is stunning.', speaker: 'MARCUS', confidence: 0.93 },
  { start: 21.5, end: 25.0, text: "Let's use the wide shot for the opening.", speaker: 'MARCUS', confidence: 0.92 },
  { start: 25.5, end: 29.0, text: 'Everything was about to change forever.', speaker: 'NARRATOR', confidence: 0.98 },
  { start: 29.5, end: 33.0, text: 'The city below hummed with restless energy.', speaker: 'NARRATOR', confidence: 0.96 },
  { start: 33.5, end: 37.0, text: "Hold on the wide a beat longer before we cut.", speaker: 'DIRECTOR', confidence: 0.91 },
  { start: 37.5, end: 40.0, text: 'And... that is a wrap on scene three.', speaker: 'DIRECTOR', confidence: 0.94 },
];

// -- Helpers ------------------------------------------------------------------

function pad2(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(2, '0');
}

function pad3(n: number): string {
  return String(Math.max(0, Math.round(n))).padStart(3, '0');
}

function secondsToSRT(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${pad2(h)}:${pad2(m)}:${pad2(s)},${pad3(ms)}`;
}

function secondsToVTT(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}.${pad3(ms)}`;
}

// -- Web Speech API runtime detection ----------------------------------------

/** Check whether the Web Speech API is available in this browser. */
function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | null {
  const w = globalThis as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as SpeechRecognitionConstructor | null;
}

// -- Engine -------------------------------------------------------------------

/**
 * Subtitle generation engine using browser-native SpeechRecognition.
 *
 * Usage:
 *   const segments = await subtitleEngine.generateFromMediaElement(videoEl);
 *   const srt      = subtitleEngine.formatAsSRT(segments);
 */
class SubtitleEngine {
  private subscribers = new Set<ProgressSubscriber>();

  // -- Progress subscription --------------------------------------------------

  /**
   * Subscribe for progress updates during generation.
   * @returns Unsubscribe function.
   */
  subscribe(cb: ProgressSubscriber): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  private emit(progress: number, status: string): void {
    this.subscribers.forEach((cb) => {
      try {
        cb(progress, status);
      } catch (err) {
        console.error('[SubtitleEngine] Subscriber error:', err);
      }
    });
  }

  // -- Generation from media element -----------------------------------------

  /**
   * Generate subtitles from an audio/video element using the Web Speech API.
   * Falls back to demo data when the API is unavailable.
   */
  async generateFromMediaElement(
    mediaElement: HTMLVideoElement | HTMLAudioElement,
    options?: Partial<SubtitleGenerationOptions>,
  ): Promise<SubtitleSegment[]> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const Ctor = getSpeechRecognitionCtor();

    if (!Ctor) {
      console.warn(
        '[SubtitleEngine] SpeechRecognition API not available. Returning demo data.',
      );
      return this.generateFallback(opts);
    }

    this.emit(0, 'Initializing speech recognition...');

    try {
      const segments = await this.recognizeFromElement(Ctor, mediaElement, opts);
      const final = this.autoSegment(segments, opts.maxCharsPerLine);
      this.emit(100, 'Complete');
      return final;
    } catch (err) {
      console.error('[SubtitleEngine] Recognition error, falling back to demo:', err);
      return this.generateFallback(opts);
    }
  }

  // -- Generation from blob ---------------------------------------------------

  /**
   * Generate subtitles from an audio Blob by creating a temporary media element.
   */
  async generateFromBlob(
    blob: Blob,
    options?: Partial<SubtitleGenerationOptions>,
  ): Promise<SubtitleSegment[]> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const Ctor = getSpeechRecognitionCtor();

    if (!Ctor) {
      console.warn(
        '[SubtitleEngine] SpeechRecognition API not available. Returning demo data.',
      );
      return this.generateFallback(opts);
    }

    this.emit(0, 'Preparing audio...');

    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    audio.src = url;

    try {
      await new Promise<void>((resolve, reject) => {
        audio.oncanplaythrough = () => resolve();
        audio.onerror = () => reject(new Error('Failed to load audio blob'));
        audio.load();
      });

      const segments = await this.recognizeFromElement(Ctor, audio, opts);
      const final = this.autoSegment(segments, opts.maxCharsPerLine);
      this.emit(100, 'Complete');
      return final;
    } catch (err) {
      console.error('[SubtitleEngine] Blob recognition error, falling back to demo:', err);
      return this.generateFallback(opts);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // -- Internal recognition ---------------------------------------------------

  private recognizeFromElement(
    Ctor: SpeechRecognitionConstructor,
    media: HTMLVideoElement | HTMLAudioElement,
    opts: SubtitleGenerationOptions,
  ): Promise<SubtitleSegment[]> {
    return new Promise((resolve, reject) => {
      const recognition = new Ctor();
      recognition.lang = opts.language;
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      const segments: SubtitleSegment[] = [];
      let segmentStart = 0;
      const duration = media.duration || 60;

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            const text = result[0].transcript.trim();
            if (!text) continue;

            const currentTime = media.currentTime;
            const confidence = result[0].confidence;
            const estimatedDuration = Math.max(
              opts.minDuration,
              Math.min(opts.maxDuration, text.length * 0.06),
            );
            const end = Math.min(currentTime, segmentStart + estimatedDuration);

            segments.push({
              start: segmentStart,
              end: Math.max(end, segmentStart + opts.minDuration),
              text,
              confidence,
            });

            segmentStart = end;

            // Report progress
            const progress = Math.min(95, Math.round((currentTime / duration) * 100));
            this.emit(progress, `Transcribing... ${segments.length} segments`);
          }
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error === 'no-speech') {
          // Acceptable, just means silence at this point
          return;
        }
        console.warn('[SubtitleEngine] Recognition error:', event.error);
        // Resolve with what we have so far rather than rejecting
        if (segments.length > 0) {
          resolve(segments);
        } else {
          reject(new Error(`Speech recognition error: ${event.error}`));
        }
      };

      recognition.onend = () => {
        media.pause();
        resolve(segments);
      };

      // Start playback and recognition together
      media.currentTime = 0;
      media.play().then(() => {
        this.emit(5, 'Listening...');
        recognition.start();
      }).catch((err) => {
        reject(new Error(`Failed to play media: ${err.message}`));
      });

      // Auto-stop when media ends
      media.onended = () => {
        try {
          recognition.stop();
        } catch {
          // Recognition may already have stopped
        }
      };

      // Safety timeout: stop after 5 minutes max
      setTimeout(() => {
        try {
          media.pause();
          recognition.stop();
        } catch {
          // Already stopped
        }
      }, 5 * 60 * 1000);
    });
  }

  // -- Fallback / demo --------------------------------------------------------

  private generateFallback(
    opts: SubtitleGenerationOptions,
  ): Promise<SubtitleSegment[]> {
    return new Promise((resolve) => {
      const total = DEMO_SEGMENTS.length;
      let idx = 0;

      this.emit(0, 'Generating subtitles (demo mode)...');

      const interval = setInterval(() => {
        idx++;
        const progress = Math.round((idx / total) * 100);
        this.emit(Math.min(progress, 95), `Processing segment ${idx}/${total}...`);

        if (idx >= total) {
          clearInterval(interval);
          this.emit(100, 'Complete');
          resolve(this.autoSegment([...DEMO_SEGMENTS], opts.maxCharsPerLine));
        }
      }, 150);
    });
  }

  // -- Formatting: SRT --------------------------------------------------------

  /**
   * Format subtitle segments as an SRT string.
   */
  formatAsSRT(segments: SubtitleSegment[]): string {
    return segments
      .map((seg, i) => {
        const startTC = secondsToSRT(seg.start);
        const endTC = secondsToSRT(seg.end);
        return `${i + 1}\n${startTC} --> ${endTC}\n${seg.text}\n`;
      })
      .join('\n');
  }

  // -- Formatting: VTT --------------------------------------------------------

  /**
   * Format subtitle segments as a WebVTT string.
   */
  formatAsVTT(segments: SubtitleSegment[]): string {
    const cues = segments
      .map((seg) => {
        const startTC = secondsToVTT(seg.start);
        const endTC = secondsToVTT(seg.end);
        return `${startTC} --> ${endTC}\n${seg.text}\n`;
      })
      .join('\n');

    return `WEBVTT\n\n${cues}`;
  }

  // -- Auto-segmentation ------------------------------------------------------

  /**
   * Split raw segments by sentence boundaries and character limits so no single
   * cue exceeds the maximum characters.
   *
   * Sentence boundaries are detected at `. `, `! `, `? `, and line-final
   * punctuation. Long sentences are further split at comma or word boundaries.
   */
  autoSegment(rawSegments: SubtitleSegment[], maxChars: number): SubtitleSegment[] {
    const result: SubtitleSegment[] = [];

    for (const seg of rawSegments) {
      if (seg.text.length <= maxChars) {
        result.push({ ...seg });
        continue;
      }

      // Split into sentences first
      const sentences = this.splitIntoSentences(seg.text);
      const segDuration = seg.end - seg.start;
      const totalChars = seg.text.length;
      let charOffset = 0;

      for (const sentence of sentences) {
        if (!sentence.trim()) continue;

        // Estimate timing proportionally
        const charRatio = sentence.length / totalChars;
        const sentenceStart = seg.start + (charOffset / totalChars) * segDuration;
        const sentenceDuration = segDuration * charRatio;

        if (sentence.length <= maxChars) {
          result.push({
            start: sentenceStart,
            end: sentenceStart + sentenceDuration,
            text: sentence.trim(),
            speaker: seg.speaker,
            confidence: seg.confidence,
          });
        } else {
          // Further split long sentences at word boundaries
          const chunks = this.splitAtWordBoundary(sentence, maxChars);
          const chunkTotalChars = sentence.length;
          let chunkCharOffset = 0;

          for (const chunk of chunks) {
            const chunkRatio = chunk.length / chunkTotalChars;
            const chunkStart = sentenceStart + (chunkCharOffset / chunkTotalChars) * sentenceDuration;
            const chunkDuration = sentenceDuration * chunkRatio;

            result.push({
              start: chunkStart,
              end: chunkStart + chunkDuration,
              text: chunk.trim(),
              speaker: seg.speaker,
              confidence: seg.confidence,
            });

            chunkCharOffset += chunk.length;
          }
        }

        charOffset += sentence.length;
      }
    }

    return result;
  }

  // -- Private helpers --------------------------------------------------------

  private splitIntoSentences(text: string): string[] {
    // Split at sentence-ending punctuation followed by whitespace
    const parts: string[] = [];
    let current = '';

    for (let i = 0; i < text.length; i++) {
      current += text[i];
      const ch = text[i];
      const next = text[i + 1];

      if ((ch === '.' || ch === '!' || ch === '?') && (!next || next === ' ')) {
        parts.push(current);
        current = '';
        // Skip the space after punctuation
        if (next === ' ') i++;
      }
    }

    if (current.trim()) {
      parts.push(current);
    }

    return parts;
  }

  private splitAtWordBoundary(text: string, maxChars: number): string[] {
    const words = text.split(/\s+/);
    const chunks: string[] = [];
    let current = '';

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > maxChars && current) {
        chunks.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }

    if (current.trim()) {
      chunks.push(current);
    }

    return chunks;
  }
}

/** Singleton subtitle engine instance. */
export const subtitleEngine = new SubtitleEngine();
