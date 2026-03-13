# Universal Media Backend Prompts

These prompts are written to drive implementation of the universal media backend and video middle layer described in `docs/UNIVERSAL_MEDIA_BACKEND_ARCHITECTURE.md`.

They are intentionally repo-specific and should produce code, tests, and docs instead of more abstract planning.

## Prompt 1: Canonical media contracts

```text
Implement the canonical universal-media contracts for The Avid.

Requirements:
- Extend @mcua/core with explicit types for AssetRecord, MediaReference, StreamDescriptor, VariantRecord, CapabilityReport, ColorDescriptor, GraphicDescriptor, and rational timebase metadata.
- Model video, audio, subtitle, bitmap, vector, and layered-graphics assets without reducing them to a single file path.
- Add support-tier classification: native, normalized, adapter, unsupported.
- Preserve container, codec, timecode, reel, frame-rate, channel-layout, and color metadata deeply enough for relink and conform.
- Add tests for mixed-format video, multichannel audio, still-image, subtitle, and layered-graphics fixtures.
- Update docs/MEDIA_PIPELINE_ARCHITECTURE.md and docs/ARCHITECTURE.md.

Do not stop at type aliases. Wire the new model into the existing project/media code paths.
```

## Prompt 2: Shared media-backend package

```text
Create a new packages/media-backend workspace that defines the video middle layer contracts used by desktop, API, render-agent, and local-ai-runtime.

Requirements:
- Add Zod or equivalent schemas for probe jobs, transcode jobs, render jobs, transcription jobs, worker capability reports, and artifact manifests.
- Expose a stable TypeScript API for capability matching, variant manifests, job lineage, and graph-evaluation requests.
- Move duplicated worker/job payload typing out of apps/api and packages/render-agent into this package.
- Add tests proving schema compatibility across coordinator and worker boundaries.
- Update the existing API and render-agent imports to consume the shared package.

Do not create a dead package. Replace real duplicated contracts with the new shared layer.
```

## Prompt 3: Probe and capability classification

```text
Turn media probing into a first-class service and classify every imported asset by editability.

Requirements:
- Expand the current FFprobe-driven metadata extraction so it records container, streams, side data, timecode, audio layouts, color metadata, alpha, captions, and still-image specifics.
- Produce a capability report for each asset on each target surface: desktop, web, mobile, and distributed worker.
- Record whether the asset is natively editable, proxy-only, mezzanine-required, adapter-required, or unsupported.
- Surface that decision in the desktop and web UI so import failures and proxy decisions are explainable.
- Add fixture coverage for mixed frame rates, HDR metadata, multichannel audio, and unsupported/proprietary cases.
- Update docs/AVID_PARITY_MATRIX.md and docs/UNIVERSAL_MEDIA_BACKEND_ARCHITECTURE.md.

Do not hide unsupported cases behind generic failure messages. Make the classification explicit and testable.
```

## Prompt 4: Desktop media gateway

```text
Refactor the desktop media pipeline into a local gateway that implements the shared media-backend contract.

Requirements:
- Keep apps/desktop as the low-latency workstation path, but move probe, variant resolution, decode preparation, cache invalidation, and export handoff behind the universal-media interfaces.
- Split local-only concerns from shared contracts so desktop can fall back to distributed services for heavy jobs without changing the caller API.
- Ensure record monitor, source monitor, scopes, export preview, and external output all resolve assets through the same middle layer.
- Add integration tests for native playback, normalized playback, and cache invalidation.
- Update docs/MEDIA_ENGINE_ARCHITECTURE_BRIEF.md.

Do not leave desktop as an exception path with private types. Make it the local implementation of the same backend contract.
```

## Prompt 5: Distributed media control plane

```text
Upgrade the existing render farm into a real distributed media control plane.

Requirements:
- Extend apps/api/src/services/renderfarm.service.ts to persist jobs, worker registrations, capability metadata, retries, and artifact lineage.
- Expand packages/render-agent to run metadata, transcode, render, thumbnail, waveform, qc, and transcribe workloads under one shared scheduler.
- Support job DAGs so probe -> normalize -> render -> qc chains can be resumed instead of re-run from scratch.
- Add worker draining, per-job retry policy, and explicit support for GPU/CPU capability matching.
- Add tests for worker loss, rescheduling, and artifact-manifest continuity.
- Update docs/PRODUCTION_READINESS.md and docs/UNIVERSAL_MEDIA_BACKEND_ARCHITECTURE.md.

Do not keep the worker system as best-effort websocket glue. Turn it into a durable media orchestration surface.
```

