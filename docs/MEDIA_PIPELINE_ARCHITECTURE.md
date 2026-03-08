# Media Pipeline Architecture

This document defines the production media foundation for The Avid. It is intentionally modeled around the strengths that make Media Composer reliable in professional conform workflows: durable media indexing, relinkable source identity, and a separation between logical editorial state and physical media location.

## Goals

- Ingest a wide range of media without forcing an upfront transcode before organization or editorial work can begin.
- Preserve enough source identity to relink, conform, and rebuild media later.
- Keep desktop editing local-first and offline-capable.
- Generate proxies and waveform data as background services, not blocking prerequisites.
- Add semantic media organization on top of hard relink metadata instead of replacing it.

## Media Composer Parity Principles

The pipeline should preserve these behaviors:

1. Logical clip identity is not the same thing as file path.
2. Physical media can move and still be relinked through durable identity fields.
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
- technical metadata: container, codecs, duration, frame rate, resolution, audio layout, timecode, reel
- fingerprint: durable file identity based on file size, modified time, and content hash sampling
- relink identity: normalized clip name, source stem, source timecode, reel, duration, frame rate, prior paths
- waveform metadata: extraction status and sampled peaks
- semantic metadata: tags and machine-generated organization metadata

This is the bridge between Media Composer-style reliability and AI-assisted organization.

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

### 3. Waveform Extraction

- Run in the background.
- Extract real sample peaks when decode tooling is available.
- Store the peaks as sidecar JSON for fast redraw.

### 4. Proxy Generation

- Optional and asynchronous.
- Never block ingest.
- Prefer proxy playback when available.
- Keep originals as the conform source of truth.

### 5. Semantic Organization

- Seed tags from folder names, clip names, and technical metadata.
- Later enrich with transcript alignment, face/object detection, and scene classification.
- Use semantic data as a ranking aid during relink, not as the primary identity key.

### 6. Relink and Conform

- Match first on hard identity: hash, size, duration, reel, timecode, normalized name.
- Use semantic cues only to break ties or recover from incomplete metadata.
- Preserve path history and relink candidates as explicit state.

### 7. Export

- Export should always include a conform package: project state plus media index and relink descriptors.
- Final timeline rendering is a later stage that requires a true compositor/playback engine.

## Playback Strategy

- Desktop should prefer managed originals for immediate editability.
- If the original format is poor for UI playback, background proxies can take over automatically when ready.
- Browser and mobile should stay metadata-first unless a streamable playback URL exists.

## Current Implementation Direction

This pass implements the production foundation rather than a full finishing engine:

- schema-aware media asset metadata in the shared project model
- managed-media package layout for desktop projects
- ingest-time fingerprints, technical metadata capture, and relink keys
- sidecar media index manifests
- best-effort proxy generation and waveform extraction when `ffmpeg` and `ffprobe` are available
- packaged-binary resolution for `ffmpeg` and `ffprobe`, so desktop builds can pin media-tool versions instead of depending only on system installs
- semantic tag seeding from source paths and clip names
- source monitor playback from preferred media URLs
- watch-folder driven background ingest for desktop projects
- relink and missing-media recovery from the ingest workspace
- conform-oriented export packages with relink metadata, EDL, OTIO, audio-turnover manifests, and a best-effort screener render

## Remaining Work After This Pass

- Ship trusted codec/probe binaries in product packaging rather than only supporting the resolution path.
- Deepen the current screener render into a full compositor with transitions, effects, multilayer audio mixing, and color management.
- Turn the current watch-folder implementation into a more resilient index daemon with watch persistence, backoff, and large-volume scanning controls.
- Expand relink from one-step recovery into candidate review, manual overrides, and conform-grade matching diagnostics.
- Add transcript alignment, face/object detection, and richer semantic indexing.
- Add managed database compaction, cache eviction, and versioned migrations.
