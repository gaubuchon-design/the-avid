# Media Pipeline Architecture

This document defines the production media foundation for The Avid. It is
intentionally modeled around the strengths that make Media Composer reliable in
professional conform workflows: durable media indexing, relinkable source
identity, and a separation between logical editorial state and physical media
location.

## Goals

- Ingest a wide range of media without forcing an upfront transcode before
  organization or editorial work can begin.
- Preserve enough source identity to relink, conform, and rebuild media later.
- Keep desktop editing local-first and offline-capable.
- Generate proxies and waveform data as background services, not blocking
  prerequisites.
- Add semantic media organization on top of hard relink metadata instead of
  replacing it.

## Media Composer Parity Principles

The pipeline should preserve these behaviors:

1. Logical clip identity is not the same thing as file path.
2. Physical media can move and still be relinked through durable identity
   fields.
3. Source metadata is first-class.
4. Indexing and media services run in the background.
5. Linking and managed-copy workflows can coexist.
6. Conform depends on metadata fidelity, not just filenames.

## Project Package Layout

Each desktop project package should evolve toward this layout:

```text
<project>/
  project.avid.json
  media/
    managed/       copied source originals for offline-safe editing
    proxies/       optional editorial proxies
    waveforms/     extracted waveform peak data
    thumbnails/    poster frames and timeline/bin thumbnail tiles
    indexes/
      media-index.json
  exports/
    conform/
    screeners/
```

## Asset Model

Every media asset should carry:

- ingest metadata: import time, storage mode, original filename
- locations: original path, managed path, proxy path, path history
- technical metadata: container, codecs, duration, frame rate, resolution, audio
  layout, timecode, reel
- fingerprint: durable file identity based on file size, modified time, and
  content hash sampling
- relink identity: normalized clip name, source stem, source timecode, reel,
  duration, frame rate, prior paths
- waveform metadata: extraction status and sampled peaks
- semantic metadata: tags and machine-generated organization metadata

This is the bridge between Media Composer-style reliability and AI-assisted
organization.

### Canonical Record Shape

The shared `@mcua/core` media model now treats an editorial asset as a canonical
record instead of a single file path:

- `AssetRecord` carries `assetClass`, `supportTier`, `references`, `streams`,
  `variants`, `capabilityReport`, `timebase`, `colorDescriptor`, and
  `graphicDescriptor`.
- `assetClass` distinguishes `video`, `audio`, `subtitle`, `bitmap`, `vector`,
  `layered-graphic`, and `document`.
- `supportTier` is explicit and honest: `native`, `normalized`, `adapter`, or
  `unsupported`.
- `MediaReference` records canonical/original, managed, proxy, playback,
  subtitle-sidecar, and graphic-render locations separately.
- `StreamDescriptor` preserves stream-level codec, language, channel layout,
  timecode, reel, rational timebase, and color metadata.
- `VariantRecord` models edit/playback/renderable variants instead of assuming
  one source path equals one usable asset.
- `CapabilityReport` captures whether each runtime surface should use the
  canonical source directly or require a mezzanine/adapter path.

This lets the app preserve raw camera masters, multichannel audio, stills,
vector/layered graphics, and subtitle sidecars without flattening them into the
lowest-common-denominator file model.

### Support-Tier Semantics

- `native`: the canonical source is directly usable for the target editorial
  path.
- `normalized`: the source is preserved canonically, but the edit path prefers a
  mezzanine or proxy representation.
- `adapter`: the source needs a domain-specific adapter, such as subtitle
  interpretation, vector rasterization, or layered-document flattening.
- `unsupported`: the source is preserved as a record, but no edit path is
  currently defined.

## Pipeline Stages

### 1. Ingest

- Accept source files directly.
- Either copy them into managed storage or link them in place.
- Immediately create a durable media record.
- Make the original media editable as soon as possible.

### 2. Index

