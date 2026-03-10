// ─── Project Manifest ───────────────────────────────────────────────────────
// Defines the shareable project structure that can be exchanged between
// collaborators via file export (JSON), cloud relay, or LAN transfer.
//
// The manifest is the "table of contents" for a collaborative project.
// It does NOT contain the actual media bytes or the full CRDT state —
// instead it references them by id / checksum / URL so that each
// participant can fetch what they need.
//
// Sections:
//   1. **Project metadata** — name, created/modified dates, collaborators.
//   2. **Timeline references** — which timelines exist, their version hashes.
//   3. **Media asset references** — paths, checksums, proxy info.
//   4. **Version chain** — linked list of version snapshots.
//   5. **Manifest builder** — fluent API for constructing manifests.
//   6. **Serialisation** — JSON export / import with validation.
// ─────────────────────────────────────────────────────────────────────────────

import type { NodeId } from './ProjectDocument';

// ─── 1. Project Metadata ────────────────────────────────────────────────────

/**
 * Core metadata describing the project.
 */
export interface ManifestProjectMeta {
  /** Unique project identifier (UUID). */
  projectId: string;
  /** Human-readable project name. */
  name: string;
  /** Optional description. */
  description: string;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** ISO-8601 last-modified timestamp. */
  modifiedAt: string;
  /** Timeline frame rate (fps). */
  frameRate: number;
  /** Horizontal resolution in pixels. */
  width: number;
  /** Vertical resolution in pixels. */
  height: number;
  /** Audio sample rate in Hz. */
  sampleRate: number;
  /** Colour space identifier (e.g. "Rec.709", "Rec.2020"). */
  colorSpace: string;
  /** Arbitrary key/value tags for organisation. */
  tags: string[];
}

// ─── 2. Collaborator ────────────────────────────────────────────────────────

/** Role a collaborator can hold within a project. */
export type CollaboratorRole = 'owner' | 'admin' | 'editor' | 'assistant' | 'reviewer' | 'viewer';

/**
 * A collaborator entry in the manifest.
 */
export interface ManifestCollaborator {
  /** The collaborator's node id. */
  nodeId: NodeId;
  /** Display name. */
  displayName: string;
  /** Email address (optional, for cloud-relay invitations). */
  email?: string;
  /** Collaborator role. */
  role: CollaboratorRole;
  /** Hex colour assigned for presence cursors. */
  color: string;
  /** ISO-8601 timestamp of when they joined. */
  joinedAt: string;
  /** ISO-8601 timestamp of last activity. */
  lastActiveAt: string;
}

// ─── 3. Timeline Reference ──────────────────────────────────────────────────

/**
 * A lightweight reference to a timeline within the project.
 * Does not contain the full timeline data — that lives in the
 * `ProjectDocument` CRDT.
 */
export interface ManifestTimelineRef {
  /** Unique timeline id. */
  timelineId: string;
  /** Display name (e.g. "Main Timeline", "Director's Cut"). */
  name: string;
  /** Whether this is the primary timeline. */
  isPrimary: boolean;
  /** Duration in seconds. */
  duration: number;
  /** Number of tracks. */
  trackCount: number;
  /** Number of clips. */
  clipCount: number;
  /** SHA-256 hash of the timeline's serialised CRDT state.  Used to detect
   *  whether a sync is needed without transmitting the full state. */
  stateHash: string;
  /** The version snapshot id that this timeline reference corresponds to. */
  versionSnapshotId: string;
  /** ISO-8601 last-modified timestamp. */
  modifiedAt: string;
}

// ─── 4. Media Asset Reference ───────────────────────────────────────────────

/** The type of media an asset represents. */
export type ManifestMediaType = 'video' | 'audio' | 'image' | 'document' | 'graphic';

/** Status of an asset from the manifest's perspective. */
export type ManifestAssetStatus = 'available' | 'pending' | 'offline' | 'error';

/**
 * A reference to a media asset.  Contains enough metadata for the
 * receiver to locate, verify, and optionally download the asset.
 */
