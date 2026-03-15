// =============================================================================
//  THE AVID — Electron IPC Channel Definitions
//  Shared constants for codec service IPC between renderer and main process.
// =============================================================================

/** IPC channel namespace for codec operations. */
export const CODEC_IPC_NAMESPACE = 'avid:codec';

/** All codec IPC channels. */
export const CodecIpcChannel = {
  // Lifecycle
  INIT: `${CODEC_IPC_NAMESPACE}:init`,
  DISPOSE: `${CODEC_IPC_NAMESPACE}:dispose`,

  // Probe
  PROBE: `${CODEC_IPC_NAMESPACE}:probe`,

  // Decode
  DECODE_FRAME: `${CODEC_IPC_NAMESPACE}:decodeFrame`,
  DECODE_RAW: `${CODEC_IPC_NAMESPACE}:decodeRaw`,
  IS_RAW_SUPPORTED: `${CODEC_IPC_NAMESPACE}:isRawSupported`,
  DECODE_IMAGE_SEQ_FRAME: `${CODEC_IPC_NAMESPACE}:decodeImageSeqFrame`,

  // Encode
  OPEN_ENCODE_SESSION: `${CODEC_IPC_NAMESPACE}:openEncodeSession`,
  WRITE_VIDEO_FRAME: `${CODEC_IPC_NAMESPACE}:writeVideoFrame`,
  WRITE_AUDIO_SAMPLES: `${CODEC_IPC_NAMESPACE}:writeAudioSamples`,
  FINALIZE_ENCODE: `${CODEC_IPC_NAMESPACE}:finalizeEncode`,

  // Mux / Transcode
  REMUX: `${CODEC_IPC_NAMESPACE}:remux`,
  TRANSCODE: `${CODEC_IPC_NAMESPACE}:transcode`,
  TRANSCODE_PROGRESS: `${CODEC_IPC_NAMESPACE}:transcodeProgress`,

  // HW Accel
  QUERY_HW_ACCEL: `${CODEC_IPC_NAMESPACE}:queryHwAccel`,

  // Capabilities
  GET_CAPABILITIES: `${CODEC_IPC_NAMESPACE}:getCapabilities`,
  CAN_DECODE: `${CODEC_IPC_NAMESPACE}:canDecode`,
  CAN_ENCODE: `${CODEC_IPC_NAMESPACE}:canEncode`,

  // Diagnostics
  GET_VERSIONS: `${CODEC_IPC_NAMESPACE}:getVersions`,
} as const;
