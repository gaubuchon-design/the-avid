// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — Podcast Mode (CC-08)
//  Audio-first editing: silence removal, filler word detection, chapters
// ═══════════════════════════════════════════════════════════════════════════

import { generateId } from '../utils';
import {
  PodcastConfig,
  PodcastExportConfig,
  PodcastExportFormat,
  SilenceRegion,
  FillerWord,
  FillerWordType,
  ChapterMarker,
} from './types';

// ─── Default Configuration ────────────────────────────────────────────────

const DEFAULT_PODCAST_CONFIG: PodcastConfig = {
  silenceGateMs: 500,
  silenceThresholdDb: -40,
  fillerWordRemoval: true,
  fillerWordTypes: ['um', 'uh', 'like', 'you_know'],
  chapterAutoGenerate: true,
  loudnessTarget: -16,
  crossfadeMs: 50,
  preserveBreathSounds: true,
};

const DEFAULT_EXPORT_CONFIG: PodcastExportConfig = {
  format: 'mp3',
  bitrate: 192,
  sampleRate: 44100,
  channels: 2,
  includeChapters: true,
  includeArtwork: false,
  metadata: {
    title: 'Untitled Episode',
    artist: 'Unknown',
  },
};

// ─── Silence Detection ────────────────────────────────────────────────────

function detectSilence(
  audioData: Float32Array | number[],
  sampleRate: number,
  thresholdDb: number,
  minDurationMs: number,
): SilenceRegion[] {
  const data = Array.isArray(audioData) ? audioData : Array.from(audioData);
  const threshold = Math.pow(10, thresholdDb / 20); // Convert dB to linear
  const minSamples = Math.floor((minDurationMs / 1000) * sampleRate);

  const silences: SilenceRegion[] = [];
  let silenceStart = -1;
  let consecutiveSilent = 0;

  // Analyze in windows
  const windowSize = Math.floor(sampleRate * 0.01); // 10ms windows

  for (let i = 0; i < data.length; i += windowSize) {
    // Calculate RMS for this window
    let sumSquares = 0;
    const end = Math.min(i + windowSize, data.length);
    for (let j = i; j < end; j++) {
      const sample = data[j] ?? 0;
      sumSquares += sample * sample;
    }
    const rms = Math.sqrt(sumSquares / (end - i));

    if (rms < threshold) {
      if (silenceStart === -1) {
        silenceStart = i;
      }
      consecutiveSilent += windowSize;
    } else {
      if (silenceStart !== -1 && consecutiveSilent >= minSamples) {
        const startTime = silenceStart / sampleRate;
        const endTime = i / sampleRate;
        silences.push({
          startTime,
          endTime,
          duration: endTime - startTime,
        });
      }
      silenceStart = -1;
      consecutiveSilent = 0;
    }
  }

  // Handle trailing silence
  if (silenceStart !== -1 && consecutiveSilent >= minSamples) {
    const startTime = silenceStart / sampleRate;
    const endTime = data.length / sampleRate;
    silences.push({
      startTime,
      endTime,
      duration: endTime - startTime,
    });
  }

  return silences;
}

// ─── Filler Word Detection ────────────────────────────────────────────────

interface TranscriptWord {
  word: string;
  startTime: number;
  endTime: number;
  confidence: number;
}

const FILLER_PATTERNS: Record<FillerWordType, RegExp> = {
  um: /^u+m+$/i,
  uh: /^u+h+$/i,
  like: /^like$/i,
  you_know: /^you\s*know$/i,
  so: /^so$/i,
  basically: /^basically$/i,
  actually: /^actually$/i,
  literally: /^literally$/i,
};

