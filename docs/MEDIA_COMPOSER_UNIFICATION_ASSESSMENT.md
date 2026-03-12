# Media Composer Unification Assessment

This document answers three questions about the current architecture of The Avid:

1. Does the current architecture ensure a unified experience across desktop, browser, and mobile?
2. What functional gaps remain before this can honestly claim Media Composer-grade editorial parity?
3. What concrete plan should close those gaps, and what Codex prompts should drive that work?

## Queued Execution Order

1. `Completed` Lock the cross-surface capability and workspace contract.
2. `Completed` Finish editorial-core acceptance tests and close behavioral gaps.
3. `In Progress` Replace desktop media-engine scaffolds with a real decode/composite/playback runtime.
4. `In Progress` Close multichannel audio and Pro Tools parity.
5. `Queued` Close multicam and hardware video I/O/deck control.
6. `Queued` Close finishing, interchange, facility workflow, plugin ABI, and release readiness.

## Executive Verdict

The current architecture is a strong foundation for a unified product family, but it does **not yet ensure** a unified workstation experience across desktop, browser, and mobile.

It is strongest where desktop and browser meet:

- `apps/desktop/src/renderer/App.tsx` imports the web `DashboardPage` and `EditorPage`, which means desktop and browser already share the main editorial shell.
- `packages/core/src/parity/NLEPortContracts.ts` defines platform-neutral NLE runtime ports, which is the right architectural seam for capability-specific implementations.
- `apps/desktop/src/main/index.ts` and `apps/desktop/src/preload/index.ts` expose native-only services such as GPU flags, project packaging, relink/transcode, hardware video I/O, streaming, and deck control.

It is materially weaker where mobile is concerned:

- `apps/mobile/app/editor/[projectId].tsx` is a separate Expo/React Native editor, not the shared workstation UI.
- Mobile shares the project model through `@mcua/core` and its own repository adapter in `apps/mobile/app/lib/projectRepository.ts`, but it does not share the same interaction model, docking model, monitor model, or runtime path as desktop/web.

The practical conclusion is:

- Desktop and browser can plausibly converge on one editorial experience with capability-based fallbacks.
- Mobile is currently a companion surface, not a unified workstation surface.
- The architecture supports intentional cross-surface coherence, but it does not yet enforce it.

## Current Architectural Assessment

### What is solid

- Shared project/domain model in `@mcua/core`
- Shared desktop/web editor shell
- Platform-specific persistence adapters
- Explicit parity-runtime contracts for decode, compositing, playback, audio, media management, interchange, change lists, motion effects, and multicam
- Desktop-native media pipeline foundation for ingest, relink, proxies, watch folders, and export packaging

### What is still structurally incomplete

- No single capability-driven workspace contract that defines which workflows must feel identical across desktop, browser, and mobile
- No shared monitor/runtime contract that guarantees the same seek, preroll, playback, and evaluated-frame behavior across surfaces
- No shared plugin/effects ABI that cleanly separates browser-safe effects from desktop-native effects
- Some repository-level docs still lag the current editorial-only product narrowing, which increases planning risk unless the architecture documents are treated as living artifacts
- No product-level policy that distinguishes:
  - identical behavior across surfaces
  - degraded-but-consistent behavior across surfaces
  - desktop-only workflows

### Important reality check on the desktop parity runtime

The desktop parity layer is useful and important, but many of its implementations are still closer to production scaffolds than finished workstation subsystems.

Examples in `apps/desktop/src/main/parity/DesktopNativeParityRuntime.ts`:

- Decode validates media presence and returns handles, but it does not run a real codec graph.
- Video compositing compiles render-graph manifests and returns composite handles, but it does not execute a finishing-grade GPU compositor.
- Audio mixing compiles bus manifests, preview handles, and synthetic loudness calculations, but it is not yet a full mixer engine.
- Motion effects and multicam are meaningfully structured, but still rely on manifest/job orchestration and helper engines rather than a proven workstation runtime.

That means the architectural direction is correct, but the repo should not yet treat those seams as solved parity.

## Current Functionality Snapshot

The current codebase already provides meaningful editorial value:

