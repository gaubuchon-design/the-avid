// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — Caption Validator (AC-02)
//  Validates subtitle/caption files against broadcast and streaming specs.
//  Supports FCC, Netflix Timed Text, BBC/EBU, and WCAG 2.1 compliance.
//  Includes auto-fix mode for common violations.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Types ─────────────────────────────────────────────────────────────────

export type CaptionStandard = 'fcc' | 'netflix' | 'bbc-ebu' | 'wcag21';
export type CaptionViolationSeverity = 'error' | 'warning' | 'info';

export interface CaptionCue {
  id: string;
  index: number;
  startTimeSeconds: number;
  endTimeSeconds: number;
  text: string;
  speaker?: string;
  position?: { x: number; y: number };
  alignment?: 'left' | 'center' | 'right';
  style?: CaptionStyle;
}

export interface CaptionStyle {
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  backgroundColor?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export interface CaptionViolation {
  id: string;
  cueId: string;
  cueIndex: number;
  standard: CaptionStandard;
  severity: CaptionViolationSeverity;
  rule: string;
  message: string;
  autoFixable: boolean;
  suggestedFix?: string;
}

export interface CaptionValidationResult {
  valid: boolean;
  standard: CaptionStandard;
  totalCues: number;
  violations: CaptionViolation[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  complianceScore: number; // 0-100
}

export interface CaptionAutoFixResult {
  fixedCues: CaptionCue[];
  fixesApplied: number;
  unfixableViolations: CaptionViolation[];
}

export interface CaptionValidatorConfig {
  standards: CaptionStandard[];
  autoFix: boolean;
  strictMode: boolean;
}

// ─── Standard Rules ────────────────────────────────────────────────────────

interface StandardRules {
  maxCharsPerLine: number;
  maxLines: number;
  minDisplaySeconds: number;
  maxDisplaySeconds: number;
  minGapSeconds: number;
  maxCPS: number; // Characters per second
  requireSpeakerLabels: boolean;
  maxConsecutiveCaptions: number;
  requirePunctuation: boolean;
}

const STANDARD_RULES: Record<CaptionStandard, StandardRules> = {
  fcc: {
    maxCharsPerLine: 32,
    maxLines: 2,
    minDisplaySeconds: 1.0,
    maxDisplaySeconds: 6.0,
    minGapSeconds: 0.0,
    maxCPS: 25,
    requireSpeakerLabels: false,
    maxConsecutiveCaptions: 0,
    requirePunctuation: false,
  },
  netflix: {
    maxCharsPerLine: 42,
    maxLines: 2,
    minDisplaySeconds: 0.833,
    maxDisplaySeconds: 7.0,
    minGapSeconds: 0.083, // 2 frames at 24fps
    maxCPS: 20,
    requireSpeakerLabels: true,
    maxConsecutiveCaptions: 0,
    requirePunctuation: true,
  },
  'bbc-ebu': {
    maxCharsPerLine: 37,
    maxLines: 2,
    minDisplaySeconds: 1.0,
    maxDisplaySeconds: 7.0,
    minGapSeconds: 0.0,
    maxCPS: 20,
    requireSpeakerLabels: true,
    maxConsecutiveCaptions: 3,
    requirePunctuation: true,
  },
  wcag21: {
    maxCharsPerLine: 47,
    maxLines: 3,
    minDisplaySeconds: 1.0,
    maxDisplaySeconds: 10.0,
    minGapSeconds: 0.0,
    maxCPS: 25,
    requireSpeakerLabels: false,
    maxConsecutiveCaptions: 0,
    requirePunctuation: false,
  },
};

// ─── Validator ─────────────────────────────────────────────────────────────

export class CaptionValidator {
  private config: CaptionValidatorConfig;

  constructor(config?: Partial<CaptionValidatorConfig>) {
    this.config = {
      standards: config?.standards ?? ['fcc'],
      autoFix: config?.autoFix ?? false,
      strictMode: config?.strictMode ?? false,
    };
  }

  /**
   * Validates captions against the specified standard(s).
   */
  validate(cues: CaptionCue[], standard?: CaptionStandard): CaptionValidationResult {
    const targetStandard: CaptionStandard = standard ?? this.config.standards[0] ?? 'fcc';
    const rules = STANDARD_RULES[targetStandard];
    const violations: CaptionViolation[] = [];

    for (let i = 0; i < cues.length; i++) {
      const cue = cues[i]!;
      const nextCue = i < cues.length - 1 ? cues[i + 1] ?? null : null;

      // Line count validation
      const lines = cue.text.split('\n');
      if (lines.length > rules.maxLines) {
        violations.push({
          id: `v-${cue.id}-lines`,
          cueId: cue.id,
          cueIndex: cue.index,
          standard: targetStandard,
          severity: 'error',
          rule: 'max-lines',
          message: `Caption has ${lines.length} lines (max: ${rules.maxLines})`,
          autoFixable: true,
          suggestedFix: lines.slice(0, rules.maxLines).join('\n'),
        });
      }

      // Characters per line
      for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx]!;
        if (line.length > rules.maxCharsPerLine) {
          violations.push({
            id: `v-${cue.id}-chars-${lineIdx}`,
            cueId: cue.id,
            cueIndex: cue.index,
            standard: targetStandard,
            severity: 'error',
            rule: 'max-chars-per-line',
            message: `Line ${lineIdx + 1} has ${line.length} chars (max: ${rules.maxCharsPerLine})`,
            autoFixable: true,
            suggestedFix: this.wrapLine(line, rules.maxCharsPerLine),
          });
        }
      }

