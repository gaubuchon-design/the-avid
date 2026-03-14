# NLE Parity Gap Architecture

This document turns the remaining NLE parity gaps into explicit subsystem boundaries. Several of these feature names already exist in the repo as engines or UI models, but they are not yet backed by workstation-grade runtime services. The shared scaffold for closing that gap now lives in `packages/core/src/parity/NLEPortContracts.ts` and `packages/core/src/parity/NLEParityScaffold.ts`.

## Current Reality

- `apps/web/src/engine/PlaybackEngine.ts` is a transport loop, not a professional decode scheduler.
- `apps/web/src/engine/FrameCompositor.ts` and the WebGPU/WebCodecs helpers are useful preview technology, not yet a finishing-grade compositor.
- `apps/web/src/engine/AAFEngine.ts`, `AudioMixerEngine.ts`, `TitleEngine.ts`, `MediaManagementEngine.ts`, and `MulticamEngine.ts` describe important product surfaces, but they still need native/runtime back ends and validation against external tools.
- `apps/desktop/src/main/mediaPipeline.ts` is the strongest current foundation because it already owns ingest, proxies, waveforms, and relink metadata.

## Shared Scaffold

The new scaffold introduces nine contract-level ports in `@mcua/core`:

- `ProfessionalMediaDecodePort`
- `VideoCompositingPort`
- `InterchangePort`
- `RealtimePlaybackPort`
- `ProfessionalAudioMixPort`
- `MotionEffectsPort`
- `MediaManagementPort`
- `ChangeListPort`
- `MulticamPort`

These are intentionally platform-neutral. Desktop should be the first full implementation target, while web can continue to provide reduced or proxy-first adapters.

This pass also adds a reference implementation runtime in `packages/core/src/parity/ReferenceNLEParityRuntime.ts`. It is not the final workstation engine, but it does make the architecture executable and testable across all nine ports.

The desktop execution layer now replaces all nine parity ports in `apps/desktop/src/main/parity/DesktopNativeParityRuntime.ts`. Media management, interchange, change lists, and professional decode remain disk-backed as before. The remaining five ports are now desktop-native too: video compositing writes render-graph manifests per project package, realtime playback binds transports to decode sessions plus compositor graphs, professional audio mixing persists mix/preview state under the export tree, motion effects renders template jobs against the bound desktop package, and multicam orchestration now builds on the desktop playback adapter instead of the core reference runtime. The interchange path also moved one step closer to external-tool fidelity: AAF/OMF exports now emit Pro Tools turnover companions plus package-audit manifests, validation inspects the actual exported artifacts, and standalone interchange files can be imported even when the desktop package manifest is absent. The reference runtime still exists as a shared fallback and snapshot helper, but desktop parity wiring no longer delegates any of the nine ports to it.

## Gap Matrix

| Gap | Current repo boundary | New contract(s) | First serious owner | Exit bar |
| --- | --- | --- | --- | --- |
| Real media decode/playback pipeline | `PlaybackEngine`, `FrameCompositor`, `VideoDecoderPipeline`, desktop `mediaPipeline` | `ProfessionalMediaDecodePort`, `RealtimePlaybackPort` | Desktop runtime | Frame-accurate seek/play/preroll with shared monitor/export snapshots |
| GPU video compositing | `FrameCompositor`, `engine/gpu/WebGPUPipeline`, `EffectsEngine` | `VideoCompositingPort` | Desktop compositor with web preview adapter | One render graph for monitor, scopes, multicam, and export |
| AAF/OMF/XML interchange | `AAFEngine`, `AAFExporter`, Pro Tools AAF bridge | `InterchangePort` | Core + desktop packaging | Validated round-trip packages with relink fidelity |
| Real-time multi-stream playback | `PlaybackEngine`, `MulticamEngine` | `RealtimePlaybackPort` | Desktop transport | Stable benchmark playback with dropped-frame telemetry |
| Professional audio mixing | `AudioMixerEngine`, `AudioEngine`, Pro Tools bridges | `ProfessionalAudioMixPort` | Desktop audio graph | Routing, automation, loudness, and preview/export parity |
| Motion effects, titler, advanced effects | `TitleEngine`, `TitleRenderer`, `EffectsEngine` | `MotionEffectsPort`, `VideoCompositingPort` | Desktop compositor/effects runtime | Template-backed motion graphics on the same render path |
| Media management | `MediaManagementEngine`, desktop `mediaPipeline`, `RelinkEngine` | `MediaManagementPort` | Desktop media services | Real relink review, consolidate/transcode jobs, diagnostics |
| EDL/change list workflows | `EDLExporter`, `OTIOEngine` | `ChangeListPort`, `InterchangePort` | Core compare/handoff services | Revision-based compare artifacts and verified exports |
| Multi-cam editing | `MulticamEngine`, core `MultiCamEngine`, `MultiCamSyncEngine` | `MulticamPort`, `RealtimePlaybackPort` | Desktop editorial runtime | Synced multiview playback, cut commit, angle refinement |

