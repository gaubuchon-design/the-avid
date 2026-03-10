# Phase Execution Status

This file tracks the first concrete execution slices of the NLE modernization program.

## Current State

- `Phase 0: Program Reset` is in progress.
- `Phase 1: Editorial Alpha` is in progress.

## Started In This Pass

### Phase 0

- Added a formal modernization program and UI/UX refactor plan.
- Consolidated the editor shell around a workbench bar and URL-backed page/workspace state.
- Added a phase execution status file so delivery can be tracked in-repo.

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

## Next Execution Slices

1. Push export parity beyond rendered preview frames into actual sequence frame stepping and encoded output generation.
2. Extend the shared graded-frame path from paused monitor renders into reliable realtime playback/fallback behavior during transport.
3. Replace browser-side audio layout heuristics with real media-agent/FFprobe metadata when the ingest path is available.
4. Persist actual version-history entries and restore points into project or collaboration backends instead of runtime-only session memory.
5. Split picture grading from title/subtitle/safe-zone overlays so scopes and export can choose pre-overlay vs post-overlay analysis explicitly.

## Exit Signals For These Early Phases

- Phase 0 moves forward when the shell/navigation model and delivery cadence are stable enough for sustained iteration.
- Phase 1 moves forward when core editorial verbs and keyboard paths are consistently testable and trustworthy.