      // Display duration
      const displayDuration = cue.endTimeSeconds - cue.startTimeSeconds;

      if (displayDuration < rules.minDisplaySeconds) {
        violations.push({
          id: `v-${cue.id}-min-dur`,
          cueId: cue.id,
          cueIndex: cue.index,
          standard: targetStandard,
          severity: 'error',
          rule: 'min-display-duration',
          message: `Display time ${displayDuration.toFixed(2)}s is below minimum ${rules.minDisplaySeconds}s`,
          autoFixable: true,
          suggestedFix: `Extend to ${rules.minDisplaySeconds}s`,
        });
      }

      if (displayDuration > rules.maxDisplaySeconds) {
        violations.push({
          id: `v-${cue.id}-max-dur`,
          cueId: cue.id,
          cueIndex: cue.index,
          standard: targetStandard,
          severity: 'warning',
          rule: 'max-display-duration',
          message: `Display time ${displayDuration.toFixed(2)}s exceeds maximum ${rules.maxDisplaySeconds}s`,
          autoFixable: true,
          suggestedFix: `Split into multiple captions`,
        });
      }

      // Characters per second (reading speed)
      const textLength = cue.text.replace(/\n/g, ' ').length;
      const cps = displayDuration > 0 ? textLength / displayDuration : Infinity;
      if (cps > rules.maxCPS) {
        violations.push({
          id: `v-${cue.id}-cps`,
          cueId: cue.id,
          cueIndex: cue.index,
          standard: targetStandard,
          severity: 'warning',
          rule: 'max-reading-speed',
          message: `Reading speed ${cps.toFixed(1)} CPS exceeds max ${rules.maxCPS} CPS`,
          autoFixable: false,
        });
      }

      // Gap between captions
      if (nextCue && rules.minGapSeconds > 0) {
        const gap = nextCue.startTimeSeconds - cue.endTimeSeconds;
        if (gap < rules.minGapSeconds && gap >= 0) {
          violations.push({
            id: `v-${cue.id}-gap`,
            cueId: cue.id,
            cueIndex: cue.index,
            standard: targetStandard,
            severity: 'error',
            rule: 'min-gap',
            message: `Gap to next caption is ${(gap * 1000).toFixed(0)}ms (min: ${(rules.minGapSeconds * 1000).toFixed(0)}ms)`,
            autoFixable: true,
            suggestedFix: `Adjust end time to create ${(rules.minGapSeconds * 1000).toFixed(0)}ms gap`,
          });
        }
      }

      // Overlapping captions
      if (nextCue && cue.endTimeSeconds > nextCue.startTimeSeconds) {
        violations.push({
          id: `v-${cue.id}-overlap`,
          cueId: cue.id,
          cueIndex: cue.index,
          standard: targetStandard,
          severity: 'error',
          rule: 'no-overlap',
          message: `Caption overlaps with next caption by ${(cue.endTimeSeconds - nextCue.startTimeSeconds).toFixed(3)}s`,
          autoFixable: true,
          suggestedFix: `Trim end time to ${nextCue.startTimeSeconds.toFixed(3)}s`,
        });
      }

      // Speaker labels
      if (rules.requireSpeakerLabels && !cue.speaker) {
        violations.push({
          id: `v-${cue.id}-speaker`,
          cueId: cue.id,
          cueIndex: cue.index,
          standard: targetStandard,
          severity: this.config.strictMode ? 'error' : 'warning',
          rule: 'require-speaker-label',
          message: `Missing speaker label (required by ${targetStandard})`,
          autoFixable: false,
        });
      }

      // Empty captions
      if (cue.text.trim().length === 0) {
        violations.push({
          id: `v-${cue.id}-empty`,
          cueId: cue.id,
          cueIndex: cue.index,
          standard: targetStandard,
          severity: 'error',
          rule: 'no-empty-captions',
          message: 'Caption text is empty',
          autoFixable: false,
        });
      }

      // Punctuation
      if (rules.requirePunctuation) {
        const trimmedText = cue.text.trim();
        if (trimmedText.length > 0 && !/[.!?,;:—\-)]$/.test(trimmedText)) {
          violations.push({
            id: `v-${cue.id}-punct`,
            cueId: cue.id,
            cueIndex: cue.index,
            standard: targetStandard,
            severity: 'info',
            rule: 'require-punctuation',
            message: 'Caption does not end with punctuation',
            autoFixable: false,
          });
        }
      }
    }

    const errorCount = violations.filter((v) => v.severity === 'error').length;
    const warningCount = violations.filter((v) => v.severity === 'warning').length;
    const infoCount = violations.filter((v) => v.severity === 'info').length;

