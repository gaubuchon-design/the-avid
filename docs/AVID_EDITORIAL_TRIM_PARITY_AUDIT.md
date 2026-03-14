# Avid Editorial And Trim Parity Audit

This document is the current source-backed audit for Media Composer-style trim and core editorial behavior in the web editor.

## Primary sources

Official Avid material reviewed for this audit:

- [Avid Media Composer First User's Guide](https://resources.avid.com/SupportFiles/attach/MCFirst_UG.pdf)
- [Avid Media Composer Guide](https://resources.avid.com/SupportFiles/attach/MCGS.PDF)
- [Avid Media Composer Reference Guide](https://resources.avid.com/SupportFiles/attach/Refguide.pdf)
- [Media Composer v2025.x Editing Guide](https://resources.avid.com/SupportFiles/attach/Media_Composer/Media_Composer_v2025.x_Editing_Guide.pdf)
- [Avid KB: recalling previous trim settings](https://kb.avid.com/pkb/articles/en_US/How_To/en267087)

## Confirmed Avid behavior we are targeting

The following behaviors are directly supported by the Avid material above:

- Trim is transition-centric, not clip-centric.
- Clicking `Trim Mode` again switches between big and small trim instead of acting like a generic tool toggle.
- Clicking the timecode track exits trim and returns the editor to source/record mode.
- You can select multiple transitions to trim, but only one transition per track can participate in a trim session.
- Lassoed multi-transition trim is intended for staggered transitions across tracks, not multiple transitions on the same track.
- `Lift`, `Extract`, `Splice-In`, and `Overwrite` are editorial actions first; they should not be conflated with generic tool shortcuts from other NLEs.
- Smart Tool segment/trim zones are a separate interaction model from the trim workspace.
- Match Frame is an editorial monitor action and should not be sharing a key with unrelated application chrome behavior.

## Repo findings before this pass

The repo had several parity problems even after the earlier trim work:

- The app had two keyboard stories:
  - the actual keyboard engine was mostly Avid-style
  - the older shortcut sheet and some hardcoded fallback handlers still taught a generic-NLE model
- Unmodified `C` still behaved like a generic razor/cut shortcut in `useGlobalKeyboard`, which is not the Avid-style editorial mapping we want.
- Unmodified `Y` still behaved like a generic slip-tool shortcut in `useGlobalKeyboard`, which again was generic NLE behavior rather than Media Composer parity.
- `F` was being used for Match Frame in practice, but the keyboard engine still advertised `F` as fullscreen, which is a direct parity break.
- Entering trim from the main trim button did not consistently follow the documented Avid rule that pressing or clicking trim again should toggle big/small trim when trim is already active.
- Using the timeline ruler/timecode track did not force a clean exit from trim mode.
- Exiting trim could leave the UI visually sitting in the trim tool state even after the trim session ended.

## Landed in this slice

This pass closes the following gaps:

- Shared trim workspace helper:
  - `/Users/guillaumeaubuchon/GitHub/the-avid/apps/web/src/lib/trimWorkspace.ts`
  - centralizes Avid-style trim entry, big/small toggle behavior, and timecode-track trim exit
- Trim button parity:
  - `/Users/guillaumeaubuchon/GitHub/the-avid/apps/web/src/pages/EditorPage.tsx`
  - `/Users/guillaumeaubuchon/GitHub/the-avid/apps/web/src/components/TimelinePanel/TimelinePanel.tsx`
  - `/Users/guillaumeaubuchon/GitHub/the-avid/apps/web/src/components/RecordMonitor/RecordMonitor.tsx`
  - requesting trim while already trimming now toggles big/small trim instead of trying to re-enter a fresh session
- Timecode-track exit:
  - `/Users/guillaumeaubuchon/GitHub/the-avid/apps/web/src/components/TimelinePanel/TimelinePanel.tsx`
  - using the ruler/timecode track now exits trim before updating the position indicator
- Mode cleanup on exit:
  - `/Users/guillaumeaubuchon/GitHub/the-avid/apps/web/src/lib/trimStateBridge.ts`
  - when trim ends, the UI no longer stays stranded in a trim-tool visual state
- Keyboard cleanup:
  - `/Users/guillaumeaubuchon/GitHub/the-avid/apps/web/src/engine/KeyboardEngine.ts`
  - `/Users/guillaumeaubuchon/GitHub/the-avid/apps/web/src/hooks/useGlobalKeyboard.ts`
  - `F` is now explicitly documented as Match Frame instead of fullscreen
  - non-Avid generic `C`/`Y` fallback shortcuts were removed
- Shortcut documentation cleanup:
  - `/Users/guillaumeaubuchon/GitHub/the-avid/docs/KEYBOARD_SHORTCUTS.md`

## Remaining trim and editorial gaps

We are materially closer, but this is still not one-for-one Media Composer parity yet.

- Dynamic trim review now has monitor-routed audio, but it still lacks full Avid-grade transition audio behavior across every shuttle tier and review mode.
- Multi-transition trim selection is still explicit cut selection plus shift-accumulation rather than a fuller Avid-style lasso-selection UX across staggered transitions.
- Smart Tool interaction is closer than before but still not pixel-perfect to Media Composer's zone language and visual treatment.
- Add Edit / segment editing UI still reads as a modern hybrid toolbar instead of a faithful Media Composer editorial surface.
- The current timeline tool strip still exposes non-Avid abstractions internally (`select`, `razor`, `slip`, `slide`) even where the user-facing behavior is being moved toward Avid.
- Command coverage is not yet exhaustive across every Media Composer keyboard action in the Reference Guide.

## Implementation rule going forward

For trim and core editorial behavior, do not add generic-NLE shortcuts or generic tool metaphors unless they are explicitly outside the Media Composer parity path. If behavior differs from Avid, document the deviation and keep the implementation surface narrow enough that it can still be replaced with the Avid-style model later.