- Read filesystem metadata.
- Compute a partial content hash.
- Capture extension, size, modified time, and path history.
- Probe technical metadata when a probe tool is available.
- Build canonical `StreamDescriptor` records with rational timebase, channel
  layout, and color metadata when probing succeeds.
- Classify the imported source into a support tier immediately so later
  proxy/adapter work is explainable.

### 3. Waveform Extraction

- Run during ingest when tooling is available, with fallback data if not.
- Extract real sample peaks for audio-capable assets.
- Store the peaks as sidecar JSON for fast redraw.
- Surface the same peak data into timeline clip rendering and asset metadata.

### 4. Poster Frames And Thumbnail Extraction

- Generate a poster frame for video assets at ingest time.
- Generate additional video thumbnail frames every 10 seconds.
- Persist those images into project-local thumbnail storage.
- Surface those frames in bins and in timeline clip thumbnail strips.

### 5. Proxy Generation

- Optional and asynchronous.
- Never block ingest.
- Prefer proxy playback when available.
- Keep originals as the conform source of truth.
- Persist proxies and rendered-graphic outputs as `VariantRecord`s that point
  back to the canonical source references.

### 6. Semantic Organization

- Seed tags from folder names, clip names, and technical metadata.
- Later enrich with transcript alignment, face/object detection, and scene
  classification.
- Use semantic data as a ranking aid during relink, not as the primary identity
  key.

### 7. Relink and Conform

- Match first on hard identity: hash, size, duration, reel, timecode, normalized
  name.
- Use semantic cues only to break ties or recover from incomplete metadata.
- Preserve path history and relink candidates as explicit state.

### 8. Export

- Export should always include a conform package: project state plus media index
  and relink descriptors.
- Final timeline rendering is a later stage that requires a true
  compositor/playback engine.

### 9. Color Metadata Flow

On ingest, each asset's color space metadata is captured:

1. **Detection**: `MediaPipeline.detectColorSpace()` probes `VideoFrame.colorSpace`
   primaries via WebCodecs. Falls back to file-extension heuristics (EXR → linear,
   DPX → log, etc.).
2. **Storage**: Results are stored on the `MediaAsset` in the editor store as
   `colorSpace` (string), `isHDR` (boolean), and `hdrMode` (`'sdr'`|`'hlg'`|`'pq'`).
3. **Pipeline resolution**: When a clip enters the timeline, `resolveColorPipeline()`
   compares its source color space against the sequence working space to determine
   whether an input transform is needed. Warnings are generated for gamut-clipping
   and HDR/SDR mismatch scenarios.
4. **Export/render**: The `DeliverySpec` carries `outputColorSpace`, `hdrMode`,
   and `transferFunction`. The render pipeline applies the appropriate output
   transform (and tone mapping when crossing HDR/SDR boundaries).

The `ColorDescriptor` type (in `@mcua/core/project-library`) captures the full
color profile: primaries, transfer, matrix, range, bit depth, chroma subsampling,
HDR mode, ICC profile, and mastering display metadata.

## Playback Strategy

- Desktop should prefer managed originals for immediate editability.
- If the original format is poor for UI playback, background proxies can take
  over automatically when ready.
- Browser and mobile should stay metadata-first unless a streamable playback URL
  exists.
- Vector graphics, layered graphics, and subtitle sidecars should resolve
  through adapter-backed variants instead of pretending the source document is
  already a renderable timeline frame.

## Current Implementation Direction

This pass implements the production foundation rather than a full finishing
engine:

- schema-aware media asset metadata in the shared project model
- managed-media package layout for desktop projects
- ingest-time fingerprints, technical metadata capture, and relink keys
- sidecar media index manifests
- best-effort proxy generation when `ffmpeg` is available
- ingest-time waveform extraction with fallback peaks when decode tooling is
  unavailable
- poster-frame generation and thumbnail-frame extraction every 10 seconds for
  video assets
- packaged-binary resolution for `ffmpeg` and `ffprobe`, so desktop builds can
  pin media-tool versions instead of depending only on system installs
