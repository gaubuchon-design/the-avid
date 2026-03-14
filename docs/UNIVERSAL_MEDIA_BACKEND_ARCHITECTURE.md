# Universal Media Backend and Video Middleware Architecture

This document defines the repo plan for a universal media backend, described here as the "video middle layer", for The Avid.

It is intentionally aligned to the code that already exists in this repository:

- desktop media services in `apps/desktop`
- distributed work execution in `packages/render-agent`
- render-farm coordination in `apps/api`
- local speech/runtime services in `services/local-ai-runtime`
- shared editorial and media models in `packages/core`

## Why This Exists

The application needs one media substrate that can:

- import video, audio, still-image, layered-image, subtitle, and graphic assets
- probe and preserve technical metadata deeply enough to relink, conform, and export safely
- play mixed-format timelines without forcing the UI to understand every codec/container detail
- edit against originals, proxies, mezzanines, and generated derivatives through one contract
- export and render through the same evaluated media graph used for monitoring
- run locally for low-latency editorial work and remotely for heavy render/transcode/transcription workloads
- share one transcription backend so large speech-to-text jobs can be parallelized instead of serialized per workstation

## Truthful Constraint

No single build can honestly guarantee literal first-party decode, playback, and export for "every" codec, container, image format, camera raw format, subtitle format, and graphics format.

A production-grade design should therefore support four tiers:

| Tier | Meaning | Expected behavior |
| --- | --- | --- |
| `native` | The backend can probe, decode, play, edit, and export directly. | Works end-to-end without format normalization. |
| `normalized` | The backend can probe/import the original but edits against a generated proxy or mezzanine. | Original stays canonical; editorial and render use a managed derivative where needed. |
| `adapter` | The format requires a vendor SDK, licensed decoder, or specialized plugin. | Support is explicit and capability-gated, not implied by file extension. |
| `unsupported` | The format cannot be lawfully or technically processed. | The app must say so clearly and preserve the asset record for relink/review metadata. |

This is the only credible way to meet the user's requirement without promising impossible behavior for DRM, encrypted streams, or proprietary formats that need closed SDKs.

## Research Summary

The backend choice should be anchored in tools that already expose the primitives we need:

