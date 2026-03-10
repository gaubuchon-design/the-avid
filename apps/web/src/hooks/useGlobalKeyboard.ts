import { useEffect } from 'react';
import { keyboardEngine } from '../engine/KeyboardEngine';
import { trimEngine } from '../engine/TrimEngine';
import { matchFrameAtPlayhead } from '../lib/editorMonitorActions';
import { suspendKeyboardProviderDispatch } from '../lib/keyboardProviderGate';
import { useEditorStore } from '../store/editor.store';
import { usePlayerStore } from '../store/player.store';

function isTextInputTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  const tag = element?.tagName?.toLowerCase();

  return Boolean(
    tag === 'input'
      || tag === 'textarea'
      || tag === 'select'
      || element?.isContentEditable,
  );
}

export function handleEditorKeyboardEvent(event: KeyboardEvent): boolean {
  if (isTextInputTarget(event.target)) {
    return false;
  }

  const key = event.key;
  const isMod = event.metaKey || event.ctrlKey;
  const editorState = useEditorStore.getState();
  const activeMonitor = usePlayerStore.getState().activeMonitor;
  const fps = editorState.sequenceSettings?.fps || 24;
  const frameDuration = 1 / fps;

  switch (key) {
    case 'f':
    case 'F':
      if (!isMod && !event.shiftKey) {
        event.preventDefault();
        if (usePlayerStore.getState().activeMonitor !== 'source') {
          matchFrameAtPlayhead();
        }
        return true;
      }
      break;

    case 'ArrowLeft':
      event.preventDefault();
      if (activeMonitor === 'source') {
        editorState.setSourcePlayhead(
          Math.max(0, editorState.sourcePlayhead - (event.shiftKey ? 1 : frameDuration)),
        );
      } else {
        editorState.setPlayhead(
          Math.max(0, editorState.playheadTime - (event.shiftKey ? 1 : frameDuration)),
        );
      }
      return true;

    case 'ArrowRight':
      event.preventDefault();
      if (activeMonitor === 'source') {
        const sourceDuration = editorState.sourceAsset?.duration ?? Number.POSITIVE_INFINITY;
        editorState.setSourcePlayhead(
          Math.min(sourceDuration, editorState.sourcePlayhead + (event.shiftKey ? 1 : frameDuration)),
        );
      } else {
        editorState.setPlayhead(
          Math.min(editorState.duration, editorState.playheadTime + (event.shiftKey ? 1 : frameDuration)),
        );
      }
      return true;

    case 'Home':
      event.preventDefault();
      if (activeMonitor === 'source') {
        editorState.setSourcePlayhead(0);
      } else {
        editorState.setPlayhead(0);
      }
      return true;

    case 'End':
      event.preventDefault();
      if (activeMonitor === 'source') {
        editorState.setSourcePlayhead(editorState.sourceAsset?.duration ?? 0);
      } else {
        editorState.setPlayhead(editorState.duration);
      }
      return true;

    case 'a':
    case 'A':
      if (isMod) {
        event.preventDefault();
        const allClipIds = editorState.tracks.flatMap((track) => track.clips.map((clip) => clip.id));
        allClipIds.forEach((id, index) => {
          useEditorStore.getState().selectClip(id, index > 0);
        });
        return true;
      }
      break;

    case 'd':
    case 'D':
      if (isMod && editorState.selectedClipIds.length > 0) {
        event.preventDefault();
        editorState.duplicateClip(editorState.selectedClipIds[0]!);
        return true;
      }
      break;

    case 'c':
      if (!isMod && !event.shiftKey) {
        event.preventDefault();
        if (editorState.selectedClipIds.length > 0) {
          editorState.splitClip(editorState.selectedClipIds[0]!, editorState.playheadTime);
        } else {
          editorState.setActiveTool('razor');
        }
        return true;
      }
      break;

    case 'y':
    case 'Y':
      if (!isMod && !event.shiftKey) {
        event.preventDefault();
        editorState.setActiveTool('slip');
        return true;
      }
      break;

    case 'Escape':
      event.preventDefault();
      if (trimEngine.getState().active) {
        trimEngine.cancelTrim();
      } else {
        editorState.clearSelection();
      }
      return true;
  }

  if (keyboardEngine.handleKeyDown(event)) {
    event.preventDefault();
    return true;
  }

  return false;
}

export function useGlobalKeyboard(): void {
  useEffect(() => {
    const resumeKeyboardProviderDispatch = suspendKeyboardProviderDispatch();

    const handleKeyDown = (event: KeyboardEvent) => {
      handleEditorKeyboardEvent(event);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      keyboardEngine.handleKeyUp(event);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      resumeKeyboardProviderDispatch();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);
}