- semantic tag seeding from source paths and clip names
- source monitor playback from preferred media URLs
- watch-folder driven background ingest for desktop projects
- relink and missing-media recovery from the ingest workspace
- conform-oriented export packages with relink metadata, EDL, OTIO,
  audio-turnover manifests, and a best-effort screener render
- timeline/bin preview surfaces that consume the same thumbnail and waveform
  metadata stored on the asset

## 10. Hardware Acceleration

The pipeline uses native GPU hardware acceleration across all supported
platforms, falling back gracefully to CPU/software codecs when hardware is
unavailable.

### Supported Hardware Acceleration SDKs

| Vendor      | Platform      | Encode API        | Decode API            | Compute            |
|-------------|---------------|-------------------|-----------------------|--------------------|
| **NVIDIA**  | Win/Linux     | NVENC             | NVDEC (CUVID)         | CUDA via WebGPU    |
| **AMD**     | Windows       | AMF               | D3D11VA               | OpenCL via WebGPU  |
| **AMD**     | Linux         | VA-API (radeonsi) | VA-API                | OpenCL via WebGPU  |
| **Intel**   | Win/macOS     | QSV (oneVPL)      | QSV                   | WebGPU             |
| **Intel**   | Linux         | VA-API (iHD/i965) | VA-API                | WebGPU             |
| **Apple**   | macOS/iOS     | VideoToolbox      | VideoToolbox          | Metal via WebGPU   |
| **Qualcomm**| Windows ARM   | MediaCodec        | MediaCodec / D3D11VA  | WebGPU (Adreno)    |

### Per-Operation Acceleration

- **Ingest/Proxy Generation:** Hardware decode → hardware encode for proxy
  transcodes. NVENC, VideoToolbox, AMF, QSV, VA-API presets for H.264 proxy.
- **Preview/Playback:** WebCodecs `VideoDecoder` with `hardwareAcceleration:
  'prefer-hardware'` for browser-side playback. Desktop uses FFmpeg hardware
  decode.
- **Transcription:** GPU-accelerated audio extraction via hardware decode.
  CUDA for Whisper model inference (NVIDIA), CoreML (Apple Silicon), OpenVINO
  (Intel).
- **Color Processing:** WebGPU compute shaders for real-time color transforms,
  LUT application, and grading node graphs. Maps to CUDA (NVIDIA), Metal
  (Apple), Vulkan (AMD/Intel) through the browser's WebGPU backend.
- **Render/Export:** Full hardware-accelerated encode pipeline with
  vendor-specific quality tuning. NVENC P4/HQ presets, VideoToolbox
  non-realtime mode, AMF quality mode, QSV medium preset.
- **Effects/Compositing:** 26 GPU-accelerated WGSL compute shaders for
  blur, chroma key, color correction, LUTs, noise, distortion, etc.

### Key Files

- `apps/desktop/src/main/gpu.ts` — Desktop GPU detection (Electron)
- `apps/web/src/engine/HardwareAccelerator.ts` — Browser GPU/CPU detection + dispatch
- `apps/web/src/engine/PlatformCapabilities.ts` — Platform capability probing
- `packages/render-agent/src/workers/RenderWorker.ts` — FFmpeg HW encode
- `packages/render-agent/src/workers/IngestWorker.ts` — FFmpeg HW proxy
- `packages/render-agent/src/workers/TranscribeWorker.ts` — HW audio extraction
- `libs/contracts/src/render-pipeline.ts` — HW accel type contracts

## Remaining Work After This Pass

- Ship trusted codec/probe binaries in product packaging rather than only
  supporting the resolution path.
- Deepen the current screener render into a full compositor with transitions,
  effects, multilayer audio mixing, and color management.
- Turn the current watch-folder implementation into a more resilient index
  daemon with watch persistence, backoff, and large-volume scanning controls.
- Expand relink from one-step recovery into candidate review, manual overrides,
  and conform-grade matching diagnostics.
- Add transcript alignment, face/object detection, and richer semantic indexing.
- Add managed database compaction, cache eviction, and versioned migrations.
