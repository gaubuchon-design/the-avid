# The Avid -- Editorial Keyboard Shortcuts

This sheet documents the current editorial keyboard contract implemented in the app.

It is intentionally aligned to the Avid-style bindings in:

- `/Users/guillaumeaubuchon/GitHub/the-avid/apps/web/src/engine/KeyboardEngine.ts`
- `/Users/guillaumeaubuchon/GitHub/the-avid/apps/web/src/hooks/useGlobalKeyboard.ts`
- `/Users/guillaumeaubuchon/GitHub/the-avid/apps/web/src/pages/EditorPage.tsx`

## Transport

| Shortcut | Action | Context |
|----------|--------|---------|
| `J` | Shuttle reverse | Monitor / Timeline |
| `K` | Stop | Monitor / Timeline |
| `L` | Shuttle forward | Monitor / Timeline |
| `Space` | Play / Stop toggle | Monitor / Timeline |
| `Left Arrow` | Step back one frame, or trim left while trim is active | Monitor / Timeline |
| `Right Arrow` | Step forward one frame, or trim right while trim is active | Monitor / Timeline |
| `Shift+Left Arrow` | Trim left 10 frames while trim is active | Trim |
| `Shift+Right Arrow` | Trim right 10 frames while trim is active | Trim |
| `Home` | Go to start | Active monitor |
| `End` | Go to end | Active monitor |
| `5` | Play transition / trim loop | Trim |

## Marks And Match Frame

| Shortcut | Action | Context |
|----------|--------|---------|
| `I` | Mark IN | Active monitor |
| `O` | Mark OUT | Active monitor |
| `E` | Mark Clip | Active monitor |
| `T` | Mark Clip (alternate binding) | Active monitor |
| `D` | Clear IN and OUT | Active monitor |
| `G` | Clear IN | Active monitor |
| `H` | Clear OUT | Active monitor |
| `Q` | Go to IN | Active monitor |
| `W` | Go to OUT | Active monitor |
| `F` | Match Frame | Record monitor |

## Editing

| Shortcut | Action | Context |
|----------|--------|---------|
| `V` | Splice-In (insert) | Timeline |
| `B` | Overwrite | Timeline |
| `Z` | Lift | Timeline |
| `X` | Extract | Timeline |
| `Delete` / `Backspace` | Delete selected clips | Timeline |
| `Cmd/Ctrl+Z` | Undo | Global |
| `Cmd/Ctrl+Shift+Z` | Redo | Global |
| `Cmd/Ctrl+C` | Copy | Global |
| `Cmd/Ctrl+V` | Paste | Global |

## Trim

| Shortcut | Action | Context |
|----------|--------|---------|
| `U` | Enter trim, or toggle big/small trim when already in trim | Timeline / Monitor |
| `Alt+U` | Recall previous trim configuration | Timeline / Monitor |
| `Shift+U` | Toggle big/small trim view | Trim |
| `P` | Select A-side roller | Trim |
| `[` | Select both sides | Trim |
| `]` | Select B-side roller | Trim |
| `M` | Trim left 1 frame | Trim |
| `,` | Trim right 1 frame | Trim |
| `/` | Trim left 10 frames | Trim |
| `.` | Trim right 10 frames | Trim |
| `Escape` | Cancel / exit trim | Trim |

## Smart Tool

| Shortcut | Action | Context |
|----------|--------|---------|
| `Shift+A` | Toggle Lift/Overwrite segment mode | Timeline |
| `Shift+S` | Toggle Extract/Splice-In segment mode | Timeline |
| `Shift+D` | Toggle Overwrite Trim | Timeline |
| `Shift+F` | Toggle Ripple Trim | Timeline |

## Navigation

| Shortcut | Action | Context |
|----------|--------|---------|
| `A` | Previous edit point | Timeline |
| `S` | Next edit point | Timeline |

## Notes

- This app no longer treats unmodified `C` as a generic razor shortcut or unmodified `Y` as a generic slip shortcut, because those were not part of the Avid-style editorial map and conflicted with parity work.
- Trim is modeled as a dedicated editorial mode. When trim exits, the editor falls back to standard source/record mode rather than leaving the UI in a half-trimmed tool state.
- The current keyboard contract is closer to Media Composer than the older generic-NLE shortcut sheet that previously existed in this repo, but it is still not full command-palette parity with Media Composer.
