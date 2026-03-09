// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID -- Streaming Output Types
// ═══════════════════════════════════════════════════════════════════════════

export type StreamProtocol = 'ndi' | 'srt';

export interface NDIConfig {
  sourceName: string;
  groups?: string;
  clockVideo: boolean;
  clockAudio: boolean;
}

export interface SRTConfig {
  host: string;
  port: number;
  mode: 'caller' | 'listener' | 'rendezvous';
  latency: number;          // ms, default 120
  passphrase?: string;      // AES-128/256 encryption
  maxBandwidth?: number;    // bytes/s, -1 for unlimited
  streamId?: string;
  payloadSize?: number;     // MTU, default 1316
}

export interface StreamConfig {
  protocol: StreamProtocol;
  ndi?: NDIConfig;
  srt?: SRTConfig;
  videoCodec: 'h264' | 'hevc';
  videoBitrate: number;     // kbps
  width: number;
  height: number;
  frameRate: number;
  audioEnabled: boolean;
  audioSampleRate: number;
  audioChannels: number;
}

export interface StreamStats {
  protocol: StreamProtocol;
  state: 'idle' | 'connecting' | 'streaming' | 'error';
  framesSent: number;
  bytesSent: number;
  bitrate: number;          // current kbps
  rtt?: number;             // ms (SRT only)
  packetLoss?: number;      // percentage (SRT only)
  uptime: number;           // seconds
  errorMessage?: string;
}

export interface StreamTarget {
  id: string;
  protocol: StreamProtocol;
  name: string;
  config: StreamConfig;
  stats: StreamStats;
}