## Prompt 6: Color management and cadence engine

```text
Implement explicit color-management and frame-rate conversion contracts in the media backend.

Requirements:
- Add shared ColorDescriptor and TimebaseDescriptor types for source media, working space, display transforms, and delivery outputs.
- Integrate OpenColorIO-style roles into the backend contract so the app can distinguish scene-referred and display-referred processing.
- Add backend graph nodes for colorspace conversion, tone mapping, scaling, cadence conversion, and frame interpolation policy.
- Ensure export manifests record the exact transform policy used for output.
- Add tests for Rec.709, BT.2020, SDR/HDR transform paths, VFR inputs, and cadence conversion modes.
- Update docs/MEDIA_ENGINE_ARCHITECTURE_BRIEF.md and docs/NLE_MODERNIZATION_PROGRAM.md.

Do not silently collapse color metadata or frame-rate changes into ad hoc helper logic. Make them explicit graph operations.
```

## Prompt 7: Graphics and still-image import chain

```text
Implement a universal graphics/stills import chain for bitmap, vector, and layered graphic assets.

Requirements:
- Define asset-class handlers for bitmap stills, vector graphics, and layered graphics.
- Preserve original documents as canonical sources while generating managed render-ready RGBA variants when necessary.
- Record ICC/exif/orientation/alpha metadata and any flattening decisions in the asset manifest.
- Support timeline usage for stills and graphics through the same variant resolver used for video assets.
- Add tests for PNG, TIFF, JPEG, SVG, PDF-page, and layered-document fallback paths.
- Update docs/MEDIA_PIPELINE_ARCHITECTURE.md.

Do not treat graphics as generic video files. Give them a real import contract and variant path.
```

## Prompt 8: Shared Whisper transcription cluster

```text
Turn services/local-ai-runtime into the shared transcription backend for both local and distributed execution.

Requirements:
- Keep faster-whisper as the primary backend and expose chunked transcription, batched inference, and merge orchestration through one stable API.
- Extend packages/render-agent so large transcription jobs can fan out into chunk jobs and merge back into one transcript with word-level timing.
- Add capability-aware routing for CPU, CUDA, and future Apple-native backends.
- Cache transcript outputs by asset fingerprint plus model/task/language/diarization settings.
- Preserve speaker labels, word timings, and translation metadata in the shared transcript model.
- Add load tests and correctness tests for chunk overlap, merge determinism, and retry behavior.
- Update docs/SPEECH_TO_TEXT_SCRIPTSYNC_ARCHITECTURE.md and docs/UNIVERSAL_MEDIA_BACKEND_ARCHITECTURE.md.

Do not leave transcription as one-file-per-worker synchronous processing. Implement the shared, parallelized backend.
```

## Prompt 9: Containerization and deployment model

```text
Containerize the universal media backend so it can run locally, as background services, or as distributed workers.

Requirements:
- Add container build targets for the coordinator, media worker, and transcription worker.
- Define environment contracts for ffmpeg, gstreamer, OCIO config, model caches, artifact storage, and GPU enablement.
- Add deployment examples for local docker-compose and Kubernetes.
- Support queue-depth or custom-metric scaling for media/transcription workers.
- Add health, readiness, and graceful-drain behavior for long-running render and transcription jobs.
- Update docs/PRODUCTION_READINESS.md and docs/ARCHITECTURE.md.

Do not stop at Dockerfiles. Make the deployment model operationally credible.
```

## Prompt 10: Compatibility corpus and acceptance gates

```text
Build a compatibility corpus and acceptance suite for the universal media backend.

Requirements:
- Define a test corpus that covers mixed containers, codecs, frame rates, channel layouts, color spaces, stills, graphics, subtitles, and failure cases.
- Add automated probe/import/playback/export/render/transcribe acceptance checks against that corpus.
- Record native vs normalized vs adapter vs unsupported outcomes as golden results.
- Add a generated support matrix report to docs/AVID_PARITY_MATRIX.md or a new backend-specific matrix doc.
- Gate CI on schema compatibility, worker contract compatibility, and representative media-path tests.

Do not rely on ad hoc fixtures. Build a reusable corpus that measures the backend honestly.
```