- Shared project persistence across web, desktop, and mobile
- Browser/desktop editorial shell with bins, timeline, source/record monitors, track patching, export panel, title/subtitle tooling, and keyboard routing
- Desktop-native ingest, relink, proxy generation, conform/export packaging, and media indexing
- Mobile review/light-edit companion built on the same project schema

It also already contains parts of the right professional shape:

- Hardware video I/O and deck-control surfaces are exposed through desktop preload IPC
- Interchange and Pro Tools turnover seams exist
- Media management, relink, transcode, consolidate, and watch-folder foundations exist
- Multicam, audio mix, motion effects, and change-list APIs are represented at the contract level

## Remaining Functional Gaps To Editorial Parity

The gaps below are ordered by dependency, not by marketing visibility.

### 1. Cross-surface workstation contract

This is the biggest architectural gap if the goal is one modernized Media Composer family.

Missing:

- A formal capability matrix for desktop, browser, and mobile
- A shared workspace contract that says which panels, commands, and monitor behaviors must be identical
- A single interaction model for source/record workflow, trim, patching, keyboard, and sequence navigation

Without this, the repo can share code while still drifting into three different products.

### 2. Professional media engine

Still missing for honest parity:

- Real codec-backed decode graph
- GPU-resident frame path from decode to composite to monitor/export
- Stable multi-stream playback with measurable dropped-frame behavior
- Background render-cache strategy for effects that cannot meet realtime
- Reliable proxy/original switching and revisioned evaluated-frame caching

This is the main blocker for monitor fidelity, multicam confidence, finishing preview, and hardware output.

### 3. Editorial precision and Media Composer behaviors

The repo has many editorial verbs, but parity is still incomplete around depth and determinism:

- Advanced trim parity, especially asymmetrical and roller workflows
- Full overwrite/splice/replace/segment behavior validation
- Full keyboard-first parity and remapping depth
- Record/source monitor precision, gang semantics, preroll, loop play, and mark handling
- Track targeting, sync-lock, patching, and monitored-track behavior under all edit modes
- Marker, matchback, and navigation parity under dense timelines

### 4. Multicam parity

Still missing or incomplete:

- Full multiview UX with angle/audio policies
- Reliable cut-record workflow over real playback transports
- Group refinement after live switching
- Angle sync diagnostics, resync, and assistant-editor workflows
- Multicam interaction parity between monitor, timeline, and matchback

### 5. Audio parity, including multichannel/containerized audio

This is a large gap if the target is Media Composer plus Pro Tools-friendly turnover.

Still missing:

- True multichannel/containerized audio asset model across ingest, timeline, monitoring, and export
- Reliable channel layout handling for mono, stereo, dual mono, 5.1, 7.1, and split-track production audio
- Bussing, sends, submixes, EQ, dynamics, automation modes, and proper meters
- Frame-accurate audio scrubbing and monitoring parity
- Loudness/QC workflows and verified turnover artifacts
- Production-ready Pro Tools handoff validation

### 6. Finishing stack

Still missing:

- Real color pipeline and scopes tied to the same render graph as playback/export
- Titles/motion graphics on a dependable realtime and render-cache path
- Subtitle/caption authoring, import/export, styling, and burn-ins
- Better transitions/effects coverage and deterministic preview/render parity

### 7. Interchange and facility handoff

Still incomplete:

- Third-party validated round-trips for AAF, OMF, XML, EDL, and OTIO
- Better conform fidelity, reel/timecode preservation, and relink rules
- Change-list workflows that match revision-aware editorial review
- Assistant-editor workflows for turnovers and conform prep

### 8. Media management and shared-storage workflow

Still missing:

- Serious relink review UI
- Consolidate/transcode policy depth
- Shared storage semantics closer to NEXIS expectations
- Bin and project locking semantics
- Watch-folder governance, background indexing, and facility diagnostics

### 9. Hardware video I/O and deck control

The codebase has IPC surfaces for this, but parity is not closed until these are integrated into real workflows:

- Confidence monitoring and fullscreen/output routing
- External video playback/output tied to the real transport/compositor
- Capture/ingest tied to source monitor and logging workflows
- Timecode, reference, format, and signal diagnostics
- Insert edit / assemble / layoff style deck-control workflows where applicable

