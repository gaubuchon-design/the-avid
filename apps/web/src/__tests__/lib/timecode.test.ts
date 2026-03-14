import { describe, it, expect } from 'vitest';

import {
  Timecode,
  supportsDropFrame,
  FRAME_RATE_OPTIONS,
  toTimecode,
  formatDuration,
  trackTypeColor,
  trackTypeClass,
  mediaTypeIcon,
} from '../../lib/timecode';

describe('Timecode', () => {
  // ── Frame Rate Constants ──────────────────────────────────────────────

  describe('FRAME_RATE_OPTIONS', () => {
    it('contains all 10 standard frame rates', () => {
      expect(FRAME_RATE_OPTIONS.length).toBe(10);
      const values = FRAME_RATE_OPTIONS.map((o) => o.value);
      expect(values).toEqual([23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 120]);
    });
  });

  // ── supportsDropFrame ─────────────────────────────────────────────────

  describe('supportsDropFrame', () => {
    it('returns true for 29.97', () => {
      expect(supportsDropFrame(29.97)).toBe(true);
    });

    it('returns true for 59.94', () => {
      expect(supportsDropFrame(59.94)).toBe(true);
    });

    it('returns false for 24', () => {
      expect(supportsDropFrame(24)).toBe(false);
    });

    it('returns false for 25', () => {
      expect(supportsDropFrame(25)).toBe(false);
    });

    it('returns false for 30', () => {
      expect(supportsDropFrame(30)).toBe(false);
    });

    it('returns false for 60', () => {
      expect(supportsDropFrame(60)).toBe(false);
    });
  });

  // ── Non-Drop-Frame framesToTC ─────────────────────────────────────────

  describe('framesToTC (non-drop-frame)', () => {
    it('frame 0 at 24fps => 00:00:00:00', () => {
      const tc = new Timecode({ fps: 24, dropFrame: false });
      expect(tc.framesToTC(0)).toBe('00:00:00:00');
    });

    it('frame 23 at 24fps => 00:00:00:23', () => {
      const tc = new Timecode({ fps: 24 });
      expect(tc.framesToTC(23)).toBe('00:00:00:23');
    });

    it('frame 24 at 24fps => 00:00:01:00', () => {
      const tc = new Timecode({ fps: 24 });
      expect(tc.framesToTC(24)).toBe('00:00:01:00');
    });

    it('frame 1440 at 24fps => 00:01:00:00', () => {
      const tc = new Timecode({ fps: 24 });
      expect(tc.framesToTC(1440)).toBe('00:01:00:00');
    });

    it('frame 86400 at 24fps => 01:00:00:00', () => {
      const tc = new Timecode({ fps: 24 });
      expect(tc.framesToTC(86400)).toBe('01:00:00:00');
    });

    it('23.976fps uses nominal fps of 24', () => {
      const tc = new Timecode({ fps: 23.976 });
      expect(tc.framesToTC(0)).toBe('00:00:00:00');
      expect(tc.framesToTC(24)).toBe('00:00:01:00');
    });

    it('25fps: frame 25 => 00:00:01:00', () => {
      const tc = new Timecode({ fps: 25 });
      expect(tc.framesToTC(25)).toBe('00:00:01:00');
    });

    it('30fps: frame 30 => 00:00:01:00', () => {
      const tc = new Timecode({ fps: 30 });
      expect(tc.framesToTC(30)).toBe('00:00:01:00');
    });

    it('48fps: frame 48 => 00:00:01:00', () => {
      const tc = new Timecode({ fps: 48 });
      expect(tc.framesToTC(48)).toBe('00:00:01:00');
    });

    it('50fps: frame 50 => 00:00:01:00', () => {
      const tc = new Timecode({ fps: 50 });
      expect(tc.framesToTC(50)).toBe('00:00:01:00');
    });

    it('60fps: frame 60 => 00:00:01:00', () => {
      const tc = new Timecode({ fps: 60 });
      expect(tc.framesToTC(60)).toBe('00:00:01:00');
    });

    it('120fps: frame 120 => 00:00:01:00', () => {
      const tc = new Timecode({ fps: 120 });
      expect(tc.framesToTC(120)).toBe('00:00:01:00');
    });
  });

  // ── Drop-Frame framesToTC ─────────────────────────────────────────────

  describe('framesToTC (drop-frame)', () => {
    it('uses semicolon separator for drop-frame', () => {
      const tc = new Timecode({ fps: 29.97, dropFrame: true });
      expect(tc.framesToTC(0)).toContain(';');
    });

    it('frame 0 at 29.97 DF => 00:00:00;00', () => {
      const tc = new Timecode({ fps: 29.97, dropFrame: true });
      expect(tc.framesToTC(0)).toBe('00:00:00;00');
    });

    it('29.97 DF: minute boundary skips frames 0,1 (frame 1800 => 00:01:00;02)', () => {
      const tc = new Timecode({ fps: 29.97, dropFrame: true });
      // At DF, frame 1800 displays as 00:01:00;02 (frames ;00 and ;01 are skipped)
      expect(tc.framesToTC(1800)).toBe('00:01:00;02');
    });

    it('29.97 DF: frame 1799 is 00:00:59;29', () => {
      const tc = new Timecode({ fps: 29.97, dropFrame: true });
      expect(tc.framesToTC(1799)).toBe('00:00:59;29');
    });

    it('29.97 DF: every 10th minute does NOT skip', () => {
      const tc = new Timecode({ fps: 29.97, dropFrame: true });
      // 10 minutes in DF: 10 * 30 * 60 - 9 * 2 = 17982 frames
      const framesIn10Min = 17982;
      expect(tc.framesToTC(framesIn10Min)).toBe('00:10:00;00');
    });

    it('59.94 DF drops 4 frames per minute boundary', () => {
      const tc = new Timecode({ fps: 59.94, dropFrame: true });
      expect(tc.framesToTC(0)).toBe('00:00:00;00');
      // At 59.94 DF, frame 3600 displays as 00:01:00;04
      expect(tc.framesToTC(3600)).toBe('00:01:00;04');
    });

    it('warns and disables DF for unsupported frame rates', () => {
      // 24fps does not support drop frame
      const tc = new Timecode({ fps: 24, dropFrame: true });
      // Should fall back to NDF (uses colon, not semicolon)
      const result = tc.framesToTC(24);
      expect(result).toBe('00:00:01:00');
    });
  });

  // ── tcToFrames ────────────────────────────────────────────────────────

  describe('tcToFrames', () => {
    it('parses NDF timecode correctly', () => {
      const tc = new Timecode({ fps: 24 });
      expect(tc.tcToFrames('00:00:00:00')).toBe(0);
      expect(tc.tcToFrames('00:00:01:00')).toBe(24);
      expect(tc.tcToFrames('00:01:00:00')).toBe(1440);
      expect(tc.tcToFrames('01:00:00:00')).toBe(86400);
    });

    it('parses DF timecode with semicolon', () => {
      const tc = new Timecode({ fps: 29.97, dropFrame: true });
      expect(tc.tcToFrames('00:01:00;02')).toBe(1800);
    });

    it('returns 0 for invalid timecode', () => {
      const tc = new Timecode({ fps: 24 });
      expect(tc.tcToFrames('invalid')).toBe(0);
      expect(tc.tcToFrames('00:00')).toBe(0);
    });
  });

  // ── Round-trip: framesToTC -> tcToFrames ───────────────────────────────

  describe('round-trip', () => {
    it('NDF 24fps round-trips correctly', () => {
      const tc = new Timecode({ fps: 24 });
      for (const frame of [0, 1, 23, 24, 100, 1440, 86400]) {
        const timecodeStr = tc.framesToTC(frame);
        const back = tc.tcToFrames(timecodeStr);
        expect(back).toBe(frame);
      }
    });

    it('NDF 25fps round-trips correctly', () => {
      const tc = new Timecode({ fps: 25 });
      for (const frame of [0, 24, 25, 100, 1500]) {
        expect(tc.tcToFrames(tc.framesToTC(frame))).toBe(frame);
      }
    });

    it('NDF 30fps round-trips correctly', () => {
      const tc = new Timecode({ fps: 30 });
      for (const frame of [0, 29, 30, 1800]) {
        expect(tc.tcToFrames(tc.framesToTC(frame))).toBe(frame);
      }
    });

    it('DF 29.97fps round-trips for valid frames', () => {
      const tc = new Timecode({ fps: 29.97, dropFrame: true });
      for (const frame of [0, 10, 100, 1800, 17982]) {
        const timecodeStr = tc.framesToTC(frame);
        const back = tc.tcToFrames(timecodeStr);
        expect(back).toBe(frame);
      }
    });
  });

  // ── secondsToTC / tcToSeconds ─────────────────────────────────────────

  describe('secondsToTC', () => {
    it('converts seconds to timecode', () => {
      const tc = new Timecode({ fps: 24 });
      expect(tc.secondsToTC(0)).toBe('00:00:00:00');
      expect(tc.secondsToTC(1)).toBe('00:00:01:00');
      expect(tc.secondsToTC(60)).toBe('00:01:00:00');
      expect(tc.secondsToTC(3600)).toBe('01:00:00:00');
    });
  });

  describe('tcToSeconds', () => {
    it('converts timecode to seconds', () => {
      const tc = new Timecode({ fps: 24 });
      expect(tc.tcToSeconds('00:00:00:00')).toBe(0);
      expect(tc.tcToSeconds('00:00:01:00')).toBe(1);
      expect(tc.tcToSeconds('00:01:00:00')).toBe(60);
    });
  });

  // ── Edge Cases ────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('negative frames are clamped to 0', () => {
      const tc = new Timecode({ fps: 24 });
      expect(tc.framesToTC(-10)).toBe('00:00:00:00');
    });

    it('very large frame numbers produce valid timecode', () => {
      const tc = new Timecode({ fps: 24 });
      const result = tc.framesToTC(1000000);
      expect(result).toMatch(/\d{2}:\d{2}:\d{2}:\d{2}/);
      // 1000000 / 24 / 3600 = ~11.57 hours
      expect(result.startsWith('11:')).toBe(true);
    });

    it('starting timecode offset shifts display', () => {
      const tc = new Timecode({ fps: 24, startOffset: 86400 });
      expect(tc.framesToTC(0)).toBe('01:00:00:00');
      expect(tc.framesToTC(24)).toBe('01:00:01:00');
    });

    it('tcToFrames with startOffset subtracts offset', () => {
      const tc = new Timecode({ fps: 24, startOffset: 86400 });
      expect(tc.tcToFrames('01:00:00:00')).toBe(0);
    });
  });

  // ── secondsToFrames / framesToSeconds ─────────────────────────────────

  describe('frame-seconds conversion', () => {
    it('secondsToFrames converts correctly', () => {
      const tc = new Timecode({ fps: 24 });
      expect(tc.secondsToFrames(1)).toBe(24);
      expect(tc.secondsToFrames(0)).toBe(0);
      expect(tc.secondsToFrames(0.5)).toBe(12);
    });

    it('framesToSeconds converts correctly', () => {
      const tc = new Timecode({ fps: 24 });
      expect(tc.framesToSeconds(24)).toBe(1);
      expect(tc.framesToSeconds(0)).toBe(0);
      expect(tc.framesToSeconds(12)).toBe(0.5);
    });
  });

  // ── Convenience Functions ─────────────────────────────────────────────

  describe('toTimecode', () => {
    it('formats seconds as timecode', () => {
      const result = toTimecode(0);
      expect(result).toBe('00:00:00:00');
    });

    it('respects fps parameter', () => {
      const result = toTimecode(1, 30);
      expect(result).toBe('00:00:01:00');
    });
  });

  describe('formatDuration', () => {
    it('formats seconds as M:SS', () => {
      expect(formatDuration(0)).toBe('0:00');
      expect(formatDuration(65)).toBe('1:05');
      expect(formatDuration(3661)).toBe('61:01');
    });
  });

  describe('trackTypeColor', () => {
    it('returns correct colors for known types', () => {
      expect(trackTypeColor('VIDEO')).toBe('#5b6ef4');
      expect(trackTypeColor('AUDIO')).toBe('#22c896');
      expect(trackTypeColor('EFFECT')).toBe('#f0a500');
      expect(trackTypeColor('SUBTITLE')).toBe('#c084fc');
      expect(trackTypeColor('GRAPHIC')).toBe('#fb7185');
    });

    it('returns default for unknown type', () => {
      expect(trackTypeColor('UNKNOWN')).toBe('#5b6ef4');
    });
  });

  describe('trackTypeClass', () => {
    it('returns correct CSS classes', () => {
      expect(trackTypeClass('VIDEO')).toBe('clip-video');
      expect(trackTypeClass('AUDIO')).toBe('clip-audio');
      expect(trackTypeClass('EFFECT')).toBe('clip-effect');
    });

    it('returns default for unknown type', () => {
      expect(trackTypeClass('UNKNOWN')).toBe('clip-video');
    });
  });

  describe('mediaTypeIcon', () => {
    it('returns correct icons for known types', () => {
      expect(mediaTypeIcon('VIDEO')).toBeTruthy();
      expect(mediaTypeIcon('AUDIO')).toBeTruthy();
      expect(mediaTypeIcon('IMAGE')).toBeTruthy();
    });

    it('returns default icon for unknown type', () => {
      expect(mediaTypeIcon('UNKNOWN')).toBeTruthy();
    });
  });
});
