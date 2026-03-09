/**
 * @fileoverview Adapter interface for multi-platform publish / distribution.
 *
 * `IPublishConnector` handles the last mile of the editorial workflow --
 * rendering variants for different platforms (YouTube, broadcast, OTT, etc.)
 * and delivering them.  Each connector implementation targets a specific
 * distribution back-end; the mock simulates the full lifecycle.
 */

import type {
  DeliverySpec,
  PublishPlatform,
  PublishStatus,
  PublishVariant,
} from './contracts-types';

// ---------------------------------------------------------------------------
// Supporting types
// ---------------------------------------------------------------------------

/** Result returned after a publish request is accepted. */
export interface PublishResult {
  /** Server-assigned job identifier. */
  jobId: string;
  /** Platform the variant is being published to. */
  platform: PublishPlatform;
  /** Current status of the publish job. */
  status: PublishStatus;
  /** Estimated time to completion in seconds, if available. */
  estimatedSeconds?: number;
  /** ISO-8601 timestamp of job creation. */
  createdAt: string;
}

/** Detailed status info for a publish job, returned by polling. */
export interface PublishStatusInfo {
  /** The job identifier. */
  jobId: string;
  /** Current lifecycle status. */
  status: PublishStatus;
  /** Render / upload progress from 0 to 100. */
  progress: number;
  /** Public URL once published (e.g. YouTube watch URL). */
  publicUrl?: string;
  /** Human-readable error message if status is `'failed'`. */
  error?: string;
  /** ISO-8601 timestamp of last status change. */
  updatedAt: string;
}

/** Describes what a platform supports. */
export interface PlatformCapabilities {
  /** Platform identifier. */
  platform: PublishPlatform;
  /** Human-readable display name. */
  displayName: string;
  /** Supported output formats (e.g. `["mp4", "mov"]`). */
  supportedFormats: string[];
  /** Maximum file size in bytes. */
  maxFileSizeBytes: number;
  /** Maximum duration in seconds. */
  maxDurationSeconds: number;
  /** Supported resolutions. */
  supportedResolutions: Array<{ width: number; height: number }>;
  /** Whether the platform supports scheduled publishing. */
  supportsScheduling: boolean;
  /** Whether the platform supports captions / subtitles upload. */
  supportsCaptions: boolean;
}

/** Outcome of a delivery-spec validation check. */
export interface ValidationResult {
  /** Whether the spec is valid for the target platform. */
  valid: boolean;
  /** List of issues found (empty when valid). */
  errors: ValidationIssue[];
  /** Non-blocking suggestions for improvement. */
  warnings: ValidationIssue[];
}

/** A single validation issue. */
export interface ValidationIssue {
  /** Machine-readable issue code (e.g. `"resolution_too_high"`). */
  code: string;
  /** Human-readable description. */
  message: string;
  /** The spec field that caused the issue. */
  field?: string;
}

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

/**
 * Connector for multi-platform publish and distribution.
 *
 * Implementations include platform-specific connectors (YouTube API,
 * broadcast playout servers, OTT ingest endpoints) and a mock connector
 * that simulates the full publish lifecycle in memory.
 */
export interface IPublishConnector {
  /**
   * Submit a publish variant for rendering and distribution.
   *
   * The variant contains the sequence reference, target platform,
   * delivery spec, and optional scheduling information.
   *
   * @param variant - The fully specified {@link PublishVariant}.
   * @returns A {@link PublishResult} with the assigned job ID and initial status.
   */
  publish(variant: PublishVariant): Promise<PublishResult>;

  /**
   * Poll for the current status of a publish job.
   *
   * @param jobId - The job identifier returned by {@link publish}.
   * @returns Detailed {@link PublishStatusInfo} including progress and public URL.
   */
  getPublishStatus(jobId: string): Promise<PublishStatusInfo>;

  /**
   * Revoke / un-publish a previously published piece of content.
   *
   * @param publishId - The publish job ID to revoke.
   * @throws If the content has not yet been published or was already revoked.
   */
  revoke(publishId: string): Promise<void>;

  /**
   * List all platforms supported by this connector with their capabilities.
   *
   * @returns An array of {@link PlatformCapabilities} descriptors.
   */
  getSupportedPlatforms(): Promise<PlatformCapabilities[]>;

  /**
   * Validate a delivery specification against a platform's requirements
   * before committing to a publish.
   *
   * @param platform - Target platform identifier string.
   * @param spec     - The {@link DeliverySpec} to validate.
   * @returns A {@link ValidationResult} indicating validity and any issues.
   */
  validateSpec(
    platform: string,
    spec: DeliverySpec,
  ): Promise<ValidationResult>;
}
