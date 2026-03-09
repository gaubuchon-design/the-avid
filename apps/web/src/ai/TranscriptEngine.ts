// ─── Transcript Engine ──────────────────────────────────────────────────────
// Manages per-clip transcriptions and provides phrase-search across the
// entire project media. Seeded with demo data for clips c1 and c6.

import { geminiClient } from './GeminiClient';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TranscriptWord {
  text: string;
  startTime: number;
  endTime: number;
  confidence: number;
  speaker?: string;
}

export interface TranscriptSegment {
  clipId: string;
  words: TranscriptWord[];
  language: string;
}

export interface PhraseSearchResult {
  clipId: string;
  clipName: string;
  startTime: number;
  endTime: number;
  text: string;
  score: number;
}

type Subscriber = () => void;

// ─── Demo transcript data ───────────────────────────────────────────────────

const DEMO_TRANSCRIPT_C1: TranscriptWord[] = [
  { text: 'We', startTime: 0.2, endTime: 0.35, confidence: 0.98, speaker: 'Speaker A' },
  { text: 'need', startTime: 0.35, endTime: 0.52, confidence: 0.97, speaker: 'Speaker A' },
  { text: 'to', startTime: 0.52, endTime: 0.60, confidence: 0.99, speaker: 'Speaker A' },
  { text: 'talk', startTime: 0.60, endTime: 0.88, confidence: 0.96, speaker: 'Speaker A' },
  { text: 'about', startTime: 0.88, endTime: 1.12, confidence: 0.98, speaker: 'Speaker A' },
  { text: 'the', startTime: 1.12, endTime: 1.22, confidence: 0.99, speaker: 'Speaker A' },
  { text: 'project', startTime: 1.22, endTime: 1.62, confidence: 0.95, speaker: 'Speaker A' },
  { text: 'deadline.', startTime: 1.62, endTime: 2.15, confidence: 0.94, speaker: 'Speaker A' },
  { text: 'I', startTime: 2.80, endTime: 2.90, confidence: 0.99, speaker: 'Speaker B' },
  { text: 'know,', startTime: 2.90, endTime: 3.15, confidence: 0.97, speaker: 'Speaker B' },
  { text: 'it\'s', startTime: 3.15, endTime: 3.35, confidence: 0.96, speaker: 'Speaker B' },
  { text: 'tomorrow.', startTime: 3.35, endTime: 3.92, confidence: 0.98, speaker: 'Speaker B' },
  { text: 'Can', startTime: 4.20, endTime: 4.38, confidence: 0.97, speaker: 'Speaker A' },
  { text: 'we', startTime: 4.38, endTime: 4.50, confidence: 0.99, speaker: 'Speaker A' },
  { text: 'get', startTime: 4.50, endTime: 4.65, confidence: 0.98, speaker: 'Speaker A' },
  { text: 'it', startTime: 4.65, endTime: 4.75, confidence: 0.99, speaker: 'Speaker A' },
  { text: 'done', startTime: 4.75, endTime: 4.98, confidence: 0.97, speaker: 'Speaker A' },
  { text: 'in', startTime: 4.98, endTime: 5.10, confidence: 0.99, speaker: 'Speaker A' },
  { text: 'time?', startTime: 5.10, endTime: 5.48, confidence: 0.96, speaker: 'Speaker A' },
  { text: 'If', startTime: 5.80, endTime: 5.92, confidence: 0.98, speaker: 'Speaker B' },
  { text: 'we', startTime: 5.92, endTime: 6.05, confidence: 0.99, speaker: 'Speaker B' },
  { text: 'work', startTime: 6.05, endTime: 6.28, confidence: 0.97, speaker: 'Speaker B' },
  { text: 'together,', startTime: 6.28, endTime: 6.72, confidence: 0.95, speaker: 'Speaker B' },
  { text: 'absolutely.', startTime: 6.72, endTime: 7.35, confidence: 0.94, speaker: 'Speaker B' },
  { text: 'Let\'s', startTime: 7.60, endTime: 7.82, confidence: 0.96, speaker: 'Speaker A' },
  { text: 'start', startTime: 7.82, endTime: 8.05, confidence: 0.98, speaker: 'Speaker A' },
  { text: 'with', startTime: 8.05, endTime: 8.20, confidence: 0.99, speaker: 'Speaker A' },
  { text: 'the', startTime: 8.20, endTime: 8.30, confidence: 0.99, speaker: 'Speaker A' },
  { text: 'opening.', startTime: 8.30, endTime: 8.48, confidence: 0.95, speaker: 'Speaker A' },
];