export interface ManifestAssetRef {
  /** Unique asset id. */
  assetId: string;
  /** File name (e.g. "interview_take3.mov"). */
  fileName: string;
  /** Media type. */
  mediaType: ManifestMediaType;
  /** Current status. */
  status: ManifestAssetStatus;
  /** MIME type (e.g. "video/quicktime"). */
  mimeType: string;
  /** File size in bytes. */
  fileSize: number;
  /** Duration in seconds (for audio / video). `null` for images. */
  duration: number | null;
  /** SHA-256 checksum of the original file for integrity verification. */
  checksum: string;

  // ── Storage paths ──────────────────────────────────────────────────────

  /** Relative path within the project directory (for file-based projects). */
  relativePath: string;
  /** Cloud storage key (S3 / GCS), if applicable. */
  cloudStorageKey?: string;
  /** URL for direct download (presigned or public). */
  downloadUrl?: string;

  // ── Proxy ──────────────────────────────────────────────────────────────

  /** Whether a low-res proxy exists for this asset. */
  hasProxy: boolean;
  /** Relative path to the proxy file. */
  proxyRelativePath?: string;
  /** Cloud storage key for the proxy. */
  proxyCloudStorageKey?: string;
  /** Resolution of the proxy (e.g. "1280x720"). */
  proxyResolution?: string;

  // ── Technical metadata ─────────────────────────────────────────────────

  /** Width in pixels (video / image). */
  width?: number;
  /** Height in pixels (video / image). */
  height?: number;
  /** Frame rate (video). */
  frameRate?: number;
  /** Codec identifier (e.g. "h264", "prores"). */
  codec?: string;
  /** Number of audio channels. */
  audioChannels?: number;
  /** Audio sample rate in Hz. */
  sampleRate?: number;
}

// ─── 5. Version Chain Entry ─────────────────────────────────────────────────

/**
 * A single entry in the version chain stored within the manifest.
 * This is a simplified view of `VersionSnapshot` — the full snapshot
 * data is not included; instead a reference id and hash are provided.
 */
export interface ManifestVersionEntry {
  /** Snapshot id. */
  snapshotId: string;
  /** Human-readable version name. */
  name: string;
  /** Description / release notes. */
  description: string;
  /** Who created it. */
  createdBy: string;
  /** ISO-8601 timestamp. */
  createdAt: string;
  /** Id of the parent snapshot (linked list). `null` for root. */
  parentSnapshotId: string | null;
  /** SHA-256 hash of the full snapshot data for verification. */
  snapshotHash: string;
  /** Number of incremental changes since the parent snapshot. */
  changeCount: number;
  /** Tags for filtering. */
  tags: string[];
}

// ─── 6. Full Manifest ───────────────────────────────────────────────────────

/**
 * The complete project manifest.
 * Exportable as a single JSON file and usable for both file-based
 * sharing (e.g. `.avid-project` file) and cloud-relay handshake.
 */
export interface ProjectManifest {
  /** Fixed identifier for the manifest schema. */
  schemaVersion: number;
  /** Project metadata. */
  project: ManifestProjectMeta;
  /** List of collaborators. */
  collaborators: ManifestCollaborator[];
  /** Timeline references. */
  timelines: ManifestTimelineRef[];
  /** Media asset references. */
  assets: ManifestAssetRef[];
  /** Version chain (oldest first). */
  versionChain: ManifestVersionEntry[];
  /** ISO-8601 timestamp of when this manifest was generated. */
  generatedAt: string;
  /** The node that generated this manifest. */
  generatedBy: NodeId;
}

// ─── 7. Manifest Builder ────────────────────────────────────────────────────

/**
 * Fluent builder for constructing a `ProjectManifest`.
 *
 * @example
 * ```ts
 * const manifest = new ManifestBuilder('node-a')
 *   .setProject({
 *     projectId: 'p1',
 *     name: 'My Film',
 *     description: 'A short film',
 *     createdAt: new Date().toISOString(),
 *     modifiedAt: new Date().toISOString(),
 *     frameRate: 23.976,
 *     width: 1920,
 *     height: 1080,
 *     sampleRate: 48000,
 *     colorSpace: 'Rec.709',
 *     tags: ['short', 'drama'],
 *   })
 *   .addCollaborator({ ... })
 *   .addTimeline({ ... })
 *   .addAsset({ ... })
 *   .addVersion({ ... })
 *   .build();
 * ```
 */
