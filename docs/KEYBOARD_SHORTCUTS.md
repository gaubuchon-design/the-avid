# The Avid -- Keyboard Shortcuts

## Transport Controls

| Shortcut | Action | Context |
|----------|--------|---------|
| Space | Play / Pause | Global |
| J | Shuttle reverse (successive presses increase speed) | Source Monitor / Editor Toolbar |
| K | Stop shuttle / Pause | Source Monitor / Editor Toolbar |
| L | Shuttle forward (successive presses increase speed) | Source Monitor / Editor Toolbar |
| Home | Go to start (frame 0) | Editor Toolbar / Record Monitor |
| End | Go to end (last frame) | Editor Toolbar / Record Monitor |
| Left Arrow | Step back one frame | Source Monitor / Record Monitor |
| Right Arrow | Step forward one frame | Source Monitor / Record Monitor |

## Editing Marks

| Shortcut | Action | Context |
|----------|--------|---------|
| I | Set In point at current frame | Source Monitor |
| O | Set Out point at current frame | Source Monitor |
| Shift+I | Go to In point | Source Monitor |
| Shift+O | Go to Out point | Source Monitor |
| F | Match Frame (sync source to record playhead) | Record Monitor |

## Undo / Redo

| Shortcut | Action | Context |
|----------|--------|---------|
| Cmd+Z / Ctrl+Z | Undo | Global (Timeline) |
| Cmd+Shift+Z / Ctrl+Y | Redo | Global (Timeline) |

## Tool Modes

| Shortcut | Action | Context |
|----------|--------|---------|
| V | Selection tool | Toolbar |
| T | Trim tool | Toolbar |
| B | Razor / Cut tool | Toolbar |
| Y | Slip tool | Toolbar |
| U | Slide tool | Toolbar |
| H | Hand (pan) tool | Toolbar |

## Edit Operations

| Shortcut | Action | Context |
|----------|--------|---------|
| Z | Lift | Toolbar |
| X | Extract | Toolbar |
| B | Overwrite edit | Toolbar |
| V | Splice-in (Insert) edit | Toolbar |

## Zoom

| Shortcut | Action | Context |
|----------|--------|---------|
| + / = | Zoom in | Editor Toolbar |
| - | Zoom out | Editor Toolbar |
| Ctrl+Scroll / Cmd+Scroll | Zoom in/out (continuous) | Timeline Panel |

## Notes

- Keyboard shortcuts are suppressed when an `<input>` or `<textarea>` element has focus.
- The J/K/L shuttle system follows the industry-standard NLE convention: successive J presses increase reverse speed (1x, 2x, 4x, 8x), successive L presses increase forward speed, and K immediately stops and resets the shuttle accumulators.
- On macOS, `Cmd` is the modifier key. On Windows/Linux, `Ctrl` is used instead.
