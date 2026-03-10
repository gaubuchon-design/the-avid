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
- Persisted collaborator identity metadata in collab store state (keyed by user id/name), hydrated those profiles from repository-backed version history and live presence, and threaded activity entries with `userId` metadata.
- Updated comment/reply and activity-feed avatar resolution to use hydrated collaborator identity profiles so reopened projects keep non-current collaborator avatars beyond version cards.
- Expanded Phase-1 coverage for activity `userId` metadata persistence and non-current collaborator avatar rendering in comment/reply threads plus activity rows via hydrated identity profiles.
- Added explicit reaction-actor profile metadata (`userId`/display name/avatar/color) to collaboration reactions and synchronized that metadata through reaction add/remove flows.
- Hydrated collab identity profiles from reaction actor metadata (with `userIds` fallback) so non-current reaction participants can still resolve identity across reconnect/reopen flows where full live presence is unavailable.
- Extended reaction UI tooling with actor-name-aware reaction labels/tooltips and added Phase-1 coverage for reaction actor identity rendering and store-level reaction actor metadata capture.
- Persisted collaboration comment threads (including replies, reactions, and reaction actor profiles) into project repository data under `collaborationComments`, and hydrated those threads on collab connect/reopen.
- Added engine-level comment hydration (`hydrateComments(...)`) and unified collab-state repository saves so comment mutations and version-history writes persist together for reopen/reconnect parity.
- Expanded store coverage for repository-backed comment hydration and reaction persistence so reopened projects retain review-thread context and non-current reaction identity metadata.
- Persisted collaboration activity-feed entries into project repository data under `collaborationActivityFeed`, and hydrated that feed on collab connect/reopen so chronological collaboration context survives reloads.
- Extended unified collab-state repository saves to include activity feed snapshots alongside version history and comment-thread state for reopen/reconnect parity.
- Expanded store coverage for repository-backed activity-feed hydration/persistence so saved collaboration actions retain actor metadata (`userId`/name/action/detail) across project reloads.
- Added explicit collaboration activity retention preferences (`preset` + `autoPrune`) in collab state with local preference persistence, policy-driven feed pruning, and a dedicated `setActivityRetentionPreferences(...)` action.
- Persisted/hydrated collaboration activity retention preferences in repository project data (`collaborationActivityRetentionPreferences`) so reopen/reconnect cycles preserve the same activity history policy.
- Replaced the hardcoded activity-feed cap with policy-based pruning (`keep-all`/`last-25`/`last-50`/`last-100`) and expanded store coverage for retention hydration, pruning behavior, and retention preference persistence.
- Surfaced collaboration activity retention controls directly in the collaboration panel activity tab (preset selector + auto-prune toggle) so editors can manage history policy from UI without direct store/API calls.
- Wired activity-tab retention controls to live store updates via `setActivityRetentionPreferences(...)`, including immediate feed-prune feedback and current-entry count visibility in the panel.
- Expanded phase-1 UI coverage to assert activity-tab retention control interactions update store retention preferences and prune activity entries as expected.
- Added project-scoped collaboration panel preference persistence (`collaborationPanelPreferences`) covering active tab, comment filter, activity action filter, and activity search query.
- Hydrated collaboration panel review-context preferences on connect/reopen and wired tab/filter/search UI actions to persist those preferences immediately via repository-backed collab state saves.
- Expanded store and phase-1 UI coverage for collaboration panel preference hydration/persistence and activity action-filter control behavior so reopen cycles restore the same review context.
- Surfaced restored activity review context in the collaboration panel activity header with active summary chips for action-filter, search query, and shown/total result count.
- Added phase-1 UI coverage asserting persisted activity filter/search state renders the expected restored context chips and filtered count after reopen hydration.
- Surfaced restored comments review context in the collaboration panel comments tab with summary indicators for active filter and shown/total thread count.
- Added phase-1 UI coverage asserting persisted comment-filter state renders restored comments context indicators and expected filtered thread counts.
- Extended project-scoped collaboration panel preferences to persist version-history review controls (`versionHistoryRetentionPreference` + `versionHistoryCompareMode`) alongside tab/filter/search context.
- Hydrated persisted version-history review controls on collaboration reconnect/reopen and applied them to editor store so version compare/retention UI state restores automatically.
- Added store coverage for persisted version-history review control hydration and explicit persistence of these controls via collaboration panel preference writes.
- Surfaced restored version-history review context in the Versions tab header with summary chips for retention mode and compare mode when non-default review controls are active.
- Added phase-1 UI coverage asserting hydrated version-history retention/compare preferences render the expected restored versions context summary chips.
- Extended `collaborationPanelPreferences` to persist version-compare setup state (`versionCompareTargetVersionId`, `versionCompareBaselineMode`, `versionCompareCustomBaselineId`) and hydrated that state on reconnect/reopen.
- Replaced local-only version-compare selection state in the Versions tab with collab-store-backed panel preferences so compare target/baseline selection survives reopen cycles.
- Added store and phase-1 UI coverage verifying persisted version-compare panel selections round-trip through repository hydration and restore selected compare controls in UI.
- Surfaced restored version-compare context indicators near compare controls with summary chips for selected target and resolved baseline labels.
- Added phase-1 UI coverage asserting hydrated version-compare selections render compare-context summary indicators (`Target`/`Baseline`) with restored labels.
- Persisted selected comment focus in `collaborationPanelPreferences.selectedCommentId` and hydrated it on reconnect/reopen only when the corresponding persisted comment thread still exists.
- Wired `selectComment(...)` to persist panel preferences immediately, and added store coverage for selected-comment hydration validity checks plus selected-thread persistence round-trip behavior.
- Surfaced restored selected-comment focus indicators in the Comments tab header with summary chips for selected thread id and focus timecode.
- Added phase-1 UI coverage asserting hydrated selected-comment focus renders expected comments focus summary indicators.
- Extended `collaborationPanelPreferences` with comments composer context (`commentsComposerVisible`, `commentsComposerDraft`, `commentsActiveReplyCommentId`) and hydrated this context on reconnect/reopen with active-reply validation.
- Replaced local-only comments composer/reply visibility state with collab-store-backed context so open composer + draft + active reply thread survive reconnect/reopen.
- Added store and phase-1 UI coverage asserting persisted composer draft and active reply focus round-trip through panel preference hydration/persistence.
- Surfaced restored comments composer context indicators in the Comments tab header with summary chips for draft preview and active reply-thread focus.
- Added phase-1 UI coverage asserting hydrated composer draft/active-reply state renders expected comments composer-context summary chips.
- Persisted and hydrated per-thread reply draft text state via `collaborationPanelPreferences.commentsReplyDrafts`, including reconnect-time filtering to existing comment threads.
- Replaced local per-thread reply draft state with collab-store-backed drafts so in-progress replies survive reconnect/reopen, and added store/UI coverage for reply draft round-trip behavior.
- Surfaced restored per-thread reply draft indicators directly on comment cards with concise draft-preview chips so in-progress replies are visible without opening each reply editor.
- Extended phase-1 UI coverage to assert hydrated reply drafts render expected in-card draft indicators.
- Persisted and hydrated comment-card reaction-picker visibility context (`commentsActiveReactionPickerCommentId`) so interrupted reaction selection can resume on reconnect/reopen when the comment still exists.
- Replaced local reaction-picker visibility state with collab-store-backed context and added store/UI coverage for reaction-picker visibility round-trip behavior.
- Surfaced restored reaction-picker context indicators in the Comments tab header with a focus chip showing which comment currently has reaction selection open.
- Extended phase-1 UI coverage to assert hydrated reaction-picker context renders expected comments reaction-focus summary indicators.
- Consolidated repeated panel-preference persistence call sites in collab UI actions behind a shared store helper so tab/filter/comment/compare/composer updates route through one persistence path and error boundary.

## Next Execution Slices

1. Consolidate non-panel collaboration-state persistence call sites (comment/version/activity mutation paths) behind typed helper wrappers to reduce duplication and standardize failure logging.

## Exit Signals For These Early Phases

- Phase 0 moves forward when the shell/navigation model and delivery cadence are stable enough for sustained iteration.
- Phase 1 moves forward when core editorial verbs and keyboard paths are consistently testable and trustworthy.
