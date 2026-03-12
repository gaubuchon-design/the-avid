import { describe, it, expect, beforeEach } from 'vitest';
import {
  useEditorStore,
  DEFAULT_INTRINSIC_VIDEO,
  DEFAULT_INTRINSIC_AUDIO,
  DEFAULT_TIME_REMAP,
  makeClip,
} from '../../store/editor.store';

// Capture the initial state once at module load (before any test mutates it).
const initialState = useEditorStore.getState();

function seedEditorialFixture() {
  const bins = [
    {
      id: 'b-master',
      name: 'Master',
      color: '#5b6af5',
      isOpen: true,
      children: [],
      assets: [
        {
          id: 'asset-video-long',
          name: 'Dialogue Long Take',
          type: 'VIDEO' as const,
          duration: 45,
          status: 'READY' as const,
          tags: ['dialogue', 'interview'],
          isFavorite: true,
        },
        {
          id: 'asset-video-short',
          name: 'B-Roll',
          type: 'VIDEO' as const,
          duration: 12,
          status: 'READY' as const,
          tags: ['broll'],
          isFavorite: false,
        },
        {
          id: 'asset-audio',
          name: 'Room Tone',
          type: 'AUDIO' as const,
          duration: 60,
          status: 'READY' as const,
          tags: ['dialogue', 'audio'],
          isFavorite: false,
        },
      ],
    },
  ];

  useEditorStore.setState({
    duration: 40,
    tracks: [
      {
        id: 't-v1',
        name: 'V1',
        type: 'VIDEO',
        sortOrder: 0,
        muted: false,
        locked: false,
        solo: false,
        volume: 1,
        color: '#5b6af5',
        clips: [
          makeClip({
            id: 'c1',
            trackId: 't-v1',
            name: 'Clip One',
            startTime: 0,
            endTime: 10,
            trimStart: 0,
            trimEnd: 0,
            type: 'video',
          }),
          makeClip({
            id: 'c2',
            trackId: 't-v1',
            name: 'Clip Two',
            startTime: 15,
            endTime: 25,
            trimStart: 0,
            trimEnd: 0,
            type: 'video',
          }),
        ],
      },
      {
        id: 't-v2',
        name: 'V2',
        type: 'VIDEO',
        sortOrder: 1,
        muted: false,
        locked: false,
        solo: false,
        volume: 1,
        color: '#818cf8',
        clips: [
          makeClip({
            id: 'c3',
            trackId: 't-v2',
            name: 'Overlay',
            startTime: 5,
            endTime: 12,
            trimStart: 0,
            trimEnd: 0,
            type: 'video',
          }),
        ],
      },
      {
        id: 't-a1',
        name: 'A1',
        type: 'AUDIO',
        sortOrder: 2,
        muted: false,
        locked: false,
        solo: false,
        volume: 0.85,
        color: '#e05b8e',
        clips: [],
      },
    ],
    bins,
    selectedBinId: 'b-master',
    activeBinAssets: bins[0]!.assets,
    smartBins: [
      { id: 'sb1', name: 'All Video', color: '#5bbfc7', rules: [{ field: 'type', operator: 'equals', value: 'VIDEO' }], matchAll: true },
      { id: 'sb2', name: 'Favorites', color: '#f59e0b', rules: [{ field: 'favorite', operator: 'is', value: 'true' }], matchAll: true },
      { id: 'sb3', name: 'Long Takes', color: '#22c55e', rules: [{ field: 'duration', operator: 'greaterThan', value: '30' }], matchAll: true },
      { id: 'sb4', name: 'Dialogue Clips', color: '#ec4899', rules: [{ field: 'tag', operator: 'contains', value: 'dialogue' }], matchAll: true },
      { id: 'sb5', name: 'Ready Media', color: '#94a3b8', rules: [{ field: 'status', operator: 'equals', value: 'READY' }], matchAll: true },
    ],
  });
}

