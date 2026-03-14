# UI/UX Refactor Plan

This plan defines the editor UX refactor required to make The Avid feel like a deliberate workstation product instead of a collection of impressive but loosely connected panels.

## Current UX Problems

- The shell mixes multiple navigation models: toolbar tabs, workspace presets, page tabs, panels, overlays, and modal tools without a clear hierarchy.
- Project context is weak. The editor does not consistently communicate what mode the user is in, what page they are on, what workspace is active, or whether they are in desktop or web workflow.
- Important operational information is fragmented across the toolbar, status bar, monitor chrome, and panel headers.
- The visual language still carries prototype cues such as decorative chrome and inconsistent emphasis.

## UX Goals

- Make the shell feel like a workstation: stable, dense, legible, and hierarchy-driven.
- Keep page, workspace, project, format, and transport state visible without overwhelming the canvas.
- Reduce duplicate navigation and make every mode switch intentional.
- Preserve keyboard-first editorial flow and avoid full-screen modal interruptions where docked tools work better.
- Create a design system that can scale to advanced color, audio, multicam, interchange, and collaboration workflows.

## Target Information Architecture

### 1. Project Bar

- Application identity
- Surface mode (`Desktop workstation` or `Web collaborative`)
- Project and sequence identity
- Global actions: home, open, AI, transcript, export, inspector, settings

### 2. Workbench Bar

- Primary page navigation: `Media`, `Cut`, `Edit`, `Color`, `Deliver`
- Editorial workspace selection while on `Edit`
- Persistent session telemetry: format, transport, monitor mode, track/clip counts

### 3. Main Workspace

- Left: bins and editorial context panels
- Center: monitors and timeline-focused canvas
- Right: inspector and tool-specific docked panels
- Bottom: technical status, runtime mode, and environment signals

### 4. Tool Surfaces

- Prefer docked side panels for titles, subtitles, trackers, and assistants
- Reserve modal overlays for actions that genuinely block workflow, such as export configuration or project creation

## Interaction Rules

- Page changes and workspace changes must be deep-linkable so teams can share or restore context.
- Page-level navigation owns macro workflow changes; workspace selection only changes the `Edit` environment.
- Panel headers should communicate state, not just labels.
- Every persistent panel needs clear active, loading, empty, and error states.
- Keyboard shortcuts should be visible in tooltips and reflected in the UI hierarchy.

## Visual Direction

- Keep the current dark workstation direction, but remove novelty chrome and strengthen editorial hierarchy.
- Use brand accents sparingly for selection, active states, and AI-related affordances.
- Increase contrast between structural chrome, content surfaces, and active edit targets.
- Treat typography as an information system: display font for identity only, UI font for workflow, mono for technical values.

## Refactor Phases

### Phase 1: Shell Consolidation

- Replace scattered top/bottom navigation with a single workbench layer under the main toolbar.
- Strengthen application identity and runtime context in the toolbar.
- Deep-link page and workspace state in the editor URL.

### Phase 2: Panel Chrome and Density

- Standardize panel headers, tabs, empty states, and section spacing.
- Normalize iconography, status badges, and active/selected treatment.

### Phase 3: Monitor and Timeline Ergonomics

- Improve monitor controls, transport discoverability, trim affordances, and timeline readability.
- Support serious dual-monitor, fullscreen, and multicam workflows.

### Phase 4: Finishing and Task Workflows

- Bring color, audio, effects, subtitles, and delivery pages into the same shell language.
- Reduce mode confusion between editorial, finishing, review, and publish tasks.

## Completed In This Pass

- Introduced a new workbench bar that unifies page navigation, workspace selection, and live session telemetry.
- Replaced decorative toolbar chrome with stronger product identity and workstation context.
- Added URL-backed page and workspace state so editor context can be restored and shared.

## Exit Criteria

The UI refactor is not complete until:

- Navigation hierarchy is obvious without documentation
- Core editorial tasks can be completed without hunting for hidden context
- Desktop and web have the same mental model with scope-appropriate differences
- Advanced workflows can be added without multiplying one-off chrome patterns
