import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from 'react';
import { shallow } from 'zustand/shallow';
import { useStoreWithEqualityFn } from 'zustand/traditional';
import type {
  EditorProject,
  FrameRange,
  PlaybackStreamDescriptor,
  TimelineRenderSnapshot,
} from '@mcua/core';
import { buildPlaybackSnapshot } from '../engine/PlaybackSnapshot';
import {
  buildProjectFromEditorState,
  buildProjectPersistenceSnapshot,
} from '../lib/editorProjectState';
import { resolveRuntimeSurface } from '../lib/runtimeSurface';
import { useEditorStore } from '../store/editor.store';

export interface DesktopParityPlaybackTransportView {
  buffer: SharedArrayBuffer;
  width: number;
  height: number;
  bytesPerPixel: number;
  slots: number;
}

export interface DesktopParityPlaybackFrame {
  metadata: {
    width: number;
    height: number;
    frameNumber: number;
    timestamp: number;
    timecode: string;
  };
  pixelData: Uint8Array;
}

export interface DesktopParityMonitorRequest {
  project: EditorProject;
  snapshot: TimelineRenderSnapshot;
  streams: PlaybackStreamDescriptor[];
  streamKey: string;
  frameNumber: number;
  prerollRange: FrameRange;
  transportKey: string;
}

interface UseDesktopParityMonitorPlaybackOptions {
  consumer: 'record-monitor' | 'program-monitor';
  canvasRef: RefObject<HTMLCanvasElement>;
  canvasSize: { w: number; h: number };
  disabled?: boolean;
}

const HEADER_SIZE = 64;
const FLAG_WRITTEN = 1;
const FLAG_READ = 2;
const TIMECODE_OFFSET = 24;
const TIMECODE_MAX_LENGTH = 32;
const textDecoder = new TextDecoder();

