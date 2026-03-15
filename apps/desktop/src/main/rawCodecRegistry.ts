/**
 * RAW Codec Registry — Stub integration points for proprietary camera RAW formats.
 *
 * Each entry declares:
 *   - Whether the vendor SDK is available at runtime
 *   - The file extensions it handles
 *   - The SDK/library needed to decode
 *   - A decode stub that can be replaced with real SDK calls once licensed
 *
 * LICENSING NOTES (as of 2026-03):
 *   - BRAW SDK: Free download from Blackmagic Design (requires registration)
 *   - RED SDK (DSMC2/V-RAPTOR): Proprietary — contact RED Digital Cinema for OEM license
 *   - ARRI SDK: Proprietary — contact ARRI for ARRIRAW SDK access
 *   - Canon Cinema RAW Light: Proprietary — contact Canon for SDK access
 *   - Sony RAW: Proprietary — contact Sony for SDK access
 *   - CinemaDNG: Open standard, decoded via libraw/FFmpeg (already supported)
 */

export interface RawCodecDescriptor {
  id: string;
  name: string;
  vendor: string;
  extensions: string[];
  sdkName: string;
  sdkUrl: string;
  licenseType: 'free' | 'proprietary' | 'open-source';
  /** Whether the native SDK module is loadable at runtime. */
  isAvailable: () => boolean;
  /**
   * Attempt to probe a RAW file for metadata.
   * Returns null if the SDK is not installed.
   */
  probe: (filePath: string) => Promise<RawProbeResult | null>;
  /**
   * Decode a frame range to an intermediate format (e.g. EXR/DPX) for timeline playback.
   * Returns null if the SDK is not installed.
   */
  decodeFrames: (filePath: string, startFrame: number, endFrame: number, outputDir: string) => Promise<string[] | null>;
}

export interface RawProbeResult {
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
  codec: string;
  bitDepth: number;
  colorSpace?: string;
  sensorInfo?: string;
  /** Camera model string, if available from metadata. */
  cameraModel?: string;
}

// ─── SDK availability checks ─────────────────────────────────────────────────

function tryRequire(moduleName: string): boolean {
  try {
    require.resolve(moduleName);
    return true;
  } catch {
    return false;
  }
}

// ─── Codec Descriptors ───────────────────────────────────────────────────────

const blackmagicRaw: RawCodecDescriptor = {
  id: 'braw',
  name: 'Blackmagic RAW',
  vendor: 'Blackmagic Design',
  extensions: ['.braw'],
  sdkName: 'Blackmagic RAW SDK',
  sdkUrl: 'https://www.blackmagicdesign.com/developer/product/camera',
  licenseType: 'free',
  isAvailable: () => tryRequire('braw-sdk'),
  probe: async (filePath) => {
    if (!blackmagicRaw.isAvailable()) {
      console.warn(`[RAW] BRAW SDK not installed — cannot decode ${filePath}`);
      return null;
    }
    // TODO: Replace with real BRAW SDK calls when available
    // const braw = require('braw-sdk');
    // return braw.probe(filePath);
    return null;
  },
  decodeFrames: async (_filePath, _startFrame, _endFrame, _outputDir) => {
    if (!blackmagicRaw.isAvailable()) return null;
    // TODO: Replace with real BRAW SDK decode
    return null;
  },
};

const redRaw: RawCodecDescriptor = {
  id: 'r3d',
  name: 'REDCODE RAW',
  vendor: 'RED Digital Cinema',
  extensions: ['.r3d'],
  sdkName: 'RED SDK',
  sdkUrl: 'https://www.red.com/dsmc2-sdk',
  licenseType: 'proprietary',
  isAvailable: () => tryRequire('red-sdk'),
  probe: async (filePath) => {
    if (!redRaw.isAvailable()) {
      console.warn(`[RAW] RED SDK not installed — cannot decode ${filePath}`);
      return null;
    }
    // TODO: Replace with real RED SDK calls when licensed
    return null;
  },
  decodeFrames: async (_filePath, _startFrame, _endFrame, _outputDir) => {
    if (!redRaw.isAvailable()) return null;
    return null;
  },
};