export class ManifestBuilder {
  private nodeId: NodeId;
  private project: ManifestProjectMeta | null = null;
  private collaborators: ManifestCollaborator[] = [];
  private timelines: ManifestTimelineRef[] = [];
  private assets: ManifestAssetRef[] = [];
  private versionChain: ManifestVersionEntry[] = [];

  constructor(nodeId: NodeId) {
    this.nodeId = nodeId;
  }

  /** Set the project metadata (required). */
  setProject(meta: ManifestProjectMeta): this {
    this.project = meta;
    return this;
  }

  /** Add a collaborator. */
  addCollaborator(collaborator: ManifestCollaborator): this {
    this.collaborators.push(collaborator);
    return this;
  }

  /** Add multiple collaborators. */
  addCollaborators(collaborators: ManifestCollaborator[]): this {
    this.collaborators.push(...collaborators);
    return this;
  }

  /** Add a timeline reference. */
  addTimeline(timeline: ManifestTimelineRef): this {
    this.timelines.push(timeline);
    return this;
  }

  /** Add multiple timeline references. */
  addTimelines(timelines: ManifestTimelineRef[]): this {
    this.timelines.push(...timelines);
    return this;
  }

  /** Add a media asset reference. */
  addAsset(asset: ManifestAssetRef): this {
    this.assets.push(asset);
    return this;
  }

  /** Add multiple media asset references. */
  addAssets(assets: ManifestAssetRef[]): this {
    this.assets.push(...assets);
    return this;
  }

  /** Add a version chain entry. */
  addVersion(version: ManifestVersionEntry): this {
    this.versionChain.push(version);
    return this;
  }

  /** Add multiple version chain entries. */
  addVersions(versions: ManifestVersionEntry[]): this {
    this.versionChain.push(...versions);
    return this;
  }

  /**
   * Build and return the manifest.
   *
   * @throws Error if project metadata has not been set.
   */
  build(): ProjectManifest {
    if (!this.project) {
      throw new Error('ManifestBuilder: project metadata must be set before building.');
    }

    return {
      schemaVersion: ProjectManifest.SCHEMA_VERSION,
      project: { ...this.project },
      collaborators: [...this.collaborators],
      timelines: [...this.timelines],
      assets: [...this.assets],
      versionChain: [...this.versionChain],
      generatedAt: new Date().toISOString(),
      generatedBy: this.nodeId,
    };
  }
}

// ─── 8. Manifest Utilities (namespace on the interface) ─────────────────────