const DEMO_TRANSCRIPT_C6: TranscriptWord[] = [
  { text: 'Look', startTime: 0.10, endTime: 0.32, confidence: 0.97, speaker: 'Speaker A' },
  { text: 'at', startTime: 0.32, endTime: 0.42, confidence: 0.99, speaker: 'Speaker A' },
  { text: 'that', startTime: 0.42, endTime: 0.60, confidence: 0.98, speaker: 'Speaker A' },
  { text: 'sunset.', startTime: 0.60, endTime: 1.10, confidence: 0.96, speaker: 'Speaker A' },
  { text: 'Perfect', startTime: 1.10, endTime: 1.52, confidence: 0.95, speaker: 'Speaker A' },
  { text: 'for', startTime: 1.52, endTime: 1.68, confidence: 0.98, speaker: 'Speaker A' },
  { text: 'the', startTime: 1.68, endTime: 1.78, confidence: 0.99, speaker: 'Speaker A' },
  { text: 'opening', startTime: 1.78, endTime: 2.15, confidence: 0.97, speaker: 'Speaker A' },
  { text: 'sequence.', startTime: 2.15, endTime: 2.72, confidence: 0.94, speaker: 'Speaker A' },
  { text: 'We', startTime: 3.20, endTime: 3.35, confidence: 0.98, speaker: 'Speaker B' },
  { text: 'should', startTime: 3.35, endTime: 3.58, confidence: 0.97, speaker: 'Speaker B' },
  { text: 'use', startTime: 3.58, endTime: 3.75, confidence: 0.99, speaker: 'Speaker B' },
  { text: 'the', startTime: 3.75, endTime: 3.85, confidence: 0.99, speaker: 'Speaker B' },
  { text: 'wide', startTime: 3.85, endTime: 4.10, confidence: 0.96, speaker: 'Speaker B' },
  { text: 'shot', startTime: 4.10, endTime: 4.38, confidence: 0.97, speaker: 'Speaker B' },
  { text: 'first.', startTime: 4.38, endTime: 4.82, confidence: 0.95, speaker: 'Speaker B' },
  { text: 'Then', startTime: 5.10, endTime: 5.32, confidence: 0.98, speaker: 'Speaker B' },
  { text: 'cut', startTime: 5.32, endTime: 5.52, confidence: 0.97, speaker: 'Speaker B' },
  { text: 'to', startTime: 5.52, endTime: 5.62, confidence: 0.99, speaker: 'Speaker B' },
  { text: 'the', startTime: 5.62, endTime: 5.72, confidence: 0.99, speaker: 'Speaker B' },
  { text: 'close-up', startTime: 5.72, endTime: 6.18, confidence: 0.94, speaker: 'Speaker B' },
  { text: 'for', startTime: 6.18, endTime: 6.32, confidence: 0.98, speaker: 'Speaker B' },
  { text: 'the', startTime: 6.32, endTime: 6.42, confidence: 0.99, speaker: 'Speaker B' },
  { text: 'reaction.', startTime: 6.42, endTime: 6.98, confidence: 0.96, speaker: 'Speaker B' },
  { text: 'That\'s', startTime: 7.40, endTime: 7.65, confidence: 0.97, speaker: 'Speaker A' },
  { text: 'a', startTime: 7.65, endTime: 7.72, confidence: 0.99, speaker: 'Speaker A' },
  { text: 'wrap', startTime: 7.72, endTime: 7.98, confidence: 0.96, speaker: 'Speaker A' },
  { text: 'on', startTime: 7.98, endTime: 8.10, confidence: 0.99, speaker: 'Speaker A' },
  { text: 'scene', startTime: 8.10, endTime: 8.35, confidence: 0.97, speaker: 'Speaker A' },
  { text: 'one.', startTime: 8.35, endTime: 8.72, confidence: 0.95, speaker: 'Speaker A' },
  { text: 'Moving', startTime: 9.20, endTime: 9.48, confidence: 0.96, speaker: 'Speaker A' },
  { text: 'on', startTime: 9.48, endTime: 9.60, confidence: 0.99, speaker: 'Speaker A' },
  { text: 'to', startTime: 9.60, endTime: 9.72, confidence: 0.99, speaker: 'Speaker A' },
  { text: 'the', startTime: 9.72, endTime: 9.82, confidence: 0.99, speaker: 'Speaker A' },
  { text: 'hallway', startTime: 9.82, endTime: 10.22, confidence: 0.94, speaker: 'Speaker A' },
  { text: 'sequence.', startTime: 10.22, endTime: 10.78, confidence: 0.93, speaker: 'Speaker A' },
  { text: 'Watch', startTime: 11.50, endTime: 11.75, confidence: 0.97, speaker: 'Speaker B' },
  { text: 'the', startTime: 11.75, endTime: 11.85, confidence: 0.99, speaker: 'Speaker B' },
  { text: 'lighting', startTime: 11.85, endTime: 12.25, confidence: 0.95, speaker: 'Speaker B' },
  { text: 'in', startTime: 12.25, endTime: 12.35, confidence: 0.99, speaker: 'Speaker B' },
  { text: 'this', startTime: 12.35, endTime: 12.52, confidence: 0.98, speaker: 'Speaker B' },
  { text: 'take.', startTime: 12.52, endTime: 12.92, confidence: 0.96, speaker: 'Speaker B' },
  { text: 'The', startTime: 13.30, endTime: 13.45, confidence: 0.98, speaker: 'Speaker B' },
  { text: 'shadows', startTime: 13.45, endTime: 13.88, confidence: 0.95, speaker: 'Speaker B' },
  { text: 'are', startTime: 13.88, endTime: 14.02, confidence: 0.99, speaker: 'Speaker B' },
  { text: 'perfect.', startTime: 14.02, endTime: 14.55, confidence: 0.94, speaker: 'Speaker B' },
];