function hashText(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function readDesktopParityFrame(
  view: DesktopParityPlaybackTransportView,
): DesktopParityPlaybackFrame | null {
  const slotSize = Math.ceil((HEADER_SIZE + (view.width * view.height * view.bytesPerPixel)) / 8) * 8;
  const int32View = new Int32Array(view.buffer);
  const uint32View = new Uint32Array(view.buffer);
  const float64View = new Float64Array(view.buffer);
  const uint8View = new Uint8Array(view.buffer);
  let selectedSlot = -1;
  let latestTimestamp = Number.NEGATIVE_INFINITY;

  for (let slot = 0; slot < view.slots; slot += 1) {
    const byteOffset = slot * slotSize;
    const flagIndex = byteOffset >> 2;
    if (Atomics.load(int32View, flagIndex) !== FLAG_WRITTEN) {
      continue;
    }

    const timestamp = float64View[(byteOffset + 16) >> 3]!;
    if (timestamp >= latestTimestamp) {
      latestTimestamp = timestamp;
      selectedSlot = slot;
    }
  }

  if (selectedSlot < 0) {
    return null;
  }

  const byteOffset = selectedSlot * slotSize;
  const flagIndex = byteOffset >> 2;
  const width = uint32View[(byteOffset + 4) >> 2]!;
  const height = uint32View[(byteOffset + 8) >> 2]!;
  const frameNumber = uint32View[(byteOffset + 12) >> 2]!;
  const timestamp = float64View[(byteOffset + 16) >> 3]!;
  const timecodeBytes = uint8View.subarray(
    byteOffset + TIMECODE_OFFSET,
    byteOffset + TIMECODE_OFFSET + TIMECODE_MAX_LENGTH,
  );
  const timecodeEnd = timecodeBytes.indexOf(0);
  const timecode = textDecoder.decode(
    timecodeBytes.subarray(0, timecodeEnd >= 0 ? timecodeEnd : timecodeBytes.length),
  );
  const pixelData = uint8View.slice(byteOffset + HEADER_SIZE, byteOffset + slotSize);
  Atomics.store(int32View, flagIndex, FLAG_READ);

  return {
    metadata: {
      width,
      height,
      frameNumber,
      timestamp,
      timecode,
    },
    pixelData,
  };
}

function updateCachedCanvas(
  sourceCanvas: HTMLCanvasElement,
  cacheRef: MutableRefObject<HTMLCanvasElement | null>,
): void {
  if (typeof document === 'undefined') {
    return;
  }

  const cachedCanvas = cacheRef.current ?? document.createElement('canvas');
  cachedCanvas.width = sourceCanvas.width;
  cachedCanvas.height = sourceCanvas.height;
  const cachedContext = cachedCanvas.getContext('2d');
  if (!cachedContext) {
    return;
  }

  cachedContext.clearRect(0, 0, cachedCanvas.width, cachedCanvas.height);
  cachedContext.drawImage(sourceCanvas, 0, 0, cachedCanvas.width, cachedCanvas.height);
  cacheRef.current = cachedCanvas;
}

function drawCachedCanvas(
  canvas: HTMLCanvasElement,
  cacheRef: MutableRefObject<HTMLCanvasElement | null>,
): boolean {
  const cachedCanvas = cacheRef.current;
  const context = canvas.getContext('2d');
  if (!cachedCanvas || !context) {
    return false;
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(cachedCanvas, 0, 0, canvas.width, canvas.height);
  return true;
}

function drawDesktopParityFrameToCanvas(
  canvas: HTMLCanvasElement,
  frame: DesktopParityPlaybackFrame,
  cacheRef: MutableRefObject<HTMLCanvasElement | null>,
): boolean {
  const context = canvas.getContext('2d');
  if (!context) {
    return false;
  }

  if (canvas.width !== frame.metadata.width) {
    canvas.width = frame.metadata.width;
  }
  if (canvas.height !== frame.metadata.height) {
    canvas.height = frame.metadata.height;
  }

  const rgba = new Uint8ClampedArray(frame.pixelData.length);
  for (let offset = 0; offset < frame.pixelData.length; offset += 4) {
    rgba[offset] = frame.pixelData[offset + 2] ?? 0;
    rgba[offset + 1] = frame.pixelData[offset + 1] ?? 0;
    rgba[offset + 2] = frame.pixelData[offset] ?? 0;
    rgba[offset + 3] = frame.pixelData[offset + 3] ?? 255;
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.putImageData(new ImageData(rgba, frame.metadata.width, frame.metadata.height), 0, 0);
  updateCachedCanvas(canvas, cacheRef);
  return true;
}

function collectActiveAudioStreams(
  state: ReturnType<typeof useEditorStore.getState>,
): PlaybackStreamDescriptor[] {
  const activeAudioAssetIds = new Set<string>();
  for (const track of state.tracks) {
    if (track.type !== 'AUDIO' || track.muted) {
      continue;
    }

    const activeClip = track.clips.find((clip) => {
      return state.playheadTime >= clip.startTime && state.playheadTime < clip.endTime;
    });
    if (activeClip?.assetId) {
      activeAudioAssetIds.add(activeClip.assetId);
    }
  }

  return Array.from(activeAudioAssetIds).map((assetId, index) => ({
    streamId: `program-audio-${index}`,
    assetId,
    mediaType: 'audio' as const,
    role: 'program' as const,
  }));
}

export function createDesktopParityMonitorRequest(
  state: ReturnType<typeof useEditorStore.getState>,
  consumer: 'record-monitor' | 'program-monitor',
  outputSize: { width: number; height: number },
): DesktopParityMonitorRequest | null {
  const persistenceSnapshot = buildProjectPersistenceSnapshot(state);
  if (!persistenceSnapshot) {
    return null;
  }

  const project = buildProjectFromEditorState(persistenceSnapshot);
  const playbackSnapshot = buildPlaybackSnapshot({
    tracks: state.tracks,
    subtitleTracks: state.subtitleTracks,
    titleClips: state.titleClips,
    playheadTime: state.playheadTime,
    duration: state.duration,
    isPlaying: state.isPlaying,
    showSafeZones: state.showSafeZones,
    activeMonitor: 'record',
    activeScope: null,
    sequenceSettings: state.sequenceSettings,
    projectSettings: state.projectSettings,
  }, consumer);

  const videoStreams: PlaybackStreamDescriptor[] = Array.from(
    new Set(
      playbackSnapshot.videoLayers
        .map((layer) => layer.assetId)
        .filter((assetId): assetId is string => Boolean(assetId)),
    ),
  ).map((assetId, index) => ({
    streamId: `program-video-${index}`,
    assetId,
    mediaType: 'video' as const,
    role: 'program' as const,
  }));

  const audioStreams = collectActiveAudioStreams(state);
  const streams = [...videoStreams, ...audioStreams];
  const fps = state.sequenceSettings.fps || state.projectSettings.frameRate || 24;
  const revisionHash = hashText([
    consumer,
    playbackSnapshot.sequenceRevision,
    outputSize.width,
    outputSize.height,
  ].join(':'));
  const frameNumber = playbackSnapshot.frameNumber;
  const prerollSpan = state.isPlaying ? Math.max(6, Math.round(fps / 2)) : 2;
  const videoTrackCount = project.tracks.filter((track) => track.type === 'VIDEO' || track.type === 'GRAPHIC').length;
  const audioTrackCount = project.tracks.filter((track) => track.type === 'AUDIO').length;

  return {
    project,
    snapshot: {
      projectId: project.id,
      sequenceId: `${project.id}-${consumer}`,
      revisionId: `${consumer}-${revisionHash}`,
      fps,
      sampleRate: state.sequenceSettings.sampleRate || project.settings.sampleRate,
      durationSeconds: Math.max(state.duration, 0),
      videoLayerCount: Math.max(videoTrackCount, 1),
      audioTrackCount,
      output: {
        width: outputSize.width,
        height: outputSize.height,
        colorSpace: state.sequenceSettings.colorSpace,
      },
    },
    streams,
    streamKey: streams
      .map((stream) => [stream.mediaType, stream.role, stream.assetId, stream.streamId].join(':'))
      .join('|'),
    frameNumber,
    prerollRange: {
      startFrame: Math.max(0, frameNumber - 2),
      endFrame: frameNumber + prerollSpan,
    },
    transportKey: [
      project.id,
      consumer,
      `${outputSize.width}x${outputSize.height}`,
      revisionHash,
    ].join(':'),
  };
}

export function useDesktopParityMonitorPlayback(
  options: UseDesktopParityMonitorPlaybackOptions,
): boolean {
  const requestState = useStoreWithEqualityFn(useEditorStore, (state) => ({
    projectId: state.projectId,
    projectName: state.projectName,
    projectTemplate: state.projectTemplate,
    projectDescription: state.projectDescription,
    projectTags: state.projectTags,
    projectSchemaVersion: state.projectSchemaVersion,
    projectCreatedAt: state.projectCreatedAt,
    projectSettings: state.projectSettings,
    sequenceSettings: state.sequenceSettings,
    tracks: state.tracks,
    markers: state.markers,
    bins: state.bins,
    transcript: state.transcript,
    reviewComments: state.reviewComments,
    approvals: state.approvals,
    publishJobs: state.publishJobs,
    watchFolders: state.watchFolders,
    subtitleTracks: state.subtitleTracks,
    titleClips: state.titleClips,
    trackHeights: state.trackHeights,
    activeWorkspaceId: state.activeWorkspaceId,
    composerLayout: state.composerLayout,
    showTrackingInfo: state.showTrackingInfo,
    trackingInfoFields: state.trackingInfoFields,
    clipTextDisplay: state.clipTextDisplay,
    dupeDetectionEnabled: state.dupeDetectionEnabled,
    versionHistoryRetentionPreference: state.versionHistoryRetentionPreference,
    versionHistoryCompareMode: state.versionHistoryCompareMode,
    sourceAsset: state.sourceAsset,
    selectedBinId: state.selectedBinId,
    enabledTrackIds: state.enabledTrackIds,
    syncLockedTrackIds: state.syncLockedTrackIds,
    videoMonitorTrackId: state.videoMonitorTrackId,
    playheadTime: state.playheadTime,
    duration: state.duration,
    isPlaying: state.isPlaying,
    showSafeZones: state.showSafeZones,
  }), shallow);
  const desktopParityAvailable = resolveRuntimeSurface() === 'desktop'
    && Boolean(window.electronAPI?.parityPlayback);
  const cachedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const configuredTransportRef = useRef<{
    handle: string;
    transportKey: string;
    streamKey: string;
  } | null>(null);
  const continuousPlaybackRef = useRef<{
    handle: string;
    running: boolean;
    requestedFrame: number;
    streamKey: string;
    transportKey: string;
  } | null>(null);
  const [transportState, setTransportState] = useState<{
    handle: string;
    view: DesktopParityPlaybackTransportView;
    key: string;
  } | null>(null);
  const [bridgeFailed, setBridgeFailed] = useState(false);

  const request = useMemo(() => {
    if (!desktopParityAvailable || options.disabled) {
      return null;
    }
    return createDesktopParityMonitorRequest(useEditorStore.getState(), options.consumer, {
      width: Math.max(1, Math.round(options.canvasSize.w)),
      height: Math.max(1, Math.round(options.canvasSize.h)),
    });
  }, [desktopParityAvailable, options.canvasSize.h, options.canvasSize.w, options.consumer, options.disabled, requestState]);

  useEffect(() => {
    if (!desktopParityAvailable || options.disabled || !request || !window.electronAPI?.parityPlayback) {
      configuredTransportRef.current = null;
      continuousPlaybackRef.current = null;
      setTransportState(null);
      useEditorStore.getState().clearDesktopMonitorAudioPreview(options.consumer);
      return;
    }

    let cancelled = false;
    let ownedHandle: string | null = null;

    const createTransport = async () => {
      try {
        setBridgeFailed(false);
        const descriptor = await window.electronAPI!.parityPlayback!.createTransport({
          project: request.project,
          snapshot: request.snapshot,
          sequenceId: request.snapshot.sequenceId,
          revisionId: request.snapshot.revisionId,
        });
        ownedHandle = descriptor.transportHandle;
        if (cancelled) {
          await window.electronAPI!.parityPlayback!.releaseTransport(descriptor.transportHandle);
          return;
        }
        setTransportState({
          handle: descriptor.transportHandle,
          view: descriptor.view,
          key: request.transportKey,
        });
      } catch {
        if (!cancelled) {
          setBridgeFailed(true);
          setTransportState(null);
          useEditorStore.getState().clearDesktopMonitorAudioPreview(options.consumer);
        }
      }
    };

    void createTransport();

    return () => {
      cancelled = true;
      if (configuredTransportRef.current?.handle === ownedHandle) {
        configuredTransportRef.current = null;
      }
      if (continuousPlaybackRef.current?.handle === ownedHandle) {
        continuousPlaybackRef.current = null;
      }
      if (ownedHandle && window.electronAPI?.parityPlayback) {
        void window.electronAPI.parityPlayback.releaseTransport(ownedHandle);
      }
      useEditorStore.getState().clearDesktopMonitorAudioPreview(options.consumer);
      setTransportState((current) => (
        current?.handle === ownedHandle ? null : current
      ));
    };
  }, [desktopParityAvailable, options.consumer, options.disabled, request?.transportKey]);

  useEffect(() => {
    if (!desktopParityAvailable || !request || !transportState || transportState.key !== request.transportKey || !window.electronAPI?.parityPlayback) {
      return;
    }

    let cancelled = false;

    const ensureTransportConfigured = async () => {
      const configuredTransport = configuredTransportRef.current;
      if (
        configuredTransport
        && configuredTransport.handle === transportState.handle
        && configuredTransport.transportKey === request.transportKey
        && configuredTransport.streamKey === request.streamKey
      ) {
        return true;
      }

      await window.electronAPI!.parityPlayback!.syncProject(request.project);
      await window.electronAPI!.parityPlayback!.attachStreams(transportState.handle, request.streams);
      if (cancelled) {
        return false;
      }

      configuredTransportRef.current = {
        handle: transportState.handle,
        transportKey: request.transportKey,
        streamKey: request.streamKey,
      };
      return true;
    };

    const syncAudioMonitorPreview = async () => {
      const preview = await window.electronAPI!.parityPlayback!.getAudioMonitorPreview(transportState.handle);
      if (cancelled) {
        return;
      }

      if (preview) {
        useEditorStore.getState().setDesktopMonitorAudioPreview(options.consumer, preview);
        return;
      }

      useEditorStore.getState().clearDesktopMonitorAudioPreview(options.consumer);
    };

    const renderDesktopFrame = async () => {
      const canvas = options.canvasRef.current;
      if (!canvas) {
        return;
      }

      try {
        setBridgeFailed(false);
        const transportReady = await ensureTransportConfigured();
        if (!transportReady || cancelled) {
          return;
        }

        if (requestState.isPlaying) {
          const activeLoop = continuousPlaybackRef.current;
          const shouldStartLoop = !activeLoop
            || activeLoop.handle !== transportState.handle
            || !activeLoop.running
            || activeLoop.transportKey !== request.transportKey
            || activeLoop.streamKey !== request.streamKey;
          const shouldResyncLoop = !shouldStartLoop
            && Math.abs(activeLoop.requestedFrame - request.frameNumber) > Math.max(
              12,
              Math.round((request.snapshot.fps || 24) / 2),
            );

          if (shouldStartLoop) {
            await window.electronAPI!.parityPlayback!.preroll(transportState.handle, request.prerollRange);
            await window.electronAPI!.parityPlayback!.play(transportState.handle, request.frameNumber);
            continuousPlaybackRef.current = {
              handle: transportState.handle,
              running: true,
              requestedFrame: request.frameNumber,
              streamKey: request.streamKey,
              transportKey: request.transportKey,
            };
            await syncAudioMonitorPreview();
          } else if (shouldResyncLoop) {
            await window.electronAPI!.parityPlayback!.syncFrame(transportState.handle, request.frameNumber);
            continuousPlaybackRef.current = {
              handle: transportState.handle,
              running: true,
              requestedFrame: request.frameNumber,
              streamKey: request.streamKey,
              transportKey: request.transportKey,
            };
            await syncAudioMonitorPreview();
          }
          return;
        }

        if (continuousPlaybackRef.current?.handle === transportState.handle && continuousPlaybackRef.current.running) {
          await window.electronAPI!.parityPlayback!.stop(transportState.handle);
        }
        await window.electronAPI!.parityPlayback!.preroll(transportState.handle, request.prerollRange);
        continuousPlaybackRef.current = {
          handle: transportState.handle,
          running: false,
          requestedFrame: request.frameNumber,
          streamKey: request.streamKey,
          transportKey: request.transportKey,
        };
        await window.electronAPI!.parityPlayback!.start(transportState.handle, request.frameNumber);
        if (cancelled) {
          return;
        }
        await syncAudioMonitorPreview();

        const frame = readDesktopParityFrame(transportState.view);
        if (!frame) {
          drawCachedCanvas(canvas, cachedCanvasRef);
          return;
        }

        drawDesktopParityFrameToCanvas(canvas, frame, cachedCanvasRef);
      } catch {
        if (!cancelled) {
          setBridgeFailed(true);
          useEditorStore.getState().clearDesktopMonitorAudioPreview(options.consumer);
        }
      }
    };

    void renderDesktopFrame();

    return () => {
      cancelled = true;
    };
  }, [
    desktopParityAvailable,
    options.canvasRef,
    options.consumer,
    requestState.isPlaying,
    request,
    request?.frameNumber,
    request?.prerollRange.endFrame,
    request?.prerollRange.startFrame,
    request?.streamKey,
    request?.transportKey,
    transportState,
  ]);

  useEffect(() => {
    if (!desktopParityAvailable || !transportState) {
      return;
    }

    let cancelled = false;
    let rafHandle: number | null = null;

    const drawLatestFrame = () => {
      if (cancelled) {
        return;
      }

      const canvas = options.canvasRef.current;
      if (!canvas) {
        rafHandle = requestAnimationFrame(drawLatestFrame);
        return;
      }

      const frame = readDesktopParityFrame(transportState.view);
      if (frame) {
        drawDesktopParityFrameToCanvas(canvas, frame, cachedCanvasRef);
      } else if (!requestState.isPlaying) {
        drawCachedCanvas(canvas, cachedCanvasRef);
      }

      rafHandle = requestAnimationFrame(drawLatestFrame);
    };

    rafHandle = requestAnimationFrame(drawLatestFrame);
    return () => {
      cancelled = true;
      if (rafHandle !== null) {
        cancelAnimationFrame(rafHandle);
      }
    };
  }, [desktopParityAvailable, options.canvasRef, requestState.isPlaying, transportState]);

  return desktopParityAvailable && !options.disabled && !bridgeFailed && Boolean(request);
}
