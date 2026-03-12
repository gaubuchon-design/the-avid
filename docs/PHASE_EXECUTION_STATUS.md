# Phase Execution Status

This file tracks the first concrete execution slices of the NLE modernization program.

## Current State

- `Phase 0: Program Reset` is in progress.
- `Phase 1: Editorial Alpha` has cleared its last open editorial behavior contract in the shared shell; remaining execution focus now shifts toward desktop media-runtime depth.
- `Phase 2: Desktop Media Runtime` is in progress.
- `Phase 3: Audio Parity` is in progress with layout-aware bussing, send topology, preview metering, and stricter Pro Tools turnover diagnostics now landed.

## Started In This Pass

### Phase 0

- Added a formal modernization program and UI/UX refactor plan.
- Consolidated the editor shell around a workbench bar and URL-backed page/workspace state.
- Added a phase execution status file so delivery can be tracked in-repo.
- Landed a shared cross-surface editorial experience contract in `@mcua/core` so desktop, browser, and mobile can consume one capability/workspace policy instead of drifting on hardcoded defaults.
- Wired project creation and default workspace selection through that shared contract for shared desktop/web and mobile companion surfaces.

### Phase 1

- Restored keyboard parity for core editorial actions already defined in the keyboard engine:
  - splice-in
  - overwrite
  - lift
  - extract
  - mark clip / clear mark / go to mark
  - previous/next edit point
  - trim mode entry
  - play/stop and frame-step aliases