### 10. Plugin/runtime extensibility

Still missing:

- Production plugin ABI and sandbox policy
- Clear separation between browser-safe preview plugins and desktop-native processing plugins
- Deterministic render parity between interactive preview and export

### 11. Release/enterprise readiness

Still missing:

- CI/test gates that reflect parity expectations
- Migration and schema-upgrade policy
- Crash/telemetry/reliability program
- Permissions, governance, audit, entitlements, and admin controls

## Unified-Experience Answer

If the question is strict:

> Does the architecture as currently formed ensure that the resulting application will share a unified experience across desktop, mobile, and browser?

The answer is **no**.

If the question is softer:

> Does the architecture provide a credible path to a unified family of products with platform-appropriate capability differences?

The answer is **yes, especially for desktop and browser**.

The current repo is best understood as:

- one shared project/domain model
- one increasingly shared desktop/browser editorial shell
- one separate mobile companion experience
- one in-progress native parity runtime whose abstractions are ahead of its real media-engine depth

## Concrete Plan To Close The Gaps

### Phase 0: Lock the product boundaries

Objective:

- Define what must be identical across desktop/browser/mobile, what may degrade, and what is desktop-only

Deliverables:

- Capability matrix by surface
- Shared workspace contract
- Shared command/monitor behavior contract
- Acceptance scenes and benchmark timelines

Exit bar:

- Every feature is classified as `shared`, `degraded`, or `desktop-only`
- Mobile is explicitly positioned as either companion-only or upgraded toward workstation parity

### Phase 1: Finish editorial-core parity

Objective:

- Make the editor behave like a reliable keyboard-first NLE before adding more breadth

Deliverables:

- Full edit-verb parity tests
- Advanced trim and segment modes
- Deterministic patching/targeting/sync-lock behavior
- Source/record monitor parity tests

Exit bar:

- Top twenty editorial behaviors pass acceptance tests on desktop and browser

### Phase 2: Replace the preview engine with a real workstation media runtime

Objective:

- Move from preview scaffolds to a real decode/composite/playback architecture

Deliverables:

- Real decode session manager
- GPU compositing graph
- Background render-cache policy
- Multi-stream transport scheduler
- Performance telemetry

Current execution state:

- Desktop decode/composite/playback now materialize real file-backed artifacts instead of only manifests and synthetic handles.
- Desktop playback now owns a `SharedArrayBuffer` frame transport and can fan the same composite-derived BGRA frame out to external playback device bindings.
- The Electron app now has a dedicated parity playback manager in `apps/desktop/src/main/parity/DesktopParityPlaybackManager.ts` that binds live projects, creates transports over IPC, and routes output through the existing `VideoIOManager`.
- The desktop renderer now has a transport reader bridge in `apps/desktop/src/renderer/parityPlayback.ts`, so the shared desktop shell can consume parity playback frames directly instead of inventing a second preview-only transport.
- The shared record/program monitor path now prefers parity-runtime playback when running inside Electron, via `apps/web/src/hooks/useDesktopParityMonitorPlayback.ts`, while the browser shell retains the existing canvas/video render path.
- Desktop parity playback now has an explicit transport-release path so monitor-driven transport recreation does not leak main-process decode/composite state.
- Desktop parity playback now owns a real continuous scheduler, so one transport loop can keep feeding successive frames to monitors and external outputs without repeated one-frame `start(...)` calls from the shared shell.
- The shared desktop monitor hook now separates transport setup from playback control and RAF readback, which keeps small playhead drift from reissuing full `syncProject(...)` and `attachStreams(...)` setup on every render tick.
- Desktop realtime playback now applies adaptive transport policy on every frame: it computes frame budget, classifies stream pressure, chooses composite quality, and switches between source-only and promoted-cache strategies from observed transport conditions.
- Desktop playback now promotes lookahead frames into decode/composite caches opportunistically, so heavier multistream sessions can trade background cache work for steadier future-frame playback.
- Shared playback telemetry now exposes quality level, cache strategy, stream pressure, frame budget, render latency, cache-hit rate, and promotion counts instead of only raw dropped-frame and latency counters.
- Transport stop/release now waits for in-flight scheduler and promotion work, which closes the lifecycle gap where background playback tasks could outlive the released transport.

