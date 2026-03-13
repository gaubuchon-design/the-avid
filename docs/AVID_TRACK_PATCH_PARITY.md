# Avid Track Patch Parity

## Research inputs

This pass is based on official Avid and Blackmagic documentation, not third-party summaries.

- Avid Media Composer Editing Guide
  - https://resources.avid.com/SupportFiles/attach/MCMC_Editing_Guide.pdf
- Avid Media Composer Editing Guide (2022/2023 editions surfaced in Avid support search)
  - https://resources.avid.com/SupportFiles/attach/MediaComposer2022.x_EditingGuide.pdf
  - https://resources.avid.com/SupportFiles/attach/MediaComposer2023.x_EditingGuide.pdf
- Avid Media Composer First User's Guide
  - https://resources.avid.com/SupportFiles/attach/MCFirst_UG.pdf
- DaVinci Resolve 20 New Features Guide
  - https://documents.blackmagicdesign.com/SupportNotes/DaVinci_Resolve_20_New_Features_Guide.pdf

The relevant product behaviors from those sources are:

- Avid treats patching, monitoring, recording enable, locking, and sync lock as one selector-panel workflow.
- Avid describes patching as a source-side to record-side operation, not just a generic track toggle.
- DaVinci Resolve keeps source/destination patching separate from sync-lock state and exposes resettable selector state.
- Inference from that shared source/record selector model:
  - moving a patched lane should preserve ordered source-to-record mapping whenever there is enough room
  - monitored picture should follow a moved picture patch when the monitor was already following that lane
  - multichannel audio patching needs source-track metadata richer than just `A1`, `A2`, `A3`

## Current app state

The current web editor already has a meaningful track-patching foundation:

- source-to-record mapping is persisted
- record enable and sync lock are real engine state
- monitored video track is persisted and exposed in the shell
- insert/overwrite already honor enabled patches
- restored projects keep patch maps and source-track descriptors

What it did not do yet:

- preserve patch order when moving a patched lane
- distinguish the selector panel as a source-side vs record-side workflow clearly enough
- auto-follow monitored picture when a followed video patch moves
- model multichannel audio patching beyond one descriptor per channel with no role/layout semantics
- expose source-side active/inactive patch state even though `TrackPatch.enabled` already exists in the data model
- provide keyboard-first patch manipulation or richer conflict/overflow feedback

## Implemented in this pass

This slice closes the first concrete parity gap:

- order-preserving patch-bank moves:
  - when a patched audio or picture lane is moved to another compatible record lane, the engine now preserves source order and shifts the patched bank together when there is enough room
  - when there is not enough compatible room, it safely falls back to the existing single-lane behavior
- monitor follow for moved picture patches:
  - if the record monitor was already following the moved picture lane, it now follows the new destination automatically
- source-side patch activation:
  - a patch can now stay mapped while being turned off for edits
  - the panel exposes that directly on the source side as `ON/OFF` state instead of forcing unpatch/repatch just to keep a lane out of the next edit
  - overwrite and insert targeting continue to honor only enabled patches
- clearer source/record language in the panel:
  - the panel now speaks in `Source Side` and `Record Side` terms
  - slots that would trigger an ordered bank move now expose that state in the UI instead of looking identical to a single-lane route

## Implementation map

- runtime behavior:
  - `/Users/guillaumeaubuchon/GitHub/the-avid/apps/web/src/engine/TrackPatchingEngine.ts`
- panel integration:
  - `/Users/guillaumeaubuchon/GitHub/the-avid/apps/web/src/components/TimelinePanel/TrackPatchPanel.tsx`
- styling:
  - `/Users/guillaumeaubuchon/GitHub/the-avid/apps/web/src/styles/editor.css`
- test coverage:
  - `/Users/guillaumeaubuchon/GitHub/the-avid/apps/web/src/__tests__/engine/TrackPatchingEngine.test.ts`
  - `/Users/guillaumeaubuchon/GitHub/the-avid/apps/web/src/__tests__/phase1/track-patch-panel.test.tsx`

## Remaining parity gaps

The next track-patching gaps are now clearer:

- Multichannel and role-aware audio patching:
  - enrich source-track descriptors with layout and channel-role metadata such as `L`, `R`, `C`, `LFE`, `Ls`, `Rs`
  - validate destination compatibility using layout-aware rules instead of only `VIDEO` vs `AUDIO`
- Keyboard and speed workflows:
  - keyboard-first patch moves, enable toggles, monitor selection, and reset behavior
- Conflict feedback:
  - visible overflow/conflict states when an ordered move cannot fit
  - clearer distinction between a disabled patch, an unpatched lane, and a locked destination
- Workflow depth:
  - better reset and preset behaviors for common stereo, dual-mono, and surround source layouts
  - tighter integration with monitored-track focus in source/record editing flows
