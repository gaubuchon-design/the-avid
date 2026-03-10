/**
 * @fileoverview Mocked temporary music placement workflow.
 *
 * {@link placeTempMusic} simulates searching a music library by mood /
 * genre, selecting a track, and placing it on the Pro Tools timeline at
 * the specified position.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Options for temp music placement. */
export interface TempMusicPlacementOptions {
  /** Desired mood of the music (e.g. "upbeat", "melancholic"). */
  readonly mood?: string;
  /** Genre filter (e.g. "ambient", "orchestral", "electronic"). */
  readonly genre?: string;
  /** Desired duration of the music bed in seconds. */
  readonly duration?: number;
  /** Timeline position in seconds where the music should start. */
  readonly startTime?: number;
}

/** Information about the selected and placed music track. */
export interface TempMusicResult {
  /** Whether placement succeeded. */
  readonly success: boolean;
  /** Name of the selected music track. */
  readonly trackName: string;
  /** ID of the library entry that was chosen. */
  readonly libraryEntryId: string;
  /** Pro Tools track where the music was placed. */
  readonly targetTrack: string;
  /** Timeline start position in seconds. */
  readonly startTimeSec: number;
  /** Timeline end position in seconds. */
  readonly endTimeSec: number;
  /** Duration of the placed clip in seconds. */
  readonly durationSec: number;
  /** Non-fatal warnings. */
  readonly warnings: readonly string[];
}

// ---------------------------------------------------------------------------
// Mock music library
// ---------------------------------------------------------------------------

interface LibraryEntry {
  readonly id: string;
  readonly name: string;
  readonly mood: string;
  readonly genre: string;
  readonly durationSec: number;
}

const MOCK_LIBRARY: readonly LibraryEntry[] = [
  { id: 'lib_001', name: 'Morning Glow', mood: 'upbeat', genre: 'ambient', durationSec: 120 },
  { id: 'lib_002', name: 'City Pulse', mood: 'energetic', genre: 'electronic', durationSec: 90 },
  { id: 'lib_003', name: 'Quiet Reflection', mood: 'melancholic', genre: 'ambient', durationSec: 180 },
  { id: 'lib_004', name: 'Breaking Story', mood: 'tense', genre: 'orchestral', durationSec: 60 },
  { id: 'lib_005', name: 'Sunset Drive', mood: 'upbeat', genre: 'pop', durationSec: 150 },
  { id: 'lib_006', name: 'News Opener', mood: 'energetic', genre: 'orchestral', durationSec: 30 },
  { id: 'lib_007', name: 'Late Night Jazz', mood: 'relaxed', genre: 'jazz', durationSec: 240 },
  { id: 'lib_008', name: 'Documentary Underscore', mood: 'neutral', genre: 'ambient', durationSec: 300 },
] as const;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Search the mock music library and place a temp music bed on the
 * timeline.
 *
 * If `mood` or `genre` are specified the library is filtered accordingly.
 * When no exact match is found the first entry in the library is used as
 * a fallback.
 *
 * @param options - Mood, genre, duration, and placement preferences.
 * @returns A {@link TempMusicResult} describing what was placed.
 *
 * @example
 * ```ts
 * const result = await placeTempMusic({
 *   mood: 'upbeat',
 *   genre: 'ambient',
 *   duration: 60,
 *   startTime: 10,
 * });
 * console.log(result.trackName); // "Morning Glow"
 * ```
 */
export async function placeTempMusic(
  options: TempMusicPlacementOptions = {},
): Promise<TempMusicResult> {
  // Simulate library search latency.
  await new Promise<void>((resolve) => setTimeout(resolve, 200 + Math.random() * 300));

  const { mood, genre, duration, startTime = 0 } = options;

  // Filter library.
  let candidates = [...MOCK_LIBRARY];
  if (mood) {
    const moodLower = mood.toLowerCase();
    const moodMatches = candidates.filter(
      (e) => e.mood.toLowerCase() === moodLower,
    );
    if (moodMatches.length > 0) candidates = moodMatches;
  }
  if (genre) {
    const genreLower = genre.toLowerCase();
    const genreMatches = candidates.filter(
      (e) => e.genre.toLowerCase() === genreLower,
    );
    if (genreMatches.length > 0) candidates = genreMatches;
  }

  // Pick the best candidate (prefer closest duration match).
  const selected = duration
    ? candidates.reduce((best, cur) =>
        Math.abs(cur.durationSec - duration) <
        Math.abs(best.durationSec - duration)
          ? cur
          : best,
      )
    : candidates[0];

  const actualDuration = duration
    ? Math.min(duration, selected!.durationSec)
    : selected!.durationSec;

  const warnings: string[] = [];
  if (duration && duration > selected!.durationSec) {
    warnings.push(
      `Requested duration (${duration}s) exceeds track length (${selected!.durationSec}s). ` +
        'The clip may loop or be shorter than expected.',
    );
  }

  return {
    success: true,
    trackName: selected!.name,
    libraryEntryId: selected!.id,
    targetTrack: 'A3_Music',
    startTimeSec: startTime,
    endTimeSec: startTime + actualDuration,
    durationSec: actualDuration,
    warnings,
  };
}
