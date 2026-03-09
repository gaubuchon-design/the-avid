// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID -- Media Management Engine
// ═══════════════════════════════════════════════════════════════════════════
//
// Implements Avid Media Composer's media management operations:
//  - Consolidate:     Copy/move media referenced by clips to a single
//                     target drive, trimming to used portions + handles.
//  - Transcode:       Re-encode media into a different codec/resolution
//                     (background or foreground).
//  - Relink:          Reconnect offline clips to their source media files
//                     by matching tape name, timecode, or clip name.
//  - Dynamic Relink:  Switch between proxy and full-res on the fly.
//  - AMA (Avid Media Access): Link camera-native media directly without
//                     importing to Avid MediaFiles.
//  - Import / Export: Bring media into the project or export to disk.
//

import { useEditorStore } from '../store/editor.store';
import type { MediaAsset, Bin } from '../store/editor.store';

// ─── Types ──────────────────────────────────────────────────────────────────

export type MediaFormat = 'mxf-op-atom' | 'mxf-op1a' | 'mov' | 'mp4';

export type CodecType =
  | 'dnxhr-lb'
  | 'dnxhr-sq'
  | 'dnxhr-hq'
  | 'dnxhr-hqx'
  | 'dnxhr-444'
  | 'prores-proxy'
  | 'prores-lt'
  | 'prores-422'
  | 'prores-hq'
  | 'prores-4444'
  | 'h264'
  | 'h265'
  | 'original';

export interface ConsolidateOptions {
  targetPath: string;
  skipExisting: boolean;
  includeHandles: boolean;
  handleLength: number; // frames
}

export interface TranscodeOptions {
  codec: CodecType;
  resolution: 'project' | 'source' | '1/4' | '1/16' | 'custom';
  customWidth?: number;
  customHeight?: number;
  targetPath: string;
  runInBackground: boolean;
}

export interface RelinkOptions {
  matchBy: ('tape-name' | 'timecode' | 'clip-name')[];
  targetPath?: string;
  createNewSequence: boolean;
}

export interface MediaStatus {
  assetId: string;
  online: boolean;
  mediaPath: string | null;
  codec: string | null;
  resolution: string | null;
  fileSize: number; // bytes
  isProxy: boolean;
}

export interface AMALink {
  id: string;
  assetId: string;
  sourcePath: string;
  format: string;
  linked: boolean;
}

// ─── Codec Catalog ──────────────────────────────────────────────────────

interface CodecInfo {
  id: CodecType;
  name: string;
  description: string;
}

const CODEC_CATALOG: CodecInfo[] = [
  { id: 'dnxhr-lb',       name: 'DNxHR LB',         description: 'Avid DNxHR Low Bandwidth -- offline/proxy editing.' },
  { id: 'dnxhr-sq',       name: 'DNxHR SQ',         description: 'Avid DNxHR Standard Quality -- broadcast standard.' },
  { id: 'dnxhr-hq',       name: 'DNxHR HQ',         description: 'Avid DNxHR High Quality -- high bitrate finishing.' },
  { id: 'dnxhr-hqx',      name: 'DNxHR HQX',        description: 'Avid DNxHR HQX -- 12-bit 4:2:2 for HDR workflows.' },
  { id: 'dnxhr-444',      name: 'DNxHR 444',        description: 'Avid DNxHR 444 -- 12-bit 4:4:4 for VFX/color.' },
  { id: 'prores-proxy',   name: 'Apple ProRes Proxy', description: 'ProRes Proxy -- ultra-low bitrate offline editing.' },
  { id: 'prores-lt',      name: 'Apple ProRes LT',    description: 'ProRes LT -- lightweight yet visually transparent.' },
  { id: 'prores-422',     name: 'Apple ProRes 422',   description: 'ProRes 422 -- standard post-production codec.' },
  { id: 'prores-hq',      name: 'Apple ProRes 422 HQ', description: 'ProRes 422 HQ -- high quality for finishing.' },
  { id: 'prores-4444',    name: 'Apple ProRes 4444',  description: 'ProRes 4444 -- 4:4:4:4 with alpha channel support.' },
  { id: 'h264',           name: 'H.264 / AVC',        description: 'MPEG-4 AVC -- widely compatible delivery codec.' },
  { id: 'h265',           name: 'H.265 / HEVC',       description: 'High Efficiency Video Coding -- next-gen delivery.' },
  { id: 'original',       name: 'Original / Passthrough', description: 'Keep original codec -- no re-encoding.' },
];

