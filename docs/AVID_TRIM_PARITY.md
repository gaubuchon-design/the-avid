# Avid Trim Parity

## Research inputs

This trim pass was based on Avid's own trim documentation and keyboard/reference material, not third-party summaries.

- Media Composer Guide: `MCGS.PDF`
  - https://resources.avid.com/SupportFiles/attach/MCGS.PDF
- Media Composer Guide 10.0: `GSGuide_v10_0.pdf`
  - https://resources.avid.com/SupportFiles/attach/GSGuide_v10_0.pdf
- Media Composer Reference Guide: `Refguide.pdf`
  - https://resources.avid.com/SupportFiles/attach/Refguide.pdf
- Avid KB on recalling previous trim settings
  - https://kb.avid.com/pkb/articles/en_US/How_To/en267087

The specific Avid behaviors used as the parity target were:

- trim is cut-centric, not clip-centric
- source and record monitors represent the A-side and B-side of the trim
- trim-side selection can be changed directly from the monitor presentation
- big/small trim is a trim-workspace presentation toggle, not a separate tool
- transition play loop is part of trim review
- previous trim settings can be recalled
- asymmetrical trim is multi-roller trim on a shared edit point
- slip and slide use dedicated monitor labels rather than generic source/record labeling

## Product definition

The web editor now treats trim as a dedicated editorial workspace with the following behavior:

- Cut-first trim selection:
  - timeline trim handles select edit points
  - shift-click groups additional cut points without collapsing them to one shared timeline time
  - the last selected cut becomes the trim anchor while earlier selected cuts remain in the trim group
  - only one explicit cut is kept per track, which keeps trim sessions deterministic while still allowing multi-cut selection across tracks
  - trim entry prefers explicit selected cuts over playhead heuristics
- Dual-monitor trim presentation:
  - source monitor represents the outgoing A-side
  - record monitor represents the incoming B-side
  - slip and slide replace those labels with mode-specific contexts such as `SLIP IN`, `SLIP OUT`, `SLIDE LEFT`, and `SLIDE RIGHT`
- Active trim-side feedback:
  - the active trim side is visibly emphasized in the source/record monitor headers
  - per-monitor frame counters show the A-side and B-side deltas independently
- Big/small trim view:
  - trim forces the composer into dual-monitor layout
  - trim view can switch between small and big presentation without leaving trim
  - big trim now exposes playback-duration presets for trim review
  - big trim now also exposes direct pre-roll and post-roll frame controls, so review duration is no longer limited to presets
- Transition play loop:
  - the monitor play button becomes trim-loop review while trim is active
  - trim loop advances the trim preview around the cut instead of invoking normal monitor playback
- Dynamic trim transport:
  - `J` and `L` now drive reverse/forward trim review instead of normal playback while trim is active
  - repeated `J`/`L` presses raise trim review speed using the existing shuttle tiers
  - `K` and space stop/toggle trim review instead of falling back to normal transport
  - arrow keys become trim nudges while trim is active, with `Shift+Arrow` using the larger 10-frame nudge
- Recall previous trim:
  - the keyboard path exists with `Alt+U`
  - the composer toolbar exposes `Recall Trim` when a previous configuration is available
  - the trim engine restores prior slip/slide sessions directly instead of depending on normal mode cycling
- Asymmetrical multi-track trim:
  - each roller can be assigned to `A`, `AB`, or `B`
  - the trim HUD keeps per-track roller assignment controls
- Mode-aware slip/slide review:
  - slip and slide no longer present roll/ripple side-selection controls
  - trim labels switch to `IN/OUT` and `LEFT/RIGHT` in the HUD instead of always showing `A/B`

## Implementation map

- Cut selection and trim entry:
  - `/Users/guillaumeaubuchon/GitHub/the-avid/apps/web/src/store/editor.store.ts`
  - `/Users/guillaumeaubuchon/GitHub/the-avid/apps/web/src/lib/trimEntry.ts`
  - `/Users/guillaumeaubuchon/GitHub/the-avid/apps/web/src/components/TimelinePanel/ClipView.tsx`
  - `/Users/guillaumeaubuchon/GitHub/the-avid/apps/web/src/components/TimelinePanel/TimelinePanel.tsx`
- Trim engine and recall:
  - `/Users/guillaumeaubuchon/GitHub/the-avid/apps/web/src/engine/TrimEngine.ts`
  - `/Users/guillaumeaubuchon/GitHub/the-avid/apps/web/src/lib/trimStateBridge.ts`
- Monitor trim representation:
  - `/Users/guillaumeaubuchon/GitHub/the-avid/apps/web/src/lib/trimMonitorPreview.ts`
  - `/Users/guillaumeaubuchon/GitHub/the-avid/apps/web/src/components/SourceMonitor/SourceMonitor.tsx`
  - `/Users/guillaumeaubuchon/GitHub/the-avid/apps/web/src/components/RecordMonitor/RecordMonitor.tsx`
  - `/Users/guillaumeaubuchon/GitHub/the-avid/apps/web/src/components/Editor/TrimStatusOverlay.tsx`
  - `/Users/guillaumeaubuchon/GitHub/the-avid/apps/web/src/components/ComposerPanel/ComposerPanel.tsx`
  - `/Users/guillaumeaubuchon/GitHub/the-avid/apps/web/src/hooks/useTrimLoopPlayback.ts`
- Trim workspace styling:
  - `/Users/guillaumeaubuchon/GitHub/the-avid/apps/web/src/styles/editor.css`

## Remaining parity gaps

This is materially closer to Media Composer trim, but it is still not complete parity.

- No full audio-backed Avid-style dynamic trim review yet
- No dedicated keyboard-first big/small trim monitor choreography beyond the implemented toggle
- No lasso/select-many transition workflow on the same track beyond the current one-cut-per-track selection model
- No trim-specific sync diagnostics or lock-conflict UI
- No deeper dedicated slip/slide trim review playback beyond the updated monitor labeling, mode-aware controls, and loop-aware preview timing

Those are the next trim slices if the goal is to keep pushing toward Media Composer-grade editorial parity rather than stopping at a cleaner modern approximation.