Remaining within Phase 2:

- Surface the adaptive transport diagnostics in desktop monitor/output UX and use them to drive multicam and external-output confidence indicators.

Exit bar:

- Frame-accurate seek/play/preroll on workstation-scale media
- Reliable evaluated-frame parity between monitor, scopes, and export

### Phase 3: Close audio parity

Objective:

- Make audio a real editorial/turnover workflow instead of a lightweight preview path

Deliverables:

- Multichannel/containerized audio asset model
- Mixer, bussing, sends, automation, EQ/dynamics
- Monitoring and loudness/QC
- Verified Pro Tools turnovers

Current execution state:

- Core now has a shared normalized audio-channel-layout model (`mono` / `stereo` / `5.1` / `7.1`) that is reused by ingest, audio mix compilation, and Pro Tools turnover instead of treating layout as an arbitrary string.
- Desktop audio mix compilation now derives dominant layout, source layouts, bus channel counts, and containerized-audio state from bound project assets instead of assuming a stereo-only mix graph.
- Desktop audio preview manifests and loudness analysis now expose layout/channel-count context and warnings when containerized multichannel audio is present.
- Desktop audio turnover manifests now carry project-, track-, and clip-level channel-layout metadata for downstream turnover tools.
- `ProToolsAAFExporter` now derives track/clip channel assignment from asset metadata and validates mixed-layout tracks plus multichannel assets that lack layout metadata.
- Core now has a shared audio-mix topology model for bus roles, send targets, printmaster routing, fold-down routing, and routing warnings, and both the reference runtime and desktop runtime compile against that same topology.
- Desktop audio preview artifacts now include routing plans and per-bus metering snapshots instead of only flat stem summaries.
- Loudness analysis now exposes per-bus measurements and routing diagnostics, which brings the runtime a step closer to real QC workflows.
- Pro Tools turnover validation now reports missing source-path failures, sample-rate conversion warnings, and summary counts alongside layout diagnostics.
- Audio mixes now carry explicit automation modes per track plus per-bus insert-chain metadata for EQ, dynamics, limiter, meter, and fold-down stages.
- Desktop preview artifacts and turnover manifests now expose processing chains and automation-mode summaries, not just routing and stem membership.
- Desktop Pro Tools turnover validation now enforces printmaster/fold-down facility policy when turnover manifests are present, including required processing-stage checks.
- Audio buses now carry explicit stem roles and insert application policy (`preview`, `print`, `both`), so preview and turnover no longer imply the same processing path.
- Desktop preview and turnover artifacts now expose preview-vs-print processing separation directly, including assistant-editor checklist entries for source paths, stem roles, printmaster chain, and fold-down chain.
- Desktop turnover validation now enforces stem-role assignment, preview/print processing separation, and assistant-editor checklist completeness in addition to the earlier facility checks.
- Reference and desktop runtimes now share a processing-policy summary that explicitly reports per-bus preview-active stages, print-active stages, and bypassed stages instead of leaving that inference to each consumer.
- Audio preview artifacts now include print-reference metering alongside live preview metering, which makes the monitor-vs-turnover delta observable in tests and downstream UI.
- Desktop assistant-editor handoff output now includes sign-off status, recommended actions, processing-intent summaries, and facility-policy rollups rather than only checklist presence.

Remaining within Phase 3:

- Drive actual desktop monitor/export behavior from the preview-vs-print policy so preview and print paths do more than describe different chains; they should choose different execution paths when needed.
- Tighten turnover sign-off from generic review output into facility-specific assistant-editor delivery packages, stem expectations, and approval gates.

Exit bar:

- Production audio layouts survive ingest, edit, preview, export, and interchange

### Phase 4: Close multicam and hardware integration

Objective:

- Turn multicam, hardware video I/O, and deck control into dependable workflows

Deliverables:

- Full multiview monitor workflow
- Angle/audio policies and refinement
- External video output integration
- Capture/logging/deck-control workflows

Exit bar:

- Multicam and hardware monitoring are trustworthy in real editorial scenarios

