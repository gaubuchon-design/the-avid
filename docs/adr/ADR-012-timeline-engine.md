# ADR-012: Timeline Engine — Segment Graph, Decode Pipeline, and Frame-Accurate Playback

**Status:** Accepted
**Date:** 2026-03-15
**Author:** @architect
**Supersedes:** None (completes the playback subsystem specified in ADR-001)

---

## Context

The existing playback subsystem has a working RAF-driven PlaybackEngine, PlaybackSnapshot
contract, VideoSourceManager (HTMLVideoElement-based), FrameCompositor (Canvas 2D), and
AudioEngine (Web Audio API). These pieces handle basic single-source playback and simple
compositing, but lack:

1. **A segment graph** — a data structure that resolves the timeline's track/clip hierarchy
   into an ordered list of frame-addressable media segments, supporting transitions, nested
   sequences, and mixed frame rates.
2. **A WebCodecs decode pipeline** — using `VideoDecoder` / `AudioDecoder` for frame-accurate
   decode with pre-fetch, ring-buffer cache, and GPU-backed output.
3. **A frame-accurate scheduler** — replacing the RAF-only loop with a vsync-aligned scheduler
   that manages decode latency, frame dropping, A/V sync, and reverse playback.
4. **A muxer/export pipeline** — WebCodecs `VideoEncoder` / `AudioEncoder` feeding into
   container muxing for professional export.
5. **An integration controller** — a single entry point that ties SegmentGraph → DecodePipeline
   → FrameCompositor → AudioEngine → Display with clean lifecycle management.

### Decision Drivers

- **Frame accuracy is non-negotiable** (per AGENTS.md @platform-engineer constraints).
- **Web-first** (per ADR-001): all engines run in-browser; Electron is an additive shell.
- **WebCodecs** is the primary decode/encode API. HTMLVideoElement remains a fallback for
  browsers without WebCodecs support, but the professional playback path uses WebCodecs.
- **No Rust** (per ADR-001): all implementations are TypeScript.
- **GPU acceleration** via WebGPU for compositing and effects; Canvas 2D as fallback.
- **Audio never blocks video, video never blocks audio** — independent pipelines synced via
  a shared presentation clock.

---

## Decision

### 1. Segment Graph (`SegmentGraph.ts`)

The **SegmentGraph** is the canonical intermediate representation between the Zustand editor
store (user-facing timeline model) and the playback/render engines.

```
EditorStore (tracks, clips, effects)
        │
        ▼
  SegmentGraph.resolve(tracks, settings)
        │
        ▼
  SegmentGraphResult {
    videoSegments: VideoSegment[]   // sorted by timeline time
    audioSegments: AudioSegment[]   // sorted by timeline time
    duration: number                // total timeline duration
    fps: number
  }
```

**Key types:**

- `VideoSegment` — a contiguous span on the timeline backed by a single media source, with
  source time mapping, intrinsic transforms, blend mode, effects, and optional transition
  overlap regions.
- `AudioSegment` — a contiguous span backed by a single audio source, with gain, pan, and
  automation keyframes.
- `TransitionRegion` — describes overlap between two segments (dissolve, wipe, etc.) with
  interpolation curve.

**Design rules:**
- The graph is **immutable** — rebuild on any timeline edit (cheap: ~1ms for 1000 clips).
- Segments are **non-overlapping per track** but may overlap **across tracks** (compositing).
- Nested sequences are flattened recursively with accumulated time offsets.
- Mixed frame rates are resolved via the FrameRateMixer conform method per clip.

### 2. Decode Pipeline (`DecodePipeline.ts`)

A **pull-based** pipeline: the FrameScheduler requests frames by timeline time; the
DecodePipeline resolves the segment, maps to source time, and returns decoded frames.

```
FrameScheduler.requestFrame(timelineTime)
        │
        ▼
  DecodePipeline.getVideoFrame(segment, sourceTime)
        │
        ├─ Cache hit? → return cached VideoFrame
        │
        ├─ Decode queue → WebCodecs VideoDecoder
        │                       │
        │                       ▼
        │                 VideoFrame (GPU-backed)
        │
        └─ Pre-fetch: decode ahead N frames based on speed/direction
```

**Key design:**
- **Ring buffer frame cache** — holds last N decoded VideoFrames per source (default: 30 frames
  per source, configurable by available VRAM).
- **Decode workers** — each active source gets its own VideoDecoder instance. Inactive sources
  are flushed to free GPU memory.
- **Pre-fetch strategy** — at play speed 1x, decode 8 frames ahead. At speeds > 2x, decode
  every Nth frame (frame dropping). At reverse speeds, decode GOP-aligned chunks.
- **Fallback** — if WebCodecs is unavailable, fall through to VideoSourceManager
  (HTMLVideoElement seek + createImageBitmap).

### 3. Frame Scheduler (`FrameScheduler.ts`)

Replaces the simple RAF accumulator with a **presentation-clock-driven scheduler**.

```
RAF tick (vsync)
    │
    ├─ Read presentation clock
    ├─ Calculate target frame number
    ├─ Compare with last displayed frame
    │
    ├─ Frame ready in DecodePipeline cache?
    │   ├─ Yes → composite + display
    │   └─ No  → drop frame, log drop, display previous
    │
    ├─ Update AudioEngine sync point
    └─ Emit frame to subscribers
```

**Key design:**
- **Presentation clock** — a monotonic clock initialized at play-start, advancing at
  `speed * realtime`. Seek resets the clock origin.