// Map clip IDs to human-readable names
const CLIP_NAMES: Record<string, string> = {
  c1: 'INT. OFFICE - DAY',
  c6: 'Dialogue Track',
};

// ─── Engine ─────────────────────────────────────────────────────────────────

export class TranscriptEngine {
  private transcripts: Map<string, TranscriptSegment> = new Map();
  private subscribers: Set<Subscriber> = new Set();

  constructor() {
    // Seed demo transcripts
    this.transcripts.set('c1', {
      clipId: 'c1',
      words: DEMO_TRANSCRIPT_C1,
      language: 'en',
    });
    this.transcripts.set('c6', {
      clipId: 'c6',
      words: DEMO_TRANSCRIPT_C6,
      language: 'en',
    });
  }

  /**
   * Transcribe a clip. Stub: for demo clips returns pre-seeded data,
   * otherwise generates simulated words.
   */
  async transcribeClip(clipId: string): Promise<TranscriptSegment> {
    // If already transcribed, return cached
    const existing = this.transcripts.get(clipId);
    if (existing) return existing;

    // Simulate transcription delay
    await new Promise(r => setTimeout(r, 100));

    // Use the Gemini client stub for unknown clips
    const result = await geminiClient.transcribe(new Blob());

    const segment: TranscriptSegment = {
      clipId,
      words: result.words.map(w => ({
        text: (w as any).word ?? (w as any).text ?? '',
        startTime: w.startTime,
        endTime: w.endTime,
        confidence: (w as any).confidence ?? 0.90 + Math.random() * 0.09,
        speaker: 'Speaker A',
      })),
      language: 'en',
    };

    this.transcripts.set(clipId, segment);
    this.notify();
    return segment;
  }

  /**
   * Get the transcript for a clip, or null if not yet transcribed.
   */
  getTranscript(clipId: string): TranscriptSegment | null {
    return this.transcripts.get(clipId) ?? null;
  }