function detectFillerWords(
  words: TranscriptWord[],
  enabledTypes: FillerWordType[],
): FillerWord[] {
  const fillers: FillerWord[] = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i];

    for (const type of enabledTypes) {
      const pattern = FILLER_PATTERNS[type];

      if (type === 'you_know') {
        // Two-word filler: check current + next
        if (
          i < words.length - 1 &&
          word!.word.toLowerCase() === 'you' &&
          words[i + 1]!.word.toLowerCase() === 'know'
        ) {
          fillers.push({
            id: generateId(),
            type,
            startTime: word!.startTime,
            endTime: words[i + 1]!.endTime,
            confidence: Math.min(word!.confidence, words[i + 1]!.confidence),
            removed: false,
          });
          i++; // Skip next word
          break;
        }
      } else if (pattern.test(word!.word)) {
        // Check context: filler words at sentence boundaries or after pauses are more likely actual fillers
        const prevGap = i > 0 ? word!.startTime - words[i - 1]!.endTime : 0.5;
        const isLikelyFiller = prevGap > 0.15 || word!.confidence < 0.8;

        // "like" needs special handling -- only flag if it's actually a filler
        if (type === 'like' && !isLikelyFiller) continue;

        fillers.push({
          id: generateId(),
          type,
          startTime: word!.startTime,
          endTime: word!.endTime,
          confidence: isLikelyFiller ? 0.85 : 0.6,
          removed: false,
        });
        break;
      }
    }
  }

  return fillers;
}

// ─── Chapter Auto-Generation ──────────────────────────────────────────────

interface PodcastTranscriptSegment {
  speaker: string;
  text: string;
  startTime: number;
  endTime: number;
}

function autoGenerateChapters(
  segments: PodcastTranscriptSegment[],
  totalDuration: number,
): ChapterMarker[] {
  if (segments.length === 0) return [];

  const chapters: ChapterMarker[] = [{
    time: 0,
    title: 'Intro',
    isAutoGenerated: true,
    confidence: 0.9,
  }];

  // Detect significant speaker or topic changes
  let lastChapterTime = 0;
  const minGap = Math.max(60, totalDuration / 20); // At least 1 minute between chapters

  for (let i = 1; i < segments.length; i++) {
    const prev = segments[i - 1];
    const curr = segments[i];
    const timeSinceLastChapter = curr!.startTime - lastChapterTime;

    if (timeSinceLastChapter < minGap) continue;

    let shouldCreateChapter = false;
    let title = '';

    // Check for significant silence between segments (>3 seconds)
    const gap = curr!.startTime - prev!.endTime;
    if (gap > 3) {
      shouldCreateChapter = true;
    }

    // Check for topic keywords
    const lowerText = curr!.text.toLowerCase();
    const topicIndicators = [
      'question', 'topic', 'let\'s talk', 'moving on',
      'next', 'first', 'second', 'third', 'finally',
      'sponsor', 'break', 'segment',
    ];

    for (const indicator of topicIndicators) {
      if (lowerText.includes(indicator)) {
        shouldCreateChapter = true;
        title = extractTitleFromText(curr!.text);
        break;
      }
    }

    // Time-based chapters for long podcasts
    if (!shouldCreateChapter && totalDuration > 1800 && timeSinceLastChapter > 600) {
      shouldCreateChapter = true;
    }

    if (shouldCreateChapter) {
      chapters.push({
        time: curr!.startTime,
        title: title || `Segment ${chapters.length}`,
        isAutoGenerated: true,
        confidence: title ? 0.8 : 0.6,
      });
      lastChapterTime = curr!.startTime;
    }
  }

  return chapters;
}

function extractTitleFromText(text: string): string {
  const cleaned = text.replace(/^(so|okay|alright|now|and)\s+/i, '').trim();
  const words = cleaned.split(/\s+/);
  let title = '';
  for (const word of words) {
    if ((title + ' ' + word).length > 50) break;
    title = title ? `${title} ${word}` : word;
  }
  return title.charAt(0).toUpperCase() + title.slice(1);
}

// ─── Edit Operations ──────────────────────────────────────────────────────

interface EditRegion {
  startTime: number;
  endTime: number;
  type: 'silence_removal' | 'filler_removal';
}

function generateSilenceEdits(
  silences: SilenceRegion[],
  config: PodcastConfig,
): EditRegion[] {
  const crossfade = config.crossfadeMs / 1000;

  return silences
    .filter((s) => s.duration > config.silenceGateMs / 1000)
    .map((silence) => {
      // Keep a small portion of silence for natural pacing
      const keepDuration = Math.min(0.3, silence.duration * 0.2);
      return {
        startTime: silence.startTime + keepDuration,
        endTime: silence.endTime - (config.preserveBreathSounds ? 0.1 : 0),
        type: 'silence_removal' as const,
      };
    })
    .filter((edit) => edit.endTime - edit.startTime > crossfade);
}

