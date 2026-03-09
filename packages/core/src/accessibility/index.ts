/**
 * Accessibility Module
 * Caption validation, WCAG compliance, audio description, keyboard navigation
 */

// ─── Types ─────────────────────────────────────────────────────────────────

export type CaptionFormat = 'SRT' | 'VTT' | 'SCC' | 'TTML' | 'STL' | 'DFXP';

export interface CaptionCue {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  speaker?: string;
  position?: { x: number; y: number };
  style?: CaptionStyle;
}

export interface CaptionStyle {
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  backgroundColor?: string;
  italic?: boolean;
  bold?: boolean;
  alignment?: 'left' | 'center' | 'right';
}

export interface CaptionValidationResult {
  isValid: boolean;
  errors: CaptionError[];
  warnings: CaptionWarning[];
  stats: CaptionStats;
}

export interface CaptionError {
  cueId: string;
  type: 'TIMING_OVERLAP' | 'TOO_FAST' | 'TOO_LONG' | 'EMPTY_CUE' | 'INVALID_FORMAT';
  message: string;
  severity: 'error' | 'warning';
}

export interface CaptionWarning {
  cueId: string;
  type: 'READING_SPEED' | 'LINE_LENGTH' | 'DURATION' | 'GAP';
  message: string;
  suggestion?: string;
}

export interface CaptionStats {
  totalCues: number;
  totalDuration: number;
  averageReadingSpeed: number; // words per minute
  maxLinesPerCue: number;
  coverage: number; // percentage of video covered
}

export interface AccessibilityReport {
  captionValidation: CaptionValidationResult;
  audioDescriptionPresent: boolean;
  contrastRatio?: number;
  wcagLevel: 'A' | 'AA' | 'AAA' | 'FAIL';
}

// ─── Caption Validator ─────────────────────────────────────────────────────
// Renamed to BasicCaptionValidator to avoid collision with the
// MultiStandardCaptionValidator re-exported from ./CaptionValidator.

export class BasicCaptionValidator {
  private maxWordsPerMinute = 160;
  private maxCharsPerLine = 42;
  private maxLinesPerCue = 2;
  private minCueDuration = 0.7; // seconds
  private maxCueDuration = 7; // seconds
  private minGap = 0.04; // 1 frame at 25fps

  validate(cues: CaptionCue[]): CaptionValidationResult {
    const errors: CaptionError[] = [];
    const warnings: CaptionWarning[] = [];

    const sorted = [...cues].sort((a, b) => a.startTime - b.startTime);

    for (let i = 0; i < sorted.length; i++) {
      const cue = sorted[i];
      const duration = cue.endTime - cue.startTime;

      // Empty cue check
      if (!cue.text.trim()) {
        errors.push({ cueId: cue.id, type: 'EMPTY_CUE', message: 'Empty caption cue', severity: 'error' });
        continue;
      }

      // Duration checks
      if (duration < this.minCueDuration) {
        errors.push({ cueId: cue.id, type: 'TOO_FAST', message: `Cue too short: ${duration.toFixed(2)}s (min ${this.minCueDuration}s)`, severity: 'error' });
      }
      if (duration > this.maxCueDuration) {
        warnings.push({ cueId: cue.id, type: 'DURATION', message: `Cue very long: ${duration.toFixed(1)}s`, suggestion: 'Consider splitting into multiple cues' });
      }

      // Overlap check
      if (i < sorted.length - 1) {
        const next = sorted[i + 1];
        if (cue.endTime > next.startTime + 0.001) {
          errors.push({ cueId: cue.id, type: 'TIMING_OVERLAP', message: `Overlaps with next cue by ${(cue.endTime - next.startTime).toFixed(3)}s`, severity: 'error' });
        } else if (next.startTime - cue.endTime < this.minGap) {
          warnings.push({ cueId: cue.id, type: 'GAP', message: `Very small gap to next cue: ${((next.startTime - cue.endTime) * 1000).toFixed(0)}ms` });
        }
      }

      // Reading speed
      const words = cue.text.split(/\s+/).length;
      const wpm = (words / duration) * 60;
      if (wpm > this.maxWordsPerMinute) {
        warnings.push({ cueId: cue.id, type: 'READING_SPEED', message: `Reading speed too fast: ${Math.round(wpm)} WPM`, suggestion: `Reduce to under ${this.maxWordsPerMinute} WPM` });
      }

      // Line length
      const lines = cue.text.split('\n');
      for (const line of lines) {
        if (line.length > this.maxCharsPerLine) {
          warnings.push({ cueId: cue.id, type: 'LINE_LENGTH', message: `Line too long: ${line.length} chars (max ${this.maxCharsPerLine})` });
        }
      }
      if (lines.length > this.maxLinesPerCue) {
        warnings.push({ cueId: cue.id, type: 'LINE_LENGTH', message: `Too many lines: ${lines.length} (max ${this.maxLinesPerCue})` });
      }
    }

    const totalDuration = sorted.length > 0
      ? sorted[sorted.length - 1].endTime - sorted[0].startTime
      : 0;
    const coveredTime = sorted.reduce((sum, c) => sum + (c.endTime - c.startTime), 0);
    const totalWords = sorted.reduce((sum, c) => sum + c.text.split(/\s+/).length, 0);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      stats: {
        totalCues: sorted.length,
        totalDuration,
        averageReadingSpeed: totalDuration > 0 ? (totalWords / totalDuration) * 60 : 0,
        maxLinesPerCue: Math.max(0, ...sorted.map(c => c.text.split('\n').length)),
        coverage: totalDuration > 0 ? (coveredTime / totalDuration) * 100 : 0,
      },
    };
  }
}

// ─── Caption Exporter ──────────────────────────────────────────────────────
// Renamed to BasicCaptionExporter to avoid collision with the class name
// pattern in the multi-standard caption validator module.

export class BasicCaptionExporter {
  exportSRT(cues: CaptionCue[]): string {
    const sorted = [...cues].sort((a, b) => a.startTime - b.startTime);
    return sorted.map((cue, i) => {
      return `${i + 1}\n${this.formatSRTTime(cue.startTime)} --> ${this.formatSRTTime(cue.endTime)}\n${cue.text}`;
    }).join('\n\n');
  }

  exportVTT(cues: CaptionCue[]): string {
    const sorted = [...cues].sort((a, b) => a.startTime - b.startTime);
    const lines = ['WEBVTT', ''];
    for (const cue of sorted) {
      lines.push(`${this.formatVTTTime(cue.startTime)} --> ${this.formatVTTTime(cue.endTime)}`);
      lines.push(cue.text);
      lines.push('');
    }
    return lines.join('\n');
  }

  private formatSRTTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  }

  private formatVTTTime(seconds: number): string {
    return this.formatSRTTime(seconds).replace(',', '.');
  }
}

// ─── Multi-Standard Caption Validator (AC-02) ─────────────────────────────
// Re-exported with aliases for colliding names
export {
  type CaptionStandard,
  type CaptionViolationSeverity,
  type CaptionCue as MultiStandardCaptionCue,
  type CaptionStyle as MultiStandardCaptionStyle,
  type CaptionViolation,
  type CaptionValidationResult as MultiStandardCaptionValidationResult,
  type CaptionAutoFixResult,
  type CaptionValidatorConfig,
  CaptionValidator as MultiStandardCaptionValidator,
  createCaptionValidator,
} from './CaptionValidator';
