# Media Engine Architecture Brief

This brief defines the first production-grade media-engine direction for The Avid. It exists to stop feature work from drifting ahead of playback, compositing, caching, and export reliability.

Related deep dives:

- `docs/MEDIA_PIPELINE_ARCHITECTURE.md`
- `docs/UNIVERSAL_MEDIA_BACKEND_ARCHITECTURE.md`
- `docs/UNIVERSAL_MEDIA_BACKEND_PROMPTS.md`

## Purpose

The current web editor can render and preview, but it still behaves like a screener pipeline rather than a workstation media engine. The next architecture needs to support:

- deterministic frame-accurate playback
- mixed-format editorial timelines
- background proxy, cache, and waveform generation
- undo-safe render state changes
- consistent output between timeline playback, paused monitoring, and export

## Product Boundaries

- Desktop is the primary performance target and should own the full workstation pipeline.
- Web uses the same timeline and project model, but can run a reduced playback tier with proxy-first constraints.
- Mobile stays review-first and should not carry workstation render obligations.

## Target Architecture

### 1. Timeline State Layer

- Keep editorial state in the project model and editor store.
- Split render-facing timeline snapshots from mutable UI state.
- Produce immutable playback snapshots keyed by sequence revision so playback, scopes, and export consume the same graph.

### 2. Media Index and Asset Services

- Centralize source metadata, relink state, proxy variants, waveform peaks, thumbnails, and cache residency.
- Treat source inspection as background work that can be resumed and invalidated.
- Persist derived metadata separately from the edit graph so project loads stay fast.

### 3. Playback Graph

- Resolve sequence tracks into a compositing graph with explicit clip timing, transforms, color operations, transitions, titles, and overlays.
- Use a dedicated scheduler for decode, preroll, and frame presentation instead of tying playback to React renders.
- Separate audio and video clocks, with the audio clock as the master whenever audible playback is active.

### 4. Render Surfaces

- Record monitor, source monitor, scopes, and export should consume the same evaluated frame pipeline.
- Preview quality tiers should be explicit: full, half, quarter, proxy, and draft-effects.
- Effects that cannot play in real time must degrade predictably instead of stalling the transport.

### 5. Cache and Background Jobs

- Introduce cache keys based on asset revision, effect parameters, color state, and sequence settings.
- Support background jobs for proxies, transcodes, waveform generation, thumbnails, and render-cache warmup.
- Make cache invalidation observable so editors understand whether they are seeing source, proxy, or cached renders.

### 6. Export Path

- Export should reuse the evaluated playback graph, not a separate ad hoc code path.
- Delivery jobs must capture the exact sequence revision, settings, and asset-resolve decisions used for output.
- Failed exports should be restartable from validated intermediate stages.

## Performance Targets

These are the first measurable bars for workstation credibility.

| Scenario | Target |
| --- | --- |
| Timeline open | 2 minute sequence with 1,000 clips opens in under 2 seconds on reference desktop hardware |
| Playback start | Play response under 120 ms after transport command |
| Editorial playback | 2 video layers + 8 audio tracks + basic color/resize holds real-time at full frame rate |
| Proxy playback | 4 mixed-format video layers with proxies holds real-time at full frame rate |
| Scrub/step | Frame stepping and scrub updates feel immediate and remain frame-accurate |
| Waveforms | Peak previews visible within 3 seconds for newly imported short-form assets |
| Export parity | Exported frame and paused monitor frame match for the same timecode/sample position |

## Desktop Reference Tier

- Apple Silicon M-series with hardware decode/encode acceleration
- 32 GB RAM target for long-form editing
- SSD-backed local cache
- Multichannel audio output supported, but stereo confidence monitoring required first

## Web Reference Tier

- Proxy-first playback
- 1080p monitoring target
- Reduced effect stack when background cache is unavailable
- Explicit unsupported cases rather than silent degradation

## Immediate Engineering Work

1. Define the playback snapshot contract shared by timeline, monitor, scopes, and export.
2. Add benchmark sequences covering long-form narrative, multicam sports, and transcript-heavy documentary edits.
3. Split source metadata, proxy state, and waveform generation into background job surfaces.
4. Replace monitor rendering paths that bypass the shared graph.
5. Add performance instrumentation for open time, play latency, dropped frames, and cache hit rate.

## Exit Criteria For The Brief

- A concrete playback snapshot type exists in code or technical design.
- Benchmark scenes and capture scripts are defined.
- Desktop and web playback tiers are explicitly separated.
- Export and monitor parity rules are testable.
