# Editorial UI Refactor Prompts

Use these prompts in order. Each one assumes the current repo state and should produce code, tests, and brief docs updates.

## Prompt 1: Finish the resizable shell

Refine the primary editor shell in `/Users/guillaumeaubuchon/GitHub/the-avid/apps/web/src/pages/EditorPage.tsx` and `/Users/guillaumeaubuchon/GitHub/the-avid/apps/web/src/styles/editor.css` so panel resizing behaves like a professional NLE. Improve drag feel, keyboard accessibility, cursor states, and persistence. Add tests for layout persistence and viewport clamping. Validate docked and overlay behavior for bin, inspector, tracker, and timeline.

## Prompt 2: Add workspace presets for editors

Add editor-focused workspace presets to the primary editor shell, inspired by common cutting flows rather than generic app tabs. Implement at least `Assemble`, `Trim`, and `Finish` presets. Each preset should reconfigure visible panels, monitor layout, and tool emphasis without losing user resize preferences. Update the workbench UI and add tests covering preset switching behavior.

## Prompt 3: Improve transport and cut ergonomics

Audit the top-of-screen editorial controls and the timeline toolbar. Reduce redundancy, group the buttons by editor intent, and make the most common operations faster to read: marking, matching, insert/overwrite, lift/extract, trim mode entry, and play state. Prefer clear labels and compact controls over decorative UI. Add interaction tests for the new visible action strip.

## Prompt 4: Neutralize remaining color noise

Continue the grayscale theme sweep across the rest of the application. Remove vivid hardcoded colors from secondary panels, dialogs, dashboards, and admin views. Ensure both `data-theme="dark"` and `data-theme="light"` maintain strong contrast while staying neutral around picture. Update shared tokens in `/Users/guillaumeaubuchon/GitHub/the-avid/packages/ui/src/theme/tokens.ts` and any CSS or inline styles still bypassing the design system.

## Prompt 5: Normalize project-driven colors

Audit all places where project data injects clip, track, bin, or badge colors into the UI. Add a neutral display mode that maps user/project colors into grayscale values for interface rendering while preserving underlying metadata. Make this a user setting and default it on. Add tests around the mapping function and key timeline/bin surfaces.

## Prompt 6: Run a task-based editorial validation pass

Create a lightweight usability harness for the primary editor view. Script three task flows based on the usability study in `/Users/guillaumeaubuchon/GitHub/the-avid/docs/EDITORIAL_UI_USABILITY_STUDY.md`: ingest and organize, fast cutting, and finishing review. Document timing, click count, and any confusion points directly in the repo, then apply one more round of UI cleanup based on those findings.
