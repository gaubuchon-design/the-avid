import { useEffect, useRef } from 'react';
import { useEditorStore } from '../store/editor.store';
import { usePlayerStore } from '../store/player.store';

export function useTrimLoopPlayback(): void {
  const trimActive = useEditorStore((s) => s.trimActive);
  const trimLoopPlaybackActive = useEditorStore((s) => s.trimLoopPlaybackActive);
  const trimLoopPlaybackDirection = useEditorStore((s) => s.trimLoopPlaybackDirection);
  const trimLoopPlaybackRate = useEditorStore((s) => s.trimLoopPlaybackRate);
  const trimLoopPreRollFrames = useEditorStore((s) => s.trimLoopPreRollFrames);
  const trimLoopPostRollFrames = useEditorStore((s) => s.trimLoopPostRollFrames);
  const fps = useEditorStore((s) => s.sequenceSettings.fps || s.projectSettings.frameRate || 24);
  const setTrimLoopOffsetFrames = useEditorStore((s) => s.setTrimLoopOffsetFrames);
  const setTrimLoopPlaybackActive = useEditorStore((s) => s.setTrimLoopPlaybackActive);
  const previousPlaybackActiveRef = useRef(false);

  useEffect(() => {
    const wasPlaybackActive = previousPlaybackActiveRef.current;
    previousPlaybackActiveRef.current = trimLoopPlaybackActive;

    if (!trimActive) {
      setTrimLoopOffsetFrames(0);
      if (trimLoopPlaybackActive) {
        setTrimLoopPlaybackActive(false);
      }
      return;
    }

    if (!trimLoopPlaybackActive) {
      setTrimLoopOffsetFrames(0);
      return;
    }

    const editorState = useEditorStore.getState();
    if (editorState.isPlaying) {
      editorState.togglePlay();
    }
    usePlayerStore.getState().pause();

    let frameHandle = 0;
    let lastTimestamp = 0;
    let lastFrame = Number.NaN;
    const minOffset = -trimLoopPreRollFrames;
    const maxOffset = trimLoopPostRollFrames;
    const frameSpan = Math.max(1, maxOffset - minOffset + 1);
    const currentOffset = useEditorStore.getState().trimLoopOffsetFrames;
    let currentFrame = wasPlaybackActive && Number.isFinite(currentOffset)
      ? currentOffset
      : (trimLoopPlaybackDirection < 0 ? maxOffset : minOffset);

    if (!wasPlaybackActive) {
      setTrimLoopOffsetFrames(Math.round(currentFrame));
      lastFrame = Math.round(currentFrame);
    }

    const tick = (timestamp: number) => {
      if (lastTimestamp === 0) {
        lastTimestamp = timestamp;
      }

      const deltaSeconds = Math.max(0, timestamp - lastTimestamp) / 1000;
      lastTimestamp = timestamp;

      currentFrame += deltaSeconds
        * Math.max(fps, 1)
        * trimLoopPlaybackRate
        * trimLoopPlaybackDirection;

      const wrappedFrame = (((currentFrame - minOffset) % frameSpan) + frameSpan) % frameSpan;
      const nextFrame = minOffset + wrappedFrame;
      currentFrame = nextFrame;
      const roundedFrame = Math.round(nextFrame);

      if (roundedFrame !== lastFrame) {
        lastFrame = roundedFrame;
        setTrimLoopOffsetFrames(roundedFrame);
      }

      frameHandle = requestAnimationFrame(tick);
    };

    frameHandle = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameHandle);
      setTrimLoopOffsetFrames(0);
    };
  }, [
    fps,
    setTrimLoopOffsetFrames,
    setTrimLoopPlaybackActive,
    trimActive,
    trimLoopPlaybackActive,
    trimLoopPlaybackDirection,
    trimLoopPlaybackRate,
    trimLoopPostRollFrames,
    trimLoopPreRollFrames,
  ]);
}
