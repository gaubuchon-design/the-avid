# Avid User Settings Parity

This document defines the current user-settings scaffold for the web editor and the parity direction relative to Media Composer.

## Research basis

Primary Avid references used for this scaffold:

- [Media Composer v2025.x Editing Guide](https://resources.avid.com/SupportFiles/attach/Media_Composer/Media_Composer_v2025.x_Editing_Guide.pdf)
- [Media Composer Reference Guide](https://resources.avid.com/SupportFiles/attach/Refguide.pdf)
- [Media Composer First User's Guide](https://resources.avid.com/SupportFiles/attach/MCFirst_UG.pdf)

The relevant Avid product ideas are:

- keyboard mappings are user-level preferences
- button reassignment is part of the editorial customization model, not just a raw keybinding list
- user settings are distinct from project settings and site/facility settings
- editorial surface behavior such as trim presentation and button language should be user-customizable without mutating the project itself

## Current scaffold

The current web implementation stores user-scoped preferences in:

- `/Users/guillaumeaubuchon/GitHub/the-avid/apps/web/src/store/userSettings.store.ts`

The current persisted editorial/keyboard settings now include:

- keyboard layout preset id
- custom key bindings
- keyboard conflict policy
- preferred editorial icon style
- preferred trim entry view
- whether scrubbing the timecode track exits trim
- whether trim counters appear in monitor headers
- button-assignment mode
- button-assignment slots scaffold

This is intentionally user-scoped and local-first. It is not yet a full facility/site-settings model.

## UI entry points

The user-facing settings scaffold now lives in:

- `/Users/guillaumeaubuchon/GitHub/the-avid/apps/web/src/components/UserSettings/UserSettingsPanel.tsx`
- `/Users/guillaumeaubuchon/GitHub/the-avid/apps/web/src/components/UserSettings/SettingsSidebar.tsx`
- `/Users/guillaumeaubuchon/GitHub/the-avid/apps/web/src/components/UserSettings/sections/EditorialSettings.tsx`
- `/Users/guillaumeaubuchon/GitHub/the-avid/apps/web/src/components/KeyboardSettings/KeyboardSettingsPanel.tsx`

## Persistence behavior

Persistence is local-first via Zustand `persist`. The current implementation includes:

- versioned storage migration
- migration of the older `media-composer` keyboard preset id to the real `avid-media-composer` layout id
- backfill of new editorial preference defaults when older saved settings are hydrated

## Intentional limits

This is still a scaffold, not full Media Composer settings parity.

Not yet implemented:

- distinct site settings / facility settings / user settings layers
- shared roaming user settings across machines
- full button-to-button reassignment UI for monitor palettes and tool palettes
- palette-specific button maps persisted independently by window/palette type
- complete keyboard-command coverage for every Media Composer command
- import/export parity with Media Composer settings bundles

## Guidance

Future settings work should keep the Avid model separation explicit:

- project settings change editorial output or project behavior
- user settings change how the editor feels and how commands are invoked
- site/facility settings change machine or environment defaults