- **Frame number = floor(clockTime * fps)** — integer frame addressing eliminates floating-point
  drift.
- **A/V sync** — audio playback rate is set to match `speed`; audio position is the sync
  master (Web Audio API currentTime). Video catches up or drops frames to match.
- **Reverse playback** — clock runs backward; DecodePipeline serves frames in reverse order
  from GOP-aligned cache.
- **Performance monitoring** — tracks dropped frames, decode latency p50/p95, and cache hit
  rate. Emits metrics to HardwareAccelerator performance monitor.

### 4. Timeline Playback Controller (`TimelinePlaybackController.ts`)

The **integration facade** that owns the lifecycle of all subsystems.

```
TimelinePlaybackController
    ├── SegmentGraph (rebuilt on timeline edits)
    ├── DecodePipeline (manages decoders per source)
    ├── FrameScheduler (owns the playback clock)
    ├── FrameCompositor (existing, receives frames)
    ├── AudioEngine (existing, receives audio segments)
    └── PlaybackEngine (existing, transport state — play/pause/stop/JKL)
```

**Responsibilities:**
- Subscribes to the Zustand editor store; rebuilds SegmentGraph on changes.
- On `play()`: initializes decoders for visible segments, starts pre-fetch, starts scheduler.
- On `seek(time)`: flushes decode caches, seeks audio, rebuilds pre-fetch window.
- On `stop()`: flushes all decoders, releases GPU resources.
- Exposes the same `subscribe(cb)` pattern as PlaybackEngine for UI integration.

### 5. Muxer Pipeline (`MuxerPipeline.ts`)

For export, the pipeline runs **offline** (not real-time):

```
SegmentGraph (full sequence)
    │
    ▼
  For each frame 0..totalFrames:
    DecodePipeline.getVideoFrame(segment, sourceTime)
    FrameCompositor.renderTimelineFrame(...)
    VideoEncoder.encode(composited frame)
    AudioEncoder.encode(mixed audio)
    │
    ▼
  Muxer (mp4box.js / custom MXF writer)
    │
    ▼
  Output file (MP4, MOV, MXF)
```

**Key design:**
- Uses the same SegmentGraph and DecodePipeline as playback — no separate render path.
- Encode runs in a Web Worker to avoid blocking the UI.
- Progress reported via structured events.
- Container support: MP4 (via mp4box.js), MOV (MP4 with Apple atoms), MXF (custom writer
  for Avid interchange).

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Zustand Editor Store                          │
│  tracks[], clips[], sequenceSettings, effects, subtitles, titles     │
└──────────────────────────┬───────────────────────────────────────────┘
                           │ subscribe (on edit)
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    TimelinePlaybackController                        │
│  ┌────────────┐  ┌───────────────┐  ┌──────────────┐               │
│  │SegmentGraph│  │FrameScheduler │  │DecodePipeline│               │
│  │            │  │               │  │              │               │
│  │ resolve()  │──│ presentClock  │──│ getFrame()   │               │
│  │ video segs │  │ targetFrame   │  │ preFetch()   │               │
│  │ audio segs │  │ dropDetect    │  │ frameCache   │               │
│  │ transitions│  │ avSync        │  │ decoders[]   │               │
│  └────────────┘  └───────┬───────┘  └──────┬───────┘               │
│                          │                  │                        │
│            ┌─────────────┴──────────────────┘                       │
│            ▼                                                         │
│  ┌─────────────────┐        ┌─────────────┐                        │
│  │ FrameCompositor  │        │ AudioEngine  │                       │
│  │ (Canvas2D/WebGPU)│        │ (Web Audio)  │                       │
│  └────────┬─────────┘        └──────┬───────┘                       │
│           │                         │                                │
│           ▼                         ▼                                │
│  ┌─────────────────┐        ┌──────────────┐                       │
│  │ Record Monitor   │        │ Speaker Out   │                      │
│  │ Source Monitor    │        │ Meters        │                      │
│  │ Video I/O Output  │       │ LUFS          │                      │
│  └──────────────────┘        └──────────────┘                       │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Trade-offs

| Decision | Benefit | Cost |
|----------|---------|------|
| WebCodecs primary path | Frame-accurate decode, GPU frames, no HTMLVideoElement seek jank | Requires WebCodecs support (Chrome 94+, Edge 94+, Safari 16.4+) |
| Pull-based decode | Scheduler controls timing; no wasted decodes | Slightly higher latency on first frame vs push |
| Ring buffer cache | Bounded memory, fast scrub within cache window | Cache misses on large seeks require re-decode |
| Immutable segment graph | Simple, no mutation bugs, cheap to rebuild | Full rebuild on every edit (acceptable at <1ms) |
| Single integration controller | Clean lifecycle, one place for resource management | More indirection than direct engine coupling |
| mp4box.js for muxing | Proven, maintained, handles MP4/MOV atoms | No native MXF support (requires custom writer) |

---

## Consequences

- PlaybackEngine remains the transport state machine (play/pause/stop/JKL) but delegates
  frame delivery to TimelinePlaybackController.
- FrameCompositor gains a `renderFromVideoFrames()` method that accepts `VideoFrame[]`
  directly (avoiding ImageBitmap conversion when WebCodecs is active).
- VideoSourceManager remains as the HTMLVideoElement fallback path; the new DecodePipeline
  is the preferred path.
- All new engines follow the existing singleton + dispose pattern.
- Tests validate frame accuracy: given a known sequence, assert exact frame numbers at
  given timeline times.
