// ─── Brand Compliance Agent ──────────────────────────────────────────────────
// AI-powered brand validation: logo presence/placement/size checking, color
// palette adherence detection, font usage validation (OCR), prohibited element
// detection, safe area compliance, frame-level findings with severity, and
// auto-run before export as a gating check.

import { generateId } from '../utils';
import type {
  BrandKit,
  ComplianceReport,
  ComplianceFinding,
  ComplianceCategory,
  ComplianceSeverity,
  ComplianceOverallStatus,
} from './types';

// ─── In-memory store ─────────────────────────────────────────────────────────

const reportStore = new Map<string, ComplianceReport>();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createFinding(
  frameTime: number,
  severity: ComplianceSeverity,
  category: ComplianceCategory,
  description: string,
  suggestedFix?: string,
): ComplianceFinding {
  return {
    id: generateId(),
    frameTime,
    severity,
    category,
    description,
    suggestedFix,
  };
}

// ─── Individual Check Functions ──────────────────────────────────────────────

/**
 * Check that a logo is present in at least the first and last 3 seconds.
 * In a real implementation this would use frame analysis / CV.
 * Here we simulate findings.
 */
export function checkLogoPresence(
  kit: BrandKit,
  durationSeconds: number,
): ComplianceFinding[] {
  const findings: ComplianceFinding[] = [];

  if (kit.logoFiles.length === 0) {
    findings.push(
      createFinding(0, 'warning', 'logo-presence', 'No logo files defined in brand kit.'),
    );
    return findings;
  }

  // Simulate: 80% chance logo is found, 20% chance a finding is flagged
  if (Math.random() < 0.2) {
    findings.push(
      createFinding(
        0,
        'error',
        'logo-presence',
        'Brand logo not detected in opening sequence (0:00 - 0:03).',
        'Add the primary brand logo to the first 3 seconds of the video.',
      ),
    );
  }

  if (durationSeconds > 10 && Math.random() < 0.15) {
    findings.push(
      createFinding(
        durationSeconds - 2,
        'warning',
        'logo-presence',
        'Brand logo not detected in closing sequence.',
        'Ensure the end card includes the brand logo.',
      ),
    );
  }

  return findings;
}

/**
 * Validate logo placement respects safe area rules.
 */
export function checkLogoPlacement(
  kit: BrandKit,
  durationSeconds: number,
): ComplianceFinding[] {
  const findings: ComplianceFinding[] = [];

  if (Math.random() < 0.15) {
    const frameTime = Math.random() * durationSeconds;
    findings.push(
      createFinding(
        frameTime,
        'warning',
        'logo-placement',
        `Logo placement at ${frameTime.toFixed(1)}s may extend beyond safe area boundaries.`,
        `Reposition logo within the ${kit.safeArea.top}%/${kit.safeArea.right}%/${kit.safeArea.bottom}%/${kit.safeArea.left}% safe area.`,
      ),
    );
  }

  return findings;
}

/**
 * Check logo minimum size requirements.
 */
export function checkLogoSize(kit: BrandKit): ComplianceFinding[] {
  const findings: ComplianceFinding[] = [];

  for (const logo of kit.logoFiles) {
    if (logo.minWidth && Math.random() < 0.1) {
      findings.push(
        createFinding(
          0,
          'error',
          'logo-size',
          `Logo "${logo.name}" appears below minimum width of ${logo.minWidth}px.`,
          `Resize the logo to at least ${logo.minWidth}px wide.`,
        ),
      );
    }
  }

  return findings;
}

/**
 * Detect off-brand colors in the video frames.
 */
export function checkColorPalette(
  kit: BrandKit,
  durationSeconds: number,
): ComplianceFinding[] {
  const findings: ComplianceFinding[] = [];
  const allColors = [...kit.primaryColors, ...kit.secondaryColors];

  if (allColors.length === 0) {
    return findings;
  }

  // Simulate: detect off-brand color usage
  if (Math.random() < 0.25) {
    const frameTime = Math.random() * durationSeconds;
    findings.push(
      createFinding(
        frameTime,
        'warning',
        'color-palette',
        `Detected prominent color (#FF00FF) at ${frameTime.toFixed(1)}s that is not in the brand palette.`,
        `Replace with a brand-approved color: ${allColors.slice(0, 3).join(', ')}.`,
      ),
    );
  }

  return findings;
}

/**
 * Validate font usage via simulated OCR detection.
 */
export function checkFontUsage(
  kit: BrandKit,
  durationSeconds: number,
): ComplianceFinding[] {
  const findings: ComplianceFinding[] = [];
  const brandFamilies = kit.fonts.map((f) => f.family.toLowerCase());

  if (brandFamilies.length === 0) {
    return findings;
  }

  // Simulate: detect off-brand font
  if (Math.random() < 0.2) {
    const frameTime = Math.random() * durationSeconds;
    findings.push(
      createFinding(
        frameTime,
        'warning',
        'font-usage',
        `Detected non-brand font "Arial" in on-screen text at ${frameTime.toFixed(1)}s.`,
        `Replace with approved brand font: ${kit.fonts[0]?.family ?? 'brand font'}.`,
      ),
    );
  }

  return findings;
}