## Layering

### 1. Shared sequence snapshot

Everything should start from one immutable sequence/playback snapshot keyed by sequence revision. Decode, compositor, audio, scopes, and export must consume the same revision instead of rebuilding their own interpretations.

### 2. Desktop-owned media runtime

Desktop should own the first full implementation of:

- decode sessions
- preroll and transport scheduling
- GPU composition
- audio mix graph
- background caches and transcodes

Web should use the same contracts with reduced implementations where possible, typically proxy-first and explicitly unsupported for finishing cases.

### 2a. Editorial preview path

The web editor now treats monitor playback as two related but different problems:

- an interactive transport frame that must never blank or stall during scrub/play
- a higher-fidelity evaluated frame that can arrive asynchronously and be cached by render revision

That split is deliberate. The current web pass keeps layered compositing live in the immediate transport path and upgrades the monitor with a cached post-color evaluated frame once it is ready. This is the right short-term direction for editorial usability because it removes monitor blackouts and avoids forcing the transport loop to wait on the heavier post-processing step.

The longer-term NLE path is stricter:

- decode into GPU-addressable frames/textures, not CPU `ImageData`
- bind those frames directly into the compositor/effects/color graph
- keep an evaluated-frame cache keyed by sequence revision, effect stack revision, grade revision, and output size
- use a separate background render cache for effects that cannot meet realtime
- never put `getImageData`/CPU readback on the transport-critical preview path

This matches the external-tool/runtime direction we want from desktop-native parity: realtime preview should consume the same render graph as export, but with explicit quality levels and background cache promotion instead of blocking the monitor.

### 3. Media services separate from editorial state

Relink, transcode, consolidate, waveform extraction, and interchange packaging should remain separate job surfaces. The editor graph should reference durable asset identity and resolved variants, not own the media jobs directly.

### 4. Interchange and compare as validated outputs

AAF, OMF, XML, EDL, and change lists should all be emitted from revision-aware services. The output must record the exact sequence revision, media resolves, and validation warnings used to generate the artifact.

## Delivery Order

### Phase 1

- Professional decode/playback pipeline
- Media management workflows
- GPU compositing engine

### Phase 2

- Professional audio mixing
- Real-time multi-stream playback
- Motion effects, titler, advanced effects

### Phase 3

- AAF/OMF/XML interchange
- EDL/change list workflows
- Multi-cam editing

This ordering matters because multicam, titles, and interchange all depend on the runtime and media layers being trustworthy first.

## Code Entry Points

- Shared contracts: `packages/core/src/parity/NLEPortContracts.ts`
- Gap registry and phase mapping: `packages/core/src/parity/NLEParityScaffold.ts`
- Reference runtime implementation: `packages/core/src/parity/ReferenceNLEParityRuntime.ts`
- Desktop-native parity runtime: `apps/desktop/src/main/parity/DesktopNativeParityRuntime.ts`
- Tests for scaffold and runtime coverage: `packages/core/src/__tests__/NLEParityScaffold.test.ts` and `packages/core/src/__tests__/ReferenceNLEParityRuntime.test.ts`
- Desktop adapter coverage: `apps/desktop/src/main/__tests__/DesktopNativeParityRuntime.test.ts`

The intent of this pass is not to claim these features are now implemented. It establishes a typed contract and an explicit execution map so the remaining parity work can be built against stable subsystem seams instead of more ad hoc engine expansion.