describe('useEditorStore', () => {
  beforeEach(() => {
    // Reset store to initial state before every test.
    // Zustand v4's create() exposes getInitialState() but since this store
    // uses immer middleware we reset via setState with a captured snapshot.
    useEditorStore.setState(initialState, true);
    seedEditorialFixture();
  });

  // ── Baseline ──────────────────────────────────────────────────────────

  it('should have initial state', () => {
    const state = useEditorStore.getState();
    expect(state.tracks.length).toBeGreaterThan(0);
    expect(state.playheadTime).toBe(0);
    expect(state.isPlaying).toBe(false);
    expect(state.zoom).toBe(60);
    expect(state.duration).toBe(40);
  });

  // ── Playhead ──────────────────────────────────────────────────────────

  it('should set playhead', () => {
    useEditorStore.getState().setPlayhead(10);
    expect(useEditorStore.getState().playheadTime).toBe(10);
  });

  it('should clamp playhead to zero', () => {
    useEditorStore.getState().setPlayhead(-5);
    expect(useEditorStore.getState().playheadTime).toBe(0);
  });

  it('should clamp playhead to duration', () => {
    const { duration } = useEditorStore.getState();
    useEditorStore.getState().setPlayhead(duration + 100);
    expect(useEditorStore.getState().playheadTime).toBe(duration);
  });

  // ── Play ──────────────────────────────────────────────────────────────

  it('should toggle play', () => {
    useEditorStore.getState().togglePlay();
    expect(useEditorStore.getState().isPlaying).toBe(true);
    useEditorStore.getState().togglePlay();
    expect(useEditorStore.getState().isPlaying).toBe(false);
  });

  // ── Zoom ──────────────────────────────────────────────────────────────

  it('should set zoom with bounds', () => {
    useEditorStore.getState().setZoom(5);
    expect(useEditorStore.getState().zoom).toBe(10); // min is 10

    useEditorStore.getState().setZoom(500);
    expect(useEditorStore.getState().zoom).toBe(300); // max is 300

    useEditorStore.getState().setZoom(100);
    expect(useEditorStore.getState().zoom).toBe(100);
  });

  // ── Selection ─────────────────────────────────────────────────────────

  it('should select and deselect clips', () => {
    useEditorStore.getState().selectClip('c1');
    expect(useEditorStore.getState().selectedClipIds).toEqual(['c1']);

    useEditorStore.getState().selectClip('c2', true); // multi-select
    expect(useEditorStore.getState().selectedClipIds).toEqual(['c1', 'c2']);

    useEditorStore.getState().clearSelection();
    expect(useEditorStore.getState().selectedClipIds).toEqual([]);
  });

  it('should toggle a clip off on multi-select if already selected', () => {
    useEditorStore.getState().selectClip('c1');
    useEditorStore.getState().selectClip('c2', true);
    useEditorStore.getState().selectClip('c1', true); // toggle off
    expect(useEditorStore.getState().selectedClipIds).toEqual(['c2']);
  });

  // ── Add / Remove Clips ────────────────────────────────────────────────

  it('should add and remove clips', () => {
    // Use the first track ID from current demo data (t-v3)
    const trackId = useEditorStore.getState().tracks[0]!.id;
    const initialClipCount = useEditorStore.getState().tracks[0]!.clips.length;
    useEditorStore.getState().addClip({
      id: 'test-clip',
      trackId,
      name: 'Test',
      startTime: 50,
      endTime: 55,
      trimStart: 0,
      trimEnd: 0,
      type: 'video',
      intrinsicVideo: DEFAULT_INTRINSIC_VIDEO,
      intrinsicAudio: DEFAULT_INTRINSIC_AUDIO,
      timeRemap: DEFAULT_TIME_REMAP,
    });
    expect(useEditorStore.getState().tracks[0]!.clips.length).toBe(initialClipCount + 1);

    useEditorStore.getState().removeClip('test-clip');
    expect(useEditorStore.getState().tracks[0]!.clips.length).toBe(initialClipCount);
  });

  // ── Split Clip ────────────────────────────────────────────────────────

  it('should split clip', () => {
    const track = useEditorStore.getState().tracks[0];
    const clip = track!.clips[0]!;
    const splitTime = (clip.startTime! + clip.endTime!) / 2;

    useEditorStore.getState().splitClip(clip.id!, splitTime);

    const updatedTrack = useEditorStore.getState().tracks[0];
    expect(updatedTrack!.clips.length!).toBe(track!.clips.length! + 1);

    const originalClip = updatedTrack!.clips.find(c => c.id === clip.id!)!;
    expect(originalClip?.endTime).toBe(splitTime);

    // The new clip should start at the split time
    const newClip = updatedTrack!.clips.find(c => c.id !== clip.id! && c.startTime === splitTime)!;
    expect(newClip).toBeDefined();
  });

  it('should not split if time is outside clip bounds', () => {
    const track = useEditorStore.getState().tracks[0];
    const clip = track!.clips[0]!;
    const clipCount = track!.clips.length!;

    // Split at a time before clip start
    useEditorStore.getState().splitClip(clip.id!, clip.startTime! - 1);
    expect(useEditorStore.getState().tracks[0]!.clips.length).toBe(clipCount);

    // Split at a time after clip end
    useEditorStore.getState().splitClip(clip.id!, clip.endTime! + 1);
    expect(useEditorStore.getState().tracks[0]!.clips.length).toBe(clipCount);
  });

  // ── Track mute/solo/lock ──────────────────────────────────────────────

  it('should toggle track mute/solo/lock', () => {
    const trackId = useEditorStore.getState().tracks[0]!.id;
    const track = useEditorStore.getState().tracks[0];

    useEditorStore.getState().toggleMute(trackId);
    expect(useEditorStore.getState().tracks.find(t => t.id === trackId)?.muted).toBe(!track!.muted!);

    useEditorStore.getState().toggleSolo(trackId);
    expect(useEditorStore.getState().tracks.find(t => t.id === trackId)?.solo).toBe(!track!.solo!);

    useEditorStore.getState().toggleLock(trackId);
    expect(useEditorStore.getState().tracks.find(t => t.id === trackId)?.locked).toBe(!track!.locked!);
  });

  it('should toggle track properties back off', () => {
    const trackId = useEditorStore.getState().tracks[0]!.id;
    // V3 starts with locked: true, so first toggle unlocks it
    const initialMuted = useEditorStore.getState().tracks.find(t => t.id === trackId)?.muted;
    useEditorStore.getState().toggleMute(trackId);
    useEditorStore.getState().toggleMute(trackId);
    expect(useEditorStore.getState().tracks.find(t => t.id === trackId)?.muted).toBe(initialMuted);
  });

  // ── Move Clip ─────────────────────────────────────────────────────────

  it('should move clip between tracks', () => {
    const srcTrack = useEditorStore.getState().tracks[0];
    const dstTrack = useEditorStore.getState().tracks[1];
    const clipId = srcTrack!.clips[0]!.id!;

    useEditorStore.getState().moveClip(clipId, dstTrack!.id!, 20);

    const srcClips = useEditorStore.getState().tracks.find(t => t.id === srcTrack!.id!)?.clips || [];
    const dstClips = useEditorStore.getState().tracks.find(t => t.id === dstTrack!.id!)?.clips || [];

    expect(srcClips.find(c => c.id === clipId)).toBeUndefined();
    expect(dstClips.find(c => c.id === clipId)).toBeDefined();
    expect(dstClips.find(c => c.id === clipId)?.startTime).toBe(20);
  });

  it('should preserve clip duration when moving', () => {
    const srcTrack = useEditorStore.getState().tracks[0];
    const dstTrack = useEditorStore.getState().tracks[1];
    const clip = srcTrack!.clips[0]!;
    const originalDuration = clip.endTime! - clip.startTime!;

    useEditorStore.getState().moveClip(clip.id!, dstTrack!.id!, 15);

    const movedClip = useEditorStore.getState().tracks.find(t => t.id === dstTrack!.id!)?.clips.find(c => c.id === clip.id!);
    expect(movedClip).toBeDefined();
    expect(movedClip!.endTime - movedClip!.startTime).toBeCloseTo(originalDuration);
  });

  // ── Trim Clip ─────────────────────────────────────────────────────────

  it('should trim clip left edge', () => {
    const clip = useEditorStore.getState().tracks[0]!.clips[0];
    const trimTime = clip!.startTime! + 1;
    useEditorStore.getState().trimClip(clip!.id!, 'left', trimTime);
    const updated = useEditorStore.getState().tracks[0]!.clips.find(c => c.id === clip!.id!);
    expect(updated?.startTime).toBe(trimTime);
  });

  it('should trim clip right edge', () => {
    const clip = useEditorStore.getState().tracks[0]!.clips[0];
    const trimTime = clip!.endTime! - 1;
    useEditorStore.getState().trimClip(clip!.id!, 'right', trimTime);
    const updated = useEditorStore.getState().tracks[0]!.clips.find(c => c.id === clip!.id!);
    expect(updated?.endTime).toBe(trimTime);
  });

  // ── Track volume ──────────────────────────────────────────────────────

  it('should set track volume', () => {
    const trackId = useEditorStore.getState().tracks[0]!.id;
    useEditorStore.getState().setTrackVolume(trackId, 0.5);
    expect(useEditorStore.getState().tracks.find(t => t.id === trackId)?.volume).toBe(0.5);
  });

  // ── ScrollLeft ────────────────────────────────────────────────────────

  it('should set scroll left, clamped to 0', () => {
    useEditorStore.getState().setScrollLeft(100);
    expect(useEditorStore.getState().scrollLeft).toBe(100);

    useEditorStore.getState().setScrollLeft(-10);
    expect(useEditorStore.getState().scrollLeft).toBe(0);
  });

  // ── UI toggles ────────────────────────────────────────────────────────

  it('should set active panel', () => {
    useEditorStore.getState().setActivePanel('color');
    expect(useEditorStore.getState().activePanel).toBe('color');
  });

  it('should set inspector tab', () => {
    useEditorStore.getState().setInspectorTab('audio');
    expect(useEditorStore.getState().activeInspectorTab).toBe('audio');
  });

  // ── Inspector toggle ────────────────────────────────────────────────

  it('should toggle inspector visibility', () => {
    expect(useEditorStore.getState().showInspector).toBe(true);
    useEditorStore.getState().toggleInspector();
    expect(useEditorStore.getState().showInspector).toBe(false);
    useEditorStore.getState().toggleInspector();
    expect(useEditorStore.getState().showInspector).toBe(true);
  });

  // ── Toolbar tab ─────────────────────────────────────────────────────

  it('should set toolbar tab (media/effects)', () => {
    expect(useEditorStore.getState().toolbarTab).toBe('media');
    useEditorStore.getState().setToolbarTab('effects');
    expect(useEditorStore.getState().toolbarTab).toBe('effects');
  });

  // ── Timeline view mode ──────────────────────────────────────────────

  it('should set timeline view mode', () => {
    expect(useEditorStore.getState().timelineViewMode).toBe('timeline');
    useEditorStore.getState().setTimelineViewMode('waveform');
    expect(useEditorStore.getState().timelineViewMode).toBe('waveform');
  });

  // ── Clip groups ───────────────────────────────────────────────────────

  it('should set and remove clip groups', () => {
    useEditorStore.getState().setClipGroup('g1', ['c1', 'c2']);
    expect(useEditorStore.getState().clipGroups['g1']).toEqual(['c1', 'c2']);

    useEditorStore.getState().removeClipGroup('g1');
    expect(useEditorStore.getState().clipGroups['g1']).toBeUndefined();
  });

  // ── Audio ─────────────────────────────────────────────────────────────

  it('should set volume and toggle mute', () => {
    useEditorStore.getState().setVolume(0.5);
    expect(useEditorStore.getState().volume).toBe(0.5);

    useEditorStore.getState().toggleMuteAll();
    expect(useEditorStore.getState().isMuted).toBe(true);
    useEditorStore.getState().toggleMuteAll();
    expect(useEditorStore.getState().isMuted).toBe(false);
  });

  // ── Add / Remove Tracks ───────────────────────────────────────────────

  it('should add and remove tracks', () => {
    const initialCount = useEditorStore.getState().tracks.length;
    const newTrack = {
      id: 'tnew',
      name: 'New Track',
      type: 'VIDEO' as const,
      sortOrder: 99,
      muted: false,
      locked: false,
      solo: false,
      volume: 1,
      clips: [],
      color: '#ff0000',
    };
    useEditorStore.getState().addTrack(newTrack);
    expect(useEditorStore.getState().tracks.length).toBe(initialCount + 1);

    useEditorStore.getState().removeTrack('tnew');
    expect(useEditorStore.getState().tracks.length).toBe(initialCount);
  });

  // ── Slip Clip ─────────────────────────────────────────────────────────

  it('should slip clip media offset', () => {
    const clip = useEditorStore.getState().tracks[0]!.clips[0];
    expect(clip!.trimStart!).toBe(0);

    useEditorStore.getState().slipClip(clip!.id!, 2);
    const updated = useEditorStore.getState().tracks[0]!.clips.find(c => c.id === clip!.id!);
    expect(updated?.trimStart).toBe(2);
  });

  // ── Delete Selected Clips ───────────────────────────────────────────────

  it('should delete selected clips', () => {
    const clip = useEditorStore.getState().tracks[0]!.clips[0];
    const trackId = useEditorStore.getState().tracks[0]!.id;
    const initialCount = useEditorStore.getState().tracks[0]!.clips.length;

    useEditorStore.getState().selectClip(clip!.id!);
    useEditorStore.getState().deleteSelectedClips();

    expect(useEditorStore.getState().tracks.find(t => t.id === trackId)?.clips.length).toBe(initialCount - 1);
    expect(useEditorStore.getState().selectedClipIds).toEqual([]);
  });

  it('should not delete when no clips selected', () => {
    const totalBefore = useEditorStore.getState().tracks.reduce((n, t) => n + t.clips.length, 0);
    useEditorStore.getState().deleteSelectedClips();
    const totalAfter = useEditorStore.getState().tracks.reduce((n, t) => n + t.clips.length, 0);
    expect(totalAfter).toBe(totalBefore);
  });

  // ── Duplicate Clip ──────────────────────────────────────────────────────

  it('should duplicate a clip', () => {
    const trackId = useEditorStore.getState().tracks[0]!.id;
    const clip = useEditorStore.getState().tracks[0]!.clips[0];
    const initialCount = useEditorStore.getState().tracks[0]!.clips.length;

    useEditorStore.getState().duplicateClip(clip!.id!);

    const track = useEditorStore.getState().tracks.find(t => t.id === trackId)!;
    expect(track.clips.length).toBe(initialCount + 1);
    // New clip should start where original ends
    const duped = track.clips.find(c => c.id !== clip!.id! && c.startTime === clip!.endTime!);
    expect(duped).toBeDefined();
  });

  // ── Active Tool ─────────────────────────────────────────────────────────

  it('should set active tool', () => {
    expect(useEditorStore.getState().activeTool).toBe('select');
    useEditorStore.getState().setActiveTool('trim');
    expect(useEditorStore.getState().activeTool).toBe('trim');
    useEditorStore.getState().setActiveTool('razor');
    expect(useEditorStore.getState().activeTool).toBe('razor');
  });

  // ── Index Toggle ────────────────────────────────────────────────────────

  it('should toggle index panel', () => {
    expect(useEditorStore.getState().showIndex).toBe(false);
    useEditorStore.getState().toggleIndex();
    expect(useEditorStore.getState().showIndex).toBe(true);
    useEditorStore.getState().toggleIndex();
    expect(useEditorStore.getState().showIndex).toBe(false);
  });

  // ── In/Out Points ───────────────────────────────────────────────────────

  it('should set in/out points', () => {
    expect(useEditorStore.getState().inPoint).toBeNull();
    expect(useEditorStore.getState().outPoint).toBeNull();

    useEditorStore.getState().setInPoint(5);
    expect(useEditorStore.getState().inPoint).toBe(5);

    useEditorStore.getState().setOutPoint(15);
    expect(useEditorStore.getState().outPoint).toBe(15);

    useEditorStore.getState().setInPoint(null);
    expect(useEditorStore.getState().inPoint).toBeNull();
  });

  // ── Add Bin ─────────────────────────────────────────────────────────────

  it('should add a bin at root level', () => {
    const initialCount = useEditorStore.getState().bins.length;
    useEditorStore.getState().addBin('Test Bin');
    expect(useEditorStore.getState().bins.length).toBe(initialCount + 1);
    const newBin = useEditorStore.getState().bins[useEditorStore.getState().bins.length - 1];
    expect(newBin!.name!).toBe('Test Bin');
  });

  it('should add a child bin to a parent', () => {
    const parentId = useEditorStore.getState().bins[0]!.id;
    const initialChildren = useEditorStore.getState().bins[0]!.children.length;
    useEditorStore.getState().addBin('Child Bin', parentId);
    expect(useEditorStore.getState().bins[0]!.children.length).toBe(initialChildren + 1);
  });

  // ── Smart Bins ──────────────────────────────────────────────────────────

  it('should have initial smart bins', () => {
    expect(useEditorStore.getState().smartBins.length).toBe(5);
    expect(useEditorStore.getState().smartBins[0]!.name).toBe('All Video');
  });

  it('should add a smart bin', () => {
    const initialCount = useEditorStore.getState().smartBins.length;
    useEditorStore.getState().addSmartBin('Test Smart', [
      { field: 'type', operator: 'equals', value: 'AUDIO' },
    ]);
    expect(useEditorStore.getState().smartBins.length).toBe(initialCount + 1);
    const last = useEditorStore.getState().smartBins[useEditorStore.getState().smartBins.length - 1];
    expect(last!.name!).toBe('Test Smart');
    expect(last!.rules.length!).toBe(1);
  });

  it('should remove a smart bin', () => {
    const initialCount = useEditorStore.getState().smartBins.length;
    const id = useEditorStore.getState().smartBins[0]!.id;
    useEditorStore.getState().removeSmartBin(id);
    expect(useEditorStore.getState().smartBins.length).toBe(initialCount - 1);
  });

  it('should select a smart bin and populate active assets', () => {
    const state = useEditorStore.getState();
    // "All Video" smart bin should match VIDEO type assets
    state.selectSmartBin('sb1');
    const after = useEditorStore.getState();
    expect(after.selectedSmartBinId).toBe('sb1');
    expect(after.selectedBinId).toBeNull();
    // Should have video assets
    expect(after.activeBinAssets.length).toBeGreaterThan(0);
    expect(after.activeBinAssets.every(a => a.type === 'VIDEO')).toBe(true);
  });

  it('should get smart bin assets without mutating state', () => {
    const assets = useEditorStore.getState().getSmartBinAssets('sb2'); // Favorites
    expect(assets.length).toBeGreaterThan(0);
    expect(assets.every(a => a.isFavorite)).toBe(true);
  });

  it('should filter smart bin by duration', () => {
    const assets = useEditorStore.getState().getSmartBinAssets('sb3'); // Long Takes (>30s)
    expect(assets.length).toBeGreaterThan(0);
    expect(assets.every(a => (a.duration ?? 0) > 30)).toBe(true);
  });

  it('should filter smart bin by tag', () => {
    const assets = useEditorStore.getState().getSmartBinAssets('sb4'); // Dialogue Clips
    expect(assets.length).toBeGreaterThan(0);
    expect(assets.every(a => a.tags.some(t => t.includes('dialogue')))).toBe(true);
  });

  // ── Ripple Delete ──────────────────────────────────────────────────────

  it('should ripple delete a clip and shift subsequent clips', () => {
    const state = useEditorStore.getState();
    // Find a track with multiple clips
    const track = state.tracks.find(t => t.clips.length >= 2);
    expect(track).toBeDefined();
    if (!track) return;

    const clipToDelete = track.clips[0];
    const nextClip = track.clips[1];
    const deletedDuration = clipToDelete!.endTime! - clipToDelete!.startTime!;
    const nextOriginalStart = nextClip!.startTime!;
    const origClipCount = track.clips.length;

    state.rippleDelete(clipToDelete!.id!);

    const updatedTrack = useEditorStore.getState().tracks.find(t => t.id === track.id)!;
    expect(updatedTrack.clips.length).toBe(origClipCount - 1);
    // Only assert shift if the next clip was after the deleted one
    if (nextOriginalStart >= clipToDelete!.endTime!) {
      const shifted = updatedTrack.clips.find(c => c.id === nextClip!.id!);
      expect(shifted).toBeDefined();
      if (shifted) {
        expect(shifted.startTime).toBe(nextOriginalStart - deletedDuration);
      }
    }
  });

});