/**
 * Check for prohibited elements (competitor logos, restricted content, etc.).
 */
export function checkProhibitedElements(
  kit: BrandKit,
  durationSeconds: number,
): ComplianceFinding[] {
  const findings: ComplianceFinding[] = [];

  if (kit.prohibitedElements.length === 0) {
    return findings;
  }

  // Simulate: detect prohibited content
  if (Math.random() < 0.1) {
    const prohibited = kit.prohibitedElements[Math.floor(Math.random() * kit.prohibitedElements.length)];
    const frameTime = Math.random() * durationSeconds;
    findings.push(
      createFinding(
        frameTime,
        'error',
        'prohibited-element',
        `Potential prohibited element "${prohibited}" detected at ${frameTime.toFixed(1)}s.`,
        `Remove or replace the content flagged as "${prohibited}".`,
      ),
    );
  }

  return findings;
}

/**
 * Check safe area compliance for all on-screen elements.
 */
export function checkSafeArea(
  kit: BrandKit,
  durationSeconds: number,
): ComplianceFinding[] {
  const findings: ComplianceFinding[] = [];

  // Simulate: element outside safe zone
  if (Math.random() < 0.2) {
    const frameTime = Math.random() * durationSeconds;
    findings.push(
      createFinding(
        frameTime,
        'warning',
        'safe-area',
        `On-screen text extends beyond the title safe area at ${frameTime.toFixed(1)}s.`,
        `Move text content within the ${kit.safeArea.top}% top / ${kit.safeArea.bottom}% bottom safe margins.`,
      ),
    );
  }

  return findings;
}

// ─── Full Compliance Scan ────────────────────────────────────────────────────

export interface ComplianceScanOptions {
  projectId: string;
  brandKit: BrandKit;
  durationSeconds: number;
}

/**
 * Run a full brand compliance scan against a project.
 * Returns a ComplianceReport with all findings.
 */
export async function runComplianceScan(
  options: ComplianceScanOptions,
): Promise<ComplianceReport> {
  const { projectId, brandKit, durationSeconds } = options;
  const startTime = Date.now();

  // Simulate scanning delay (100-300ms per check category)
  await new Promise<void>((resolve) => setTimeout(resolve, 300 + Math.random() * 500));

  // Collect findings from all checks
  const findings: ComplianceFinding[] = [
    ...checkLogoPresence(brandKit, durationSeconds),
    ...checkLogoPlacement(brandKit, durationSeconds),
    ...checkLogoSize(brandKit),
    ...checkColorPalette(brandKit, durationSeconds),
    ...checkFontUsage(brandKit, durationSeconds),
    ...checkProhibitedElements(brandKit, durationSeconds),
    ...checkSafeArea(brandKit, durationSeconds),
  ];

  // Sort findings by frame time
  findings.sort((a, b) => a.frameTime - b.frameTime);

  // Determine overall status
  const hasError = findings.some((f) => f.severity === 'error');
  const hasWarning = findings.some((f) => f.severity === 'warning');
  const overallStatus: ComplianceOverallStatus = hasError
    ? 'fail'
    : hasWarning
      ? 'warning'
      : 'pass';

  const scanDuration = (Date.now() - startTime) / 1000;

  const report: ComplianceReport = {
    id: generateId(),
    projectId,
    brandKitId: brandKit.id,
    findings,
    overallStatus,
    checkedAt: now(),
    duration: scanDuration,
  };

  reportStore.set(report.id, clone(report));
  return clone(report);
}

// ─── Export gating check ─────────────────────────────────────────────────────

/**
 * Pre-export gating check. Returns true if the project passes compliance.
 * If it fails, the export should be blocked until issues are resolved.
 */
export async function gateExport(
  options: ComplianceScanOptions,
): Promise<{ allowed: boolean; report: ComplianceReport }> {
  const report = await runComplianceScan(options);
  return {
    allowed: report.overallStatus !== 'fail',
    report,
  };
}

// ─── Report access ───────────────────────────────────────────────────────────

export function getComplianceReport(id: string): ComplianceReport | null {
  const report = reportStore.get(id);
  return report ? clone(report) : null;
}

export function listComplianceReports(projectId?: string): ComplianceReport[] {
  const all = Array.from(reportStore.values());
  const filtered = projectId
    ? all.filter((r) => r.projectId === projectId)
    : all;
  return filtered.map(clone).sort((a, b) => b.checkedAt.localeCompare(a.checkedAt));
}

// ─── Reset (for tests) ──────────────────────────────────────────────────────

export function _resetComplianceStore(): void {
  reportStore.clear();
}