const arriRaw: RawCodecDescriptor = {
  id: 'arriraw',
  name: 'ARRIRAW',
  vendor: 'ARRI',
  extensions: ['.ari', '.arx'],
  sdkName: 'ARRI Image SDK',
  sdkUrl: 'https://www.arri.com/en/learn-help/learn-help-camera-system/tools/arriraw-converter',
  licenseType: 'proprietary',
  isAvailable: () => tryRequire('arri-image-sdk'),
  probe: async (filePath) => {
    if (!arriRaw.isAvailable()) {
      console.warn(`[RAW] ARRI SDK not installed — cannot decode ${filePath}`);
      return null;
    }
    return null;
  },
  decodeFrames: async (_filePath, _startFrame, _endFrame, _outputDir) => {
    if (!arriRaw.isAvailable()) return null;
    return null;
  },
};

const canonCinemaRaw: RawCodecDescriptor = {
  id: 'crm',
  name: 'Canon Cinema RAW Light',
  vendor: 'Canon',
  extensions: ['.crm'],
  sdkName: 'Canon RAW Development SDK',
  sdkUrl: 'https://developercommunity.usa.canon.com/',
  licenseType: 'proprietary',
  isAvailable: () => tryRequire('canon-raw-sdk'),
  probe: async (filePath) => {
    if (!canonCinemaRaw.isAvailable()) {
      console.warn(`[RAW] Canon Cinema RAW SDK not installed — cannot decode ${filePath}`);
      return null;
    }
    return null;
  },
  decodeFrames: async (_filePath, _startFrame, _endFrame, _outputDir) => {
    if (!canonCinemaRaw.isAvailable()) return null;
    return null;
  },
};

const sonyRaw: RawCodecDescriptor = {
  id: 'sonyraw',
  name: 'Sony RAW',
  vendor: 'Sony',
  extensions: ['.mxf'], // Sony X-OCN uses MXF container — handled by extension + codec detection
  sdkName: 'Sony RAW Driver SDK',
  sdkUrl: 'https://pro.sony/en_GB/products/software',
  licenseType: 'proprietary',
  isAvailable: () => tryRequire('sony-raw-sdk'),
  probe: async (filePath) => {
    if (!sonyRaw.isAvailable()) {
      console.warn(`[RAW] Sony RAW SDK not installed — cannot decode ${filePath}`);
      return null;
    }
    return null;
  },
  decodeFrames: async (_filePath, _startFrame, _endFrame, _outputDir) => {
    if (!sonyRaw.isAvailable()) return null;
    return null;
  },
};

// ─── Registry ────────────────────────────────────────────────────────────────

const CODEC_REGISTRY: RawCodecDescriptor[] = [
  blackmagicRaw,
  redRaw,
  arriRaw,
  canonCinemaRaw,
  sonyRaw,
];

/**
 * Look up a RAW codec descriptor by file extension.
 * Returns undefined for non-RAW files.
 */
export function findRawCodec(filePath: string): RawCodecDescriptor | undefined {
  const ext = filePath.toLowerCase().replace(/^.*(\.[^.]+)$/, '$1');
  return CODEC_REGISTRY.find((codec) => codec.extensions.includes(ext));
}

/**
 * Get the full list of registered RAW codecs with their availability status.
 */
export function getRawCodecStatus(): Array<{ id: string; name: string; vendor: string; available: boolean; licenseType: string; sdkUrl: string }> {
  return CODEC_REGISTRY.map((codec) => ({
    id: codec.id,
    name: codec.name,
    vendor: codec.vendor,
    available: codec.isAvailable(),
    licenseType: codec.licenseType,
    sdkUrl: codec.sdkUrl,
  }));
}

/**
 * Attempt to probe a RAW file using the appropriate vendor SDK.
 * Falls back to null if no SDK is available (file will be shown as "unsupported" in UI).
 */
export async function probeRawFile(filePath: string): Promise<RawProbeResult | null> {
  const codec = findRawCodec(filePath);
  if (!codec) return null;
  return codec.probe(filePath);
}

/**
 * Get a human-readable message about why a RAW file can't be decoded.
 */
export function getRawCodecUnavailableReason(filePath: string): string | null {
  const codec = findRawCodec(filePath);
  if (!codec) return null;
  if (codec.isAvailable()) return null;
  return `${codec.name} requires the ${codec.sdkName} (${codec.licenseType === 'free' ? 'free download' : 'proprietary license'} from ${codec.vendor}). Visit ${codec.sdkUrl}`;
}
