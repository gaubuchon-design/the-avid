// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID -- RS-232 Deck Control Types
// ═══════════════════════════════════════════════════════════════════════════

/** BCD-encoded timecode from a video tape deck */
export interface DeckTimecode {
  hours: number;
  minutes: number;
  seconds: number;
  frames: number;
  dropFrame: boolean;
}

/** Transport state of a connected VTR */
export type DeckTransportState =
  | 'stopped'
  | 'playing'
  | 'recording'
  | 'fast-forward'
  | 'rewind'
  | 'jog-forward'
  | 'jog-reverse'
  | 'shuttle-forward'
  | 'shuttle-reverse'
  | 'paused'
  | 'ejected'
  | 'unknown';

/** Status response from a VTR */
export interface DeckStatus {
  transportState: DeckTransportState;
  timecode: DeckTimecode;
  isRemoteEnabled: boolean;
  isTapeLoaded: boolean;
  isServoLocked: boolean;
  isRecordInhibit: boolean;
  signalPresent: boolean;
  hardwareError: boolean;
}

/** Serial port information */
export interface DeckPort {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  pnpId?: string;
  vendorId?: string;
  productId?: string;
}

/** Configuration for capture-from-deck workflow */
export interface DeckCaptureConfig {
  deckPortPath: string;
  captureDeviceId: string;    // DeckLink/AJA device for video capture
  inPoint: DeckTimecode;
  outPoint: DeckTimecode;
  prerollFrames: number;      // Default: 150 (5 seconds at 30fps)
  outputPath: string;
  fileName: string;
}

/** Status of a capture-from-deck operation */
export interface DeckCaptureStatus {
  state: 'idle' | 'prerolling' | 'recording' | 'stopping' | 'complete' | 'error';
  currentTimecode: DeckTimecode;
  framesRecorded: number;
  errorMessage?: string;
}

/** Format a DeckTimecode as a string */
export function formatDeckTimecode(tc: DeckTimecode): string {
  const sep = tc.dropFrame ? ';' : ':';
  return (
    String(tc.hours).padStart(2, '0') + ':' +
    String(tc.minutes).padStart(2, '0') + ':' +
    String(tc.seconds).padStart(2, '0') + sep +
    String(tc.frames).padStart(2, '0')
  );
}

/** Parse a timecode string into DeckTimecode */
export function parseDeckTimecode(tc: string): DeckTimecode {
  const dropFrame = tc.includes(';');
  const parts = tc.replace(';', ':').split(':').map(Number);
  return {
    hours: parts[0] || 0,
    minutes: parts[1] || 0,
    seconds: parts[2] || 0,
    frames: parts[3] || 0,
    dropFrame,
  };
}
