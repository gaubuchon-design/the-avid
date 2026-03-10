// =============================================================================
//  THE AVID -- FT-03: Managed Media / Relink Engine
// =============================================================================
//
//  Reconnects offline media to editor assets by scanning candidate files
//  and matching them against known fingerprints (resolution + duration + hash).
//  Supports the offline-to-online workflow transition.
// =============================================================================

import type {
  EditorProject,
  EditorBin,
  EditorMediaAsset,
  EditorMediaFingerprint,
  EditorMediaTechnicalMetadata,
  EditorMediaRelinkIdentity,
} from '../project-library';
import { flattenAssets } from '../project-library';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Status of a media asset in the relink context. */
export type RelinkAssetStatus = 'online' | 'offline' | 'relinked' | 'conflict';

/** A candidate file discovered during a media scan. */
export interface RelinkCandidate {
  /** Absolute path to the candidate file. */
  filePath: string;
  /** File name without directory. */
  fileName: string;
  /** File size in bytes. */
  fileSizeBytes: number;
  /** SHA-1 partial digest of the file. */
  digest?: string;
  /** Technical metadata extracted from the file. */
  technicalMetadata?: EditorMediaTechnicalMetadata;
  /** Confidence score 0-1 for the match. */
  confidence: number;
  /** Reason for the match (which criterion matched). */
  matchReason: RelinkMatchReason;
}

/** Reason a candidate was matched to an asset. */
export type RelinkMatchReason =
  | 'fingerprint_exact'
  | 'fingerprint_partial'
  | 'name_and_duration'
  | 'name_and_resolution'
  | 'name_only'
  | 'duration_and_resolution'
  | 'manual';

/** A proposed relink mapping from asset to candidate file. */
export interface RelinkProposal {
  /** The offline asset that needs relinking. */
  assetId: string;
  assetName: string;
  /** Current status. */
  currentStatus: RelinkAssetStatus;
  /** Ranked candidates, best match first. */
  candidates: RelinkCandidate[];
  /** Index of the selected candidate (null = not yet confirmed). */
  selectedCandidateIndex: number | null;
  /** Whether this proposal has been confirmed by the user. */
  confirmed: boolean;
}

/** Result of applying a relink operation. */
export interface RelinkResult {
  /** Total assets processed. */
  totalAssets: number;
  /** Number of assets successfully relinked. */
  relinked: number;
  /** Number of assets that remain offline. */
  stillOffline: number;
  /** Number of assets with conflicts (multiple strong matches). */
  conflicts: number;
  /** Detailed results per asset. */
  details: Array<{
    assetId: string;
    assetName: string;
    status: RelinkAssetStatus;
    newPath?: string;
    error?: string;
  }>;
}

/** Configuration for the relink engine. */
export interface RelinkEngineConfig {
  /** Minimum confidence threshold for automatic matching (0-1). */
  autoMatchThreshold: number;
  /** Whether to preserve edit decisions through relink. */
  preserveEditDecisions: boolean;
  /** Whether to update path history on relink. */
  updatePathHistory: boolean;
  /** Maximum candidates to consider per asset. */
  maxCandidatesPerAsset: number;
}

/** Events emitted by the relink engine. */
export interface RelinkEngineEvents {
  onScanProgress: (scanned: number, total: number) => void;
  onMatchFound: (assetId: string, candidate: RelinkCandidate) => void;
  onRelinkComplete: (result: RelinkResult) => void;
  onError: (error: Error) => void;
}

// ─── Errors ─────────────────────────────────────────────────────────────────

export class RelinkError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'NO_OFFLINE_ASSETS'
      | 'SCAN_FAILED'
      | 'MATCH_FAILED'
      | 'APPLY_FAILED'
      | 'INVALID_PROPOSAL',
  ) {
    super(message);
    this.name = 'RelinkError';
  }
}

// ─── Default configuration ──────────────────────────────────────────────────