  /**
   * Search across all transcripts for a phrase.
   * Uses simple substring matching with word-boundary awareness.
   * Returns results sorted by relevance score.
   */
  phraseFind(query: string): PhraseSearchResult[] {
    if (!query.trim()) return [];

    const results: PhraseSearchResult[] = [];
    const queryLower = query.toLowerCase().trim();
    const queryWords = queryLower.split(/\s+/);

    for (const [clipId, segment] of this.transcripts) {
      const words = segment.words;
      const fullText = words.map(w => w.text).join(' ');
      const fullTextLower = fullText.toLowerCase();

      // Sliding window search for the query phrase
      if (queryWords.length === 1) {
        // Single word search
        for (let i = 0; i < words.length; i++) {
          const wordLower = words[i].text.toLowerCase().replace(/[.,!?;:'"]/g, '');
          if (wordLower.includes(queryLower) || queryLower.includes(wordLower)) {
            // Build context: 3 words before and after
            const ctxStart = Math.max(0, i - 3);
            const ctxEnd = Math.min(words.length, i + 4);
            const contextWords = words.slice(ctxStart, ctxEnd);

            results.push({
              clipId,
              clipName: CLIP_NAMES[clipId] ?? clipId,
              startTime: words[i].startTime,
              endTime: words[i].endTime,
              text: contextWords.map(w => w.text).join(' '),
              score: words[i].confidence,
            });
          }
        }
      } else {
        // Multi-word phrase search
        for (let i = 0; i <= words.length - queryWords.length; i++) {
          const windowText = words
            .slice(i, i + queryWords.length)
            .map(w => w.text.toLowerCase().replace(/[.,!?;:'"]/g, ''))
            .join(' ');

          if (windowText.includes(queryLower) || queryLower.includes(windowText)) {
            const matchStart = words[i].startTime;
            const matchEnd = words[i + queryWords.length - 1].endTime;

            // Wider context
            const ctxStart = Math.max(0, i - 2);
            const ctxEnd = Math.min(words.length, i + queryWords.length + 2);
            const contextWords = words.slice(ctxStart, ctxEnd);

            const avgConfidence = words
              .slice(i, i + queryWords.length)
              .reduce((sum, w) => sum + w.confidence, 0) / queryWords.length;

            results.push({
              clipId,
              clipName: CLIP_NAMES[clipId] ?? clipId,
              startTime: matchStart,
              endTime: matchEnd,
              text: contextWords.map(w => w.text).join(' '),
              score: avgConfidence,
            });
          }
        }
      }

      // Also do a fuzzy full-text check for partial matches
      if (fullTextLower.includes(queryLower) && results.filter(r => r.clipId === clipId).length === 0) {
        const idx = fullTextLower.indexOf(queryLower);
        // Find the word at this index
        let charCount = 0;
        let wordIdx = 0;
        for (let i = 0; i < words.length; i++) {
          if (charCount >= idx) { wordIdx = i; break; }
          charCount += words[i].text.length + 1; // +1 for space
        }

        const ctxStart = Math.max(0, wordIdx - 2);
        const ctxEnd = Math.min(words.length, wordIdx + queryWords.length + 2);

        results.push({
          clipId,
          clipName: CLIP_NAMES[clipId] ?? clipId,
          startTime: words[wordIdx]?.startTime ?? 0,
          endTime: words[Math.min(wordIdx + queryWords.length, words.length - 1)]?.endTime ?? 0,
          text: words.slice(ctxStart, ctxEnd).map(w => w.text).join(' '),
          score: 0.85,
        });
      }
    }

    // Deduplicate by clipId + startTime
    const seen = new Set<string>();
    const unique = results.filter(r => {
      const key = `${r.clipId}:${r.startTime.toFixed(2)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by score descending
    return unique.sort((a, b) => b.score - a.score);
  }

  /**
   * Subscribe to transcript updates (new transcriptions, etc.).
   */
  subscribe(cb: Subscriber): () => void {
    this.subscribers.add(cb);
    return () => { this.subscribers.delete(cb); };
  }

  private notify(): void {
    this.subscribers.forEach(cb => {
      try { cb(); } catch (err) {
        console.error('[TranscriptEngine] Listener error:', err);
      }
    });
  }
}

export const transcriptEngine = new TranscriptEngine();