function generateFillerEdits(fillers: FillerWord[]): EditRegion[] {
  return fillers
    .filter((f) => f.confidence > 0.6)
    .map((filler) => ({
      startTime: filler.startTime,
      endTime: filler.endTime,
      type: 'filler_removal' as const,
    }));
}

// ─── Main Podcast Mode Class ──────────────────────────────────────────────

export class PodcastModeEngine {
  private config: PodcastConfig;
  private silences: SilenceRegion[] = [];
  private fillerWords: FillerWord[] = [];
  private chapters: ChapterMarker[] = [];
  private editRegions: EditRegion[] = [];

  constructor(config?: Partial<PodcastConfig>) {
    this.config = { ...DEFAULT_PODCAST_CONFIG, ...config };
  }

  // ─── Analysis ─────────────────────────────────────────────────────────

  /**
   * Detect silence regions in audio
   */
  detectSilence(
    audioData: Float32Array | number[],
    sampleRate = 44100,
  ): SilenceRegion[] {
    this.silences = detectSilence(
      audioData,
      sampleRate,
      this.config.silenceThresholdDb,
      this.config.silenceGateMs,
    );
    return [...this.silences];
  }

  /**
   * Detect filler words from word-level transcript
   */
  detectFillerWords(words: TranscriptWord[]): FillerWord[] {
    if (!this.config.fillerWordRemoval) return [];

    this.fillerWords = detectFillerWords(words, this.config.fillerWordTypes);
    return [...this.fillerWords];
  }

  /**
   * Auto-generate chapter markers
   */
  generateChapters(
    segments: PodcastTranscriptSegment[],
    totalDuration: number,
  ): ChapterMarker[] {
    if (!this.config.chapterAutoGenerate) return [];

    this.chapters = autoGenerateChapters(segments, totalDuration);
    return [...this.chapters];
  }

  /**
   * Run full analysis pipeline
   */
  analyze(
    audioData: Float32Array | number[],
    sampleRate: number,
    words: TranscriptWord[],
    segments: PodcastTranscriptSegment[],
    totalDuration: number,
  ): {
    silences: SilenceRegion[];
    fillerWords: FillerWord[];
    chapters: ChapterMarker[];
    editRegions: EditRegion[];
    stats: {
      totalSilenceDuration: number;
      fillerWordCount: number;
      estimatedTimeSaved: number;
      chapterCount: number;
    };
  } {
    const silences = this.detectSilence(audioData, sampleRate);
    const fillerWords = this.detectFillerWords(words);
    const chapters = this.generateChapters(segments, totalDuration);
    const editRegions = this.generateEditPlan();

    const totalSilenceDuration = silences.reduce((sum, s) => sum + s.duration, 0);
    const estimatedTimeSaved = editRegions.reduce(
      (sum, e) => sum + (e.endTime - e.startTime),
      0,
    );

    return {
      silences,
      fillerWords,
      chapters,
      editRegions,
      stats: {
        totalSilenceDuration,
        fillerWordCount: fillerWords.length,
        estimatedTimeSaved,
        chapterCount: chapters.length,
      },
    };
  }

  // ─── Edit Plan ────────────────────────────────────────────────────────

  /**
   * Generate the full edit plan from detected regions
   */
  generateEditPlan(): EditRegion[] {
    const silenceEdits = generateSilenceEdits(this.silences, this.config);
    const fillerEdits = generateFillerEdits(this.fillerWords);

    // Merge and sort by time
    this.editRegions = [...silenceEdits, ...fillerEdits].sort(
      (a, b) => a.startTime - b.startTime,
    );

    // Resolve overlapping regions
    const merged: EditRegion[] = [];
    for (const edit of this.editRegions) {
      if (merged.length === 0) {
        merged.push(edit);
        continue;
      }

      const last = merged[merged.length - 1];
      if (edit.startTime <= last!.endTime) {
        // Overlapping -- extend the previous edit
        last!.endTime = Math.max(last!.endTime, edit.endTime);
      } else {
        merged.push(edit);
      }
    }

    this.editRegions = merged;
    return [...this.editRegions];
  }