### Phase 5: Close finishing and interchange

Objective:

- Deliver credible handoff and finishing workflows

Deliverables:

- Real color/titles/captions/effects path
- Render-cache promotion for non-realtime effects
- Third-party round-trip validation for AAF/OMF/XML/EDL/OTIO

Exit bar:

- Finishing outputs and turnovers are validated against external tools

### Phase 6: Close media-management and facility workflows

Objective:

- Make the system safe for real teams and real media

Deliverables:

- Relink review UI
- Consolidate/transcode policy
- Shared storage and locking model
- Facility diagnostics and background services

Exit bar:

- Assistant-editor and post-supervisor workflows are supportable end to end

### Phase 7: Close plugin, governance, and release readiness

Objective:

- Make the platform shippable and maintainable

Deliverables:

- Plugin/runtime ABI
- CI parity gates
- Migration policy
- Crash/telemetry/release controls
- Enterprise permissions/audit controls

Exit bar:

- The product can be shipped and maintained as a serious professional tool

## Codex Prompts For Production-Ready Delivery

These prompts are written to drive implementation, not just more scaffolding.

### Prompt 1: Capability matrix and shared workflow contract

```text
Audit the current desktop, web, and mobile editor surfaces and implement a capability-driven workflow contract in @mcua/core.

Requirements:
- Define a typed capability matrix for desktop, browser, and mobile covering monitor behavior, timeline editing, GPU/rendering, hardware I/O, interchange, plugins, and collaboration.
- Add a shared workspace contract that classifies every workflow as shared, degraded, or desktop-only.
- Update desktop, web, and mobile shells to consume that contract instead of hardcoded product-scope assumptions.
- Add tests proving each surface exposes only the workflows allowed by the capability matrix.
- Update docs/ARCHITECTURE.md and docs/NLE_MODERNIZATION_PROGRAM.md.

Do not stop at types. Wire the contract into the actual app shells and add coverage.
```

### Prompt 2: Editorial-core acceptance suite

```text
Implement a production-grade editorial parity suite for Media Composer-style workflows and close any failing behaviors in the editor.

Requirements:
- Audit overwrite, splice-in, replace, lift, extract, trim modes, slip, slide, sync locks, track targeting, patching, markers, match frame, and source/record monitor behavior.
- Implement missing or inconsistent behavior in the editor store, edit engine, trim engine, track patching engine, and monitor actions.
- Add acceptance tests for the top twenty editorial workflows, including keyboard-first paths and undo/redo semantics.
- Ensure desktop and web share the same editorial behavior contract where supported.
- Update docs/AVID_PARITY_MATRIX.md and docs/PHASE_EXECUTION_STATUS.md.

Do not leave placeholder behaviors. Ship deterministic implementations with tests.
```

### Prompt 3: Real desktop media engine

```text
Replace the current desktop parity scaffolds for decode, compositing, and realtime playback with a real workstation media runtime.

Requirements:
- Implement a codec-backed decode session manager in apps/desktop that resolves media variants, preroll, and frame/audio requests against real assets.
- Replace manifest-only compositing with a GPU-oriented render graph that can drive record monitor, source monitor, scopes, multicam, and export from the same compiled graph.
- Implement a realtime transport scheduler with dropped-frame telemetry, preroll, multi-stream support, and cache-aware quality levels.
- Keep @mcua/core parity contracts stable, but upgrade the desktop implementation from scaffolding to real runtime behavior.
- Add integration tests and benchmark fixtures for seek, preroll, playback, and paused-frame parity.
- Update docs/NLE_PARITY_GAP_ARCHITECTURE.md and docs/MEDIA_ENGINE_ARCHITECTURE_BRIEF.md.

Do not only add manifests or synthetic handles. Implement the real runtime path and tests around it.
```

### Prompt 4: Multichannel audio and Pro Tools parity