- Added parity tests around overwrite, splice-in, sync-lock compensation, and patched-target editing behavior.
- Hardened synchronization between `TrackPatchingEngine` and editor store state so target-track and sync-lock logic do not drift.
- Surfaced target-track, sync-lock, and trim state in the editor status bar.
- Synced `TrimEngine` session state into the editor store so the shell reflects real roll/ripple trim sessions.
- Made trim entry and edit-point navigation safer when no explicit target tracks are enabled.
- Promoted trim frame counters and roller-side state into shared editor state so monitor/composer feedback stays aligned with the engine.
- Added monitor-visible trim HUD feedback for record/program monitoring and deeper acceptance tests for ripple, overwrite-trim, and asymmetric trim workflows.
- Wired smart-tool toggles into the actual engine/store state path and exposed them in the timeline toolbar.
- Replaced body drag fallbacks with real overwrite/splice segment moves, including undo coverage and acceptance tests for segment drag parity.
- Consolidated editor keyboard routing so the editor owns monitor-aware shortcuts while the keyboard engine retains the Avid keymap for the remaining actions.
- Added monitor-aware keyboard action handlers for source-vs-record marks, transport, match-frame conflict handling, and trim-side frame nudging.
- Extended smart-tool trim parity from explicit trim handles into clip-body edge hit-testing so overwrite, ripple, and roll trim drags enter real trim sessions.
- Expanded track-patching telemetry with monitored video-track state, source-to-record patch labels, and a monitor selector in track headers.
- Added acceptance tests for monitor-aware keyboard actions, `F`/`S` routing regressions, and expanded track-patching snapshots.
- Added a concrete media-engine architecture brief with playback, cache, and export targets to anchor the next engine workstream.
- Made trim-mode and smart-tool trim drags undoable by recording completed trim sessions into the edit history while keeping canceled sessions out of history.
- Closed the track-patching persistence decision by storing enabled record tracks, sync locks, monitored video track, selected bin, and source asset in the project model.
- Replaced route-only project IDs with real repository hydration and autosave so editor state now loads from and writes back to project storage.
- Added rendered parity coverage for monitored-track switching alongside direct load/save persistence tests.
- Persisted the remaining workstation shell state that was still resetting on open: subtitle tracks, title clips, track heights, workspace/layout choices, tracking-info toggles, clip text display, and dupe-detection state.
- Added explicit save-state affordances on top of autosave in the workbench shell, including dirty-state visibility, a manual save action, `file.save`, and manual checkpoint creation.
- Promoted collaboration versions from placeholder metadata to real editor snapshots by capturing serialized project state for manual versions and restoring those snapshots back into the editor store.
- Expanded rendered parity coverage into trim HUD overlays, selected-clip shell feedback, and mounted keyboard-first split editing via the global editor keyboard hook.
- Persisted source-to-record patch maps and source-track descriptors in the project model so custom patch routing now survives load, autosave, and manual checkpoints.
- Hardened the track patch panel so restored patch maps are not clobbered by the panel's source-asset auto-patch effect when a project or checkpoint is reopened.
- Added rendered collaboration-panel restore coverage so the versions UI now proves real restore flows and clearly disables the older non-restorable demo entries.
- Introduced the first concrete playback snapshot contract in code and moved both record-monitor render paths onto that shared evaluated frame snapshot.
- Moved the color scopes panel onto real playback snapshot image data instead of placeholder graticules so scope consumers now analyze the same evaluated frame contract as the monitors.
- Replaced hard-coded export selection numbers with real sequence, In/Out, and selected-clip ranges, and fed export summary preview metadata from the shared playback snapshot contract.
- Expanded version history beyond bare restore buttons with named restore-point metadata, retention labels, snapshot summaries, and compare deltas against the previous saved state.
- Added rendered parity coverage for source/record monitor focus transitions and version-history affordances beyond the restore action itself.
- Fed shared playback snapshot references directly into export jobs so queued exports now retain selection/range metadata, preview clip context, and paused-frame parity identifiers.
- Added paused-frame parity assertions between export snapshots and record-monitor snapshots so delivery paths can prove they are referencing the same evaluated frame state.
- Replaced inline track-patch source derivation with explicit metadata-aware rules for audio-only, still-image, stereo video, and multichannel sources.
- Persisted version-history retention and compare-mode preferences in project workstation state so load/save cycles keep the same collaboration review posture.
- Expanded version history from summary deltas into detailed snapshot-backed compare metrics for workspace, composer, selected bin, target tracks, sync locks, and editorial counts.
- Moved audio layout inference upstream into media probing and asset metadata so track derivation can prefer explicit layout descriptors over codec-string fallbacks.
- Added shared evaluated-frame revisions and paused-frame caching so scopes, export previews, and paused monitor renders can resolve the same deterministic snapshot output.
- Wired scope pre/post analysis through the shared playback-frame helper so the scopes panel now evaluates pre-grade and post-grade frames instead of only raw composited frames.
- Promoted export jobs from snapshot metadata only to snapshot-backed rendered preview frames with shared render revisions, so delivery jobs now capture a real evaluated frame artifact alongside their selection metadata.
- Updated the color scopes panel render path to sample live record-monitor canvases and run post mode through `ColorEngine.processFrame(...)`, with deterministic fallback frames when monitor pixels are unavailable.
- Captured this pass's implementation note: pre/post scopes now degrade gracefully with deterministic fallback frames when monitor sampling is unavailable during panel evaluation.
- Pushed browser-supported export jobs from still-preview parity into actual sequence frame stepping by rendering shared playback snapshots frame-by-frame into real WebM recordings, with per-job recorder ownership, frame counts, and cancellable runtime cleanup.
- Extended browser export from silent canvas capture to audio-aware muxed WebM by allowing explicit audio sources (MediaStreams or capturable media elements), mixed gain staging, and muxed-track telemetry on each export job.
- Added explicit encoder handoff metadata for non-WebM presets so browser-captured WebM artifacts now carry target container/codec intent for downstream transcode workers.
- Added export-engine tests proving audio-source forwarding/mux metadata and non-WebM handoff metadata generation for canvas-based exports.
- Executed the non-WebM handoff path in desktop by adding an FFmpeg-backed transcode endpoint that receives frame-stepped WebM artifacts over Electron IPC and emits requested container/codec outputs to desktop export storage.
- Extended export engine frame-stepped behavior so non-WebM presets now use desktop transcode handoff when available, and added coverage for this renderer-to-desktop handoff flow.
- Extended shared graded-frame rendering from paused-only monitor paths into active transport by routing realtime record/program monitor draws through `renderPlaybackSnapshotFrame(..., colorProcessing: 'post')` with cache disabled while playing.
- Hardened realtime transport rendering fallback so post-grade readback failures now degrade to pre-color compositing instead of dropping monitor frames, and added parity coverage for the fallback behavior.
- Replaced source-track audio-layout fallback heuristics with FFprobe-backed ingest metadata by persisting `channel_layout` in desktop technical metadata and teaching source-track derivation to prefer `technicalMetadata` channel/layout descriptors when flattened browser probe fields are absent.
- Added phase-1 derivation coverage proving desktop-ingested assets with FFprobe metadata resolve multichannel source tracks without codec-string-only inference.
- Persisted collaboration version-history entries into the shared project repository schema (`versionHistory`) and wired collab save/restore flows to capture editor-state snapshots, hydrate persisted histories on connect, and record automatic restore points before restores.
- Split playback snapshot compositing into explicit picture and overlay stages so scopes can lock to pre-overlay image analysis while export render paths opt into post-overlay output intentionally.
- Extended evaluated-frame revision metadata and export job telemetry to track overlay-stage selection (`pre` vs `post`) alongside color-stage processing, with parity tests for revision invalidation and frame-step export wiring.
- Added transport-time pre-color degradation telemetry to the shared playback render path and surfaced cumulative fallback diagnostics in record/program monitors plus the scopes header so realtime grade fallback frequency can be measured during active playback.
- Routed desktop drag/drop ingest through the same FFprobe-backed desktop import path as file-based ingest by expanding dropped directories server-side, persisting imported assets into project bins, and teaching the bin drop target to prefer desktop `importMedia(...)` when native paths are available.
- Added repository-backed collaboration version-history hydration/persistence coverage in the collab store so saved restore points are persisted to `project.versionHistory` and restored on reconnect/reopen cycles.
- Closed the remaining desktop ingest parity gap by routing BinPanel file-picker imports through desktop `openFile(...)` + `importMedia(...)` when Electron is available, then reloading the persisted project from repository storage.
- Hardened web-load repository hydration by ignoring stale `loadProject(...)` responses when project switches race, and persisted restored collaboration snapshots immediately so reopened projects reflect restored timeline/shell state without depending on autosave timing.
- Added phase-1 hydration coverage proving (a) latest web-load repository payload wins over late stale responses and (b) restored collaboration snapshots survive reopen via repository persistence.
- Wired collaboration connect/disconnect lifecycle into the editor shell so collab sessions now auto-connect on project open and cleanly disconnect on project switches/unmount without manual store calls.
- Added focused hook coverage for auto-connect on open, session switch reconnect, `new`/unset project disconnect, and unmount cleanup.
- Hydrated collaboration identity from authenticated user profile during auto-connect (name/avatar), and propagated that identity into comment authorship, version `createdBy`, and collaboration activity labels.
- Hardened collaboration user presence updates to avoid mutating frozen state references by replacing in-place user mutations with immutable map writes.
- Surfaced authenticated collaboration identity in UI affordances that previously used placeholder initials by rendering avatar-aware identity chips in version cards, activity feed rows, and panel header online-user stacks.
- Added phase-1 UI coverage that asserts authenticated avatar rendering in version and activity views.
- Extended authenticated identity avatar rendering into users-tab rows and comment/reply threads so all major collaboration surfaces now show consistent profile identity instead of placeholder initials.
- Expanded phase-1 UI coverage with users-tab and comment-thread avatar assertions for authenticated identity paths.
- Persisted and hydrated rich version-author profile metadata (`userId`/display name/avatar/color) in repository-backed version history so non-current collaborators render stable identity after reopen.
- Updated collaboration version cards to prefer persisted author profiles over current-user-only avatar inference, and added Phase-1 coverage for non-current user avatar rendering from hydrated version entries.
- Added explicit collab `identityProfiles` hydration/merge in the collaboration store so identity metadata now resolves from online users, threaded comment/reply authors, activity authors, version author profiles, and persisted project collaborators.
- Propagated `userId` into collaboration activity entries and updated Comments/Activity avatar resolution to prefer hydrated identity profiles over current-user-only fallbacks.
- Added store/UI coverage that asserts persisted collaborator identity profiles hydrate non-current comment/activity authorship paths and render stable avatars/colors.
- Persisted and hydrated collaboration threaded comments and activity-feed entries in repository project schema (`project.collaboration`), with connect-time restoration and mutation-time saves for reconnect/reopen continuity.
- Persisted and hydrated collaboration presence snapshots in repository project schema (`project.collaboration.presenceSnapshots`), including online/offline state plus cursor/playhead metadata for reconnect/reopen continuity.
- Wired active editor navigation into collaboration presence snapshots by syncing current-user playhead and selected track focus through the collaboration store, with throttled editor-state subscription updates and repository persistence coverage.
- Surfaced collaborator track-focus badges directly in timeline track headers from hydrated presence snapshots, including playhead timecode context and online/offline badge state.
- Added rendered phase-1 coverage that asserts timeline track headers show collaborator presence badges for hydrated track-focus snapshots.
- Rendered collaborator playhead indicators directly in timeline ruler/canvas space from hydrated presence snapshots, with playhead-time and cursor-frame fallback parity for online/offline collaborators.
- Added rendered phase-1 coverage for collaborator playhead indicator placement and label/timecode output across ruler/canvas overlay coordinates.
- Added click-to-follow interactions on collaborator timeline playhead indicators so clicking an indicator now parks the local playhead at that collaborator position and focuses their active track.
- Expanded phase-1 coverage to assert clickable collaborator playhead indicators update local playhead and selected-track focus.
- Added keyboard follow parity for collaborator timeline playhead indicators so Enter/Space activation now routes through the same follow path as click interactions.
- Updated collaborator playhead accessibility labels to explicit playhead-follow semantics and expanded phase-1 coverage for Enter/Space follow activation.
- Added roving-keyboard navigation parity for collaborator playhead indicators so ArrowLeft/ArrowRight traverses indicator focus in timeline order while preserving Enter/Space follow activation.
- Expanded phase-1 coverage for collaborator playheads to assert roving tab-stop behavior and ArrowLeft/ArrowRight focus traversal before keyboard follow activation.
- Added Home/End keyboard parity for collaborator playhead indicators so focus now jumps directly to the first/last indicator while preserving roving behavior and Enter/Space follow activation.
- Expanded phase-1 coverage for collaborator playheads to assert Home/End first/last tab-stop transitions in addition to ArrowLeft/ArrowRight traversal and keyboard follow.
- Preserved collaborator playhead roving focus through live presence churn by retaining the active indicator when collaborators join/reorder and resolving nearest surviving indicator focus when the active collaborator leaves.
- Expanded phase-1 collaborator playhead coverage with live join/leave/reorder churn assertions for retained roving tab-stop behavior and nearest-indicator fallback.
- Preserved DOM keyboard focus continuity when the active collaborator playhead indicator disappears by reassigning roving focus to the resolved nearest fallback indicator without requiring an extra Tab cycle.
- Expanded phase-1 collaborator playhead coverage to assert focus-transfer behavior when the active indicator is removed during live presence churn.
- Preserved Escape-key keyboard exit parity for collaborator playhead roving focus by clearing the active roving indicator and restoring first-indicator tab-stop entry behavior on the next Tab cycle.
- Expanded phase-1 collaborator playhead coverage with Escape-key assertions that reset roving tab-stop ownership back to the first indicator before keyboard follow activation resumes.
- Aligned the store-level `matchFrame()` path with the richer monitor action flow so match frame now resolves the topmost active media layer, loads the source monitor, sets source time from timeline context, and focuses the source monitor instead of only swapping the asset reference.
- Clamped store-level `slipClip()` and `slideClip()` operations to real source-handle and neighbor-boundary limits so editorial trims preserve clip duration, source continuity, and adjacent track boundaries.
- Added focused Phase 1 coverage for store-driven match-frame, slip, and slide behavior alongside the existing monitor keyboard parity suite.
- Routed store-level `liftSelection()` and `extractSelection()` through `EditOperationsEngine` instead of ad hoc timeline filtering so segment edits now follow the same editorial math and history model as the rest of the editor.
- Made segment lift/extract actions undoable through `EditEngine` snapshot restores, including selection restoration on undo/redo so keyboard-first segment editing behaves like a real NLE operation instead of a one-way state mutation.
- Hardened segment lift/extract to respect locked tracks and clear stale inspected-clip state when affected clips are removed, with new store and Phase-1 acceptance coverage for ripple-vs-filler segment behavior.
- Added undoable marked-range `lift` and `extract` actions in the editor store that delegate to the primary edit engine, so record `IN/OUT` edits now behave like real editorial operations instead of falling back to selection-only segment removal.
- Updated keyboard routing on the main editor page so `Z`/`X` prefer marked-range lift/extract when record marks are present and fall back to selected-segment lift/extract when they are not.
- Made mark-clear and go-to-mark keyboard behavior active-monitor aware, so source-monitor mark clearing/jumping no longer mutates record marks or timeline playhead state, and vice versa.
- Tightened edit-point navigation so it now ignores locked or muted tracks even when they remain enabled, with fresh store and Phase-1 coverage for enabled-track navigation edge cases.
- Moved `Mark Clip` onto the same active-monitor routing model so source monitor keyboard marking now marks the loaded source clip while record monitor keyboard marking still resolves the timeline clip under the playhead.
- Hardened `saveProject()` against repository adapters that return no saved payload by falling back to the locally built project snapshot, eliminating the pre-existing non-failing persistence error during Phase 1 restore/save coverage.
- Added focused persistence coverage for the save fallback path and expanded monitor-action coverage for source-vs-record clip-mark, clear-mark, and go-to-mark behavior.
- Centralized `Lift`/`Extract` intent policy in the editor store so full record marks take precedence over selected segments, while partial record marks now block the edit instead of silently falling back to selection-based removal.
- Removed page-local `Lift`/`Extract` precedence logic so keyboard routing now consumes one shared editorial rule instead of duplicating mark-vs-selection decisions in the page shell.
- Added focused store coverage for partial-mark edge cases to prove that one-sided record marks do not trigger destructive segment edits.
- Introduced a shared `resolveEditorialFocusTrackIds(...)` helper so next/previous edit, trim-mode entry, and record-monitor `Mark Clip` all resolve the same focus order: selected editable track, enabled editable targets, monitored video track, then all editable tracks.
- Added focused helper/store coverage for the shared editorial focus policy and a desktop renderer smoke test proving `@mcua/desktop` boots the same dashboard/editor route contract used by the browser shell.