  /**
   * Accept or reject a filler word removal
   */
  toggleFillerRemoval(fillerId: string, removed: boolean): void {
    const filler = this.fillerWords.find((f) => f.id === fillerId);
    if (filler) {
      filler.removed = removed;
    }
  }

  /**
   * Accept all filler word removals above a confidence threshold
   */
  acceptAllFillers(minConfidence = 0.7): number {
    let count = 0;
    for (const filler of this.fillerWords) {
      if (filler.confidence >= minConfidence && !filler.removed) {
        filler.removed = true;
        count++;
      }
    }
    return count;
  }

  // ─── Chapter Management ───────────────────────────────────────────────

  /**
   * Add a manual chapter marker
   */
  addChapter(time: number, title: string): ChapterMarker {
    const chapter: ChapterMarker = {
      time,
      title,
      isAutoGenerated: false,
    };
    this.chapters.push(chapter);
    this.chapters.sort((a, b) => a.time - b.time);
    return chapter;
  }

  /**
   * Remove a chapter marker
   */
  removeChapter(time: number): boolean {
    const index = this.chapters.findIndex((c) => c.time === time);
    if (index === -1) return false;
    this.chapters.splice(index, 1);
    return true;
  }

  /**
   * Get chapters
   */
  getChapters(): ChapterMarker[] {
    return [...this.chapters];
  }

  // ─── Export ───────────────────────────────────────────────────────────

  /**
   * Get export configuration
   */
  getExportConfig(overrides?: Partial<PodcastExportConfig>): PodcastExportConfig {
    return {
      ...DEFAULT_EXPORT_CONFIG,
      ...overrides,
    };
  }

  /**
   * Get supported export formats
   */
  getSupportedFormats(): PodcastExportFormat[] {
    return ['mp3', 'aac', 'wav', 'flac', 'ogg'];
  }

  /**
   * Calculate estimated export file size
   */
  estimateFileSize(
    durationSeconds: number,
    config: PodcastExportConfig,
  ): number {
    const timeSaved = this.editRegions.reduce(
      (sum, e) => sum + (e.endTime - e.startTime),
      0,
    );
    const effectiveDuration = durationSeconds - timeSaved;

    switch (config.format) {
      case 'mp3':
      case 'aac':
      case 'ogg':
        return Math.round(effectiveDuration * (config.bitrate ?? 192) * 125); // bytes
      case 'wav':
        return Math.round(effectiveDuration * config.sampleRate * config.channels * 3); // 24-bit
      case 'flac':
        return Math.round(effectiveDuration * config.sampleRate * config.channels * 1.5); // ~50% of WAV
      default:
        return Math.round(effectiveDuration * 192 * 125);
    }
  }

  // ─── Configuration ────────────────────────────────────────────────────

  /**
   * Update configuration
   */
  setConfig(config: Partial<PodcastConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): PodcastConfig {
    return { ...this.config };
  }

  // ─── Getters ──────────────────────────────────────────────────────────

  getSilences(): SilenceRegion[] {
    return [...this.silences];
  }

  getFillerWords(): FillerWord[] {
    return [...this.fillerWords];
  }

  getEditRegions(): EditRegion[] {
    return [...this.editRegions];
  }

  /**
   * Get summary statistics
   */
  getStats(): {
    silenceCount: number;
    totalSilenceDuration: number;
    fillerWordCount: number;
    removedFillerCount: number;
    editRegionCount: number;
    estimatedTimeSaved: number;
    chapterCount: number;
  } {
    return {
      silenceCount: this.silences.length,
      totalSilenceDuration: this.silences.reduce((sum, s) => sum + s.duration, 0),
      fillerWordCount: this.fillerWords.length,
      removedFillerCount: this.fillerWords.filter((f) => f.removed).length,
      editRegionCount: this.editRegions.length,
      estimatedTimeSaved: this.editRegions.reduce(
        (sum, e) => sum + (e.endTime - e.startTime),
        0,
      ),
      chapterCount: this.chapters.length,
    };
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────

export function createPodcastMode(config?: Partial<PodcastConfig>): PodcastModeEngine {
  return new PodcastModeEngine(config);
}
