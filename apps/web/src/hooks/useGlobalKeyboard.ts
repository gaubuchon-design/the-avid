// ─── Global Keyboard Dispatch ────────────────────────────────────────────────
//
// Single global keyboard handler that routes keys based on which monitor is
// active (playerStore.activeMonitor).  This replaces the separate window.keydown
// listeners that were in TimelinePanel, SourceMonitor, and RecordMonitor, which
// previously fired simultaneously regardless of active monitor.
//
// Routing rules:
//
// | Key          | Source Active           | Record/Timeline Active       |
// |--------------|------------------------|------------------------------|
// | I            | setSourceInPoint       | setInPoint (timeline)        |
// | O            | setSourceOutPoint      | setOutPoint (timeline)       |
// | Space        | playerStore play/pause | editorStore togglePlay       |
// | J/K/L        | Source shuttle          | Timeline JKL shuttle         |
// | F            | (no-op)               | Match frame                  |
// | V/B          | Always → timeline edit                                |
// | Arrows       | Always → timeline frame step                         |
// | Home/End     | Always → timeline navigation                         |
// | Del/Bksp     | Always → delete selected clips                       |
// | S/C          | Always → split / razor tool                          |
// | T/Y          | Always → trim / slip tool                            |
// | Cmd+Z/Y      | Always → undo / redo                                 |
// | Cmd+D        | Always → duplicate                                   |
// | Cmd+A        | Always → select all                                  |
// | Escape       | Always → deselect                                    |

import { useEffect } from 'react';
import { useEditorStore } from '../store/editor.store';
import { usePlayerStore } from '../store/player.store';
import { playbackEngine } from '../engine/PlaybackEngine';
import { editEngine } from '../engine/EditEngine';
import { trimEngine } from '../engine/TrimEngine';

/**
 * Source JKL shuttle state — tracks accumulator for J/L speed escalation.
 * Mirrors PlaybackEngine.jklShuttle but controls source via playerStore.
 */
let sourceShuttleJ = 0;
let sourceShuttleL = 0;

function sourceJklShuttle(key: 'j' | 'k' | 'l') {
  const { play, pause, setSpeed } = usePlayerStore.getState();

  if (key === 'k') {
    pause();
    setSpeed(1);
    sourceShuttleJ = 0;
    sourceShuttleL = 0;
    return;
  }

  if (key === 'j') {
    sourceShuttleL = 0;
    sourceShuttleJ += 1;
    setSpeed(-Math.min(sourceShuttleJ, 8));
    play();
    return;
  }

  if (key === 'l') {
    sourceShuttleJ = 0;
    sourceShuttleL += 1;
    setSpeed(Math.min(sourceShuttleL, 8));
    play();
    return;
  }
}

/**
 * Find the clip at the record monitor playhead and load it in source monitor
 * for match-frame operations.
 */
function doMatchFrame() {
  const state = useEditorStore.getState();
  const { tracks, playheadTime, bins } = state;

  // Find topmost video clip at playhead
  const videoTracks = tracks
    .filter((t) => (t.type === 'VIDEO' || t.type === 'GRAPHIC') && !t.muted)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  for (const track of videoTracks) {
    const clip = track.clips.find((c) => playheadTime >= c.startTime && playheadTime < c.endTime);
    if (clip?.assetId) {
      const sourceTime = clip.trimStart + (playheadTime - clip.startTime);
      const bin = bins.find((b) => b.assets.some((a) => a.id === clip.assetId));
      const asset = bin?.assets.find((a) => a.id === clip.assetId);
      if (asset) {
        state.setSourceAsset(asset);
        state.setSourcePlayhead(sourceTime);
        state.setInspectedClip(clip.id);
        usePlayerStore.getState().setActiveMonitor('source');
      }
      return;
    }
  }
}

/**
 * Install a single global keydown listener that dispatches based on active
 * monitor.  Call once from EditorPage.
 */