    const maxViolationScore = cues.length * 5; // 5 possible rules per cue
    const complianceScore = maxViolationScore > 0
      ? Math.max(0, Math.round(((maxViolationScore - errorCount * 3 - warningCount) / maxViolationScore) * 100))
      : 100;

    return {
      valid: errorCount === 0,
      standard: targetStandard,
      totalCues: cues.length,
      violations,
      errorCount,
      warningCount,
      infoCount,
      complianceScore,
    };
  }

  /**
   * Validates against all configured standards and returns combined results.
   */
  validateAll(cues: CaptionCue[]): CaptionValidationResult[] {
    return this.config.standards.map((standard) => this.validate(cues, standard));
  }

  /**
   * Auto-fixes common caption violations.
   */
  autoFix(cues: CaptionCue[], standard?: CaptionStandard): CaptionAutoFixResult {
    const targetStandard: CaptionStandard = standard ?? this.config.standards[0] ?? 'fcc';
    const rules = STANDARD_RULES[targetStandard];
    const fixedCues: CaptionCue[] = cues.map((cue) => ({ ...cue }));
    let fixesApplied = 0;
    const unfixableViolations: CaptionViolation[] = [];

    for (let i = 0; i < fixedCues.length; i++) {
      const cue = fixedCues[i]!;
      const nextCue = i < fixedCues.length - 1 ? fixedCues[i + 1] ?? null : null;

      // Fix line wrapping
      const lines = cue.text.split('\n');
      let needsRewrite = false;
      for (const line of lines) {
        if (line.length > rules.maxCharsPerLine) {
          needsRewrite = true;
          break;
        }
      }
      if (lines.length > rules.maxLines) {
        needsRewrite = true;
      }

      if (needsRewrite) {
        const fullText = cue.text.replace(/\n/g, ' ');
        const wrappedLines: string[] = [];
        const words = fullText.split(' ');
        let currentLine = '';

        for (const word of words) {
          if (currentLine.length + word.length + 1 > rules.maxCharsPerLine) {
            if (currentLine) wrappedLines.push(currentLine);
            currentLine = word;
          } else {
            currentLine = currentLine ? `${currentLine} ${word}` : word;
          }
        }
        if (currentLine) wrappedLines.push(currentLine);

        cue.text = wrappedLines.slice(0, rules.maxLines).join('\n');
        fixesApplied++;
      }

      // Fix minimum display duration
      const displayDuration = cue.endTimeSeconds - cue.startTimeSeconds;
      if (displayDuration < rules.minDisplaySeconds) {
        const newEnd = cue.startTimeSeconds + rules.minDisplaySeconds;
        if (!nextCue || newEnd <= nextCue.startTimeSeconds) {
          cue.endTimeSeconds = newEnd;
          fixesApplied++;
        }
      }

      // Fix overlap with next caption
      if (nextCue && cue.endTimeSeconds > nextCue.startTimeSeconds) {
        cue.endTimeSeconds = nextCue.startTimeSeconds - (rules.minGapSeconds || 0);
        fixesApplied++;
      }

      // Fix gap between captions
      if (nextCue && rules.minGapSeconds > 0) {
        const gap = nextCue.startTimeSeconds - cue.endTimeSeconds;
        if (gap >= 0 && gap < rules.minGapSeconds) {
          cue.endTimeSeconds = nextCue.startTimeSeconds - rules.minGapSeconds;
          fixesApplied++;
        }
      }
    }

    // Re-validate to find unfixable issues
    const revalidation = this.validate(fixedCues, targetStandard);
    unfixableViolations.push(...revalidation.violations.filter((v) => !v.autoFixable));

    return {
      fixedCues,
      fixesApplied,
      unfixableViolations,
    };
  }

  // ─── Config ────────────────────────────────────────────────────────

  getConfig(): CaptionValidatorConfig {
    return { ...this.config };
  }

  setStandards(standards: CaptionStandard[]): void {
    this.config.standards = standards;
  }

  getAvailableStandards(): Array<{ id: CaptionStandard; label: string; description: string }> {
    return [
      { id: 'fcc', label: 'FCC', description: 'US Federal Communications Commission broadcast standard' },
      { id: 'netflix', label: 'Netflix Timed Text', description: 'Netflix streaming platform requirements' },
      { id: 'bbc-ebu', label: 'BBC / EBU', description: 'BBC and European Broadcasting Union standard' },
      { id: 'wcag21', label: 'WCAG 2.1', description: 'Web Content Accessibility Guidelines 2.1' },
    ];
  }

  getRules(standard: CaptionStandard): StandardRules {
    return { ...STANDARD_RULES[standard] };
  }

  // ─── Private ─────────────────────────────────────────────────────────

  private wrapLine(text: string, maxChars: number): string {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      if (currentLine.length + word.length + 1 > maxChars) {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = currentLine ? `${currentLine} ${word}` : word;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines.join('\n');
  }
}

// ─── Factory ───────────────────────────────────────────────────────────────

export function createCaptionValidator(
  config?: Partial<CaptionValidatorConfig>,
): CaptionValidator {
  return new CaptionValidator(config);
}
