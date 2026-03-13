# Editorial UI Usability Study

## Scope

This pass reviewed the primary editor shell used by both the web editor and the desktop app renderer. The review focused on three goals:

1. Make the main editor windows resizable and more responsive.
2. Improve editorial usability against common expectations shaped by tools like DaVinci Resolve, Avid Media Composer, and Premiere Pro.
3. Quiet the UI visually so interface color does not compete with picture evaluation.

## Method

This was a heuristic usability review of the current application shell, using common editorial workflows as the baseline:

- Open or return to an existing project
- Browse bins and ingest material
- Park on source or record, set marks, and cut
- Switch tools without opening deeper panels
- Trim while keeping both picture and timeline legible
- Keep inspector and secondary tooling available without collapsing the viewer
- Judge picture without strong UI color contamination

## Findings

### Pass 1: Resizing and responsiveness

- The editor previously used a mostly fixed grid with no user-controlled resizing in the primary shell.
- The tracker and inspector consumed fixed widths, which made the center picture area fragile at narrower desktop sizes.
- The timeline height was fixed, so users could not bias the interface toward picture or timeline work depending on task.
- Dual-monitor composition was locked to a fixed split, which is weaker than professional editor expectations.

### Pass 2: Editorial usability

- The top workbench had save state and page navigation, but it did not expose enough direct editorial action for fast cutting.
- The toolbar included an `Open Project` affordance without actual behavior, which breaks trust in the chrome.
- Common actions such as mark in/out, insert, overwrite, lift, and extract were available by keyboard but underrepresented in the visible interface.
- Tool state was present in the system, but not prominent enough in the top-level layout to support fast visual confirmation.

### Pass 3: Visual neutrality

- The existing UI leaned heavily on blue and purple accents.
- Multiple components used vivid hardcoded colors independent of the shared theme tokens.
- Some desktop wrapper surfaces still used standalone colored inline styles, which broke parity with the editor shell.

## Changes Landed

- Added persistent resize controls for the bin, tracker, inspector, timeline, and dual-monitor split.
- Added overlay behavior for secondary side panels on narrower widths so the main viewer remains usable.
- Added editor-first tool and action controls to the workbench bar.
- Wired the toolbar `Open Project` control to the Electron file dialog path.
- Moved the shared theme toward grayscale dark/light modes and neutralized major editor-shell accents.
- Normalized the tracker panel and desktop wrapper surfaces onto the shared neutral visual direction.

## Remaining Risks

- Some secondary product areas still use older color assumptions and need the same neutral-token sweep.
- Timeline and metadata content can still surface stored track/bin colors from project data; that should be normalized in a follow-up pass if the product wants complete grayscale enforcement.
- A full task-observation study with external editors has not been run yet; this pass is heuristic, not participant-based.

## Recommended Next Study

Run a task-based validation pass with three editor personas:

- Assistant editor organizing large bins and syncing source
- Narrative editor performing fast mark/insert/overwrite/trim cycles
- Finishing editor balancing inspector-heavy adjustments against viewer focus

Success criteria:

- No panel occludes critical picture unintentionally at 1280 to 1728 widths
- Tool mode is always visible without hunting
- Common cut actions are discoverable in under 3 seconds
- UI color never biases picture evaluation in either dark or light mode