### Phase 2

- Replaced the desktop decode path's manifest-only behavior with file-backed frame and audio artifacts, using new media-pipeline helpers that materialize decoded still frames, decoded audio slices, and composite frame artifacts into project-local cache directories.
- Taught the desktop decode adapter to persist decoded video/audio artifact metadata in session manifests and to reuse cached artifacts for repeated frame/slice requests instead of treating every request as a synthetic handle-only decode.
- Taught the desktop compositor to resolve active timeline layers, materialize their frame artifacts, and render a file-backed composite artifact for the requested monitor target rather than only recording a render request manifest.
- Updated desktop realtime playback telemetry to derive decode/composite latency from actual decode/composite artifact work and to persist the last decoded/composited artifact paths in playback transport manifests.
- Added desktop runtime coverage proving cached decode/composite reuse, file-backed decode/composite artifacts, and transport-manifest artifact telemetry in the parity runtime test suite.
- Added a real `SharedArrayBuffer` playback frame transport per desktop playback session, fed from the same composite artifact path that powers the new compositor runtime instead of a separate preview-only path.
- Added desktop playback-output attachment so the runtime can hand the same composite-derived BGRA buffer to external device playback bindings while still writing it into the shared transport for renderer-side consumption.
- Added explicit desktop cache invalidation hooks for decode/render playback caches so revision-driven runtime refresh can clear project-local cache state instead of accumulating stale composite artifacts indefinitely.
- Wired the desktop parity playback runtime into the actual Electron app through a dedicated main-process manager that binds live editor projects to project-package paths, creates playback transports over IPC, and routes external playback through the existing `VideoIOManager`.
- Exposed the parity playback transport and control surface through the desktop preload bridge so the renderer can create transports, attach streams, preroll/start/stop playback, inspect telemetry, and attach or detach external output devices without inventing a second desktop playback API.
- Added a desktop renderer transport reader that decodes the shared playback `SharedArrayBuffer` directly in the renderer and chooses the newest written slot by timestamp, which makes the parity runtime consumable from the desktop shell without copying frame payloads through IPC.
- Added desktop coverage for the new main/renderer seam, including manager-level transport/output tests and renderer-side transport-reader tests on top of the existing runtime tests.
- Wired the shared record/program monitor canvases onto the desktop parity playback bridge when running in Electron, so the desktop shell now prefers parity-runtime frames for monitor drawing while the browser shell keeps its existing canvas/video path.
- Added transport-release plumbing across the desktop runtime, manager, preload bridge, and shared shell so monitor-driven transport recreation does not accumulate stale decode/composite state in the main process.
- Added focused web coverage proving the shared monitor hook creates a parity transport, attaches the active program streams, draws the returned frame into the monitor canvas, and releases the transport on unmount.
- Replaced the desktop parity playback control path with a real continuous scheduler in the runtime, so one playback transport can keep feeding renderer monitors and external outputs across successive frames instead of depending on repeated one-frame `start(...)` calls.
- Split the shared desktop monitor hook into transport configuration, playback control, and RAF-driven frame readback, which removes repeated transport setup churn on small playhead drift while keeping paused-frame scrubbing on the explicit one-shot render path.
- Added focused coverage proving continuous desktop playback starts once, keeps drawing new transport frames without restarting the transport, and only issues explicit resync calls on meaningful playhead jumps.
- Added manager-level coverage proving the desktop playback scheduler forwards more than one frame to attached output bindings during continuous playback.
- Added adaptive transport policy on top of the continuous desktop scheduler, so playback now derives frame budget, stream pressure, quality level, and cache strategy from actual transport conditions instead of treating every session as a fixed full-quality path.
- Added opportunistic lookahead promotion into decode/composite caches for upcoming frames, which lets heavier multistream playback trade storage and background work for better continuity on future frames.
- Expanded shared playback telemetry with current quality, cache strategy, stream pressure, frame budget, last-frame render latency, cache-hit rate, and promoted-frame counts, and persisted the same policy data into playback transport manifests.
- Hardened transport shutdown so in-flight scheduler and promotion tasks are awaited during stop/release, preventing background playback work from outliving a released transport.