/**
 * Static utilities for the `ProjectManifest` type.
 *
 * Using a namespace merged onto the interface lets us write
 * `ProjectManifest.SCHEMA_VERSION` and `ProjectManifest.toJSON(m)`
 * without a separate class.
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace ProjectManifest {
  /** Current schema version.  Increment when the manifest shape changes. */
  export const SCHEMA_VERSION = 1;

  /**
   * Serialise a manifest to a JSON string.
   *
   * @param manifest  The manifest to serialise.
   * @param pretty    If `true`, format with 2-space indentation (default: `true`).
   */
  export function toJSON(manifest: ProjectManifest, pretty = true): string {
    return JSON.stringify(manifest, null, pretty ? 2 : undefined);
  }

  /**
   * Parse a manifest from a JSON string.
   *
   * @param json  The JSON string to parse.
   * @returns The parsed manifest.
   * @throws Error if the JSON is invalid or the schema version is unsupported.
   */
  export function fromJSON(json: string): ProjectManifest {
    const parsed = JSON.parse(json) as ProjectManifest;
    validate(parsed);
    return parsed;
  }

  /**
   * Validate a manifest object.
   *
   * @throws Error if required fields are missing or the schema version is
   *   not supported.
   */
  export function validate(manifest: ProjectManifest): void {
    if (!manifest.schemaVersion) {
      throw new Error('ProjectManifest: missing schemaVersion.');
    }
    if (manifest.schemaVersion > SCHEMA_VERSION) {
      throw new Error(
        `ProjectManifest: unsupported schema version ${manifest.schemaVersion} ` +
          `(max supported: ${SCHEMA_VERSION}).`,
      );
    }
    if (!manifest.project?.projectId) {
      throw new Error('ProjectManifest: missing project.projectId.');
    }
    if (!manifest.project?.name) {
      throw new Error('ProjectManifest: missing project.name.');
    }
  }

  /**
   * Compute a lightweight summary of a manifest for display purposes.
   */
  export function summarize(manifest: ProjectManifest): ManifestSummary {
    const totalAssetSize = manifest.assets.reduce((acc, a) => acc + a.fileSize, 0);
    const totalDuration = manifest.timelines.reduce((acc, t) => acc + t.duration, 0);

    return {
      projectId: manifest.project.projectId,
      name: manifest.project.name,
      collaboratorCount: manifest.collaborators.length,
      timelineCount: manifest.timelines.length,
      assetCount: manifest.assets.length,
      versionCount: manifest.versionChain.length,
      totalAssetSizeBytes: totalAssetSize,
      totalDurationSeconds: totalDuration,
      latestVersion: manifest.versionChain.length > 0
        ? manifest.versionChain[manifest.versionChain.length - 1]!.name
        : null,
      generatedAt: manifest.generatedAt,
    };
  }

  /**
   * Compute the difference between two manifests.
   * Useful for determining what has changed between two points in time.
   */
  export function diff(older: ProjectManifest, newer: ProjectManifest): ManifestDiff {
    const olderAssetIds = new Set(older.assets.map((a) => a.assetId));
    const newerAssetIds = new Set(newer.assets.map((a) => a.assetId));

    const addedAssets = newer.assets.filter((a) => !olderAssetIds.has(a.assetId));
    const removedAssets = older.assets.filter((a) => !newerAssetIds.has(a.assetId));

    const olderTimelineIds = new Set(older.timelines.map((t) => t.timelineId));
    const newerTimelineIds = new Set(newer.timelines.map((t) => t.timelineId));

    const addedTimelines = newer.timelines.filter((t) => !olderTimelineIds.has(t.timelineId));
    const removedTimelines = older.timelines.filter((t) => !newerTimelineIds.has(t.timelineId));

    const modifiedTimelines = newer.timelines.filter((nt) => {
      const ot = older.timelines.find((t) => t.timelineId === nt.timelineId);
      return ot && ot.stateHash !== nt.stateHash;
    });

    const olderCollabIds = new Set(older.collaborators.map((c) => c.nodeId));
    const newerCollabIds = new Set(newer.collaborators.map((c) => c.nodeId));

    const addedCollaborators = newer.collaborators.filter((c) => !olderCollabIds.has(c.nodeId));
    const removedCollaborators = older.collaborators.filter((c) => !newerCollabIds.has(c.nodeId));

    const newVersions = newer.versionChain.filter(
      (v) => !older.versionChain.some((ov) => ov.snapshotId === v.snapshotId),
    );

    return {
      addedAssets,
      removedAssets,
      addedTimelines,
      removedTimelines,
      modifiedTimelines,
      addedCollaborators,
      removedCollaborators,
      newVersions,
    };
  }
}

// ─── Summary & Diff Types ───────────────────────────────────────────────────

/**
 * Lightweight summary of a project manifest for UI display.
 */
export interface ManifestSummary {
  projectId: string;
  name: string;
  collaboratorCount: number;
  timelineCount: number;
  assetCount: number;
  versionCount: number;
  totalAssetSizeBytes: number;
  totalDurationSeconds: number;
  latestVersion: string | null;
  generatedAt: string;
}

/**
 * The difference between two manifest versions.
 */
export interface ManifestDiff {
  addedAssets: ManifestAssetRef[];
  removedAssets: ManifestAssetRef[];
  addedTimelines: ManifestTimelineRef[];
  removedTimelines: ManifestTimelineRef[];
  modifiedTimelines: ManifestTimelineRef[];
  addedCollaborators: ManifestCollaborator[];
  removedCollaborators: ManifestCollaborator[];
  newVersions: ManifestVersionEntry[];
}