export function useGlobalKeyboard(): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore when typing in inputs / selects
      const tag = (e.target as Element)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const isMod = e.metaKey || e.ctrlKey;
      const isSource = usePlayerStore.getState().activeMonitor === 'source';

      // ── Undo / Redo (always) ──────────────────────────────────────────
      if (isMod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault(); editEngine.undo(); return;
      }
      if (isMod && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
        e.preventDefault(); editEngine.redo(); return;
      }

      const editorState = useEditorStore.getState();
      const fps = editorState.sequenceSettings?.fps || 24;
      const frameDuration = 1 / fps;

      switch (e.key) {
        // ── Mark In / Out — routed by active monitor ──────────────────
        case 'i': case 'I':
          if (isMod) break; // don't capture Cmd+I
          e.preventDefault();
          if (isSource) {
            editorState.setSourceInPoint(editorState.sourcePlayhead);
          } else {
            editorState.setInPoint(editorState.playheadTime);
          }
          break;

        case 'o': case 'O':
          if (isMod) break; // don't capture Cmd+O
          e.preventDefault();
          if (isSource) {
            editorState.setSourceOutPoint(editorState.sourcePlayhead);
          } else {
            editorState.setOutPoint(editorState.playheadTime);
          }
          break;

        // ── Play / Pause — routed by active monitor ──────────────────
        case ' ':
          e.preventDefault();
          if (isSource) {
            const ps = usePlayerStore.getState();
            if (ps.isPlaying) ps.pause(); else ps.play();
          } else {
            editorState.togglePlay();
          }
          break;

        // ── JKL Shuttle — routed by active monitor ───────────────────
        case 'j': case 'J':
          if (isMod) break;
          e.preventDefault();
          if (isSource) {
            sourceJklShuttle('j');
          } else {
            playbackEngine.jklShuttle('j');
          }
          break;

        case 'k': case 'K':
          if (isMod) break;
          e.preventDefault();
          if (isSource) {
            sourceJklShuttle('k');
          } else {
            playbackEngine.jklShuttle('k');
          }
          break;

        case 'l': case 'L':
          if (isMod) break;
          e.preventDefault();
          if (isSource) {
            sourceJklShuttle('l');
          } else {
            playbackEngine.jklShuttle('l');
          }
          break;

        // ── Match Frame (F) — loads record clip into source ──────────
        case 'f': case 'F':
          if (isMod) break;
          e.preventDefault();
          doMatchFrame();
          break;

        // ── Edit operations (always target timeline) ─────────────────
        case 'v': case 'V':
          if (!isMod) {
            e.preventDefault();
            if (editorState.sourceAsset) {
              editorState.overwriteEdit();
            } else {
              editorState.setActiveTool('select');
            }
          }
          break;

        case 'b': case 'B':
          if (!isMod) {
            e.preventDefault();
            if (editorState.sourceAsset) {
              editorState.insertEdit();
            }
          }
          break;

        // ── Delete selected clips ────────────────────────────────────
        case 'Delete': case 'Backspace':
          if (editorState.selectedClipIds.length > 0) {
            e.preventDefault();
            editorState.deleteSelectedClips();
          }
          break;

        // ── Split at playhead ────────────────────────────────────────
        case 's':
          if (!isMod && editorState.selectedClipIds.length > 0) {
            e.preventDefault();
            editorState.splitClip(editorState.selectedClipIds[0], editorState.playheadTime);
          }
          break;
        case 'c':
          if (!isMod) {
            e.preventDefault();
            if (editorState.selectedClipIds.length > 0) {
              editorState.splitClip(editorState.selectedClipIds[0], editorState.playheadTime);
            } else {
              editorState.setActiveTool('razor');
            }
          }
          break;

        // ── Tool shortcuts ───────────────────────────────────────────
        case 't': case 'T':
          if (!isMod) { e.preventDefault(); editorState.setActiveTool('trim'); }
          break;
        case 'y': case 'Y':
          if (!isMod) { e.preventDefault(); editorState.setActiveTool('slip'); }
          break;

        // ── Duplicate (Cmd/Ctrl+D) ───────────────────────────────────
        case 'd': case 'D':
          if (isMod && editorState.selectedClipIds.length > 0) {
            e.preventDefault();
            editorState.duplicateClip(editorState.selectedClipIds[0]);
          }
          break;

        // ── Frame stepping (always timeline) ─────────────────────────
        case 'ArrowLeft':
          e.preventDefault();
          editorState.setPlayhead(
            Math.max(0, editorState.playheadTime - (e.shiftKey ? 1 : frameDuration))
          );
          break;
        case 'ArrowRight':
          e.preventDefault();
          editorState.setPlayhead(
            Math.min(editorState.duration, editorState.playheadTime + (e.shiftKey ? 1 : frameDuration))
          );
          break;

        // ── Home / End — jump to timeline start / end ────────────────
        case 'Home':
          e.preventDefault();
          editorState.setPlayhead(0);
          break;
        case 'End':
          e.preventDefault();
          editorState.setPlayhead(editorState.duration);
          break;

        // ── Select all (Cmd/Ctrl+A) ─────────────────────────────────
        case 'a': case 'A':
          if (isMod) {
            e.preventDefault();
            const allClipIds = editorState.tracks.flatMap(t => t.clips.map(c => c.id));
            allClipIds.forEach((id, i) => {
              useEditorStore.getState().selectClip(id, i > 0);
            });
          }
          break;

        // ── Deselect / Cancel Trim (Escape) ─────────────────────────────
        case 'Escape':
          if (trimEngine.getState().active) {
            trimEngine.cancelTrim();
          } else {
            editorState.clearSelection();
          }
          break;

        // ── Trim Mode Keys (Avid-style) ─────────────────────────────────
        // P: Select A-side (outgoing) roller
        case 'p': case 'P':
          if (!isMod && trimEngine.getState().active) {
            e.preventDefault();
            trimEngine.selectASide();
          }
          break;

        // [ : Select B-side (incoming) roller
        case '[':
          if (!isMod && trimEngine.getState().active) {
            e.preventDefault();
            trimEngine.selectBSide();
          }
          break;

        // ] : Select both sides (Roll trim)
        case ']':
          if (!isMod && trimEngine.getState().active) {
            e.preventDefault();
            trimEngine.selectBothSides();
          }
          break;

        // , and . : Trim by one frame left/right
        case ',':
          if (!isMod && trimEngine.getState().active) {
            e.preventDefault();
            trimEngine.trimByFrames(-1, fps);
          }
          break;
        case '.':
          if (!isMod && trimEngine.getState().active) {
            e.preventDefault();
            trimEngine.trimByFrames(1, fps);
          }
          break;

        // M / / : Trim by 10 frames left/right (when in trim mode)
        case 'm': case 'M':
          if (!isMod && trimEngine.getState().active) {
            e.preventDefault();
            trimEngine.trimByFrames(-10, fps);
          }
          break;
        case '/':
          if (!isMod && trimEngine.getState().active) {
            e.preventDefault();
            trimEngine.trimByFrames(10, fps);
          }
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