const DEFAULT_CONFIG: RelinkEngineConfig = {
  autoMatchThreshold: 0.85,
  preserveEditDecisions: true,
  updatePathHistory: true,
  maxCandidatesPerAsset: 10,
};

// ─── RelinkEngine ───────────────────────────────────────────────────────────

/**
 * Engine for reconnecting offline media assets to new file locations.
 *
 * Workflow:
 * 1. `getOfflineAssets()` - identify which assets are offline
 * 2. `scanCandidates()` - scan a set of file descriptors for matches
 * 3. `generateProposals()` - produce relink proposals with confidence scores
 * 4. User confirms proposals
 * 5. `applyRelink()` - update project state with new file locations
 *
 * ```ts
 * const engine = new RelinkEngine(project);
 * const offline = engine.getOfflineAssets();
 * const proposals = engine.generateProposals(offline, scannedFiles);
 * // User confirms...
 * const result = engine.applyRelink(project, confirmedProposals);
 * ```
 */
export class RelinkEngine {
  private config: RelinkEngineConfig;
  private events: Partial<RelinkEngineEvents>;

  constructor(config: Partial<RelinkEngineConfig> = {}, events: Partial<RelinkEngineEvents> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.events = events;
  }

  // ── Asset inspection ────────────────────────────────────────────────────

  /**
   * Get all assets from the project that are offline (missing media).
   */
  getOfflineAssets(project: EditorProject): EditorMediaAsset[] {
    const allAssets = flattenAssets(project.bins);
    return allAssets.filter((asset) => this.isAssetOffline(asset));
  }

  /**
   * Get a mapping of asset IDs to their online/offline status.
   */
  getAssetStatusMap(project: EditorProject): Map<string, RelinkAssetStatus> {
    const statusMap = new Map<string, RelinkAssetStatus>();
    const allAssets = flattenAssets(project.bins);
    for (const asset of allAssets) {
      statusMap.set(asset.id, this.isAssetOffline(asset) ? 'offline' : 'online');
    }
    return statusMap;
  }

  /**
   * Determine whether an asset is offline.
   */
  isAssetOffline(asset: EditorMediaAsset): boolean {
    // Asset is offline if it has no playback URL and status indicates an issue
    if (asset.indexStatus === 'MISSING' || asset.indexStatus === 'ERROR') return true;
    if (asset.status === 'ERROR') return true;
    // If there is a relink identity but no managed/original path, it is offline
    if (asset.relinkIdentity && !asset.locations?.managedPath && !asset.locations?.originalPath && !asset.playbackUrl) {
      return true;
    }
    return false;
  }

  // ── Candidate scanning ──────────────────────────────────────────────────

  /**
   * Score a set of scanned file descriptors against offline assets.
   * Returns proposals ranked by confidence.
   *
   * `scannedFiles` should be an array of file metadata from a directory scan.
   */
  generateProposals(
    offlineAssets: EditorMediaAsset[],
    scannedFiles: Array<{
      filePath: string;
      fileName: string;
      fileSizeBytes: number;
      digest?: string;
      technicalMetadata?: EditorMediaTechnicalMetadata;
    }>,
  ): RelinkProposal[] {
    const proposals: RelinkProposal[] = [];

    for (let i = 0; i < offlineAssets.length; i++) {
      const asset = offlineAssets[i]!;
      this.events.onScanProgress?.(i + 1, offlineAssets.length);

      const candidates: RelinkCandidate[] = [];

      for (const file of scannedFiles) {
        const { confidence, reason } = this.scoreMatch(asset, file);
        if (confidence > 0) {
          candidates.push({
            filePath: file.filePath,
            fileName: file.fileName,
            fileSizeBytes: file.fileSizeBytes,
            digest: file.digest,
            technicalMetadata: file.technicalMetadata,
            confidence,
            matchReason: reason,
          });
        }
      }

      // Sort by confidence descending
      candidates.sort((a, b) => b.confidence - a.confidence);

      // Limit to max candidates
      const limited = candidates.slice(0, this.config.maxCandidatesPerAsset);

      // Auto-select if top match exceeds threshold and is significantly better than second
      let selectedIndex: number | null = null;
      let confirmed = false;
      if (limited.length > 0 && limited[0]!.confidence >= this.config.autoMatchThreshold) {
        if (limited.length === 1 || limited[0]!.confidence - limited[1]!.confidence > 0.15) {
          selectedIndex = 0;
          confirmed = false; // Still needs user confirmation
        }
      }

      const status: RelinkAssetStatus = limited.length > 1 &&
        limited[0]!.confidence > 0.7 &&
        limited[1]!.confidence > 0.7 &&
        limited[0]!.confidence - limited[1]!.confidence < 0.1
        ? 'conflict'
        : 'offline';

      proposals.push({
        assetId: asset.id,
        assetName: asset.name,
        currentStatus: status,
        candidates: limited,
        selectedCandidateIndex: selectedIndex,
        confirmed,
      });

      if (limited.length > 0) {
        this.events.onMatchFound?.(asset.id, limited[0]!);
      }
    }

    return proposals;
  }