// ─── ID Generation ──────────────────────────────────────────────────────

let _nextId = 0;
function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${(++_nextId).toString(36)}`;
}

// ─── Helpers ────────────────────────────────────────────────────────────

/** Read-only snapshot of the current editor store state. */
function snap() {
  return useEditorStore.getState();
}

/** Recursively find a bin by ID. */
function findBinById(bins: Bin[], binId: string): Bin | null {
  for (const bin of bins) {
    if (bin.id === binId) return bin;
    if (bin.children.length > 0) {
      const child = findBinById(bin.children, binId);
      if (child) return child;
    }
  }
  return null;
}

/** Recursively search all bins for an asset by ID. */
function findAssetById(bins: Bin[], assetId: string): MediaAsset | null {
  for (const bin of bins) {
    const asset = bin.assets.find((a) => a.id === assetId);
    if (asset) return asset;
    if (bin.children.length > 0) {
      const child = findAssetById(bin.children, assetId);
      if (child) return child;
    }
  }
  return null;
}

/** Collect all assets across all bins (recursive, deduplicated). */
function collectAllAssets(bins: Bin[]): MediaAsset[] {
  const seen = new Set<string>();
  const result: MediaAsset[] = [];

  function walk(binList: Bin[]) {
    for (const bin of binList) {
      for (const asset of bin.assets) {
        if (!seen.has(asset.id)) {
          seen.add(asset.id);
          result.push(asset);
        }
      }
      if (bin.children.length > 0) walk(bin.children);
    }
  }

  walk(bins);
  return result;
}

/** Simulate an async operation with a delay. */
function simulateAsync(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Determine if a codec is a proxy/offline codec. */
function isProxyCodec(codec: CodecType): boolean {
  return codec === 'dnxhr-lb' || codec === 'prores-proxy';
}

/** Resolve resolution dimensions for transcode. */
function resolveResolution(
  option: TranscodeOptions['resolution'],
  customWidth?: number,
  customHeight?: number,
): { width: number; height: number } {
  const state = snap();
  const projectWidth = state.projectSettings.width;
  const projectHeight = state.projectSettings.height;

  switch (option) {
    case 'project':
      return { width: projectWidth, height: projectHeight };
    case 'source':
      // Source resolution is unknown generically; return project as fallback.
      return { width: projectWidth, height: projectHeight };
    case '1/4':
      return { width: Math.round(projectWidth / 2), height: Math.round(projectHeight / 2) };
    case '1/16':
      return { width: Math.round(projectWidth / 4), height: Math.round(projectHeight / 4) };
    case 'custom':
      return {
        width: customWidth ?? projectWidth,
        height: customHeight ?? projectHeight,
      };
    default:
      return { width: projectWidth, height: projectHeight };
  }
}

// ─── Engine ─────────────────────────────────────────────────────────────

/**
 * MediaManagementEngine handles Avid-style media operations:
 * consolidation, transcoding, relinking, AMA linking, and import/export.
 *
 * In a production environment these operations would dispatch to native
 * FFmpeg workers, Electron IPC, or a backend service. This implementation
 * maintains the full API surface with simulated async I/O and accurate
 * state tracking.
 */
export class MediaManagementEngine {
  // ─── Internal State ──────────────────────────────────────────────────

  /** Media status cache: assetId -> MediaStatus. */
  private mediaStatusCache: Map<string, MediaStatus> = new Map();

  /** AMA links. */
  private amaLinks: Map<string, AMALink> = new Map();

  /** Active transcode jobs. */
  private transcodeJobs: Map<string, { codec: CodecType; assetIds: string[]; progress: number; complete: boolean }> = new Map();

  /** Dynamic relink overrides: assetId -> target codec. */
  private dynamicRelinkMap: Map<string, CodecType> = new Map();

  /** Subscribers. */
  private listeners: Set<() => void> = new Set();

  // ═══════════════════════════════════════════════════════════════════════
  //  Subscription
  // ═══════════════════════════════════════════════════════════════════════

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private notify(): void {
    for (const cb of this.listeners) {
      try { cb(); } catch { /* swallow listener errors */ }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Media Status
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Retrieve the media status for a given asset. If status has not been
   * explicitly set, derive it from the asset's store state.
   */
  getMediaStatus(assetId: string): MediaStatus {
    const cached = this.mediaStatusCache.get(assetId);
    if (cached) return { ...cached };

    // Derive status from the asset in the store.
    const asset = findAssetById(snap().bins, assetId);
    const dynamicCodec = this.dynamicRelinkMap.get(assetId);

    const status: MediaStatus = {
      assetId,
      online: asset != null && asset.status === 'READY',
      mediaPath: asset?.playbackUrl ?? null,
      codec: dynamicCodec ?? null,
      resolution: null,
      fileSize: 0,
      isProxy: dynamicCodec != null ? isProxyCodec(dynamicCodec) : false,
    };

    this.mediaStatusCache.set(assetId, status);
    return { ...status };
  }

  /**
   * Return all assets that are currently offline (no media path or
   * status is not READY).
   */
  getOfflineMedia(): MediaStatus[] {
    const allAssets = collectAllAssets(snap().bins);
    const offline: MediaStatus[] = [];

    for (const asset of allAssets) {
      const status = this.getMediaStatus(asset.id);
      if (!status.online) {
        offline.push(status);
      }
    }

    return offline;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Consolidate
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Consolidate media for the given assets to a target path.
   *
   * In production this would copy MXF OP-Atom media files, trimming them
   * to the used portions of each clip plus handle frames. Here we simulate
   * the operation and update internal status.
   */
  async consolidate(
    assetIds: string[],
    options: ConsolidateOptions,
  ): Promise<{ success: boolean; consolidated: number; skipped: number }> {
    if (assetIds.length === 0) {
      return { success: true, consolidated: 0, skipped: 0 };
    }

    if (!options.targetPath) {
      return { success: false, consolidated: 0, skipped: 0 };
    }

    let consolidated = 0;
    let skipped = 0;

    for (const assetId of assetIds) {
      const existing = this.mediaStatusCache.get(assetId);

      // Skip if the asset is already at the target path and skipExisting is set.
      if (options.skipExisting && existing?.mediaPath?.startsWith(options.targetPath)) {
        skipped++;
        continue;
      }

      // Simulate consolidation delay.
      await simulateAsync(50);

      // Update the media status with the new path.
      const status = this.getMediaStatus(assetId);
      status.mediaPath = `${options.targetPath}/${assetId}.mxf`;
      status.online = true;
      this.mediaStatusCache.set(assetId, status);

      consolidated++;
    }

    this.notify();
    return { success: true, consolidated, skipped };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Transcode
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Transcode media for the given assets to a new codec/resolution.
   *
   * Returns a jobId that can be used to track progress. In production
   * this would invoke an FFmpeg worker or native encoder.
   */
  async transcode(
    assetIds: string[],
    options: TranscodeOptions,
  ): Promise<{ success: boolean; jobId: string }> {
    if (assetIds.length === 0) {
      return { success: false, jobId: '' };
    }

    if (!options.targetPath) {
      return { success: false, jobId: '' };
    }

    const jobId = uid('tcj');
    const resolution = resolveResolution(options.resolution, options.customWidth, options.customHeight);
    const resStr = `${resolution.width}x${resolution.height}`;

    this.transcodeJobs.set(jobId, {
      codec: options.codec,
      assetIds: [...assetIds],
      progress: 0,
      complete: false,
    });

    this.notify();

    // Run the transcode simulation.
    const doTranscode = async () => {
      const job = this.transcodeJobs.get(jobId);
      if (!job) return;

      for (let i = 0; i < assetIds.length; i++) {
        const assetId = assetIds[i];

        // Simulate per-asset encoding.
        await simulateAsync(options.runInBackground ? 20 : 100);

        // Update media status.
        const status = this.getMediaStatus(assetId);
        const ext = options.codec.startsWith('prores') ? 'mov' : 'mxf';
        status.mediaPath = `${options.targetPath}/${assetId}_${options.codec}.${ext}`;
        status.codec = options.codec;
        status.resolution = resStr;
        status.online = true;
        status.isProxy = isProxyCodec(options.codec);
        this.mediaStatusCache.set(assetId, status);

        // Update job progress.
        job.progress = Math.round(((i + 1) / assetIds.length) * 100);
        this.notify();
      }

      job.complete = true;
      this.notify();
    };

    if (options.runInBackground) {
      // Fire-and-forget (non-blocking).
      doTranscode();
    } else {
      await doTranscode();
    }

    return { success: true, jobId };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Relink
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Attempt to relink offline assets to media files by matching criteria.
   *
   * In production, this would scan the filesystem for media files and
   * attempt to match them by tape name, timecode, or clip name embedded
   * in the MXF/MOV metadata. Here we simulate the matching logic.
   */
  async relink(
    assetIds: string[],
    options: RelinkOptions,
  ): Promise<{ success: boolean; relinked: number; failed: number }> {
    if (assetIds.length === 0) {
      return { success: true, relinked: 0, failed: 0 };
    }

    if (options.matchBy.length === 0) {
      return { success: false, relinked: 0, failed: 0 };
    }

    let relinked = 0;
    let failed = 0;

    for (const assetId of assetIds) {
      const asset = findAssetById(snap().bins, assetId);
      if (!asset) {
        failed++;
        continue;
      }

      // Simulate match attempt -- in production we would scan targetPath
      // and check metadata against each matchBy criterion.
      await simulateAsync(30);

      // Simulate: try to match by clip name (most common for browser-based).
      const matched = options.matchBy.includes('clip-name') && asset.name.length > 0;

      if (matched) {
        const basePath = options.targetPath ?? '/media';
        const status = this.getMediaStatus(assetId);
        status.mediaPath = `${basePath}/${asset.name.replace(/\s+/g, '_')}.mxf`;
        status.online = true;
        this.mediaStatusCache.set(assetId, status);
        relinked++;
      } else {
        failed++;
      }
    }

    this.notify();
    return { success: relinked > 0, relinked, failed };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Dynamic Relink
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Switch an asset between proxy and full-resolution media on the fly.
   * This mirrors Avid's dynamic relink for proxy workflows where the
   * editor works with low-res proxies during rough cut and switches to
   * full-res for finishing.
   */
  dynamicRelink(assetId: string, targetCodec: CodecType): void {
    this.dynamicRelinkMap.set(assetId, targetCodec);

    // Update the cached media status.
    const status = this.getMediaStatus(assetId);
    status.codec = targetCodec;
    status.isProxy = isProxyCodec(targetCodec);
    this.mediaStatusCache.set(assetId, status);

    this.notify();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  AMA (Avid Media Access)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Create an AMA link to camera-native media at the given source path.
   * AMA allows direct playback of camera-native formats (R3D, ARRIRAW,
   * BRAW, MXF OP1a, etc.) without transcoding into Avid MediaFiles.
   */
  amaLink(sourcePath: string): AMALink {
    if (!sourcePath) {
      throw new Error('AMA link requires a source path.');
    }

    const id = uid('ama');
    const assetId = uid('asset');

    // Determine format from extension.
    const ext = sourcePath.split('.').pop()?.toLowerCase() ?? '';
    const formatMap: Record<string, string> = {
      r3d: 'RED R3D',
      ari: 'ARRIRAW',
      arx: 'ARRIRAW',
      braw: 'Blackmagic RAW',
      mxf: 'MXF OP1a',
      mov: 'QuickTime',
      mp4: 'MPEG-4',
      cine: 'Phantom Cine',
      dng: 'CinemaDNG',
    };
    const format = formatMap[ext] ?? `Unknown (${ext})`;

    const link: AMALink = {
      id,
      assetId,
      sourcePath,
      format,
      linked: true,
    };

    this.amaLinks.set(id, link);

    // Set up media status for the AMA-linked asset.
    const status: MediaStatus = {
      assetId,
      online: true,
      mediaPath: sourcePath,
      codec: 'original',
      resolution: null,
      fileSize: 0,
      isProxy: false,
    };
    this.mediaStatusCache.set(assetId, status);

    this.notify();
    return { ...link };
  }

  /**
   * Remove an AMA link. The linked asset reference remains in the bin
   * but becomes offline.
   */
  amaUnlink(linkId: string): void {
    const link = this.amaLinks.get(linkId);
    if (!link) return;

    link.linked = false;

    // Mark the asset as offline.
    const status = this.mediaStatusCache.get(link.assetId);
    if (status) {
      status.online = false;
      status.mediaPath = null;
    }

    this.amaLinks.delete(linkId);
    this.notify();
  }

  /**
   * Return all current AMA links.
   */
  getAMALinks(): AMALink[] {
    return Array.from(this.amaLinks.values()).map((l) => ({ ...l }));
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Import / Export
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Import media files into a target bin, optionally transcoding them.
   *
   * Returns an array of new asset IDs created in the bin.
   */
  async importMedia(
    files: File[],
    targetBinId: string,
    options?: { transcode?: boolean; codec?: CodecType },
  ): Promise<string[]> {
    if (files.length === 0) return [];

    const bin = findBinById(snap().bins, targetBinId);
    if (!bin) {
      throw new Error(`Target bin not found: ${targetBinId}`);
    }

    const newAssetIds: string[] = [];

    for (const file of files) {
      await simulateAsync(30);

      const assetId = uid('asset');

      // Determine asset type from MIME / extension.
      let assetType: MediaAsset['type'] = 'VIDEO';
      if (file.type.startsWith('audio/')) {
        assetType = 'AUDIO';
      } else if (file.type.startsWith('image/')) {
        assetType = 'IMAGE';
      } else if (file.type.startsWith('application/') || file.type.startsWith('text/')) {
        assetType = 'DOCUMENT';
      }

      // Set up media status.
      const codec = options?.transcode ? (options.codec ?? 'dnxhr-sq') : 'original';
      const status: MediaStatus = {
        assetId,
        online: true,
        mediaPath: file.name,
        codec,
        resolution: null,
        fileSize: file.size,
        isProxy: isProxyCodec(codec),
      };
      this.mediaStatusCache.set(assetId, status);

      newAssetIds.push(assetId);
    }

    this.notify();
    return newAssetIds;
  }

  /**
   * Export media for the given assets to a specified format and output path.
   *
   * In production this would render or rewrap the media into the target
   * container format.
   */
  async exportMedia(
    assetIds: string[],
    format: MediaFormat,
    outputPath: string,
  ): Promise<{ success: boolean; outputPaths: string[] }> {
    if (assetIds.length === 0) {
      return { success: true, outputPaths: [] };
    }

    if (!outputPath) {
      return { success: false, outputPaths: [] };
    }

    const extMap: Record<MediaFormat, string> = {
      'mxf-op-atom': 'mxf',
      'mxf-op1a': 'mxf',
      'mov': 'mov',
      'mp4': 'mp4',
    };
    const ext = extMap[format];
    const outputPaths: string[] = [];

    for (const assetId of assetIds) {
      const asset = findAssetById(snap().bins, assetId);
      const baseName = asset?.name.replace(/\s+/g, '_') ?? assetId;

      await simulateAsync(50);

      const path = `${outputPath}/${baseName}.${ext}`;
      outputPaths.push(path);
    }

    this.notify();
    return { success: true, outputPaths };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Codec Catalog
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Return the list of all supported codecs with display names and
   * descriptions.
   */
  getCodecs(): { id: CodecType; name: string; description: string }[] {
    return CODEC_CATALOG.map((c) => ({ ...c }));
  }
}

/** Singleton MediaManagementEngine instance. */
export const mediaManagementEngine = new MediaManagementEngine();