```text
Implement production-grade audio editorial and turnover support, including multichannel/containerized audio.

Requirements:
- Extend the shared project/media model to represent channel layouts, channel assignments, split tracks, and containerized production audio.
- Implement desktop audio mix compilation with buses, sends, automation, EQ/dynamics insertion points, preview rendering, and loudness analysis based on real media metadata.
- Ensure ingest, timeline track derivation, monitoring, export, and interchange preserve mono, stereo, dual mono, 5.1, and 7.1 layouts correctly.
- Upgrade Pro Tools turnover support so AAF/OMF handoff is validated with channel mapping and audio-role metadata.
- Add unit and integration tests for ingest, edit, preview, export, and interchange of multichannel assets.
- Update docs/AVID_PARITY_MATRIX.md and docs/NLE_MODERNIZATION_PROGRAM.md.

Do not simulate loudness or bus layouts. Implement real behavior from asset metadata through export.
```

### Prompt 5: Multicam and monitor fidelity

```text
Implement production-grade multicam editing on top of the desktop playback/runtime stack.

Requirements:
- Build synced multiview playback using the real transport/compositor path.
- Add angle-audio policies, cut recording, refinement editing, matchback, and commit-to-program-track workflows.
- Ensure source/record/multicam monitors share one timing and evaluated-frame contract.
- Add telemetry and tests for angle sync, transport stability, dropped frames, and cut accuracy.
- Update the editorial UI so multicam feels native to the main editor instead of a bolt-on tool.
- Update docs/AVID_PARITY_MATRIX.md and docs/PHASE_EXECUTION_STATUS.md.

Do not stop at backend grouping APIs. Deliver the actual editorial workflow and coverage.
```

### Prompt 6: Hardware video I/O and deck control

```text
Turn the existing desktop video I/O and deck-control surfaces into real editorial workflows.

Requirements:
- Audit apps/desktop main, preload, and renderer code for video I/O and deck control.
- Implement external playback/output routing from the real transport/compositor path, including confidence monitoring and format/state diagnostics.
- Implement capture/logging and source-monitor ingest flows tied to deck control and timecode where supported.
- Add capability detection, failure handling, and UI state for unavailable devices or unsupported formats.
- Add integration tests around device enumeration, transport attachment, error handling, and output/capture lifecycle.
- Update docs/ARCHITECTURE.md and docs/NLE_MODERNIZATION_PROGRAM.md.

Do not leave these as standalone IPC endpoints. Integrate them into real editorial workflows.
```

### Prompt 7: Interchange and external-tool validation

```text
Upgrade interchange from disk-backed package generation to validated professional handoff.

Requirements:
- Improve AAF, OMF, XML, EDL, and OTIO export fidelity from the shared sequence snapshot and resolved media graph.
- Add import and round-trip validation fixtures against external sample packages where possible.
- Record exact sequence revision, media resolves, and validation warnings in exported artifacts.
- Ensure relink metadata, reel/timecode, markers, audio layouts, and change-list outputs survive round trip correctly.
- Add integration tests for export, import, validation, and change-list workflows.
- Update docs/NLE_PARITY_GAP_ARCHITECTURE.md and docs/AVID_PARITY_MATRIX.md.

Do not stop at artifact existence checks. Validate content fidelity and round-trip behavior.
```

### Prompt 8: Facility workflow, plugin ABI, and release readiness

```text
Close the remaining production-readiness gaps for a professional editorial product.

Requirements:
- Implement media-management workflows for relink review, consolidate/transcode policy, shared-storage semantics, and locking behavior.
- Define and implement a plugin/runtime ABI that separates browser-safe preview plugins from desktop-native processing plugins.
- Add migration/versioning policy for project schema evolution.
- Add CI gates for type-check, parity acceptance tests, benchmark regressions, and critical desktop integration tests.
- Document release readiness, crash/telemetry expectations, and operational ownership.
- Update docs/PRODUCTION_READINESS.md and docs/NLE_MODERNIZATION_PROGRAM.md.

Do not treat this as documentation only. Land the runtime and test infrastructure needed to enforce the release bar.
```

## Recommended Next Move

If this effort is explicitly a modernization and unification of Media Composer, the next implementation step should be:

1. Lock the cross-surface capability/workspace contract.
2. Finish editorial-core acceptance tests.
3. Replace the desktop media-engine scaffolds with a real decode/composite/playback runtime.

That order matters because without it, the team will keep shipping panel-level improvements on top of an unstable parity foundation.