  // ── Apply relink ────────────────────────────────────────────────────────

  /**
   * Apply confirmed relink proposals to the project, updating bins in-place
   * with new file locations.
   *
   * **Note:** This mutates `project.bins` directly. Callers should clone the
   * project first if immutability is required.
   *
   * This preserves all edit decisions (clip positions, trim points, effects)
   * and only updates the media location references.
   */
  applyRelink(
    project: EditorProject,
    proposals: RelinkProposal[],
  ): RelinkResult {
    const confirmed = proposals.filter(
      (p): p is RelinkProposal & { selectedCandidateIndex: number } =>
        p.confirmed && p.selectedCandidateIndex !== null,
    );

    if (confirmed.length === 0) {
      throw new RelinkError('No confirmed proposals to apply', 'INVALID_PROPOSAL');
    }

    const result: RelinkResult = {
      totalAssets: proposals.length,
      relinked: 0,
      stillOffline: 0,
      conflicts: 0,
      details: [],
    };

    // Build a lookup from assetId to selected candidate
    const relinkMap = new Map<string, RelinkCandidate>();
    for (const proposal of confirmed) {
      const candidate = proposal.candidates[proposal.selectedCandidateIndex];
      if (candidate) {
        relinkMap.set(proposal.assetId, candidate);
      }
    }

    // Walk bins and update assets
    const updateAssetInBins = (bins: EditorBin[]): void => {
      for (const bin of bins) {
        for (let i = 0; i < bin.assets.length; i++) {
          const asset = bin.assets[i]!;
          const candidate = relinkMap.get(asset.id);

          if (candidate) {
            // Update locations
            const pathHistory = [...(asset.locations?.pathHistory ?? [])];
            if (this.config.updatePathHistory && asset.locations?.originalPath) {
              pathHistory.push(asset.locations.originalPath);
            }

            bin.assets[i]! = {
              ...asset,
              status: 'READY',
              indexStatus: 'READY',
              locations: {
                ...asset.locations,
                originalPath: candidate.filePath,
                managedPath: candidate.filePath,
                pathHistory,
              },
              fingerprint: candidate.digest
                ? {
                    algorithm: 'sha1-partial',
                    digest: candidate.digest,
                    sizeBytes: candidate.fileSizeBytes,
                    modifiedAt: new Date().toISOString(),
                  }
                : asset.fingerprint,
              technicalMetadata: candidate.technicalMetadata ?? asset.technicalMetadata,
            };

            result.relinked++;
            result.details.push({
              assetId: asset.id,
              assetName: asset.name,
              status: 'relinked',
              newPath: candidate.filePath,
            });
          } else {
            // Check if this is an offline asset that wasn't relinked
            const proposal = proposals.find((p) => p.assetId === asset.id);
            if (proposal) {
              if (proposal.currentStatus === 'conflict') {
                result.conflicts++;
                result.details.push({
                  assetId: asset.id,
                  assetName: asset.name,
                  status: 'conflict',
                  error: 'Multiple ambiguous matches found',
                });
              } else {
                result.stillOffline++;
                result.details.push({
                  assetId: asset.id,
                  assetName: asset.name,
                  status: 'offline',
                  error: proposal.candidates.length === 0 ? 'No matches found' : 'Not confirmed',
                });
              }
            }
          }
        }

        // Recurse into child bins
        updateAssetInBins(bin.children);
      }
    };

    try {
      updateAssetInBins(project.bins);
      this.events.onRelinkComplete?.(result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.events.onError?.(error);
      throw new RelinkError(`Failed to apply relink: ${error.message}`, 'APPLY_FAILED');
    }

    return result;
  }

  // ── Private scoring ─────────────────────────────────────────────────────

  private scoreMatch(
    asset: EditorMediaAsset,
    file: {
      filePath: string;
      fileName: string;
      fileSizeBytes: number;
      digest?: string;
      technicalMetadata?: EditorMediaTechnicalMetadata;
    },
  ): { confidence: number; reason: RelinkMatchReason } {
    let confidence = 0;
    let reason: RelinkMatchReason = 'name_only';

    // 1. Exact fingerprint match (highest confidence)
    if (asset.fingerprint && file.digest) {
      if (asset.fingerprint.digest === file.digest && asset.fingerprint.sizeBytes === file.fileSizeBytes) {
        return { confidence: 1.0, reason: 'fingerprint_exact' };
      }
      // Partial match: same digest but different size (re-encoded)
      if (asset.fingerprint.digest === file.digest) {
        confidence = Math.max(confidence, 0.9);
        reason = 'fingerprint_partial';
      }
    }

    // 2. Name matching
    const assetNameNorm = this.normalizeName(asset.name);
    const fileNameNorm = this.normalizeName(file.fileName);
    const stemNorm = this.normalizeName(asset.relinkIdentity?.sourceFileStem ?? '');

    const nameMatch = assetNameNorm === fileNameNorm || stemNorm === fileNameNorm ||
      fileNameNorm.includes(assetNameNorm) || assetNameNorm.includes(fileNameNorm);

    // 3. Duration matching
    const assetDuration = asset.technicalMetadata?.durationSeconds ?? asset.duration;
    const fileDuration = file.technicalMetadata?.durationSeconds;
    const durationMatch = assetDuration && fileDuration
      ? Math.abs(assetDuration - fileDuration) < 0.5
      : false;

    // 4. Resolution matching
    const assetWidth = asset.technicalMetadata?.width;
    const assetHeight = asset.technicalMetadata?.height;
    const fileWidth = file.technicalMetadata?.width;
    const fileHeight = file.technicalMetadata?.height;
    const resolutionMatch = assetWidth && assetHeight && fileWidth && fileHeight
      ? assetWidth === fileWidth && assetHeight === fileHeight
      : false;

    // Combine signals
    if (nameMatch && durationMatch && resolutionMatch) {
      confidence = Math.max(confidence, 0.95);
      reason = 'name_and_duration';
    } else if (nameMatch && durationMatch) {
      confidence = Math.max(confidence, 0.85);
      reason = 'name_and_duration';
    } else if (nameMatch && resolutionMatch) {
      confidence = Math.max(confidence, 0.75);
      reason = 'name_and_resolution';
    } else if (durationMatch && resolutionMatch) {
      confidence = Math.max(confidence, 0.7);
      reason = 'duration_and_resolution';
    } else if (nameMatch) {
      confidence = Math.max(confidence, 0.5);
      reason = 'name_only';
    }

    // 5. Path history check (bonus)
    const lastKnownPaths = asset.relinkIdentity?.lastKnownPaths ?? [];
    if (lastKnownPaths.some((p) => file.filePath.endsWith(p.split('/').pop() ?? ''))) {
      confidence = Math.min(1.0, confidence + 0.1);
    }

    return { confidence, reason };
  }

  private normalizeName(name: string): string {
    return name
      .replace(/\.[a-z0-9]+$/i, '') // Remove extension
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }
}