### Phase 3

- Added a shared normalized audio-channel-layout helper in `@mcua/core` so ingest, audio mix compilation, and Pro Tools turnover can reason about the same `mono` / `stereo` / `5.1` / `7.1` layouts instead of drifting on raw strings.
- Tightened core project/media typing so ingested `technicalMetadata.audioChannelLayout` is preserved as a normalized layout value rather than an arbitrary label.
- Upgraded desktop audio mix compilation to derive bus layout, channel count, dominant layout, source layouts, and containerized-audio state from the bound project instead of assuming every mix is stereo.
- Upgraded desktop audio preview manifests and loudness analysis to carry layout/channel-count context and explicit warnings when containerized multichannel audio is present.
- Expanded desktop audio turnover manifests with project-, track-, and clip-level channel-layout metadata so downstream turnover tools have enough information to preserve multichannel assignments.
- Upgraded `ProToolsAAFExporter` so track and clip channel assignment are derived from asset layout metadata, and turnover validation now flags mixed-layout tracks and multichannel clips that are missing layout metadata.
- Added focused core and desktop coverage for channel-layout normalization, multichannel Pro Tools turnover, reference-runtime surround mix compilation, and surround-aware desktop mix/turnover artifacts.
- Added a shared audio-mix topology model in `@mcua/core` so reference and desktop runtimes now compile the same bus roles, send targets, printmaster path, fold-down path, and routing warnings.
- Upgraded desktop audio preview artifacts from flat stem lists into routing-aware manifests with send topology, monitoring/printmaster routing, and per-bus metering snapshots.
- Expanded loudness analysis to report per-bus measurements and routing diagnostics instead of only one aggregate LUFS/true-peak result.
- Deepened desktop turnover artifacts so `audio-turnover.json` now includes bus topology and `protools-turnover.validation.json` includes source-path, resample, and summary diagnostics.
- Added focused topology/export coverage proving printmaster and fold-down routing, richer preview metering manifests, and stricter Pro Tools turnover validation.
- Added explicit automation-mode tracking to compiled mixes so track-level writes now promote `read` state into `touch`/`latch`/`write` modes in the shared parity model instead of remaining out-of-band runtime state.
- Added per-bus insert-chain metadata for EQ, dynamics, limiter, meter, and fold-down stages, and threaded that processing metadata through the shared topology model, preview manifests, and turnover manifests.
- Deepened Pro Tools turnover diagnostics with head/tail handle shortfall warnings and desktop-side facility-policy enforcement for printmaster/fold-down bus presence plus required processing stages.
- Added explicit preview-vs-print processing policy to bus insert stages so interactive preview and turnover/export can now describe different active processing chains without inventing a second audio model.
- Added assistant-editor turnover checklist output plus stem-role metadata in `audio-turnover.json`, and validated those checklist/stem-role requirements in desktop Pro Tools turnover diagnostics.
- Added a shared audio-processing-policy summary helper so reference and desktop runtimes now agree on which stages are active, bypassed, preview-only, or print-only on every bus.
- Upgraded audio preview artifacts to include print-reference measurements and per-bus processing-policy deltas, so monitor-path loudness can now be compared directly against the print path.
- Added richer assistant-editor handoff artifacts with sign-off status, recommended actions, processing-intent summaries, and facility-policy rollups for turnover review.
- Added a shared execution-policy summary so each bus now resolves to a concrete preview mode (`direct-monitor` or `buffered-preview-cache`) and print mode (`live-print-safe` or `offline-print-render`).
- Desktop audio preview now writes buffered preview-cache artifacts and an execution-plan manifest whenever the live monitor path cannot safely represent the print chain.
- Desktop AAF/OMF turnover now writes an `audio-processing.execution-plan.json` plus per-bus print-render artifacts for buses that require offline print rendering, and includes those paths in assistant-editor handoff output.
- Desktop playback transports now invoke the audio preview path directly during monitor playback, persisting monitor-audio preview state and buffered preview-cache artifacts into the transport manifest instead of leaving that path export-only.
- The shared desktop monitor hook now consumes transport-side audio preview state, publishes per-monitor buffered-preview status into editor state, and surfaces a restrained monitor diagnostics badge when desktop playback is running on buffered audio preview caches.

## Next Execution Slices

1. Deepen Phase 3 from monitor-preview diagnostics into fuller audio workflow behavior: tighten stem-delivery/facility policy, drive explicit preview-vs-print execution choices deeper into desktop monitoring/export behavior, and promote assistant-editor handoff into explicit approval gates.

## Exit Signals For These Early Phases

- Phase 0 moves forward when the shell/navigation model and delivery cadence are stable enough for sustained iteration.
- Phase 1 moves forward when core editorial verbs and keyboard paths are consistently testable and trustworthy.