- `ffprobe` produces machine-readable container, stream, packet, frame, and timecode metadata, including `-show_format`, `-show_streams`, `-show_packets`, `-show_frames`, and `-show_entries` surfaces for selective probing. It can also analyze frame side data for fields such as film grain and closed captions. Source: [ffprobe docs](https://ffmpeg.org/ffprobe.html)
- FFmpeg can enumerate build-time and runtime capability surfaces such as formats, demuxers, muxers, codecs, encoders, pixel formats, sample formats, channel layouts, devices, protocols, filters, and hardware accelerators. Source: [ffmpeg docs](https://ffmpeg.org/ffmpeg.html)
- FFmpeg's filter stack already includes `colorspace`, `zscale`, `tonemap`, `libplacebo`, and OCIO-aware transforms, which means the backend can preserve color metadata and do deterministic conversions instead of hiding them in ad hoc code paths. Source: [ffmpeg filters docs](https://ffmpeg.org/ffmpeg-filters.html)
- GStreamer `decodebin`, `decodebin3`, `playbin`, and `encodebin` provide auto-plugging, caps negotiation, stream selection, and multi-stream playback/encoding primitives that are stronger than FFmpeg alone for live inputs, device pipelines, and negotiated media graphs. Sources: [decodebin3](https://gstreamer.freedesktop.org/documentation/playback/decodebin3.html), [playback overview](https://gstreamer.freedesktop.org/documentation/playback/index.html), [encodebin](https://gstreamer.freedesktop.org/documentation/encoding/encodebin.html), [caps negotiation](https://gstreamer.freedesktop.org/documentation/plugin-development/advanced/negotiation.html)
- OpenColorIO formalizes scene-referred and display-referred reference spaces, roles such as `scene_linear`, and display/view transforms. That gives the app a real color contract instead of hardcoded Rec.709 assumptions. Source: [OpenColorIO authoring guide](https://opencolorio.readthedocs.io/en/latest/guides/authoring/authoring.html)
- `faster-whisper` already supports batched transcription and word timestamps, while CTranslate2 supports data parallelism with `inter_threads`, multi-GPU `device_index`, asynchronous execution, and parallel sub-batches. Sources: [faster-whisper](https://github.com/SYSTRAN/faster-whisper), [CTranslate2 parallelism](https://opennmt.net/CTranslate2/parallel.html)
- Kubernetes supports `Indexed` Jobs for deterministic sharded batch work and HPA control loops for scaling workers from metrics. That fits render/transcode/transcription fan-out better than workstation-only job loops. Sources: [Kubernetes Jobs](https://kubernetes.io/docs/concepts/workloads/controllers/job/), [Horizontal Pod Autoscaling](https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/)

## Decision

The repo should converge on a hybrid backend:

1. FFmpeg/libav is the canonical probe, transcode, mezzanine, thumbnail, waveform, and file-render substrate.
2. GStreamer is the negotiated live-I/O and dynamic pipeline substrate for capture, device playout, stream ingest, and stream switching.
3. OpenColorIO is the canonical color-management contract.
4. `services/local-ai-runtime` becomes the shared transcription runtime, using `faster-whisper` first and adding Apple-native backends later.
5. `apps/api` plus `packages/render-agent` become the distributed media control plane and worker plane.

This is a better fit for the repo than trying to make browser code, Electron code, and worker code each invent their own media stack.

## Planned Repo Shape

| Planned surface | Existing anchor | Responsibility |
| --- | --- | --- |
| `packages/core/src/media/*` | already exists | Canonical asset, stream, color, timebase, layout, and variant types. |
| `packages/media-backend/` | new | Shared schemas/contracts for probe jobs, transcode jobs, render graphs, variant manifests, capability registry, and worker RPC payloads. |
| `apps/desktop/src/main/mediaPipeline.ts` | already exists | Low-latency local gateway for desktop editorial playback, local variant resolution, and packaged-tool access. |
| `apps/api/src/services/renderfarm.service.ts` | already exists | Control-plane scheduler, queue manager, worker registration, capability matching, and artifact lineage. |
| `packages/render-agent` | already exists | Containerizable worker runtime for metadata, transcode, render, QC, and chunked transcription jobs. |
| `services/local-ai-runtime` | already exists | Shared STT, translation, and embedding inference service, usable both locally and remotely. |

## Canonical Media Model

The backend should stop treating a media asset as a single file path with a few metadata fields.

The canonical model should separate:

| Entity | Purpose |
| --- | --- |
| `AssetRecord` | The logical editorial asset. |
| `MediaReference` | The original file/object location. |
| `EssenceSet` | The streams/tracks contained in one source object. |
| `StreamDescriptor` | One video/audio/subtitle/data stream with codec, timebase, color/audio metadata, and tags. |
| `GraphicDescriptor` | Vector/layered document metadata such as page, artboard, alpha, ICC, or layered raster semantics. |
| `VariantRecord` | Proxy, mezzanine, thumbnail, waveform, transcription, caption, or render-cache derivative. |
| `CapabilityReport` | Whether the current target can probe, decode, play, transcode, render, or export the asset directly. |
| `JobLineage` | Which probe/transcode/render/transcription jobs produced which variants. |

Each `StreamDescriptor` should be rich enough to carry:

- codec id and codec family
- container and stream index
- timebase numerator/denominator
- start time, duration, reel, and timecode
- resolution, SAR, DAR, chroma subsampling, bit depth, field order
- color range, primaries, transfer, matrix, mastering metadata, content light metadata, ICC profile presence
- alpha presence, premultiply semantics, still-image sequence markers
- audio sample rate, sample format, channel count, standard layout, custom mapping, language, and disposition
- subtitle/caption type and sidecar references

The repo now also treats probe output as a first-class compatibility input:

- stream side-data entries are preserved explicitly
- caption services and subtitle streams are surfaced as distinct descriptors
- still-image and layered/vector specifics travel with the asset instead of being flattened into generic video metadata
- per-surface editability is computed from the probe result plus available variants, not just file extension

## Asset-Class Policy

The middleware should classify inputs by asset class before choosing a decode or normalization path:

| Asset class | First path | Fallback path |
| --- | --- | --- |
| Camera/master video | FFprobe + FFmpeg/libav decode/transcode | Adapter/provider for raw/vendor formats |
| Production/master audio | FFprobe + FFmpeg/libav | Channel-map normalization to mezzanine WAV/BWF where needed |
| Bitmap stills | FFmpeg or image adapter | Normalize to RGBA still cache with ICC/EXIF preserved |
| Vector graphics | Vector adapter (e.g. SVG renderer) | Flatten to managed RGBA at requested raster size |
| Layered graphics | Adapter/plugin path | Flatten visible state while preserving original document and import metadata |
| Subtitle/caption sidecars | Structured parser | Normalize to shared caption cue schema |

The key rule is:

- originals remain canonical
- editorial playback may use proxies/mezzanines
- export/render records exactly which variant was used and why

## Processing Pipeline

### 1. Probe and classify

Every import runs through a deterministic probe stage that:

- extracts container, stream, timecode, and side-data metadata
- extracts caption/subtitle descriptors, color/HDR hints, alpha, multichannel layouts, and still-image specifics
- records whether the asset is `native`, `proxy-only`, `mezzanine-required`, `adapter-required`, or `unsupported` on each target surface
- records whether the asset needs a proxy, mezzanine, adapter, or manual intervention
- preserves enough metadata for relink, conform, and distributed execution

Current repo implementation note:

- `packages/media-backend` owns the shared capability-classification contract
- `packages/core` hydrates canonical asset records from that shared decision
- `apps/desktop/src/main/mediaPipeline.ts` now records richer `ffprobe` metadata, including stream side-data and caption hints
- `apps/web` and desktop ingest surfaces now show the explicit classification instead of hiding it behind generic import success/failure messaging

### 2. Normalize only when necessary

Normalization should be explicit, job-driven, and versioned:

- proxy for interactive playback
- mezzanine for heavy multi-stream or unsupported editorial formats
- thumbnails and waveform peaks for UI
- still/vector rasterizations for timeline render
- audio monitor caches for multichannel preview
- transcription chunks and merged transcripts for speech workflows

### 3. Evaluate one shared media graph

Playback, paused monitoring, scopes, export preview, and final render must consume the same evaluated graph:

- source resolution
- timing and cadence
- transforms and effects
- titles/graphics/subtitles
- color transforms
- audio routing and monitoring

The graph may evaluate at different quality levels, but not through unrelated code paths.

### 3a. Layered effects and quality policy

The repo should treat clip effects, adjustment layers, title overlays, subtitle overlays, and export evaluation as one layered graph:

- clip-local effects execute on the clip image before it is composited into the record frame
- effect-track clips act as adjustment layers that evaluate against the already-composited picture below them
- title and subtitle overlays evaluate after picture/effect compositing so editorial text is not unintentionally baked into picture-level effects
- the record monitor, paused preview, and export pipeline all carry an explicit effect-quality mode instead of silently forking behavior

The current implementation direction is:

- `draft`: used during transport and scrubbing for immediate feedback, lowering the cost of blur/glow/noise-class effects
- `preview`: used for paused monitoring and high-quality monitor upgrades
- `final`: used for export/flatten paths and upgrades any effect with a discrete quality control to its highest setting
- multicam should reuse the same evaluator: the source-side angle bank is a multiview over the same frame graph while the record monitor remains the program output

### 3b. Effect invalidation contract

Realtime monitor stability depends on effect edits invalidating the same frame caches used for paused and upgraded monitor renders.

That means the render contract must include:

- the active effect-stack revision for every visible clip
- the active effect-track clip revision for every visible adjustment layer
- color-processing revision
- title-editing revision
- render-quality revision

### 4. Export and render from manifests, not ad hoc state

Every export/render job should capture:

- the sequence revision
- exact asset/variant bindings
- color/display context
- frame-rate conversion policy
- output container/codec profile
- captions, burn-ins, and sidecar outputs

That gives the repo restartable and auditable render jobs instead of opaque one-off invocations.

### 4a. Desktop background scheduler

Local workstation media tasks should not each invent their own async loop. The desktop app needs one background scheduler that:

- tracks ingest, indexing, export, transcode, transcription, render, and effects jobs through one contract
- admits or delays work based on free memory and system load
- exposes dispatch mode as `local`, `distributed`, or `hybrid`
- keeps a hook for remote dispatch so the same job definition can move to `packages/render-agent` and `apps/api` when remote workers are available

The current implementation direction is:

- watch-folder scans are scheduled as background indexing jobs
- ingest and export work use the shared scheduler instead of bespoke timers
- export-handoff transcoding is queued through the same scheduler
- the API now exposes a raw render-agent coordinator socket so remote workers can register, heartbeat, receive assignments, and complete jobs over the shared media-backend protocol
- the renderer receives structured desktop-job updates so the UI can present real background activity instead of simulated progress

## Color Management Policy

The backend should adopt these rules:

1. Store source color metadata on ingest, even if the current target cannot render it perfectly.
2. Use OpenColorIO roles to define working space, display transforms, and interchange defaults.
3. Treat scene-referred and display-referred transforms explicitly.
4. Use FFmpeg `colorspace`, `zscale`, `tonemap`, `libplacebo`, and OCIO-aware transforms for deterministic backend conversions.
5. Never silently collapse HDR/wide-gamut sources into Rec.709 without recording the transform policy.

This implies a new shared `ColorDescriptor` model in `@mcua/core`.

## Frame-Rate and Timebase Policy

The backend should treat frame rate as a rational timebase problem, not a UI-only number.

Rules:

- preserve original stream timebases from probe data
- preserve VFR knowledge instead of pretending every asset is CFR
- make cadence conversion an explicit graph node
- maintain source timecode and reel identity through ingest and export
- define clear conversion modes for hold, duplicate, blend, optical, and motion-interpolated output

This matters for:

- multicam sync
- sequence conform
- broadcast delivery
- HDR and high-frame-rate material
- downstream render sharding by frame range

## Playback Tiering

### Desktop

Desktop owns the full workstation tier:

- local file access
- GPU-assisted decode where available
- negotiated I/O for external playback and capture
- local cache inspection and invalidation
- transparent fallback to remote jobs for heavyweight operations

### Web

Web is proxy-first:

- browser-safe formats only for native playback
- server-generated or desktop-generated proxies for difficult formats
- shared graph manifests, not raw direct-file assumptions

This now maps directly to the surfaced capability states:

- browser-safe H.264/AV1/PCM-friendly media can be `native`
- HDR, VFR, multichannel, raw, and graphics-heavy sources are expected to become `proxy-only` or `mezzanine-required`
- unsupported or protected media must remain visible as `unsupported`, not silently discarded

### Mobile

Mobile remains review-first:

- managed proxies or streamable outputs
- no obligation to decode facility-grade originals directly

## Distributed Services

The current render-farm code should evolve into a true media service mesh.

### Control plane

`apps/api` should own:

- job DAG creation
- queue persistence
- worker registration and capability matching
- artifact lineage
- retries, draining, and failure policy

### Worker plane

`packages/render-agent` workers should advertise capabilities and run one or more of:

- `metadata`
- `transcode`
- `render`
- `qc`
- `transcribe`
- `thumbnail`
- `waveform`

### Artifact plane

The system should use a shared artifact store for:

- proxy/mezzanine assets
- render-cache frames
- waveform/thumbnail sidecars
- transcript chunks and merged transcripts
- QC reports and export manifests

### Container plan

The first container set should be:

| Image | Based on | Responsibility |
| --- | --- | --- |
| `avid-media-coordinator` | `apps/api` | Queue, worker registry, job DAG orchestration, artifact metadata. |
| `avid-media-worker` | `packages/render-agent` | Metadata, transcode, render, QC, thumbnail, waveform work. |
| `avid-transcribe-worker` | `services/local-ai-runtime` | Faster-Whisper/CTranslate2 backed STT and translation work. |

### Orchestration plan

- use long-running worker Deployments for steady-state background work
- use Indexed Jobs for static chunk fan-out, such as frame-range renders or chunked transcription
- scale workers off queue depth, GPU availability, or custom job metrics

## Shared Whisper Transcription Component

The repo already has the right seed:

- `services/local-ai-runtime`
- `packages/render-agent/src/workers/TranscribeWorker.ts`
- the Speech To Text architecture doc

The next step is to make it one shared service, not several partially overlapping paths.

### Required behavior

1. Accept local files, uploaded bytes, and remote object references.
2. Extract or normalize audio once.
3. Chunk large media with overlap.
4. Batch chunk inference on each worker.
5. Merge chunk outputs into one transcript with stable cue and word timing.
6. Preserve diarization and translation metadata where requested.
7. Cache transcripts by asset fingerprint plus transcription settings.

### Parallelization model

- Use `faster-whisper` batched inference for within-worker throughput.
- Use CTranslate2 data parallelism for multi-worker or multi-GPU throughput.
- Keep model weights warm per worker replica.
- Route chunks to workers based on GPU/CPU capability, language, and queue pressure.

### Repo alignment

- `services/local-ai-runtime` remains the inference surface.
- `packages/render-agent` becomes the distributed job runner for chunk extraction and merge orchestration.
- `apps/api` coordinates chunk jobs and merged transcript records.
- `apps/web` and `apps/desktop` should both call the same contract.

## What This Changes In Practice

This architecture changes the working model from:

- "the desktop app knows how to do media things"

to:

- "the application has one media contract, with local and distributed implementations"

That is the difference between an editor with media helpers and an NLE with a real media backend.

## Phased Execution

### Phase 1: Canonical contracts

- add shared stream/color/timebase/variant schemas to `@mcua/core`
- add `packages/media-backend` contracts and manifest schemas
- unify capability reporting across desktop, API, and render-agent

### Phase 2: Probe and normalization

- upgrade metadata probing into a first-class service
- classify assets into native/normalized/adapter/unsupported tiers
- add managed proxy/mezzanine policy and manifest lineage

### Phase 3: Desktop local gateway

- refactor `apps/desktop/src/main/mediaPipeline.ts` behind the shared contracts
- route playback preparation and export handoff through the middle layer
- keep low-latency local editorial behavior

### Phase 4: Distributed render/transcode plane

- promote `apps/api/src/services/renderfarm.service.ts` into a persisted coordinator
- expand `packages/render-agent` worker types and capability-driven routing
- add chunked render/transcode execution with artifact manifests

### Phase 5: Color and timing fidelity

- add OCIO-backed color descriptors and transform manifests
- add explicit cadence conversion policies and tests
- connect monitor, scopes, export preview, and final render to one graph contract

### Phase 6: Shared transcription cluster

- make `services/local-ai-runtime` the single STT runtime surface
- add chunk orchestration, batched inference, transcript merging, and caching
- route both local and distributed transcription through the same API

## Exit Criteria

This backend can be considered real when the repo can prove all of the following:

- an asset can be imported even when it is not natively editable on the current target
- the system can explain why an asset is native, normalized, adapter-backed, or unsupported
- desktop playback, paused monitor, export preview, and final render agree on the evaluated media graph
- render/transcode/transcription jobs can run on one workstation or a distributed worker pool without changing the caller contract
- the STT backend can parallelize chunked jobs while preserving deterministic merged output

## Related Repo Docs

- [Media Engine Architecture Brief](./MEDIA_ENGINE_ARCHITECTURE_BRIEF.md)
- [Media Pipeline Architecture](./MEDIA_PIPELINE_ARCHITECTURE.md)
- [Speech To Text, PhraseFind, and ScriptSync Architecture](./SPEECH_TO_TEXT_SCRIPTSYNC_ARCHITECTURE.md)
- [NLE Modernization Program](./NLE_MODERNIZATION_PROGRAM.md)
